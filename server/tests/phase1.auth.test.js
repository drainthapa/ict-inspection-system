// Phase 1 integration tests: authentication, roles and ward-level access.
// Requires a migrated + seeded database and an active Super Admin whose
// credentials are given in TEST_ADMIN_USERNAME / TEST_ADMIN_PASSWORD.
//   TEST_ADMIN_PASSWORD=... npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { pool } from '../src/config/db.js';

const ADMIN = {
  username: process.env.TEST_ADMIN_USERNAME || 'admin',
  password: process.env.TEST_ADMIN_PASSWORD,
};
const PREFIX = `t${Date.now().toString(36)}`;
let server;
let base;

/** Tiny client that keeps the auth cookie, like a browser would. */
function client() {
  let cookie = '';
  const call = async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
    return { status: res.status, body: await res.json() };
  };
  return {
    get: (p) => call('GET', p),
    post: (p, b) => call('POST', p, b),
    put: (p, b) => call('PUT', p, b),
    del: (p) => call('DELETE', p),
    get cookie() { return cookie; },
    set cookie(v) { cookie = v; },
  };
}

const wardId = async (n) =>
  (await pool.query('SELECT id FROM wards WHERE ward_number = $1', [n])).rows[0].id;

const admin = client();
let inspectorId;
let wardUserId;

before(async () => {
  assert.ok(ADMIN.password, 'Set TEST_ADMIN_PASSWORD to run the tests');
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  await pool.query('DELETE FROM users WHERE username LIKE $1', [`${PREFIX}%`]);
  server.close();
  await pool.end();
});

test('health check reports database connected', async () => {
  const r = await client().get('/health');
  assert.equal(r.status, 200);
  assert.equal(r.body.data.database, 'connected');
});

test('protected routes reject anonymous requests', async () => {
  const r = await client().get('/auth/me');
  assert.equal(r.status, 401);
  assert.equal(r.body.success, false);
});

test('login rejects a wrong password with a generic message', async () => {
  const r = await client().post('/auth/login', { username: ADMIN.username, password: 'wrong-pass-1' });
  assert.equal(r.status, 401);
  assert.equal(r.body.message, 'Incorrect username or password');
});

test('login validates required fields', async () => {
  const r = await client().post('/auth/login', { username: '' });
  assert.equal(r.status, 422);
  assert.ok(r.body.errors.username);
  assert.ok(r.body.errors.password);
});

test('super admin logs in; cookie is httpOnly; profile has no password hash', async () => {
  const res = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(ADMIN),
  });
  const setCookie = res.headers.get('set-cookie');
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Strict/i);
  admin.cookie = setCookie.split(';')[0];

  const me = await admin.get('/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.data.role, 'super_admin');
  assert.equal(me.body.data.password_hash, undefined);
});

test('super admin sees all 11 wards', async () => {
  const r = await admin.get('/wards');
  assert.equal(r.status, 200);
  assert.equal(r.body.data.length, 11);
});

test('user creation enforces role/ward rules and password policy', async () => {
  const w1 = await wardId(1);
  const w2 = await wardId(2);

  let r = await admin.post('/users', {
    full_name: 'Bad Ward User', username: `${PREFIX}bad`, password: 'Passw0rd!', role: 'ward_user',
    ward_ids: [w1, w2],
  });
  assert.equal(r.status, 422);
  assert.ok(r.body.errors.ward_ids);

  r = await admin.post('/users', {
    full_name: 'Weak', username: `${PREFIX}weak`, password: 'short', role: 'inspector', ward_ids: [w1],
  });
  assert.equal(r.status, 422);
  assert.ok(r.body.errors.password);
});

test('super admin creates an inspector (wards 1–2) and a ward user (ward 3)', async () => {
  let r = await admin.post('/users', {
    full_name: 'Test Inspector', username: `${PREFIX}insp`, password: 'Inspect0r1',
    role: 'inspector', ward_ids: [await wardId(1), await wardId(2)],
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  inspectorId = r.body.data.id;
  assert.equal(r.body.data.wards.length, 2);

  r = await admin.post('/users', {
    full_name: 'Test Ward User', username: `${PREFIX}ward`, password: 'WardUser1',
    role: 'ward_user', ward_ids: [await wardId(3)],
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  wardUserId = r.body.data.id;

  r = await admin.post('/users', {
    full_name: 'Duplicate', username: `${PREFIX}INSP`, password: 'Inspect0r1',
    role: 'inspector', ward_ids: [await wardId(1)],
  });
  assert.equal(r.status, 409, 'usernames are case-insensitively unique');
});

test('ward user sees only their own ward and cannot reach others', async () => {
  const u = client();
  assert.equal((await u.post('/auth/login', { username: `${PREFIX}ward`, password: 'WardUser1' })).status, 200);

  const list = await u.get('/wards');
  assert.deepEqual(list.body.data.map((w) => w.ward_number), [3]);

  assert.equal((await u.get(`/wards/${await wardId(3)}`)).status, 200);
  assert.equal((await u.get(`/wards/${await wardId(1)}`)).status, 403);
  assert.equal((await u.get('/users')).status, 403);
  assert.equal((await u.post('/users', {})).status, 403);
  assert.equal((await u.get(`/users/${inspectorId}`)).status, 403, 'cannot view other users');
  assert.equal((await u.get(`/users/${wardUserId}`)).status, 200, 'can view self');
});

test('inspector sees only assigned wards', async () => {
  const u = client();
  await u.post('/auth/login', { username: `${PREFIX}insp`, password: 'Inspect0r1' });
  const list = await u.get('/wards');
  assert.deepEqual(list.body.data.map((w) => w.ward_number), [1, 2]);
  assert.equal((await u.get(`/wards/${await wardId(5)}`)).status, 403);
});

test('ward reassignment takes effect immediately on existing sessions', async () => {
  const u = client();
  await u.post('/auth/login', { username: `${PREFIX}insp`, password: 'Inspect0r1' });
  await admin.put(`/users/${inspectorId}`, { ward_ids: [await wardId(7)] });
  const list = await u.get('/wards');
  assert.deepEqual(list.body.data.map((w) => w.ward_number), [7]);
});

test('deactivating a user ends their session and blocks login', async () => {
  const u = client();
  await u.post('/auth/login', { username: `${PREFIX}ward`, password: 'WardUser1' });
  assert.equal((await admin.del(`/users/${wardUserId}`)).status, 200);
  assert.equal((await u.get('/auth/me')).status, 401);
  const relog = await client().post('/auth/login', { username: `${PREFIX}ward`, password: 'WardUser1' });
  assert.equal(relog.status, 401);
  assert.match(relog.body.message, /deactivated/);
});

test('logout invalidates the token even if the cookie is replayed', async () => {
  const u = client();
  await u.post('/auth/login', { username: `${PREFIX}insp`, password: 'Inspect0r1' });
  const stolen = u.cookie;
  assert.equal((await u.post('/auth/logout')).status, 200);
  const replay = client();
  replay.cookie = stolen;
  assert.equal((await replay.get('/auth/me')).status, 401);
});

test('admin cannot deactivate or demote themself', async () => {
  const me = (await admin.get('/auth/me')).body.data;
  assert.equal((await admin.del(`/users/${me.id}`)).status, 409);
  const r = await admin.put(`/users/${me.id}`, { role: 'inspector', ward_ids: [await wardId(1)] });
  assert.equal(r.status, 422);
});

test('search input is parameterized, not executed', async () => {
  const r = await admin.get(`/users?search=${encodeURIComponent("' OR 1=1; DROP TABLE users; --")}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.data.length, 0);
  const still = await pool.query('SELECT COUNT(*)::int AS n FROM users');
  assert.ok(still.rows[0].n > 0);
});

test('password change keeps this session and ends others', async () => {
  const a = client();
  const b = client();
  await a.post('/auth/login', { username: `${PREFIX}insp`, password: 'Inspect0r1' });
  await b.post('/auth/login', { username: `${PREFIX}insp`, password: 'Inspect0r1' });
  const r = await a.post('/auth/change-password', { currentPassword: 'Inspect0r1', newPassword: 'NewPassw0rd' });
  assert.equal(r.status, 200);
  assert.equal((await a.get('/auth/me')).status, 200);
  assert.equal((await b.get('/auth/me')).status, 401);
});

test('important actions are audit-logged', async () => {
  const { rows } = await pool.query(
    `SELECT action FROM audit_logs WHERE entity_type = 'user' AND entity_id = $1::text`, [inspectorId],
  );
  const actions = rows.map((r) => r.action);
  for (const a of ['user.created', 'user.updated', 'auth.login', 'auth.logout', 'auth.password_changed']) {
    assert.ok(actions.includes(a), `missing audit action ${a}`);
  }
});

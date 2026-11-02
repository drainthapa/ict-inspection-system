// Phase 2: wards, staff assignment, categories, equipment inventory, settings.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  ADMIN, startServer, makeClient, wardIdOf, categoryIdOf, pool,
} from './helpers.js';

const P = `t${Date.now().toString(36)}`;     // username prefix
const A = `TST${Date.now().toString(36).toUpperCase()}`; // asset prefix
let server; let base;
let admin; let insp; let wardUser;
let W1; let W2; let W5; let PRINTER; let SWITCH;
let inspId; let wardUserId; let printerId;

before(async () => {
  assert.ok(ADMIN.password, 'Set TEST_ADMIN_PASSWORD');
  ({ server, base } = startServer());
  admin = makeClient(base);
  assert.equal((await admin.login(ADMIN.username, ADMIN.password)).status, 200);
  [W1, W2, W5] = await Promise.all([wardIdOf(1), wardIdOf(2), wardIdOf(5)]);
  [PRINTER, SWITCH] = await Promise.all([categoryIdOf('PRINTER'), categoryIdOf('SWITCH')]);

  let r = await admin.post('/users', {
    full_name: 'P2 Inspector', username: `${P}insp`, password: 'Inspect0r1', role: 'inspector', ward_ids: [W1],
  });
  inspId = r.body.data.id;
  r = await admin.post('/users', {
    full_name: 'P2 Ward User', username: `${P}ward`, password: 'WardUser1', role: 'ward_user', ward_ids: [W2],
  });
  wardUserId = r.body.data.id;
  insp = makeClient(base); await insp.login(`${P}insp`, 'Inspect0r1');
  wardUser = makeClient(base); await wardUser.login(`${P}ward`, 'WardUser1');
});

after(async () => {
  await pool.query('DELETE FROM equipment WHERE asset_id LIKE $1', [`${A}%`]);
  await pool.query("DELETE FROM equipment_categories WHERE code LIKE 'TST%'");
  await pool.query('DELETE FROM wards WHERE ward_number = 99');
  await pool.query('DELETE FROM users WHERE username LIKE $1', [`${P}%`]);
  await pool.query(`UPDATE system_settings SET value = 'NPR' WHERE key = 'currency'`);
  server.close();
  await pool.end();
});

/* ---------------- Wards ---------------- */

test('only Super Admin can edit ward details', async () => {
  const body = { chairperson_name: 'Test Chair', contact_number: '071-555555' };
  assert.equal((await insp.put(`/wards/${W1}`, body)).status, 403);
  const r = await admin.put(`/wards/${W1}`, body);
  assert.equal(r.status, 200);
  assert.equal(r.body.data.chairperson_name, 'Test Chair');
});

test('ward validation and duplicate ward number', async () => {
  let r = await admin.post('/wards', { ward_number: 1, office_name: 'Dup' });
  assert.equal(r.status, 422);
  assert.match(r.body.errors.ward_number, /already exists/);
  r = await admin.put(`/wards/${W1}`, { email: 'not-an-email' });
  assert.equal(r.status, 422);
  r = await admin.post('/wards', { ward_number: 99, office_name: 'Temporary Ward' });
  assert.equal(r.status, 201);
  assert.equal((await admin.del(`/wards/${r.body.data.id}`)).status, 200);
});

test('ward staff assignment: add, move ward user, refuse stranding', async () => {
  // Add the inspector to ward 5 as well
  let r = await admin.put(`/wards/${W5}/users`, { user_ids: [inspId] });
  assert.equal(r.status, 200);
  assert.ok(r.body.data.assigned_users.some((u) => u.id === inspId));

  // Ward users hold one ward: adding them to ward 5 moves them from ward 2
  r = await admin.put(`/wards/${W5}/users`, { user_ids: [inspId, wardUserId] });
  assert.equal(r.status, 200);
  const { rows } = await pool.query('SELECT ward_id FROM user_wards WHERE user_id = $1', [wardUserId]);
  assert.deepEqual(rows.map((x) => x.ward_id), [W5]);

  // Removing the ward user from their only ward is refused
  r = await admin.put(`/wards/${W5}/users`, { user_ids: [inspId] });
  assert.equal(r.status, 422);
  assert.match(r.body.errors.user_ids, /only ward/);

  // Super Admins cannot be assigned
  const me = (await admin.get('/auth/me')).body.data;
  r = await admin.put(`/wards/${W5}/users`, { user_ids: [me.id] });
  assert.equal(r.status, 422);

  // Move the ward user back to ward 2, then empty ward 5
  const w2Staff = (await admin.get(`/wards/${W2}`)).body.data.assigned_users.map((u) => u.id);
  r = await admin.put(`/wards/${W2}/users`, { user_ids: [...w2Staff, wardUserId] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  r = await admin.put(`/wards/${W5}/users`, { user_ids: [] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
});

/* ---------------- Categories ---------------- */

test('categories: list for everyone, manage as admin only', async () => {
  const list = await wardUser.get('/equipment/categories');
  assert.equal(list.status, 200);
  assert.equal(list.body.data.length, 31);

  assert.equal((await insp.post('/equipment/categories', { name: 'X', code: 'TSTX', group_name: 'Y' })).status, 403);
  let r = await admin.post('/equipment/categories', {
    name: 'Test Tablet', code: 'tst_tab', group_name: 'Computer and Office Equipment',
    type_options: ['Android', 'iPad'], checklist_group: 'computer',
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.data.code, 'TST_TAB');
  const id = r.body.data.id;

  r = await admin.post('/equipment/categories', { name: 'Other Tablet', code: 'TST_TAB', group_name: 'Other ICT Equipment' });
  assert.equal(r.status, 422);
  assert.ok(r.body.errors.code);

  assert.equal((await admin.del(`/equipment/categories/${id}`)).status, 200);
});

/* ---------------- Equipment ---------------- */

test('inspector registers equipment in an assigned ward only', async () => {
  const item = {
    asset_id: `${A}-P1`, ward_id: W1, category_id: PRINTER, name: 'HP LaserJet Pro M404',
    equipment_type: 'Laser', brand: 'HP', model: 'M404dn', serial_number: `${A}SN1`,
    installation_location: 'Registration desk', purchase_date: '2023-04-10', warranty_expiry: '2025-04-10',
  };
  let r = await insp.post('/equipment', item);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  printerId = r.body.data.id;
  assert.equal(r.body.data.current_condition, null, 'condition is set by inspections, not registration');
  assert.equal(r.body.data.ward_number, 1);

  r = await insp.post('/equipment', { ...item, asset_id: `${A}-P2`, serial_number: null, ward_id: W2 });
  assert.equal(r.status, 403);
});

test('ward users cannot create, edit or delete equipment', async () => {
  const r = await wardUser.post('/equipment', { asset_id: `${A}-X`, ward_id: W2, category_id: PRINTER, name: 'X' });
  assert.equal(r.status, 403);
  assert.equal((await wardUser.put(`/equipment/${printerId}`, { name: 'Y' })).status, 403);
  assert.equal((await wardUser.del(`/equipment/${printerId}`)).status, 403);
});

test('equipment business rules: duplicates, type options, dates', async () => {
  const base = { ward_id: W1, category_id: PRINTER, name: 'Another printer' };
  let r = await admin.post('/equipment', { ...base, asset_id: `${A}-p1`.toLowerCase() });
  assert.equal(r.status, 422);
  assert.match(r.body.errors.asset_id, /already registered/);

  r = await admin.post('/equipment', { ...base, asset_id: `${A}-P3`, serial_number: `${A}SN1` });
  assert.equal(r.status, 422);
  assert.ok(r.body.errors.serial_number);

  r = await admin.post('/equipment', { ...base, asset_id: `${A}-P3`, equipment_type: 'Dot-matrix' });
  assert.equal(r.status, 422);
  assert.match(r.body.errors.equipment_type, /Laser/);

  r = await admin.post('/equipment', {
    ...base, asset_id: `${A}-P3`, purchase_date: '2024-01-01', warranty_expiry: '2023-01-01',
  });
  assert.equal(r.status, 422);
  assert.ok(r.body.errors.warranty_expiry);

  r = await admin.post('/equipment', { ...base, asset_id: 'x' });
  assert.equal(r.status, 422);
});

test('equipment list is ward-scoped for every role', async () => {
  await admin.post('/equipment', { asset_id: `${A}-S1`, ward_id: W2, category_id: SWITCH, name: 'TP-Link 24 port', equipment_type: 'Unmanaged' });

  const mine = await insp.get(`/equipment?search=${A}`);
  assert.deepEqual([...new Set(mine.body.data.map((e) => e.ward_number))], [1]);

  const theirs = await wardUser.get(`/equipment?search=${A}`);
  assert.deepEqual(theirs.body.data.map((e) => e.asset_id), [`${A}-S1`]);

  // A ward filter cannot widen access
  const sneaky = await wardUser.get(`/equipment?ward_id=${W1}&search=${A}`);
  assert.equal(sneaky.body.data.length, 0);
  assert.equal((await wardUser.get(`/equipment/${printerId}`)).status, 403);

  const all = await admin.get(`/equipment?search=${A}`);
  assert.equal(all.body.data.length, 2);
});

test('server-side filtering, sorting and pagination', async () => {
  for (let i = 1; i <= 4; i += 1) {
    await admin.post('/equipment', { asset_id: `${A}-K${i}`, ward_id: W1, category_id: SWITCH, name: `Switch ${i}` });
  }
  let r = await admin.get(`/equipment?search=${A}&category_id=${SWITCH}&sort=asset_id&dir=asc&limit=2&page=2`);
  assert.equal(r.status, 200);
  assert.equal(r.body.meta.total, 5);
  assert.equal(r.body.meta.totalPages, 3);
  assert.deepEqual(r.body.data.map((e) => e.asset_id), [`${A}-K3`, `${A}-K4`]);

  r = await admin.get(`/equipment?search=${A}&condition=not_inspected&ward_id=${W1}`);
  assert.equal(r.body.meta.total, 5);
  r = await admin.get(`/equipment?search=${A}&condition=good`);
  assert.equal(r.body.meta.total, 0);

  r = await admin.get('/equipment?sort=drop_table');
  assert.equal(r.status, 422, 'unknown sort keys are rejected, never interpolated');
});

test('search by brand, serial and ward number', async () => {
  assert.equal((await admin.get(`/equipment?search=${A}SN1`)).body.data[0].id, printerId);
  const byBrand = await admin.get('/equipment?search=M404dn');
  assert.ok(byBrand.body.data.some((e) => e.id === printerId));
  const byWard = await admin.get('/equipment?search=Ward%20No.%201&limit=100');
  assert.ok(byWard.body.data.every((e) => e.ward_number === 1));
});

test('editing: inspectors cannot move equipment out of their wards or change status', async () => {
  assert.equal((await insp.put(`/equipment/${printerId}`, { ward_id: W5 })).status, 403);
  assert.equal((await insp.put(`/equipment/${printerId}`, { status: 'disposed' })).status, 403);
  const r = await insp.put(`/equipment/${printerId}`, { installation_location: 'Front office' });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.installation_location, 'Front office');
});

test('equipment detail includes history arrays', async () => {
  const r = await insp.get(`/equipment/${printerId}`);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.data.inspections, []);
  assert.deepEqual(r.body.data.maintenance, []);
  assert.equal(r.body.data.created_by_name, 'P2 Inspector');
});

test('next asset ID suggestion', async () => {
  await admin.post('/equipment', { asset_id: 'SMM-W01-PRINTER-007', ward_id: W1, category_id: PRINTER, name: 'tmp' });
  const r = await insp.get(`/equipment/next-asset-id?ward_id=${W1}&category_id=${PRINTER}`);
  assert.equal(r.body.data.asset_id, 'SMM-W01-PRINTER-008');
  assert.equal((await insp.get(`/equipment/next-asset-id?ward_id=${W2}&category_id=${PRINTER}`)).status, 403);
  await pool.query(`DELETE FROM equipment WHERE asset_id = 'SMM-W01-PRINTER-007'`);
});

test('equipment with history cannot be deleted', async () => {
  await pool.query(
    `INSERT INTO inspections (ward_id, equipment_id, inspector_id, condition, status, submitted_at)
     VALUES ($1, $2, $3, 'good', 'submitted', NOW())`, [W1, printerId, inspId],
  );
  let r = await admin.del(`/equipment/${printerId}`);
  assert.equal(r.status, 409);
  assert.match(r.body.message, /disposed/);
  r = await admin.del(`/equipment/${printerId}`.replace(printerId, '999999'));
  assert.equal(r.status, 404);
  await pool.query('DELETE FROM inspections WHERE equipment_id = $1', [printerId]);
});

/* ---------------- Settings ---------------- */

test('settings: readable by all, editable by admin with validation', async () => {
  assert.equal((await wardUser.get('/settings')).status, 200);
  assert.equal((await insp.put('/settings', { values: { currency: 'USD' } })).status, 403);
  let r = await admin.put('/settings', { values: { currency: 'rupees', hacker_key: 'x' } });
  assert.equal(r.status, 422);
  assert.ok(r.body.errors.currency && r.body.errors.hacker_key);
  r = await admin.put('/settings', { values: { currency: 'NPR' } });
  assert.equal(r.status, 200);
});

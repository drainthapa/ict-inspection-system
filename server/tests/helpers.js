// Shared helpers for integration tests.
import { createApp } from '../src/app.js';
import { pool } from '../src/config/db.js';

export const ADMIN = {
  username: process.env.TEST_ADMIN_USERNAME || 'admin',
  password: process.env.TEST_ADMIN_PASSWORD,
};

export function startServer() {
  const server = createApp().listen(0);
  return { server, base: `http://127.0.0.1:${server.address().port}/api` };
}

/** Minimal cookie-keeping client, like a browser. */
export function makeClient(base) {
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
    login: (username, password) => call('POST', '/auth/login', { username, password }),
    /** multipart upload: files = [{ name, type, data: Buffer }] */
    upload: async (path, files, fields = {}) => {
      const form = new FormData();
      Object.entries(fields).forEach(([k, v]) => form.append(k, v));
      files.forEach((f) => form.append('photos', new Blob([f.data], { type: f.type }), f.name));
      const res = await fetch(base + path, { method: 'POST', headers: cookie ? { cookie } : {}, body: form });
      return { status: res.status, body: await res.json() };
    },
    raw: async (path) => {
      const res = await fetch(base + path, { headers: cookie ? { cookie } : {} });
      return { status: res.status, headers: res.headers, buf: Buffer.from(await res.arrayBuffer()) };
    },
  };
}

export const wardIdOf = async (n) =>
  (await pool.query('SELECT id FROM wards WHERE ward_number = $1', [n])).rows[0].id;

export const categoryIdOf = async (code) =>
  (await pool.query('SELECT id FROM equipment_categories WHERE code = $1', [code])).rows[0].id;

export { pool };

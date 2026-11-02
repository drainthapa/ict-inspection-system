// Phases 3–5: inspections, photos, maintenance, replacements, dashboard, reports.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { ADMIN, startServer, makeClient, wardIdOf, categoryIdOf, pool } from './helpers.js';

const P = `w${Date.now().toString(36)}`;
const A = `WF${Date.now().toString(36).toUpperCase()}`;
let server; let base; let admin; let insp; let insp2; let wardUser;
let W3; let W8; let DESKTOP; let pcId; let upsId; let otherWardEq;
let inspId; let insp2Id;
const today = new Date().toISOString().slice(0, 10);

// A real 1x1 PNG
function tinyPng() {
  const crc = (buf) => { let c = ~0; for (const b of buf) { c ^= b; for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.from([0, 255, 0, 0]))), chunk('IEND', Buffer.alloc(0))]);
}

before(async () => {
  assert.ok(ADMIN.password, 'Set TEST_ADMIN_PASSWORD');
  ({ server, base } = startServer());
  admin = makeClient(base);
  await admin.login(ADMIN.username, ADMIN.password);
  [W3, W8, DESKTOP] = await Promise.all([wardIdOf(3), wardIdOf(8), categoryIdOf('DESKTOP')]);
  const UPS = await categoryIdOf('UPS');
  const mk = async (u, role, wards) => (await admin.post('/users', { full_name: `WF ${u}`, username: `${P}${u}`, password: 'Passw0rd1', role, ward_ids: wards })).body.data.id;
  await mk('insp', 'inspector', [W3]);
  await mk('insp2', 'inspector', [W3]);
  await mk('ward', 'ward_user', [W3]);
  insp = makeClient(base); await insp.login(`${P}insp`, 'Passw0rd1');
  insp2 = makeClient(base); await insp2.login(`${P}insp2`, 'Passw0rd1');
  wardUser = makeClient(base); await wardUser.login(`${P}ward`, 'Passw0rd1');
  pcId = (await admin.post('/equipment', { asset_id: `${A}-PC`, ward_id: W3, category_id: DESKTOP, name: 'Lenovo ThinkCentre' })).body.data.id;
  upsId = (await admin.post('/equipment', { asset_id: `${A}-UPS`, ward_id: W3, category_id: UPS, name: 'APC 1100VA' })).body.data.id;
  otherWardEq = (await admin.post('/equipment', { asset_id: `${A}-W8`, ward_id: W8, category_id: DESKTOP, name: 'Ward 8 PC' })).body.data.id;
});

after(async () => {
  const { rows } = await pool.query('SELECT id FROM equipment WHERE asset_id LIKE $1', [`${A}%`]);
  const ids = rows.map((r) => r.id);
  await pool.query('UPDATE equipment SET last_inspection_id = NULL WHERE id = ANY($1)', [ids]);
  await pool.query('DELETE FROM replacement_requests WHERE equipment_id = ANY($1)', [ids]);
  await pool.query('DELETE FROM maintenance WHERE equipment_id = ANY($1)', [ids]);
  await pool.query('DELETE FROM inspections WHERE equipment_id = ANY($1) OR inspector_id IN (SELECT id FROM users WHERE username LIKE $2)', [ids, `${P}%`]);
  await pool.query('DELETE FROM equipment WHERE id = ANY($1)', [ids]);
  await pool.query('DELETE FROM users WHERE username LIKE $1', [`${P}%`]);
  server.close();
  await pool.end();
});

/* ---------------- Inspections ---------------- */

test('inspector saves a partial draft; drafts stay private', async () => {
  const r = await insp.post('/inspections', { ward_id: W3, equipment_id: pcId, condition: 'not_operational', inspection_type: 'routine' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.data.status, 'draft');
  assert.match(r.body.data.inspection_code, /^INS-\d{4}-\d{6}$/);
  assert.equal(r.body.data.category_id, DESKTOP, 'category is derived from the equipment');
  inspId = r.body.data.id;

  assert.equal((await wardUser.get(`/inspections/${inspId}`)).status, 404);
  assert.equal((await insp2.get(`/inspections/${inspId}`)).status, 404);
  assert.equal((await insp2.put(`/inspections/${inspId}`, { inspector_remarks: 'x' })).status, 404);
  const list = await wardUser.get('/inspections');
  assert.ok(!list.body.data.some((i) => i.id === inspId));
  assert.equal((await admin.get(`/inspections/${inspId}`)).status, 200);
});

test('inspector cannot inspect equipment in another ward; ward users cannot inspect', async () => {
  assert.equal((await insp.post('/inspections', { ward_id: W8, equipment_id: otherWardEq })).status, 403);
  const r = await insp.post('/inspections', { ward_id: W3, equipment_id: otherWardEq });
  assert.equal(r.status, 422);
  assert.match(r.body.errors.equipment_id, /different ward/);
  assert.equal((await wardUser.post('/inspections', { ward_id: W3 })).status, 403);
});

test('submission is validated server-side', async () => {
  const r = await insp.put(`/inspections/${inspId}`, { submit: true });
  assert.equal(r.status, 422);
  for (const f of ['problem_description', 'repair_required', 'recommended_actions']) assert.ok(r.body.errors[f], `expected ${f} error`);
  const d = await insp.get(`/inspections/${inspId}`);
  assert.equal(d.body.data.status, 'draft', 'failed submit leaves it a draft');
});

test('checklist must match the equipment category', async () => {
  const { rows } = await pool.query(`SELECT id, checklist_group FROM inspection_checklist_items WHERE checklist_group IN ('computer','cctv')`);
  const cctvItem = rows.find((x) => x.checklist_group === 'cctv').id;
  let r = await insp.put(`/inspections/${inspId}`, { checklist: [{ checklist_item_id: cctvItem, result: 'good' }] });
  assert.equal(r.status, 422);
  const cl = await insp.get(`/inspections/checklist?category_id=${DESKTOP}`);
  assert.equal(cl.body.data.length, 9);
  r = await insp.put(`/inspections/${inspId}`, {
    checklist: cl.body.data.map((it, i) => ({ checklist_item_id: it.id, result: i === 0 ? 'problem' : 'good', remarks: i === 0 ? 'No POST beep' : null })),
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.checklist.length, 9);
});

test('photos: real images accepted, disguised files rejected, served to signed-in users only', async () => {
  let r = await insp.upload(`/inspections/${inspId}/photos`, [{ name: 'front.png', type: 'image/png', data: tinyPng() }], { photo_type: 'front_view' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const photo = r.body.data[0];
  assert.equal(photo.mime_type, 'image/png');
  assert.match(photo.file_path, /^inspections\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.png$/);

  r = await insp.upload(`/inspections/${inspId}/photos`, [{ name: 'evil.jpg', type: 'image/jpeg', data: Buffer.from('<script>alert(1)</script>') }]);
  assert.equal(r.status, 400);
  r = await insp.upload(`/inspections/${inspId}/photos`, [{ name: 'doc.pdf', type: 'application/pdf', data: Buffer.from('%PDF-1.4') }]);
  assert.equal(r.status, 400);
  assert.equal((await wardUser.upload(`/inspections/${inspId}/photos`, [{ name: 'a.png', type: 'image/png', data: tinyPng() }])).status, 403);

  assert.equal((await insp.raw(`/../uploads/${photo.file_path}`.replace('/..', ''))).status, 404, 'API path is not the file path');
  const anon = await fetch(base.replace('/api', `/uploads/${photo.file_path}`));
  assert.equal(anon.status, 401);
  const authed = await insp.raw(`/../uploads/${photo.file_path}`);
  assert.ok([200, 404].includes(authed.status));
});

test('submitting updates condition and opens maintenance + replacement requests', async () => {
  const r = await insp.put(`/inspections/${inspId}`, {
    inspection_date: today,
    problem_description: 'Does not power on', technical_fault: 'Motherboard failure', repair_required: true,
    required_repair_work: 'Replace motherboard', required_spare_parts: 'Motherboard H410', estimated_repair_cost: 18000,
    recommended_actions: ['hardware_repair', 'device_replacement'],
    replacement_reason: '8 years old, parts unavailable', technical_justification: 'Repair cost exceeds 60% of new device',
    estimated_replacement_cost: 85000, submit: true,
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.data.status, 'submitted');
  const kinds = r.body.data.linked_records.map((x) => `${x.kind}:${x.status}`).sort();
  assert.deepEqual(kinds, ['maintenance:pending', 'replacement:pending']);

  const eq = (await admin.get(`/equipment/${pcId}`)).body.data;
  assert.equal(eq.current_condition, 'not_operational');
  assert.equal(eq.status, 'active', 'a recommendation never marks the device replaced');
  assert.equal(eq.inspections.length, 1);
});

test('submitted inspections are permanent', async () => {
  assert.equal((await insp.put(`/inspections/${inspId}`, { inspector_remarks: 'changed' })).status, 409);
  assert.equal((await admin.put(`/inspections/${inspId}`, { inspector_remarks: 'changed' })).status, 409);
  assert.equal((await insp.del(`/inspections/${inspId}`)).status, 409);
  assert.equal((await wardUser.get(`/inspections/${inspId}`)).status, 200, 'ward users see submitted results');
});

test('"good" clears repair fields; an older inspection does not overwrite the latest condition', async () => {
  const r = await insp.post('/inspections', {
    ward_id: W3, equipment_id: upsId, condition: 'good', inspection_date: today,
    problem_description: 'stale text', repair_required: true, estimated_repair_cost: 500, submit: true,
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.data.problem_description, null);
  assert.equal(r.body.data.repair_required, false);
  assert.deepEqual(r.body.data.recommended_actions, ['no_action']);
  assert.equal(r.body.data.linked_records.length, 0);

  const old = await insp2.post('/inspections', {
    ward_id: W3, equipment_id: upsId, condition: 'partial', inspection_date: '2024-01-15', inspection_type: 'initial',
    problem_description: 'Backup only 5 minutes', repair_required: false, recommended_actions: ['general_maintenance'], submit: true,
  });
  assert.equal(old.status, 201, JSON.stringify(old.body));
  insp2Id = old.body.data.id;
  const eq = (await admin.get(`/equipment/${upsId}`)).body.data;
  assert.equal(eq.current_condition, 'good', 'back-dated entry keeps history without overwriting');
  assert.equal(eq.inspections.length, 2);
});

test('future dates and replacement without justification are refused', async () => {
  let r = await insp.post('/inspections', { ward_id: W3, equipment_id: upsId, condition: 'good', inspection_date: '2099-01-01', submit: true });
  assert.equal(r.status, 422);
  assert.ok(r.body.errors.inspection_date);
  r = await insp.post('/inspections', {
    ward_id: W3, equipment_id: upsId, condition: 'damaged', problem_description: 'Burnt', repair_required: false,
    recommended_actions: ['device_replacement'], submit: true,
  });
  assert.equal(r.status, 422);
  assert.ok(r.body.errors.replacement_reason && r.body.errors.technical_justification);
});

test('inspection list: filters and drafts', async () => {
  const d = await insp.post('/inspections', { ward_id: W3 });
  let r = await insp.get(`/inspections?status=draft&mine=true`);
  assert.ok(r.body.data.some((i) => i.id === d.body.data.id));
  r = await admin.get(`/inspections?equipment_id=${upsId}&sort=date&dir=asc`);
  assert.deepEqual(r.body.data.map((i) => i.id)[0], insp2Id);
  r = await admin.get(`/inspections?replacement=true&ward_id=${W3}`);
  assert.ok(r.body.data.every((i) => i.recommended_actions.includes('device_replacement')));
  assert.equal((await insp.del(`/inspections/${d.body.data.id}`)).status, 200, 'drafts can be deleted');
});

/* ---------------- Maintenance ---------------- */

test('maintenance workflow with role-specific approvals', async () => {
  const fault = await wardUser.post('/maintenance', { equipment_id: upsId, reported_problem: 'UPS beeps continuously' });
  assert.equal(fault.status, 201);
  assert.equal(fault.body.data.source, 'ward_report');
  assert.equal((await wardUser.post('/maintenance', { equipment_id: otherWardEq, reported_problem: 'x x x' })).status, 403);
  const id = fault.body.data.id;

  assert.equal((await wardUser.put(`/maintenance/${id}`, { status: 'under_assessment' })).status, 403);
  assert.equal((await insp.put(`/maintenance/${id}`, { status: 'approved' })).status, 403);
  assert.equal((await insp.put(`/maintenance/${id}`, { status: 'completed' })).status, 422);
  assert.equal((await insp.put(`/maintenance/${id}`, { status: 'under_assessment', required_repair: 'Replace battery' })).status, 200);
  const ap = await admin.put(`/maintenance/${id}`, { status: 'approved' });
  assert.equal(ap.body.data.approved_by_name, 'System Administrator');
  const ip = await insp.put(`/maintenance/${id}`, { status: 'in_progress' });
  assert.equal(ip.body.data.maintenance_date, today);
  assert.equal(ip.body.data.technician_display, 'WF insp');
  const done = await insp.put(`/maintenance/${id}`, {
    status: 'completed', spare_parts: [{ part_name: '12V 9Ah battery', quantity: 2, unit_cost: 2750 }],
  });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  assert.equal(done.body.data.repair_cost, 5500, 'cost defaults to the spare parts total');
  assert.equal(done.body.data.completion_date, today);
  assert.equal((await admin.put(`/maintenance/${id}`, { remarks: 'late edit' })).status, 409, 'closed records are locked');

  const photo = await insp.upload(`/maintenance/${id}/photos`, [{ name: 'after.png', type: 'image/png', data: tinyPng() }], { stage: 'after' });
  assert.equal(photo.status, 201);
});

/* ---------------- Replacements ---------------- */

test('replacement approval is Super Admin only; delivery retires the old device', async () => {
  const { body: { data: [req1] } } = await admin.get(`/replacements?search=${A}-PC`);
  assert.equal(req1.status, 'pending');
  assert.equal((await insp.put(`/replacements/${req1.id}`, { status: 'approved' })).status, 403);
  assert.equal((await admin.put(`/replacements/${req1.id}`, { status: 'delivered' })).status, 422, 'cannot skip steps');
  assert.equal((await admin.put(`/replacements/${req1.id}`, { status: 'approved' })).body.data.status, 'approved');
  assert.equal((await admin.get(`/equipment/${pcId}`)).body.data.status, 'active', 'approval alone changes nothing');
  await admin.put(`/replacements/${req1.id}`, { status: 'purchased' });
  await admin.put(`/replacements/${req1.id}`, { status: 'delivered' });
  assert.equal((await admin.get(`/equipment/${pcId}`)).body.data.status, 'replaced');

  const r2 = await insp.post('/replacements', { equipment_id: upsId, reason: 'Battery bank obsolete', technical_recommendation: 'Online UPS 2kVA' });
  assert.equal(r2.status, 201);
  assert.equal((await insp.post('/replacements', { equipment_id: upsId, reason: 'dup dup', technical_recommendation: 'dup dup' })).status, 409);
  const rej = await admin.put(`/replacements/${r2.body.data.id}`, { status: 'rejected' });
  assert.equal(rej.status, 422);
  assert.ok(rej.body.errors.review_remarks);
});

/* ---------------- Dashboard & reports ---------------- */

test('dashboard figures come from the database and respect ward scope', async () => {
  const s = (await wardUser.get('/dashboard/summary')).body.data;
  assert.equal(s.total_wards, 1);
  const { rows: [{ n }] } = await pool.query(`SELECT COUNT(*)::int AS n FROM equipment WHERE ward_id = $1 AND status = 'active'`, [W3]);
  assert.equal(s.total_equipment, n);
  assert.equal(s.good + s.partial + s.non_operational + s.not_inspected, s.total_equipment);

  const c = (await admin.get('/dashboard/charts')).body.data;
  assert.equal(c.by_ward.length, 11);
  for (const k of ['by_condition', 'by_category', 'repairs_by_ward', 'maintenance_status']) assert.ok(Array.isArray(c[k]));
  const filtered = (await admin.get(`/dashboard/summary?ward_id=${W3}&condition=good`)).body.data;
  assert.equal(filtered.total_equipment, filtered.good);
});

test('reports return data and real Excel/PDF files; scoped per ward', async () => {
  const list = await admin.get('/reports');
  assert.equal(list.body.data.length, 9);
  for (const { type } of list.body.data) {
    const r = await admin.get(`/reports/${type}`);
    assert.equal(r.status, 200, `${type}: ${JSON.stringify(r.body).slice(0, 200)}`);
    assert.ok(r.body.data.columns.length && Array.isArray(r.body.data.rows));
  }
  const alias = await admin.get('/reports/ward-wise');
  assert.equal(alias.body.data.type, 'consolidated');

  const inv = (await wardUser.get('/reports/inventory')).body.data;
  assert.ok(inv.rows.every((x) => x.ward_number === 3));

  const xlsx = await admin.raw('/reports/export/excel?type=maintenance');
  assert.equal(xlsx.status, 200);
  assert.equal(xlsx.buf.subarray(0, 2).toString(), 'PK');
  const pdf = await admin.raw(`/reports/export/pdf?type=inspections&ward_id=${W3}`);
  assert.equal(pdf.status, 200);
  assert.equal(pdf.buf.subarray(0, 4).toString(), '%PDF');
  assert.match(pdf.headers.get('content-disposition'), /ward-wise-inspection-report/);
  assert.equal((await admin.raw('/reports/export/pdf?type=nope')).status, 422);
});

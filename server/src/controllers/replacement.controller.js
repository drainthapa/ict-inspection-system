import { query, withTransaction } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ok, created, parsePagination, pageMeta } from '../utils/response.js';
import { audit } from '../utils/audit.js';
import { ROLES } from '../utils/roles.js';
import { assertWardAccess, wardScope } from '../middleware/wardAccess.js';

// Approving never marks a device replaced. Only recording delivery does, and only the Super Admin can.
const TRANSITIONS = {
  pending: ['approved', 'rejected'],
  approved: ['purchased', 'rejected'],
  purchased: ['delivered'],
  rejected: [],
  delivered: [],
};

const SELECT = `
  SELECT r.*, w.ward_number, e.asset_id, e.name AS device_name, e.serial_number, e.status AS equipment_status,
         c.name AS category_name, i.inspection_code,
         rq.full_name AS requested_by_name, rv.full_name AS reviewed_by_name
    FROM replacement_requests r
    JOIN wards w ON w.id = r.ward_id
    JOIN equipment e ON e.id = r.equipment_id
    JOIN equipment_categories c ON c.id = e.category_id
    LEFT JOIN inspections i ON i.id = r.inspection_id
    LEFT JOIN users rq ON rq.id = r.requested_by
    LEFT JOIN users rv ON rv.id = r.reviewed_by`;

const invalid = (errors) => new ApiError(422, 'Please correct the highlighted fields', errors);
const load = async (id, db = { query }) => (await db.query(`${SELECT} WHERE r.id = $1`, [id])).rows[0];

// GET /api/replacements
export const listReplacements = asyncHandler(async (req, res) => {
  const q = req.query;
  const { page, limit, offset } = parsePagination(q);
  const params = [];
  const where = [wardScope(req, 'r.ward_id', params)];
  const add = (sql, v) => { params.push(v); where.push(sql.replaceAll('$?', `$${params.length}`)); };
  if (q.status) add('r.status = $?', q.status);
  if (q.ward_id) add('r.ward_id = $?', q.ward_id);
  if (q.category_id) add('e.category_id = $?', q.category_id);
  if (q.search) add('(r.request_code ILIKE $? OR e.name ILIKE $? OR e.asset_id ILIKE $? OR e.serial_number ILIKE $?)', `%${q.search}%`);
  const whereSql = where.join(' AND ');
  const from = SELECT.slice(SELECT.indexOf('FROM replacement_requests'));
  const { rows: [{ total }] } = await query(`SELECT COUNT(*)::int AS total ${from} WHERE ${whereSql}`, params);
  params.push(limit, offset);
  const { rows } = await query(
    `${SELECT} WHERE ${whereSql}
      ORDER BY CASE r.status WHEN 'pending' THEN 1 WHEN 'approved' THEN 2 WHEN 'purchased' THEN 3 ELSE 4 END, r.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`, params,
  );
  ok(res, rows, { meta: pageMeta(page, limit, total) });
});

// GET /api/replacements/:id
export const getReplacement = asyncHandler(async (req, res) => {
  const r = await load(req.params.id);
  if (!r) throw ApiError.notFound('Replacement request not found');
  assertWardAccess(req, r.ward_id);
  ok(res, r);
});

// POST /api/replacements  (Super Admin, Inspector)
export const createReplacement = asyncHandler(async (req, res) => {
  const b = req.body;
  const { rows: [eq] } = await query('SELECT id, ward_id, status, current_condition FROM equipment WHERE id = $1', [b.equipment_id]);
  if (!eq) throw invalid({ equipment_id: 'Equipment not found' });
  assertWardAccess(req, eq.ward_id);
  if (eq.status !== 'active') throw invalid({ equipment_id: 'This equipment is no longer in use' });

  const r = await withTransaction(async (db) => {
    const { rows } = await db.query(
      `INSERT INTO replacement_requests (equipment_id, ward_id, current_condition, reason, technical_recommendation,
                                         estimated_cost, remarks, requested_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [eq.id, eq.ward_id, eq.current_condition, b.reason, b.technical_recommendation, b.estimated_cost ?? null,
        b.remarks ?? null, req.user.id],
    ).catch((err) => {
      if (err.constraint === 'replacement_requests_one_open_uq') throw ApiError.conflict('This device already has an open replacement request');
      throw err;
    });
    await audit(req, 'replacement.requested', { entityType: 'replacement', entityId: rows[0].id, details: { equipment_id: eq.id } }, db);
    return load(rows[0].id, db);
  });
  created(res, r, 'Replacement recommended');
});

// PUT /api/replacements/:id
export const updateReplacement = asyncHandler(async (req, res) => {
  const b = req.body;
  const r = await withTransaction(async (db) => {
    const { rows: [cur] } = await db.query('SELECT * FROM replacement_requests WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!cur) throw ApiError.notFound('Replacement request not found');
    assertWardAccess(req, cur.ward_id);
    const admin = req.user.role === ROLES.SUPER_ADMIN;
    const sets = {};

    if (b.status && b.status !== cur.status) {
      if (!admin) throw ApiError.forbidden('Only the Super Admin can approve, reject or progress replacement requests');
      if (!TRANSITIONS[cur.status].includes(b.status)) {
        throw invalid({ status: `Cannot move from ${cur.status} to ${b.status}` });
      }
      if (b.status === 'rejected' && !(b.review_remarks || '').trim()) {
        throw invalid({ review_remarks: 'Give a reason for rejecting this request' });
      }
      sets.status = b.status;
      if (['approved', 'rejected'].includes(b.status)) { sets.reviewed_by = req.user.id; sets.reviewed_at = new Date(); }
      if (b.status === 'delivered') {
        // Delivery is the confirmed replacement: retire the old device
        await db.query(`UPDATE equipment SET status = 'replaced' WHERE id = $1`, [cur.equipment_id]);
      }
    }

    const editable = admin ? ['reason', 'technical_recommendation', 'estimated_cost', 'remarks', 'review_remarks']
      : ['reason', 'technical_recommendation', 'estimated_cost', 'remarks'];
    const wantsEdit = editable.some((f) => b[f] !== undefined);
    if (wantsEdit && !admin && (cur.status !== 'pending' || cur.requested_by !== req.user.id)) {
      throw ApiError.forbidden('You can only edit your own requests while they are pending');
    }
    if (wantsEdit && ['rejected', 'delivered'].includes(cur.status)) throw ApiError.conflict('This request is closed');
    editable.forEach((f) => { if (b[f] !== undefined) sets[f] = b[f]; });

    const cols = Object.keys(sets);
    if (cols.length) {
      await db.query(
        `UPDATE replacement_requests SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')} WHERE id = $${cols.length + 1}`,
        [...cols.map((c) => sets[c]), cur.id],
      );
    }
    await audit(req, sets.status ? `replacement.${sets.status}` : 'replacement.updated', {
      entityType: 'replacement', entityId: cur.id, details: { from: cur.status, to: sets.status ?? cur.status },
    }, db);
    return load(cur.id, db);
  });
  ok(res, r, { message: 'Replacement request updated' });
});

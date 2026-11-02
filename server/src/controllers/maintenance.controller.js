import { query, withTransaction } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ok, created, parsePagination, pageMeta } from '../utils/response.js';
import { audit } from '../utils/audit.js';
import { ROLES } from '../utils/roles.js';
import { saveImages, removeFiles } from '../utils/uploads.js';
import { assertWardAccess, wardScope } from '../middleware/wardAccess.js';

/** Allowed status moves. `admin: true` marks moves only the Super Admin may make. */
const TRANSITIONS = {
  pending: { under_assessment: {}, approved: { admin: true }, not_repairable: {}, cancelled: { admin: true } },
  under_assessment: { approved: { admin: true }, not_repairable: {}, cancelled: { admin: true } },
  approved: { in_progress: {}, cancelled: { admin: true } },
  in_progress: { completed: {}, not_repairable: {} },
  completed: {},
  not_repairable: {},
  cancelled: {},
};
export const OPEN_STATUSES = ['pending', 'under_assessment', 'approved', 'in_progress'];

const SELECT = `
  SELECT m.*, w.ward_number, e.asset_id, e.name AS equipment_name, e.serial_number, e.current_condition,
         c.name AS category_name, i.inspection_code,
         rb.full_name AS reported_by_name, ab.full_name AS approved_by_name,
         COALESCE(m.technician_name, tu.full_name) AS technician_display,
         (SELECT COALESCE(SUM(total_cost), 0) FROM maintenance_spare_parts sp WHERE sp.maintenance_id = m.id)::float AS parts_cost
    FROM maintenance m
    JOIN wards w ON w.id = m.ward_id
    JOIN equipment e ON e.id = m.equipment_id
    JOIN equipment_categories c ON c.id = e.category_id
    LEFT JOIN inspections i ON i.id = m.inspection_id
    LEFT JOIN users rb ON rb.id = m.reported_by
    LEFT JOIN users ab ON ab.id = m.approved_by
    LEFT JOIN users tu ON tu.id = m.technician_id`;

const invalid = (errors) => new ApiError(422, 'Please correct the highlighted fields', errors);

async function loadMaintenance(id, db = { query }) {
  const { rows: [m] } = await db.query(`${SELECT} WHERE m.id = $1`, [id]);
  if (!m) return null;
  const [parts, photos] = await Promise.all([
    db.query('SELECT id, part_name, quantity, unit_cost, total_cost, remarks FROM maintenance_spare_parts WHERE maintenance_id = $1 ORDER BY id', [id]),
    db.query('SELECT id, stage, file_path, original_name, caption, created_at FROM maintenance_photos WHERE maintenance_id = $1 ORDER BY id', [id]),
  ]);
  return { ...m, spare_parts: parts.rows, photos: photos.rows };
}

// GET /api/maintenance
export const listMaintenance = asyncHandler(async (req, res) => {
  const q = req.query;
  const { page, limit, offset } = parsePagination(q);
  const params = [];
  const where = [wardScope(req, 'm.ward_id', params)];
  const add = (sql, v) => { params.push(v); where.push(sql.replaceAll('$?', `$${params.length}`)); };

  if (q.status === 'open') where.push(`m.status IN ('pending','under_assessment','approved','in_progress')`);
  else if (q.status) add('m.status = $?', q.status);
  if (q.ward_id) add('m.ward_id = $?', q.ward_id);
  if (q.equipment_id) add('m.equipment_id = $?', q.equipment_id);
  if (q.category_id) add('e.category_id = $?', q.category_id);
  if (q.source) add('m.source = $?', q.source);
  if (q.date_from) add('m.created_at >= $?::date', q.date_from);
  if (q.date_to) add(`m.created_at < $?::date + INTERVAL '1 day'`, q.date_to);
  if (q.search) {
    add(`(m.maintenance_code ILIKE $? OR e.name ILIKE $? OR e.asset_id ILIKE $? OR e.serial_number ILIKE $?
          OR m.reported_problem ILIKE $?)`, `%${q.search}%`);
  }
  const whereSql = where.join(' AND ');
  const from = SELECT.slice(SELECT.indexOf('FROM maintenance m'));
  const { rows: [{ total }] } = await query(`SELECT COUNT(*)::int AS total ${from} WHERE ${whereSql}`, params);
  params.push(limit, offset);
  const { rows } = await query(
    `${SELECT} WHERE ${whereSql}
      ORDER BY CASE m.status WHEN 'pending' THEN 1 WHEN 'under_assessment' THEN 2 WHEN 'approved' THEN 3
                             WHEN 'in_progress' THEN 4 ELSE 5 END, m.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`, params,
  );
  ok(res, rows, { meta: pageMeta(page, limit, total) });
});

// GET /api/maintenance/:id
export const getMaintenance = asyncHandler(async (req, res) => {
  const m = await loadMaintenance(req.params.id);
  if (!m) throw ApiError.notFound('Maintenance record not found');
  assertWardAccess(req, m.ward_id);
  ok(res, m);
});

// POST /api/maintenance
// Ward office users report faults; inspectors and the Super Admin can log maintenance directly.
export const createMaintenance = asyncHandler(async (req, res) => {
  const b = req.body;
  const { rows: [eq] } = await query('SELECT id, ward_id, status FROM equipment WHERE id = $1', [b.equipment_id]);
  if (!eq) throw invalid({ equipment_id: 'Equipment not found' });
  assertWardAccess(req, eq.ward_id);
  if (eq.status !== 'active') throw invalid({ equipment_id: 'This equipment is no longer in use' });

  const source = req.user.role === ROLES.WARD_USER ? 'ward_report' : 'manual';
  const m = await withTransaction(async (db) => {
    const { rows } = await db.query(
      `INSERT INTO maintenance (equipment_id, ward_id, source, reported_problem, required_repair, remarks, reported_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [eq.id, eq.ward_id, source, b.reported_problem, source === 'ward_report' ? null : b.required_repair ?? null,
        b.remarks ?? null, req.user.id],
    );
    await audit(req, source === 'ward_report' ? 'maintenance.fault_reported' : 'maintenance.created',
      { entityType: 'maintenance', entityId: rows[0].id, details: { equipment_id: eq.id } }, db);
    return loadMaintenance(rows[0].id, db);
  });
  created(res, m, source === 'ward_report' ? 'Fault reported' : 'Maintenance record created');
});

// PUT /api/maintenance/:id   (Super Admin, Inspector)
export const updateMaintenance = asyncHandler(async (req, res) => {
  const b = req.body;
  const m = await withTransaction(async (db) => {
    const { rows: [cur] } = await db.query('SELECT * FROM maintenance WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!cur) throw ApiError.notFound('Maintenance record not found');
    assertWardAccess(req, cur.ward_id);
    const admin = req.user.role === ROLES.SUPER_ADMIN;

    if (['completed', 'not_repairable', 'cancelled'].includes(cur.status)) {
      throw ApiError.conflict('This maintenance record is closed and can no longer be changed');
    }

    const next = b.status ?? cur.status;
    const sets = {};
    if (next !== cur.status) {
      const rule = TRANSITIONS[cur.status][next];
      if (!rule) throw invalid({ status: `Cannot move from ${cur.status.replace('_', ' ')} to ${next.replace('_', ' ')}` });
      if (rule.admin && !admin) throw ApiError.forbidden('Only the Super Admin can approve or cancel maintenance');
      sets.status = next;
      if (next === 'approved') { sets.approved_by = req.user.id; sets.approved_at = new Date(); }
    }

    ['required_repair', 'technician_name', 'maintenance_date', 'repair_cost', 'completion_date', 'remarks']
      .forEach((f) => { if (b[f] !== undefined) sets[f] = b[f]; });
    if (b.technician_id !== undefined) {
      if (b.technician_id) {
        const { rows: [t] } = await db.query(
          `SELECT u.full_name FROM users u JOIN roles r ON r.id = u.role_id
            WHERE u.id = $1 AND u.is_active AND r.name IN ('inspector','super_admin')`, [b.technician_id],
        );
        if (!t) throw invalid({ technician_id: 'Choose an active inspector or technician' });
      }
      sets.technician_id = b.technician_id || null;
    }
    // Starting work defaults the maintenance date and technician
    if (next === 'in_progress' && cur.status !== 'in_progress') {
      sets.maintenance_date ??= cur.maintenance_date ?? new Date().toISOString().slice(0, 10);
      if (!cur.technician_id && sets.technician_id === undefined && !cur.technician_name && !sets.technician_name) {
        sets.technician_id = req.user.id;
      }
    }

    if (b.spare_parts !== undefined) {
      await db.query('DELETE FROM maintenance_spare_parts WHERE maintenance_id = $1', [cur.id]);
      for (const p of b.spare_parts) {
        await db.query(
          `INSERT INTO maintenance_spare_parts (maintenance_id, part_name, quantity, unit_cost, remarks)
           VALUES ($1, $2, $3, $4, $5)`,
          [cur.id, p.part_name, p.quantity ?? 1, p.unit_cost ?? 0, p.remarks ?? null],
        );
      }
    }

    if (next === 'completed') {
      sets.completion_date ??= cur.completion_date ?? new Date().toISOString().slice(0, 10);
      if ((sets.repair_cost ?? cur.repair_cost) == null) {
        const { rows: [{ s }] } = await db.query(
          'SELECT COALESCE(SUM(total_cost), 0)::float AS s FROM maintenance_spare_parts WHERE maintenance_id = $1', [cur.id],
        );
        sets.repair_cost = s;
      }
      const start = sets.maintenance_date ?? cur.maintenance_date;
      if (start && sets.completion_date < start) throw invalid({ completion_date: 'Completion cannot be before the maintenance date' });
    }

    const cols = Object.keys(sets);
    if (cols.length) {
      await db.query(
        `UPDATE maintenance SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')} WHERE id = $${cols.length + 1}`,
        [...cols.map((c) => sets[c]), cur.id],
      );
    }
    await audit(req, next !== cur.status ? `maintenance.${next}` : 'maintenance.updated', {
      entityType: 'maintenance', entityId: cur.id, details: { from: cur.status, to: next, changed: cols },
    }, db);
    return loadMaintenance(cur.id, db);
  });
  ok(res, m, { message: 'Maintenance updated' });
});

// POST /api/maintenance/:id/photos   multipart: photos[], stage=before|after
export const uploadMaintenancePhotos = asyncHandler(async (req, res) => {
  if (!req.files?.length) throw ApiError.badRequest('Choose at least one photo');
  const stage = req.body.stage === 'after' ? 'after' : 'before';
  const { rows: [m] } = await query('SELECT id, ward_id, status FROM maintenance WHERE id = $1', [req.params.id]);
  if (!m) throw ApiError.notFound('Maintenance record not found');
  assertWardAccess(req, m.ward_id);
  if (['cancelled'].includes(m.status)) throw ApiError.conflict('This maintenance record is cancelled');

  const saved = await saveImages(req.files, 'maintenance');
  try {
    const out = await withTransaction(async (db) => {
      const rows = [];
      for (const s of saved) {
        const r = await db.query(
          `INSERT INTO maintenance_photos (maintenance_id, stage, file_path, original_name, mime_type, size_bytes, caption, uploaded_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, stage, file_path, original_name, caption, created_at`,
          [m.id, stage, s.file_path, s.original_name, s.mime_type, s.size_bytes, req.body.caption?.trim() || null, req.user.id],
        );
        rows.push(r.rows[0]);
      }
      await audit(req, 'maintenance.photos_added', { entityType: 'maintenance', entityId: m.id, details: { stage, count: rows.length } }, db);
      return rows;
    });
    created(res, out, 'Photos uploaded');
  } catch (err) {
    await removeFiles(saved.map((s) => s.file_path));
    throw err;
  }
});

// DELETE /api/maintenance/:id/photos/:photoId
export const deleteMaintenancePhoto = asyncHandler(async (req, res) => {
  const { rows: [m] } = await query('SELECT id, ward_id, status FROM maintenance WHERE id = $1', [req.params.id]);
  if (!m) throw ApiError.notFound('Maintenance record not found');
  assertWardAccess(req, m.ward_id);
  if (['completed', 'not_repairable', 'cancelled'].includes(m.status)) throw ApiError.conflict('This maintenance record is closed');
  const { rows } = await query('DELETE FROM maintenance_photos WHERE id = $1 AND maintenance_id = $2 RETURNING file_path', [req.params.photoId, m.id]);
  if (!rows[0]) throw ApiError.notFound('Photo not found');
  await removeFiles([rows[0].file_path]);
  ok(res, null, { message: 'Photo removed' });
});

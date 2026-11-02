import { query, withTransaction } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ok, created, parsePagination, pageMeta } from '../utils/response.js';
import { audit } from '../utils/audit.js';
import { ROLES } from '../utils/roles.js';
import { saveImages, removeFiles } from '../utils/uploads.js';
import { assertWardAccess, wardScope } from '../middleware/wardAccess.js';

const EDITABLE = [
  'ward_id', 'equipment_id', 'category_id', 'inspection_date', 'inspection_type', 'condition',
  'problem_description', 'technical_fault', 'repair_required', 'required_repair_work', 'required_spare_parts',
  'estimated_repair_cost', 'recommended_actions', 'recommendation', 'replacement_reason',
  'technical_justification', 'estimated_replacement_cost', 'inspector_remarks',
];
const REPAIR_FIELDS = [
  'problem_description', 'technical_fault', 'required_repair_work', 'required_spare_parts', 'estimated_repair_cost',
];

const LIST_SELECT = `
  SELECT i.id, i.inspection_code, i.inspection_date, i.inspection_type, i.condition, i.status,
         i.repair_required, i.estimated_repair_cost, i.recommended_actions, i.submitted_at, i.updated_at,
         i.ward_id, w.ward_number, i.equipment_id, e.asset_id, e.name AS equipment_name, e.serial_number,
         COALESCE(c.name, ec.name) AS category_name, i.inspector_id, u.full_name AS inspector_name,
         (SELECT COUNT(*)::int FROM inspection_photos p WHERE p.inspection_id = i.id) AS photo_count
    FROM inspections i
    JOIN wards w ON w.id = i.ward_id
    JOIN users u ON u.id = i.inspector_id
    LEFT JOIN equipment e ON e.id = i.equipment_id
    LEFT JOIN equipment_categories ec ON ec.id = e.category_id
    LEFT JOIN equipment_categories c ON c.id = i.category_id`;

const SORT = {
  date: 'i.inspection_date', ward: 'w.ward_number', equipment: 'LOWER(e.name)',
  condition: `CASE i.condition WHEN 'damaged' THEN 1 WHEN 'not_operational' THEN 2 WHEN 'partial' THEN 3 WHEN 'good' THEN 4 ELSE 5 END`,
};

const invalid = (errors) => new ApiError(422, 'Please correct the highlighted fields', errors);
const isAdmin = (req) => req.user.role === ROLES.SUPER_ADMIN;

/** Who may see an inspection: drafts are private to their author (and the Super Admin). */
function assertCanView(req, insp) {
  assertWardAccess(req, insp.ward_id);
  if (insp.status === 'draft' && !isAdmin(req) && insp.inspector_id !== req.user.id) {
    throw ApiError.notFound('Inspection not found');
  }
}

function assertCanEdit(req, insp) {
  assertCanView(req, insp);
  if (insp.status !== 'draft') {
    throw ApiError.conflict('Submitted inspections are part of the permanent record and cannot be changed. Start a follow-up inspection instead.');
  }
  if (!isAdmin(req) && insp.inspector_id !== req.user.id) throw ApiError.forbidden('Only the inspector who started this draft can edit it');
}

export async function loadInspection(id, db = { query }) {
  const { rows } = await db.query(
    `${LIST_SELECT.replace('SELECT i.id,', 'SELECT i.*, i.id,')}
     WHERE i.id = $1`, [id],
  );
  const insp = rows[0];
  if (!insp) return null;
  const [checklist, photos, equipment, linked] = await Promise.all([
    db.query(
      `SELECT r.checklist_item_id, r.result, r.remarks, ci.label, ci.checklist_group
         FROM inspection_checklist_results r JOIN inspection_checklist_items ci ON ci.id = r.checklist_item_id
        WHERE r.inspection_id = $1 ORDER BY ci.sort_order`, [id],
    ),
    db.query(
      `SELECT id, file_path, original_name, mime_type, size_bytes, photo_type, caption, created_at
         FROM inspection_photos WHERE inspection_id = $1 ORDER BY id`, [id],
    ),
    insp.equipment_id
      ? db.query(
        `SELECT e.id, e.asset_id, e.name, e.brand, e.model, e.serial_number, e.installation_location,
                e.equipment_type, c.name AS category_name, c.checklist_group
           FROM equipment e JOIN equipment_categories c ON c.id = e.category_id WHERE e.id = $1`, [insp.equipment_id],
      )
      : { rows: [] },
    db.query(
      `SELECT 'maintenance' AS kind, id, maintenance_code AS code, status FROM maintenance WHERE inspection_id = $1
       UNION ALL
       SELECT 'replacement', id, request_code, status FROM replacement_requests WHERE inspection_id = $1`, [id],
    ),
  ]);
  return {
    ...insp,
    checklist: checklist.rows,
    photos: photos.rows,
    equipment: equipment.rows[0] ?? null,
    linked_records: linked.rows,
  };
}

/** Normalise according to the conditional form rules before saving. */
function normalise(data) {
  const d = { ...data };
  if (d.condition === 'good') {
    // Fully operational: repair fields do not apply
    REPAIR_FIELDS.forEach((f) => { d[f] = null; });
    d.repair_required = false;
    if (d.recommended_actions === undefined || d.recommended_actions.length === 0) d.recommended_actions = ['no_action'];
  }
  if (d.recommended_actions && !d.recommended_actions.includes('device_replacement')) {
    d.replacement_reason = null;
    d.technical_justification = null;
    d.estimated_replacement_cost = null;
  }
  if (d.recommended_actions?.includes('no_action') && d.recommended_actions.length > 1) {
    throw invalid({ recommended_actions: '“No action required” cannot be combined with other actions' });
  }
  return d;
}

/** Everything a submitted inspection must contain. Returns a field → message map. */
function submissionErrors(d) {
  const e = {};
  const blank = (v) => v === null || v === undefined || String(v).trim() === '';
  if (!d.equipment_id) e.equipment_id = 'Choose or register the equipment';
  if (!d.condition) e.condition = 'Select the device condition';
  if (!d.inspection_date) e.inspection_date = 'Enter the inspection date';
  else if (d.inspection_date > new Date().toISOString().slice(0, 10)) e.inspection_date = 'The inspection date cannot be in the future';
  if (!d.recommended_actions?.length) e.recommended_actions = 'Choose at least one recommended action';
  if (d.condition && d.condition !== 'good') {
    if (blank(d.problem_description)) e.problem_description = 'Describe the problem';
    if (d.repair_required === null || d.repair_required === undefined) e.repair_required = 'Say whether repair is required';
    if (d.repair_required && blank(d.required_repair_work)) e.required_repair_work = 'Describe the repair work required';
  }
  if (d.recommended_actions?.includes('device_replacement')) {
    if (blank(d.replacement_reason)) e.replacement_reason = 'Give the reason for replacement';
    if (blank(d.technical_justification)) e.technical_justification = 'Give the technical justification';
  }
  return e;
}

/** Check the equipment belongs to the ward, and derive the category from it. */
async function resolveEquipment(db, d) {
  if (!d.equipment_id) return d;
  const { rows } = await db.query('SELECT id, ward_id, category_id, status FROM equipment WHERE id = $1', [d.equipment_id]);
  const eq = rows[0];
  if (!eq) throw invalid({ equipment_id: 'Equipment not found' });
  if (eq.ward_id !== Number(d.ward_id)) throw invalid({ equipment_id: 'This equipment is registered to a different ward' });
  if (eq.status !== 'active') throw invalid({ equipment_id: 'This equipment is no longer in use' });
  return { ...d, category_id: eq.category_id };
}

async function saveChecklist(db, inspectionId, categoryId, items) {
  if (items === undefined) return;
  await db.query('DELETE FROM inspection_checklist_results WHERE inspection_id = $1', [inspectionId]);
  if (!items.length) return;
  const ids = items.map((i) => i.checklist_item_id);
  const { rows } = await db.query(
    `SELECT ci.id FROM inspection_checklist_items ci
       JOIN equipment_categories c ON c.checklist_group = ci.checklist_group
      WHERE c.id = $1 AND ci.id = ANY($2::int[])`,
    [categoryId, ids],
  );
  if (rows.length !== new Set(ids).size) throw invalid({ checklist: 'Checklist items do not match this equipment category' });
  for (const it of items) {
    await db.query(
      `INSERT INTO inspection_checklist_results (inspection_id, checklist_item_id, result, remarks)
       VALUES ($1, $2, $3, $4)`,
      [inspectionId, it.checklist_item_id, it.result, it.remarks?.trim() || null],
    );
  }
}

/**
 * Submission side effects, in the caller's transaction:
 * - update the device's latest condition (only if this is its newest inspection)
 * - open a maintenance request when repair is required
 * - open a replacement request (pending Super Admin approval) when replacement is recommended
 */
async function applySubmission(req, db, insp) {
  const { rows: latest } = await db.query(
    `SELECT id FROM inspections WHERE equipment_id = $1 AND status = 'submitted'
      ORDER BY inspection_date DESC, submitted_at DESC, id DESC LIMIT 1`, [insp.equipment_id],
  );
  if (latest[0]?.id === insp.id) {
    await db.query(
      `UPDATE equipment SET current_condition = $1, condition_updated_at = NOW(), last_inspection_id = $2 WHERE id = $3`,
      [insp.condition, insp.id, insp.equipment_id],
    );
  }

  if (insp.repair_required) {
    await db.query(
      `INSERT INTO maintenance (equipment_id, ward_id, inspection_id, source, reported_problem, required_repair,
                                repair_cost, status, reported_by, remarks)
       VALUES ($1, $2, $3, 'inspection', $4, $5, NULL, 'pending', $6, $7)`,
      [insp.equipment_id, insp.ward_id, insp.id,
        insp.problem_description || insp.technical_fault || 'Repair recommended by inspection',
        [insp.required_repair_work, insp.required_spare_parts && `Spare parts: ${insp.required_spare_parts}`]
          .filter(Boolean).join('\n') || null,
        insp.inspector_id,
        insp.estimated_repair_cost != null ? `Estimated cost at inspection: ${insp.estimated_repair_cost}` : null],
    );
  }

  if (insp.recommended_actions.includes('device_replacement')) {
    await db.query(
      `INSERT INTO replacement_requests (equipment_id, ward_id, inspection_id, current_condition, reason,
                                         technical_recommendation, estimated_cost, status, requested_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8)`,
      [insp.equipment_id, insp.ward_id, insp.id, insp.condition, insp.replacement_reason,
        insp.technical_justification, insp.estimated_replacement_cost, insp.inspector_id],
    ).catch((err) => {
      if (err.constraint === 'replacement_requests_one_open_uq') {
        throw ApiError.conflict('This device already has an open replacement request. Remove “Complete device replacement” or follow up the existing request.');
      }
      throw err;
    });
  }
}

async function persist(req, db, id, data, submit) {
  const cols = EDITABLE.filter((c) => data[c] !== undefined);
  const params = cols.map((c) => data[c]);
  let sql;
  if (id) {
    params.push(id);
    sql = `UPDATE inspections SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')} WHERE id = $${params.length} RETURNING id`;
    if (!cols.length) sql = 'SELECT id FROM inspections WHERE id = $1';
  } else {
    params.push(req.user.id);
    sql = `INSERT INTO inspections (${[...cols, 'inspector_id'].join(', ')})
           VALUES (${params.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`;
  }
  const { rows } = await db.query(sql, params);
  const inspectionId = rows[0].id;

  if (data.checklist !== undefined) {
    const { rows: [cur] } = await db.query('SELECT category_id FROM inspections WHERE id = $1', [inspectionId]);
    if (data.checklist.length && !cur.category_id) throw invalid({ checklist: 'Choose the equipment before filling the checklist' });
    await saveChecklist(db, inspectionId, cur.category_id, data.checklist);
  }

  if (submit) {
    const { rows: [full] } = await db.query('SELECT * FROM inspections WHERE id = $1', [inspectionId]);
    const errors = submissionErrors(full);
    if (Object.keys(errors).length) throw invalid(errors);
    await db.query(`UPDATE inspections SET status = 'submitted', submitted_at = NOW() WHERE id = $1`, [inspectionId]);
    await applySubmission(req, db, { ...full, status: 'submitted' });
  }
  return inspectionId;
}

// GET /api/inspections
export const listInspections = asyncHandler(async (req, res) => {
  const q = req.query;
  const { page, limit, offset } = parsePagination(q);
  const params = [];
  const where = [wardScope(req, 'i.ward_id', params)];
  const add = (sql, v) => { params.push(v); where.push(sql.replaceAll('$?', `$${params.length}`)); };

  // Drafts are visible only to their author and the Super Admin; ward users never see drafts
  if (req.user.role === ROLES.WARD_USER) where.push(`i.status = 'submitted'`);
  else if (!isAdmin(req)) add(`(i.status = 'submitted' OR i.inspector_id = $?)`, req.user.id);

  if (q.status) add('i.status = $?', q.status);
  if (q.ward_id) add('i.ward_id = $?', q.ward_id);
  if (q.category_id) add('i.category_id = $?', q.category_id);
  if (q.equipment_id) add('i.equipment_id = $?', q.equipment_id);
  if (q.inspector_id) add('i.inspector_id = $?', q.inspector_id);
  if (q.mine === 'true') add('i.inspector_id = $?', req.user.id);
  if (q.condition) add('i.condition = $?', q.condition);
  if (q.inspection_type) add('i.inspection_type = $?', q.inspection_type);
  if (q.repair_required) add('i.repair_required = $?', q.repair_required === 'true');
  if (q.replacement === 'true') where.push(`'device_replacement' = ANY(i.recommended_actions)`);
  if (q.date_from) add('i.inspection_date >= $?', q.date_from);
  if (q.date_to) add('i.inspection_date <= $?', q.date_to);
  if (q.search) {
    params.push(`%${q.search}%`);
    const p = `$${params.length}`;
    where.push(`(i.inspection_code ILIKE ${p} OR e.name ILIKE ${p} OR e.asset_id ILIKE ${p}
                 OR e.serial_number ILIKE ${p} OR e.brand ILIKE ${p} OR e.model ILIKE ${p}
                 OR u.full_name ILIKE ${p} OR w.ward_number::text = $${params.length + 1})`);
    params.push(q.search.replace(/^ward\s*(no\.?)?\s*/i, ''));
  }
  const whereSql = where.join(' AND ');
  const from = LIST_SELECT.slice(LIST_SELECT.indexOf('FROM inspections'));
  const { rows: [{ total }] } = await query(`SELECT COUNT(*)::int AS total ${from} WHERE ${whereSql}`, params);

  const dir = q.dir === 'asc' ? 'ASC' : 'DESC';
  params.push(limit, offset);
  const { rows } = await query(
    `${LIST_SELECT} WHERE ${whereSql}
      ORDER BY ${SORT[q.sort] || SORT.date} ${dir} NULLS LAST, i.id DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`, params,
  );
  ok(res, rows, { meta: pageMeta(page, limit, total) });
});

// GET /api/inspections/:id
export const getInspection = asyncHandler(async (req, res) => {
  const insp = await loadInspection(req.params.id);
  if (!insp) throw ApiError.notFound('Inspection not found');
  assertCanView(req, insp);
  ok(res, insp);
});

// GET /api/inspections/checklist?category_id=
export const getChecklist = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT ci.id, ci.label, ci.checklist_group, ci.sort_order
       FROM inspection_checklist_items ci
       JOIN equipment_categories c ON c.checklist_group = ci.checklist_group
      WHERE c.id = $1 AND ci.is_active ORDER BY ci.sort_order`, [req.query.category_id],
  );
  ok(res, rows);
});

// POST /api/inspections   (body.submit = true to submit straight away)
export const createInspection = asyncHandler(async (req, res) => {
  assertWardAccess(req, req.body.ward_id);
  const result = await withTransaction(async (db) => {
    const data = normalise(await resolveEquipment(db, req.body));
    const id = await persist(req, db, null, data, req.body.submit);
    await audit(req, req.body.submit ? 'inspection.submitted' : 'inspection.draft_saved', { entityType: 'inspection', entityId: id }, db);
    return loadInspection(id, db);
  });
  created(res, result, req.body.submit ? 'Inspection submitted' : 'Draft saved');
});

// PUT /api/inspections/:id
export const updateInspection = asyncHandler(async (req, res) => {
  const result = await withTransaction(async (db) => {
    const { rows: [current] } = await db.query('SELECT * FROM inspections WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!current) throw ApiError.notFound('Inspection not found');
    assertCanEdit(req, current);
    if (req.body.ward_id !== undefined && req.body.ward_id !== current.ward_id) assertWardAccess(req, req.body.ward_id);

    // Merge the stored draft with the changes, then apply the same rules as on create
    const merged = { ...current, ...req.body };
    const data = normalise(await resolveEquipment(db, merged));
    if (req.body.checklist === undefined) delete data.checklist;
    const id = await persist(req, db, current.id, data, req.body.submit);
    await audit(req, req.body.submit ? 'inspection.submitted' : 'inspection.draft_saved', { entityType: 'inspection', entityId: id }, db);
    return loadInspection(id, db);
  });
  ok(res, result, { message: req.body.submit ? 'Inspection submitted' : 'Draft saved' });
});

// DELETE /api/inspections/:id   (drafts only)
export const deleteInspection = asyncHandler(async (req, res) => {
  const files = await withTransaction(async (db) => {
    const { rows: [current] } = await db.query('SELECT * FROM inspections WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!current) throw ApiError.notFound('Inspection not found');
    assertCanEdit(req, current);
    const { rows } = await db.query('SELECT file_path FROM inspection_photos WHERE inspection_id = $1', [current.id]);
    await db.query('DELETE FROM inspections WHERE id = $1', [current.id]);
    await audit(req, 'inspection.draft_deleted', { entityType: 'inspection', entityId: current.id }, db);
    return rows.map((r) => r.file_path);
  });
  await removeFiles(files);
  ok(res, null, { message: 'Draft deleted' });
});

// POST /api/inspections/:id/photos   multipart: photos[], photo_type, caption
export const uploadPhotos = asyncHandler(async (req, res) => {
  if (!req.files?.length) throw ApiError.badRequest('Choose at least one photo');
  const { rows: [insp] } = await query('SELECT * FROM inspections WHERE id = $1', [req.params.id]);
  if (!insp) throw ApiError.notFound('Inspection not found');
  assertCanEdit(req, insp);

  const { rows: [{ n }] } = await query('SELECT COUNT(*)::int AS n FROM inspection_photos WHERE inspection_id = $1', [insp.id]);
  const { rows: [setting] } = await query(`SELECT value FROM system_settings WHERE key = 'max_photos_per_inspection'`);
  const max = Number(setting?.value) || 10;
  if (n + req.files.length > max) {
    throw ApiError.badRequest(`An inspection can have at most ${max} photos (${n} already added)`);
  }

  const saved = await saveImages(req.files, 'inspections');
  try {
    const photos = await withTransaction(async (db) => {
      const out = [];
      for (const s of saved) {
        const { rows } = await db.query(
          `INSERT INTO inspection_photos (inspection_id, file_path, original_name, mime_type, size_bytes, photo_type, caption, uploaded_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id, file_path, original_name, mime_type, size_bytes, photo_type, caption, created_at`,
          [insp.id, s.file_path, s.original_name, s.mime_type, s.size_bytes,
            req.body.photo_type || 'general', req.body.caption?.trim() || null, req.user.id],
        );
        out.push(rows[0]);
      }
      await audit(req, 'inspection.photos_added', { entityType: 'inspection', entityId: insp.id, details: { count: out.length } }, db);
      return out;
    });
    created(res, photos, `${photos.length} photo${photos.length > 1 ? 's' : ''} uploaded`);
  } catch (err) {
    await removeFiles(saved.map((s) => s.file_path));
    throw err;
  }
});

// DELETE /api/inspections/:id/photos/:photoId
export const deletePhoto = asyncHandler(async (req, res) => {
  const { rows: [insp] } = await query('SELECT * FROM inspections WHERE id = $1', [req.params.id]);
  if (!insp) throw ApiError.notFound('Inspection not found');
  assertCanEdit(req, insp);
  const { rows } = await query(
    'DELETE FROM inspection_photos WHERE id = $1 AND inspection_id = $2 RETURNING file_path', [req.params.photoId, insp.id],
  );
  if (!rows[0]) throw ApiError.notFound('Photo not found');
  await removeFiles([rows[0].file_path]);
  ok(res, null, { message: 'Photo removed' });
});

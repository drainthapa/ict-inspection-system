import { query, withTransaction } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ok, created, parsePagination, pageMeta } from '../utils/response.js';
import { audit } from '../utils/audit.js';
import { ROLES } from '../utils/roles.js';
import { assertWardAccess, wardScope } from '../middleware/wardAccess.js';

const EDITABLE = [
  'asset_id', 'ward_id', 'category_id', 'name', 'equipment_type', 'brand', 'model', 'serial_number',
  'installation_location', 'quantity', 'purchase_date', 'warranty_expiry', 'status', 'remarks',
];

const SELECT = `
  SELECT e.*, w.ward_number, w.office_name AS ward_office_name,
         c.name AS category_name, c.code AS category_code, c.group_name, c.checklist_group,
         li.inspection_date AS last_inspection_date, li.inspection_code AS last_inspection_code
    FROM equipment e
    JOIN wards w ON w.id = e.ward_id
    JOIN equipment_categories c ON c.id = e.category_id
    LEFT JOIN inspections li ON li.id = e.last_inspection_id`;

const SORT_SQL = {
  asset_id: 'UPPER(e.asset_id)',
  name: 'LOWER(e.name)',
  ward: 'w.ward_number',
  category: 'c.sort_order',
  // worst condition first when ascending; not-yet-inspected last
  condition: `CASE e.current_condition WHEN 'damaged' THEN 1 WHEN 'not_operational' THEN 2
              WHEN 'partial' THEN 3 WHEN 'good' THEN 4 ELSE 5 END`,
  updated: 'e.updated_at',
  created: 'e.created_at',
};

const fieldErrors = (errors) => new ApiError(422, 'Please correct the highlighted fields', errors);

function mapUniqueViolation(err) {
  if (err.code === '23505') {
    if (err.constraint === 'equipment_asset_id_uq') throw fieldErrors({ asset_id: 'This asset ID is already registered' });
    if (err.constraint === 'equipment_serial_uq') {
      throw fieldErrors({ serial_number: 'This serial number is already registered in this category' });
    }
  }
  throw err;
}

const getEquipmentRow = async (id, db = { query }) =>
  (await db.query(`${SELECT} WHERE e.id = $1`, [id])).rows[0];

/** Validate category, type and dates against the merged (current + incoming) record. */
async function validateBusinessRules(db, data) {
  const { rows } = await db.query(
    'SELECT id, is_active, type_options FROM equipment_categories WHERE id = $1', [data.category_id],
  );
  const cat = rows[0];
  if (!cat) throw fieldErrors({ category_id: 'Category not found' });
  if (!cat.is_active) throw fieldErrors({ category_id: 'This category is no longer in use' });
  if (data.equipment_type && cat.type_options.length && !cat.type_options.includes(data.equipment_type)) {
    throw fieldErrors({ equipment_type: `Choose one of: ${cat.type_options.join(', ')}` });
  }
  if (data.purchase_date && data.warranty_expiry && data.warranty_expiry < data.purchase_date) {
    throw fieldErrors({ warranty_expiry: 'Warranty cannot end before the purchase date' });
  }
  const ward = await db.query('SELECT is_active FROM wards WHERE id = $1', [data.ward_id]);
  if (!ward.rows[0]) throw fieldErrors({ ward_id: 'Ward not found' });
}

// GET /api/equipment
export const listEquipment = asyncHandler(async (req, res) => {
  const q = req.query;
  const { page, limit, offset } = parsePagination(q);
  const params = [];
  const where = [wardScope(req, 'e.ward_id', params)];
  const add = (sql, value) => { params.push(value); where.push(sql.replaceAll('$?', `$${params.length}`)); };

  if (q.status !== 'all') add('e.status = $?', q.status || 'active');
  if (q.ward_id) add('e.ward_id = $?', q.ward_id);
  if (q.category_id) add('e.category_id = $?', q.category_id);
  if (q.group) add('c.group_name = $?', q.group);
  if (q.condition === 'not_inspected') where.push('e.current_condition IS NULL');
  else if (q.condition) add('e.current_condition = $?', q.condition);
  if (q.search) {
    params.push(`%${q.search}%`);
    const p = `$${params.length}`;
    params.push(q.search.replace(/^ward\s*(no\.?)?\s*/i, ''));
    const n = `$${params.length}`;
    where.push(`(e.name ILIKE ${p} OR e.asset_id ILIKE ${p} OR e.serial_number ILIKE ${p}
                 OR e.brand ILIKE ${p} OR e.model ILIKE ${p} OR e.installation_location ILIKE ${p}
                 OR w.ward_number::text = ${n})`);
  }

  const whereSql = where.join(' AND ');
  const from = `FROM equipment e JOIN wards w ON w.id = e.ward_id
                JOIN equipment_categories c ON c.id = e.category_id`;
  const { rows: [{ total }] } = await query(`SELECT COUNT(*)::int AS total ${from} WHERE ${whereSql}`, params);

  const sort = SORT_SQL[q.sort] || SORT_SQL.updated;
  const dir = q.dir === 'asc' ? 'ASC' : q.dir === 'desc' ? 'DESC' : (q.sort && q.sort !== 'updated' ? 'ASC' : 'DESC');
  params.push(limit, offset);
  const { rows } = await query(
    `${SELECT} WHERE ${whereSql}
      ORDER BY ${sort} ${dir} NULLS LAST, e.id ${dir}
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  ok(res, rows, { meta: pageMeta(page, limit, total) });
});

// GET /api/equipment/:id  (with inspection and maintenance history)
export const getEquipment = asyncHandler(async (req, res) => {
  const item = await getEquipmentRow(req.params.id);
  if (!item) throw ApiError.notFound('Equipment not found');
  assertWardAccess(req, item.ward_id);

  const [inspections, maintenance, creator] = await Promise.all([
    query(
      `SELECT i.id, i.inspection_code, i.inspection_date, i.inspection_type, i.condition,
              i.recommended_actions, i.repair_required, i.estimated_repair_cost, u.full_name AS inspector_name
         FROM inspections i JOIN users u ON u.id = i.inspector_id
        WHERE i.equipment_id = $1 AND i.status = 'submitted'
        ORDER BY i.inspection_date DESC, i.id DESC LIMIT 20`,
      [item.id],
    ),
    query(
      `SELECT id, maintenance_code, status, reported_problem, repair_cost, maintenance_date, completion_date, created_at
         FROM maintenance WHERE equipment_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [item.id],
    ),
    query('SELECT full_name FROM users WHERE id = $1', [item.created_by]),
  ]);

  ok(res, {
    ...item,
    created_by_name: creator.rows[0]?.full_name ?? null,
    inspections: inspections.rows,
    maintenance: maintenance.rows,
  });
});

// POST /api/equipment  (Super Admin; Inspector for assigned wards)
export const createEquipment = asyncHandler(async (req, res) => {
  const b = req.body;
  assertWardAccess(req, b.ward_id);
  if (b.status && b.status !== 'active') throw fieldErrors({ status: 'New equipment must be active' });

  const item = await withTransaction(async (db) => {
    await validateBusinessRules(db, b);
    const cols = EDITABLE.filter((c) => b[c] !== undefined && c !== 'status');
    const params = cols.map((c) => b[c]);
    params.push(req.user.id);
    const { rows } = await db.query(
      `INSERT INTO equipment (${cols.join(', ')}, created_by)
       VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}, $${params.length}) RETURNING id`,
      params,
    ).catch(mapUniqueViolation);
    await audit(req, 'equipment.created', {
      entityType: 'equipment', entityId: rows[0].id, details: { asset_id: b.asset_id, ward_id: b.ward_id },
    }, db);
    return getEquipmentRow(rows[0].id, db);
  });
  created(res, item, 'Equipment registered');
});

// PUT /api/equipment/:id
export const updateEquipment = asyncHandler(async (req, res) => {
  const b = req.body;
  const item = await withTransaction(async (db) => {
    const current = await getEquipmentRow(req.params.id, db);
    if (!current) throw ApiError.notFound('Equipment not found');
    assertWardAccess(req, current.ward_id);
    if (b.ward_id !== undefined && b.ward_id !== current.ward_id) assertWardAccess(req, b.ward_id);
    if (b.status !== undefined && b.status !== current.status && req.user.role !== ROLES.SUPER_ADMIN) {
      throw ApiError.forbidden('Only the Super Admin can mark equipment as replaced or disposed');
    }

    const merged = { ...current, ...b };
    // Category may change: re-check type against the new category
    await validateBusinessRules(db, merged);

    const cols = EDITABLE.filter((c) => b[c] !== undefined);
    if (cols.length) {
      const params = cols.map((c) => b[c]);
      params.push(current.id);
      await db.query(
        `UPDATE equipment SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')} WHERE id = $${params.length}`,
        params,
      ).catch(mapUniqueViolation);
    }
    const changed = cols.filter((c) => String(b[c] ?? '') !== String(current[c] ?? ''));
    await audit(req, 'equipment.updated', {
      entityType: 'equipment', entityId: current.id,
      details: { changed, ...(changed.includes('ward_id') ? { from_ward: current.ward_id, to_ward: b.ward_id } : {}) },
    }, db);
    return getEquipmentRow(current.id, db);
  });
  ok(res, item, { message: 'Equipment updated' });
});

// DELETE /api/equipment/:id  (Super Admin; only if it has no history)
export const deleteEquipment = asyncHandler(async (req, res) => {
  await withTransaction(async (db) => {
    const item = await getEquipmentRow(req.params.id, db);
    if (!item) throw ApiError.notFound('Equipment not found');
    const { rows } = await db.query(
      `SELECT (SELECT COUNT(*) FROM inspections WHERE equipment_id = $1)::int
            + (SELECT COUNT(*) FROM maintenance WHERE equipment_id = $1)::int
            + (SELECT COUNT(*) FROM replacement_requests WHERE equipment_id = $1)::int AS n`,
      [item.id],
    );
    if (rows[0].n > 0) {
      throw ApiError.conflict('This equipment has inspection or maintenance history. Mark it as disposed instead.');
    }
    await db.query('DELETE FROM equipment WHERE id = $1', [item.id]);
    await audit(req, 'equipment.deleted', {
      entityType: 'equipment', entityId: item.id, details: { asset_id: item.asset_id, ward_id: item.ward_id },
    }, db);
  });
  ok(res, null, { message: 'Equipment deleted' });
});

/**
 * GET /api/equipment/next-asset-id?ward_id=&category_id=
 * Suggests the next free ID in the pattern SMM-W04-PRINTER-003.
 */
export const nextAssetId = asyncHandler(async (req, res) => {
  const { ward_id: wardId, category_id: categoryId } = req.query;
  assertWardAccess(req, wardId);
  const { rows } = await query(
    `SELECT w.ward_number, c.code FROM wards w, equipment_categories c WHERE w.id = $1 AND c.id = $2`,
    [wardId, categoryId],
  );
  if (!rows[0]) throw ApiError.notFound('Ward or category not found');
  const prefix = `SMM-W${String(rows[0].ward_number).padStart(2, '0')}-${rows[0].code}-`;
  const { rows: [{ max }] } = await query(
    `SELECT COALESCE(MAX(SUBSTRING(UPPER(asset_id) FROM '\\d+$')::int), 0) AS max
       FROM equipment WHERE UPPER(asset_id) LIKE $1 || '%' AND UPPER(asset_id) ~ ('^' || $2 || '\\d+$')`,
    [prefix, prefix.replace(/[-_]/g, (m) => `\\${m}`)],
  );
  ok(res, { asset_id: `${prefix}${String(max + 1).padStart(3, '0')}` });
});

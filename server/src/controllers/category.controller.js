import { query, withTransaction } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ok, created } from '../utils/response.js';
import { audit } from '../utils/audit.js';
import { ROLES } from '../utils/roles.js';
import { wardScope } from '../middleware/wardAccess.js';

const FIELDS = ['code', 'name', 'group_name', 'type_options', 'checklist_group', 'description', 'sort_order', 'is_active'];

const fieldErrors = (e) => new ApiError(422, 'Please correct the highlighted fields', e);
function mapUnique(err) {
  if (err.code === '23505') {
    if (err.constraint?.includes('code')) throw fieldErrors({ code: 'This code is already used' });
    if (err.constraint?.includes('name')) throw fieldErrors({ name: 'A category with this name exists' });
  }
  throw err;
}

const getRow = async (id, db = { query }) => (await db.query(
  `SELECT c.*, (SELECT COUNT(*)::int FROM equipment e WHERE e.category_id = c.id) AS equipment_count
     FROM equipment_categories c WHERE c.id = $1`, [id],
)).rows[0];

// GET /api/equipment/categories
// equipment_count is limited to the wards the user can see.
export const listCategories = asyncHandler(async (req, res) => {
  const params = [];
  const scope = wardScope(req, 'e.ward_id', params);
  const showInactive = req.query.include_inactive === 'true' && req.user.role === ROLES.SUPER_ADMIN;
  const { rows } = await query(
    `SELECT c.*,
            (SELECT COUNT(*)::int FROM equipment e
              WHERE e.category_id = c.id AND e.status = 'active' AND ${scope}) AS equipment_count
       FROM equipment_categories c
      ${showInactive ? '' : 'WHERE c.is_active'}
      ORDER BY c.sort_order, c.name`,
    params,
  );
  ok(res, rows);
});

// GET /api/equipment/categories/groups
export const listGroups = asyncHandler(async (_req, res) => {
  const { rows } = await query(
    `SELECT group_name, MIN(sort_order) AS o FROM equipment_categories GROUP BY group_name ORDER BY o`,
  );
  ok(res, rows.map((r) => r.group_name));
});

// POST /api/equipment/categories
export const createCategory = asyncHandler(async (req, res) => {
  const b = req.body;
  if (b.sort_order === undefined) {
    const { rows } = await query('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM equipment_categories');
    b.sort_order = rows[0].n;
  }
  const cols = FIELDS.filter((f) => b[f] !== undefined);
  const row = await withTransaction(async (db) => {
    const { rows } = await db.query(
      `INSERT INTO equipment_categories (${cols.join(', ')})
       VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
      cols.map((c) => b[c]),
    ).catch(mapUnique);
    await audit(req, 'category.created', { entityType: 'category', entityId: rows[0].id, details: { code: b.code } }, db);
    return getRow(rows[0].id, db);
  });
  created(res, row, 'Category created');
});

// PUT /api/equipment/categories/:id
export const updateCategory = asyncHandler(async (req, res) => {
  const cols = FIELDS.filter((f) => req.body[f] !== undefined);
  const row = await withTransaction(async (db) => {
    const current = await getRow(req.params.id, db);
    if (!current) throw ApiError.notFound('Category not found');
    if (cols.length) {
      const params = cols.map((c) => req.body[c]);
      params.push(current.id);
      await db.query(
        `UPDATE equipment_categories SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')}
          WHERE id = $${params.length}`,
        params,
      ).catch(mapUnique);
    }
    await audit(req, 'category.updated', { entityType: 'category', entityId: current.id, details: { changed: cols } }, db);
    return getRow(current.id, db);
  });
  ok(res, row, { message: 'Category updated' });
});

// DELETE /api/equipment/categories/:id  (only when unused)
export const deleteCategory = asyncHandler(async (req, res) => {
  await withTransaction(async (db) => {
    const current = await getRow(req.params.id, db);
    if (!current) throw ApiError.notFound('Category not found');
    const { rows } = await db.query(
      `SELECT (SELECT COUNT(*) FROM equipment WHERE category_id = $1)::int
            + (SELECT COUNT(*) FROM inspections WHERE category_id = $1)::int AS n`, [current.id],
    );
    if (rows[0].n > 0) throw ApiError.conflict('This category is in use. Mark it inactive instead.');
    await db.query('DELETE FROM equipment_categories WHERE id = $1', [current.id]);
    await audit(req, 'category.deleted', { entityType: 'category', entityId: current.id, details: { code: current.code } }, db);
  });
  ok(res, null, { message: 'Category deleted' });
});

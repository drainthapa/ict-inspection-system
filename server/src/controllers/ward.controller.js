import { query, withTransaction } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ok, created } from '../utils/response.js';
import { audit } from '../utils/audit.js';
import { ROLES } from '../utils/roles.js';
import { assertWardAccess, wardScope } from '../middleware/wardAccess.js';

const WARD_FIELDS = [
  'ward_number', 'office_name', 'address', 'chairperson_name', 'secretary_name',
  'contact_number', 'email', 'remarks', 'is_active',
];

const WARD_SELECT = `
  SELECT w.*,
         (SELECT COUNT(*)::int FROM equipment e
           WHERE e.ward_id = w.id AND e.status = 'active') AS equipment_count,
         (SELECT COUNT(*)::int FROM equipment e
           WHERE e.ward_id = w.id AND e.status = 'active'
             AND e.current_condition IN ('not_operational','damaged')) AS faulty_count,
         (SELECT COUNT(*)::int FROM inspections i
           WHERE i.ward_id = w.id AND i.status = 'submitted') AS inspection_count,
         COALESCE((
           SELECT JSON_AGG(JSON_BUILD_OBJECT(
                    'id', u.id, 'full_name', u.full_name, 'username', u.username,
                    'phone', u.phone, 'designation', u.designation, 'role', r.name)
                  ORDER BY r.name, u.full_name)
             FROM user_wards uw
             JOIN users u ON u.id = uw.user_id AND u.is_active
             JOIN roles r ON r.id = u.role_id
            WHERE uw.ward_id = w.id
         ), '[]') AS assigned_users
    FROM wards w`;

const getWardRow = async (id, db = { query }) =>
  (await db.query(`${WARD_SELECT} WHERE w.id = $1`, [id])).rows[0];

const fieldError = (field, msg) => new ApiError(422, 'Please correct the highlighted fields', { [field]: msg });

const duplicateWard = (err) => {
  if (err.code === '23505') throw fieldError('ward_number', 'This ward number already exists');
  throw err;
};

// GET /api/wards — scoped to the user's wards
export const listWards = asyncHandler(async (req, res) => {
  const params = [];
  const where = [wardScope(req, 'w.id', params)];
  if (req.query.active === 'true') where.push('w.is_active');
  const { rows } = await query(
    `${WARD_SELECT} WHERE ${where.join(' AND ')} ORDER BY w.ward_number`, params,
  );
  ok(res, rows);
});

// GET /api/wards/:id
export const getWard = asyncHandler(async (req, res) => {
  const ward = await getWardRow(req.params.id);
  if (!ward) throw ApiError.notFound('Ward not found');
  assertWardAccess(req, ward.id);
  ok(res, ward);
});

// POST /api/wards
export const createWard = asyncHandler(async (req, res) => {
  const cols = WARD_FIELDS.filter((f) => req.body[f] !== undefined);
  const ward = await withTransaction(async (db) => {
    const { rows } = await db.query(
      `INSERT INTO wards (${cols.join(', ')})
       VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
      cols.map((c) => req.body[c]),
    ).catch(duplicateWard);
    await audit(req, 'ward.created', {
      entityType: 'ward', entityId: rows[0].id, details: { ward_number: req.body.ward_number },
    }, db);
    return getWardRow(rows[0].id, db);
  });
  created(res, ward, 'Ward created');
});

// PUT /api/wards/:id
export const updateWard = asyncHandler(async (req, res) => {
  const cols = WARD_FIELDS.filter((f) => req.body[f] !== undefined);
  const ward = await withTransaction(async (db) => {
    const current = await getWardRow(req.params.id, db);
    if (!current) throw ApiError.notFound('Ward not found');
    if (cols.length) {
      const params = cols.map((c) => req.body[c]);
      params.push(current.id);
      await db.query(
        `UPDATE wards SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')} WHERE id = $${params.length}`,
        params,
      ).catch(duplicateWard);
    }
    await audit(req, 'ward.updated', { entityType: 'ward', entityId: current.id, details: { changed: cols } }, db);
    return getWardRow(current.id, db);
  });
  ok(res, ward, { message: 'Ward updated' });
});

// DELETE /api/wards/:id — only when nothing is recorded against the ward
export const deleteWard = asyncHandler(async (req, res) => {
  await withTransaction(async (db) => {
    const ward = await getWardRow(req.params.id, db);
    if (!ward) throw ApiError.notFound('Ward not found');
    const { rows } = await db.query(
      `SELECT (SELECT COUNT(*) FROM equipment WHERE ward_id = $1)::int
            + (SELECT COUNT(*) FROM inspections WHERE ward_id = $1)::int
            + (SELECT COUNT(*) FROM maintenance WHERE ward_id = $1)::int AS n`,
      [ward.id],
    );
    if (rows[0].n > 0) {
      throw ApiError.conflict('This ward has equipment or inspection records. Mark it inactive instead.');
    }
    const onlyWard = await db.query(
      `SELECT u.full_name FROM user_wards uw JOIN users u ON u.id = uw.user_id
        WHERE uw.ward_id = $1 AND u.is_active
          AND NOT EXISTS (SELECT 1 FROM user_wards o WHERE o.user_id = uw.user_id AND o.ward_id <> $1)`,
      [ward.id],
    );
    if (onlyWard.rows.length) {
      throw ApiError.conflict(
        `Reassign these users first; this is their only ward: ${onlyWard.rows.map((r) => r.full_name).join(', ')}`,
      );
    }
    await db.query('DELETE FROM wards WHERE id = $1', [ward.id]);
    await audit(req, 'ward.deleted', {
      entityType: 'ward', entityId: ward.id, details: { ward_number: ward.ward_number },
    }, db);
  });
  ok(res, null, { message: 'Ward deleted' });
});

/**
 * PUT /api/wards/:id/users  { user_ids: [...] }
 * Sets exactly which inspectors and ward office users are assigned to this ward.
 * Adding a ward office user moves them here (they hold one ward only).
 * Removing someone for whom this is the only ward is refused.
 */
export const setWardUsers = asyncHandler(async (req, res) => {
  const wardId = req.params.id;
  const desired = [...new Set(req.body.user_ids)];

  const ward = await withTransaction(async (db) => {
    const w = await getWardRow(wardId, db);
    if (!w) throw ApiError.notFound('Ward not found');

    const { rows: users } = await db.query(
      `SELECT u.id, u.full_name, u.is_active, r.name AS role
         FROM users u JOIN roles r ON r.id = u.role_id
        WHERE u.id = ANY($1::int[])`,
      [desired],
    );
    if (users.length !== desired.length) throw fieldError('user_ids', 'One or more users do not exist');
    const bad = users.find((u) => u.role === ROLES.SUPER_ADMIN || !u.is_active);
    if (bad) throw fieldError('user_ids', `${bad.full_name} cannot be assigned (Super Admin or inactive account)`);

    const { rows: current } = await db.query(
      `SELECT u.id, u.full_name,
              (SELECT COUNT(*) FROM user_wards o WHERE o.user_id = u.id)::int AS ward_count
         FROM user_wards uw JOIN users u ON u.id = uw.user_id
        WHERE uw.ward_id = $1 AND u.is_active`,
      [wardId],
    );
    const removed = current.filter((c) => !desired.includes(c.id));
    const stranded = removed.filter((c) => c.ward_count === 1);
    if (stranded.length) {
      throw fieldError('user_ids',
        `This is the only ward for ${stranded.map((s) => s.full_name).join(', ')}. `
        + 'Assign them to another ward first, or deactivate the account.');
    }

    if (removed.length) {
      await db.query(
        'DELETE FROM user_wards WHERE ward_id = $1 AND user_id = ANY($2::int[])',
        [wardId, removed.map((r) => r.id)],
      );
    }
    const currentIds = new Set(current.map((c) => c.id));
    const added = users.filter((u) => !currentIds.has(u.id));
    for (const u of added) {
      if (u.role === ROLES.WARD_USER) {
        await db.query('DELETE FROM user_wards WHERE user_id = $1', [u.id]); // move to this ward
      }
      await db.query(
        `INSERT INTO user_wards (user_id, ward_id, assigned_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [u.id, wardId, req.user.id],
      );
    }

    await audit(req, 'ward.users_assigned', {
      entityType: 'ward', entityId: wardId,
      details: { added: added.map((u) => u.id), removed: removed.map((r) => r.id) },
    }, db);
    return getWardRow(wardId, db);
  });

  ok(res, ward, { message: 'Ward staff updated' });
});

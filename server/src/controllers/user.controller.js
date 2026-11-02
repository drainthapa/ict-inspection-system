import { query, withTransaction } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ok, created, parsePagination, pageMeta } from '../utils/response.js';
import { audit } from '../utils/audit.js';
import { ROLES } from '../utils/roles.js';
import { hashPassword } from '../services/auth.service.js';
import { getUserProfile } from '../services/user.service.js';

const fieldError = (field, msg) => new ApiError(422, 'Please correct the highlighted fields', { [field]: msg });

/** Enforce how many wards each role may hold. */
function checkWardRules(role, wardIds) {
  if (role === ROLES.SUPER_ADMIN && wardIds.length > 0) {
    throw fieldError('ward_ids', 'Super Admin has access to all wards; do not assign wards');
  }
  if (role === ROLES.WARD_USER && wardIds.length !== 1) {
    throw fieldError('ward_ids', 'A ward office user must be assigned to exactly one ward');
  }
  if (role === ROLES.INSPECTOR && wardIds.length === 0) {
    throw fieldError('ward_ids', 'Assign at least one ward to the inspector');
  }
}

async function roleIdFor(db, roleName) {
  const { rows } = await db.query('SELECT id FROM roles WHERE name = $1', [roleName]);
  if (!rows[0]) throw fieldError('role', 'Unknown role');
  return rows[0].id;
}

async function assertWardsExist(db, wardIds) {
  if (!wardIds.length) return;
  const { rows } = await db.query(
    'SELECT COUNT(*)::int AS n FROM wards WHERE id = ANY($1::int[])', [wardIds],
  );
  if (rows[0].n !== new Set(wardIds).size) throw fieldError('ward_ids', 'One or more wards do not exist');
}

async function replaceWards(db, userId, wardIds, assignedBy) {
  await db.query('DELETE FROM user_wards WHERE user_id = $1', [userId]);
  if (wardIds.length) {
    await db.query(
      `INSERT INTO user_wards (user_id, ward_id, assigned_by)
       SELECT $1, UNNEST($2::int[]), $3`,
      [userId, [...new Set(wardIds)], assignedBy],
    );
  }
}

async function countActiveSuperAdmins(db, excludeUserId) {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS n FROM users u JOIN roles r ON r.id = u.role_id
      WHERE r.name = 'super_admin' AND u.is_active AND u.id <> $1`,
    [excludeUserId],
  );
  return rows[0].n;
}

// GET /api/users
export const listUsers = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const params = [];
  const where = ['TRUE'];

  if (req.query.role) {
    params.push(req.query.role);
    where.push(`r.name = $${params.length}`);
  }
  if (req.query.active) {
    params.push(req.query.active === 'true');
    where.push(`u.is_active = $${params.length}`);
  }
  if (req.query.ward_id) {
    params.push(req.query.ward_id);
    where.push(`EXISTS (SELECT 1 FROM user_wards x WHERE x.user_id = u.id AND x.ward_id = $${params.length})`);
  }
  if (req.query.search) {
    params.push(`%${req.query.search}%`);
    const p = `$${params.length}`;
    where.push(`(u.full_name ILIKE ${p} OR u.username ILIKE ${p} OR u.email ILIKE ${p} OR u.phone ILIKE ${p})`);
  }

  const whereSql = where.join(' AND ');
  const countRes = await query(
    `SELECT COUNT(*)::int AS total FROM users u JOIN roles r ON r.id = u.role_id WHERE ${whereSql}`,
    params,
  );

  params.push(limit, offset);
  const { rows } = await query(
    `SELECT u.id, u.full_name, u.username, u.email, u.phone, u.designation, u.is_active,
            u.last_login_at, u.created_at, r.name AS role, r.display_name AS role_name,
            COALESCE(JSON_AGG(JSON_BUILD_OBJECT('id', w.id, 'ward_number', w.ward_number)
                              ORDER BY w.ward_number)
                     FILTER (WHERE w.id IS NOT NULL), '[]') AS wards
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN user_wards uw ON uw.user_id = u.id
       LEFT JOIN wards w ON w.id = uw.ward_id
      WHERE ${whereSql}
      GROUP BY u.id, r.name, r.display_name
      ORDER BY u.is_active DESC, u.full_name ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  ok(res, rows, { meta: pageMeta(page, limit, countRes.rows[0].total) });
});

// GET /api/users/:id  (Super Admin, or the user themself)
export const getUser = asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (req.user.role !== ROLES.SUPER_ADMIN && req.user.id !== id) throw ApiError.forbidden();
  const profile = await getUserProfile(id);
  if (!profile) throw ApiError.notFound('User not found');
  ok(res, profile);
});

// POST /api/users
export const createUser = asyncHandler(async (req, res) => {
  const b = req.body;
  const wardIds = b.ward_ids ?? [];
  checkWardRules(b.role, wardIds);

  const passwordHash = await hashPassword(b.password);

  const user = await withTransaction(async (db) => {
    const roleId = await roleIdFor(db, b.role);
    await assertWardsExist(db, wardIds);

    const { rows } = await db.query(
      `INSERT INTO users (full_name, username, email, phone, designation, password_hash, role_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [b.full_name, b.username, b.email || null, b.phone || null, b.designation ?? null,
        passwordHash, roleId, req.user.id],
    );
    const id = rows[0].id;
    await replaceWards(db, id, wardIds, req.user.id);
    await audit(req, 'user.created', {
      entityType: 'user', entityId: id, details: { username: b.username, role: b.role, ward_ids: wardIds },
    }, db);
    return getUserProfile(id, db);
  });

  created(res, user, 'User created');
});

// PUT /api/users/:id
export const updateUser = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const b = req.body;

  const user = await withTransaction(async (db) => {
    const current = await getUserProfile(id, db);
    if (!current) throw ApiError.notFound('User not found');

    const isSelf = id === req.user.id;
    const nextRole = b.role ?? current.role;
    const nextActive = b.is_active ?? current.is_active;
    const nextWardIds = b.ward_ids ?? current.wards.map((w) => w.id);

    // Safeguards against locking everyone out
    if (isSelf && nextRole !== current.role) throw fieldError('role', 'You cannot change your own role');
    if (isSelf && !nextActive) throw fieldError('is_active', 'You cannot deactivate your own account');
    if (current.role === ROLES.SUPER_ADMIN && (nextRole !== ROLES.SUPER_ADMIN || !nextActive)
        && (await countActiveSuperAdmins(db, id)) === 0) {
      throw ApiError.conflict('At least one active Super Admin must remain');
    }

    // When switching to Super Admin, wards are cleared automatically
    const wardIds = nextRole === ROLES.SUPER_ADMIN ? [] : nextWardIds;
    checkWardRules(nextRole, wardIds);
    await assertWardsExist(db, wardIds);

    const sets = [];
    const params = [];
    const set = (col, val) => { params.push(val); sets.push(`${col} = $${params.length}`); };

    if (b.full_name !== undefined) set('full_name', b.full_name);
    if (b.username !== undefined) set('username', b.username);
    if (b.email !== undefined) set('email', b.email || null);
    if (b.phone !== undefined) set('phone', b.phone || null);
    if (b.designation !== undefined) set('designation', b.designation);
    if (b.role !== undefined && b.role !== current.role) set('role_id', await roleIdFor(db, b.role));
    if (b.is_active !== undefined) set('is_active', b.is_active);
    if (b.password) set('password_hash', await hashPassword(b.password));

    // Sign the user out everywhere when their access changes
    const accessChanged = (b.role && b.role !== current.role) || b.is_active === false || !!b.password;
    if (accessChanged) sets.push('token_version = token_version + 1');

    if (sets.length) {
      params.push(id);
      await db.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
    }
    if (b.ward_ids !== undefined || nextRole !== current.role) {
      await replaceWards(db, id, wardIds, req.user.id);
    }

    const changed = Object.keys(b).filter((k) => k !== 'password');
    if (b.password) changed.push('password (reset)');
    await audit(req, 'user.updated', { entityType: 'user', entityId: id, details: { changed } }, db);
    return getUserProfile(id, db);
  });

  ok(res, user, { message: 'User updated' });
});

// DELETE /api/users/:id  -> deactivate (records keep their history)
export const deactivateUser = asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (id === req.user.id) throw ApiError.conflict('You cannot deactivate your own account');

  await withTransaction(async (db) => {
    const current = await getUserProfile(id, db);
    if (!current) throw ApiError.notFound('User not found');
    if (current.role === ROLES.SUPER_ADMIN && (await countActiveSuperAdmins(db, id)) === 0) {
      throw ApiError.conflict('At least one active Super Admin must remain');
    }
    await db.query(
      'UPDATE users SET is_active = FALSE, token_version = token_version + 1 WHERE id = $1', [id],
    );
    await audit(req, 'user.deactivated', { entityType: 'user', entityId: id }, db);
  });

  ok(res, null, { message: 'User deactivated' });
});

// GET /api/users/roles
export const listRoles = asyncHandler(async (_req, res) => {
  const { rows } = await query('SELECT id, name, display_name, description FROM roles ORDER BY id');
  ok(res, rows);
});

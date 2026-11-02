import { query } from '../config/db.js';

/**
 * Full public profile for a user, including assigned wards.
 * Never returns password_hash.
 */
export async function getUserProfile(userId, db = { query }) {
  const { rows } = await db.query(
    `SELECT u.id, u.full_name, u.username, u.email, u.phone, u.designation,
            u.is_active, u.last_login_at, u.created_at, u.updated_at,
            r.name AS role, r.display_name AS role_name,
            COALESCE(
              JSON_AGG(JSON_BUILD_OBJECT('id', w.id, 'ward_number', w.ward_number,
                                         'office_name', w.office_name)
                       ORDER BY w.ward_number)
              FILTER (WHERE w.id IS NOT NULL), '[]'
            ) AS wards
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN user_wards uw ON uw.user_id = u.id
       LEFT JOIN wards w ON w.id = uw.ward_id
      WHERE u.id = $1
      GROUP BY u.id, r.name, r.display_name`,
    [userId],
  );
  return rows[0] ?? null;
}

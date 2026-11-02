import bcrypt from 'bcryptjs';
import { query } from '../config/db.js';
import { env } from '../config/env.js';

// Pre-computed hash used to keep response time similar for unknown usernames
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-real-password', 10);

export const hashPassword = (plain) => bcrypt.hash(plain, env.bcryptRounds);

/**
 * Returns { user } on success or { reason } on failure.
 * Reasons are for audit logs only; the client always gets one generic message.
 */
export async function verifyCredentials(username, password) {
  const { rows } = await query(
    `SELECT u.id, u.username, u.password_hash, u.is_active, u.token_version, r.name AS role
       FROM users u JOIN roles r ON r.id = u.role_id
      WHERE LOWER(u.username) = LOWER($1)`,
    [username],
  );
  const user = rows[0];
  const match = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);

  if (!user) return { reason: 'unknown_user' };
  if (!match) return { reason: 'bad_password', userId: user.id };
  if (!user.is_active) return { reason: 'inactive', userId: user.id };
  return { user };
}

export async function verifyPasswordById(userId, password) {
  const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [userId]);
  if (!rows[0]) return false;
  return bcrypt.compare(password, rows[0].password_hash);
}

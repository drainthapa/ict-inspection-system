import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { query } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';
import { ROLES } from '../utils/roles.js';

export const AUTH_COOKIE = 'ict_token';

export function signToken(user) {
  return jwt.sign(
    { sub: String(user.id), role: user.role, tv: user.token_version },
    env.jwt.secret,
    { expiresIn: env.jwt.expiresIn, algorithm: 'HS256' },
  );
}

export const cookieOptions = () => ({
  httpOnly: true,
  secure: env.isProduction,
  sameSite: 'strict',
  path: '/',
});

function readToken(req) {
  const fromCookie = req.cookies?.[AUTH_COOKIE];
  if (fromCookie) return fromCookie;
  const header = req.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

/**
 * Verify the JWT and load the user fresh from the database on every request,
 * so deactivation, role changes and ward reassignment take effect immediately.
 * Sets req.user = { id, username, fullName, role, wardIds }
 *   wardIds is null for Super Admin (meaning: all wards).
 */
export async function authenticate(req, _res, next) {
  try {
    const token = readToken(req);
    if (!token) throw ApiError.unauthorized();

    let payload;
    try {
      payload = jwt.verify(token, env.jwt.secret, { algorithms: ['HS256'] });
    } catch {
      throw ApiError.unauthorized('Your session has expired. Please log in again.');
    }

    const { rows } = await query(
      `SELECT u.id, u.username, u.full_name, u.is_active, u.token_version, r.name AS role,
              COALESCE(ARRAY_AGG(uw.ward_id ORDER BY uw.ward_id)
                       FILTER (WHERE uw.ward_id IS NOT NULL), '{}') AS ward_ids
         FROM users u
         JOIN roles r ON r.id = u.role_id
         LEFT JOIN user_wards uw ON uw.user_id = u.id
        WHERE u.id = $1
        GROUP BY u.id, r.name`,
      [Number(payload.sub)],
    );
    const user = rows[0];
    if (!user || !user.is_active || user.token_version !== payload.tv) {
      throw ApiError.unauthorized('Your session has ended. Please log in again.');
    }

    req.user = {
      id: user.id,
      username: user.username,
      fullName: user.full_name,
      role: user.role,
      wardIds: user.role === ROLES.SUPER_ADMIN ? null : user.ward_ids,
    };
    next();
  } catch (err) {
    next(err);
  }
}

/** Allow only the listed roles. Use after authenticate. */
export const authorize = (...roles) => (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (!roles.includes(req.user.role)) return next(ApiError.forbidden());
  next();
};

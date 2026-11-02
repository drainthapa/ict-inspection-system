import { query } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ok } from '../utils/response.js';
import { audit } from '../utils/audit.js';
import { AUTH_COOKIE, cookieOptions, signToken } from '../middleware/auth.js';
import { verifyCredentials, verifyPasswordById, hashPassword } from '../services/auth.service.js';
import { getUserProfile } from '../services/user.service.js';

export const login = asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  const result = await verifyCredentials(username, password);

  if (!result.user) {
    await audit(req, 'auth.login_failed', {
      entityType: 'user', entityId: result.userId, details: { username, reason: result.reason },
    });
    if (result.reason === 'inactive') {
      throw ApiError.unauthorized('This account is deactivated. Contact the IT section.');
    }
    throw ApiError.unauthorized('Incorrect username or password');
  }

  const { user } = result;
  await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);
  req.user = { id: user.id };
  await audit(req, 'auth.login', { entityType: 'user', entityId: user.id });

  res.cookie(AUTH_COOKIE, signToken(user), cookieOptions());
  ok(res, await getUserProfile(user.id), { message: 'Logged in' });
});

/**
 * Bumping token_version invalidates every token issued to this user,
 * so logout also signs the user out on their other devices.
 */
export const logout = asyncHandler(async (req, res) => {
  await query('UPDATE users SET token_version = token_version + 1 WHERE id = $1', [req.user.id]);
  await audit(req, 'auth.logout', { entityType: 'user', entityId: req.user.id });
  res.clearCookie(AUTH_COOKIE, cookieOptions());
  ok(res, null, { message: 'Logged out' });
});

export const me = asyncHandler(async (req, res) => {
  const profile = await getUserProfile(req.user.id);
  if (!profile) throw ApiError.unauthorized();
  ok(res, profile);
});

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!(await verifyPasswordById(req.user.id, currentPassword))) {
    throw new ApiError(422, 'Please correct the highlighted fields', {
      currentPassword: 'Current password is incorrect',
    });
  }
  if (currentPassword === newPassword) {
    throw new ApiError(422, 'Please correct the highlighted fields', {
      newPassword: 'New password must be different from the current one',
    });
  }

  const hash = await hashPassword(newPassword);
  const { rows } = await query(
    `UPDATE users SET password_hash = $1, token_version = token_version + 1
      WHERE id = $2 RETURNING id, token_version, (SELECT name FROM roles WHERE id = role_id) AS role`,
    [hash, req.user.id],
  );
  await audit(req, 'auth.password_changed', { entityType: 'user', entityId: req.user.id });

  // Keep this device signed in with a fresh token; other devices are signed out.
  res.cookie(AUTH_COOKIE, signToken(rows[0]), cookieOptions());
  ok(res, null, { message: 'Password changed' });
});

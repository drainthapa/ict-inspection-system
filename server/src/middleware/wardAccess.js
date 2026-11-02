import { ApiError } from '../utils/ApiError.js';

/** True when the user may see every ward. */
export const hasAllWards = (req) => req.user?.wardIds === null;

/** True when the user may access the given ward. */
export function canAccessWard(req, wardId) {
  if (hasAllWards(req)) return true;
  return req.user.wardIds.includes(Number(wardId));
}

/**
 * Throw 403 unless the user may access `wardId`.
 * Use in controllers after the record's ward has been looked up.
 */
export function assertWardAccess(req, wardId) {
  if (!canAccessWard(req, wardId)) {
    throw ApiError.forbidden('You do not have access to this ward');
  }
}

/**
 * Build a WHERE fragment restricting `column` to the user's wards.
 * Appends to `params` and returns e.g. "e.ward_id = ANY($3)" or "TRUE".
 *
 *   const params = [];
 *   const where = [wardScope(req, 'e.ward_id', params)];
 */
export function wardScope(req, column, params) {
  if (hasAllWards(req)) return 'TRUE';
  params.push(req.user.wardIds);
  return `${column} = ANY($${params.length}::int[])`;
}

/** Route-level guard for routes with a :wardId (or custom) param. */
export const requireWardParam = (param = 'wardId') => (req, _res, next) => {
  try {
    assertWardAccess(req, req.params[param]);
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Consistent JSON envelope:
 *   success: { success: true, data, message?, meta? }
 *   failure: { success: false, message, errors? }   (see errorHandler)
 */
export function ok(res, data, { status = 200, message, meta } = {}) {
  const body = { success: true, data };
  if (message) body.message = message;
  if (meta) body.meta = meta;
  return res.status(status).json(body);
}

export const created = (res, data, message) => ok(res, data, { status: 201, message });

/** Parse ?page & ?limit safely and return SQL-ready values. */
export function parsePagination(q, { defaultLimit = 20, maxLimit = 100 } = {}) {
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(q.limit, 10) || defaultLimit));
  return { page, limit, offset: (page - 1) * limit };
}

export const pageMeta = (page, limit, total) => ({
  page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)),
});

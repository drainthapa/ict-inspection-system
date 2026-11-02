import { ApiError } from '../utils/ApiError.js';
import { env } from '../config/env.js';

// Map PostgreSQL error codes to safe HTTP responses
const PG_ERRORS = {
  '23505': [409, 'A record with this value already exists'],
  '23503': [409, 'This record is linked to other records and cannot be changed this way'],
  '23514': [400, 'One or more values are not allowed'],
  '22P02': [400, 'Invalid value format'],
  '23502': [400, 'A required value is missing'],
};

export function notFoundHandler(req, _res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (err instanceof ApiError) {
    const body = { success: false, message: err.message };
    if (err.details) body.errors = err.details;
    return res.status(err.status).json(body);
  }

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'Request body is not valid JSON' });
  }

  if (err.code && PG_ERRORS[err.code]) {
    const [status, message] = PG_ERRORS[err.code];
    const body = { success: false, message };
    if (!env.isProduction) body.debug = { constraint: err.constraint, detail: err.detail };
    return res.status(status).json(body);
  }

  console.error(`[${req.method} ${req.originalUrl}]`, err);
  res.status(500).json({
    success: false,
    message: 'Something went wrong on the server. Please try again.',
    ...(env.isProduction ? {} : { debug: err.message }),
  });
}

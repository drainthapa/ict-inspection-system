import { validationResult } from 'express-validator';
import { ApiError } from '../utils/ApiError.js';

/** Run express-validator chains, then fail with a 422-style field map. */
export const validate = (chains) => async (req, _res, next) => {
  for (const chain of chains) await chain.run(req);
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  const errors = {};
  for (const e of result.array()) {
    if (e.type === 'field' && !errors[e.path]) errors[e.path] = e.msg;
  }
  const err = new ApiError(422, 'Please correct the highlighted fields', errors);
  next(err);
};

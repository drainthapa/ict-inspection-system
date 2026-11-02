import { body, param } from 'express-validator';

export const idParam = (name = 'id') =>
  param(name).isInt({ min: 1 }).withMessage('Invalid id').toInt();

export const passwordRule = (field = 'password') =>
  body(field)
    .isString().withMessage('Password is required')
    .isLength({ min: 8, max: 72 }).withMessage('Password must be 8–72 characters')
    .matches(/[A-Za-z]/).withMessage('Password must contain a letter')
    .matches(/\d/).withMessage('Password must contain a number');

/** Optional trimmed text with a max length; empty string becomes null. */
export const optionalText = (field, max) =>
  body(field)
    .optional({ values: 'null' })
    .isString().withMessage('Must be text')
    .trim()
    .isLength({ max }).withMessage(`Must be at most ${max} characters`)
    .customSanitizer((v) => (v === '' ? null : v));

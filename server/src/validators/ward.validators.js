import { body } from 'express-validator';
import { idParam, optionalText } from './common.js';

const rules = (isCreate) => [
  isCreate
    ? body('ward_number').exists({ values: 'falsy' }).withMessage('Ward number is required')
      .isInt({ min: 1, max: 99 }).withMessage('Ward number must be 1–99').toInt()
    : body('ward_number').optional().isInt({ min: 1, max: 99 }).withMessage('Ward number must be 1–99').toInt(),
  isCreate
    ? body('office_name').exists({ values: 'falsy' }).withMessage('Office name is required')
      .isString().trim().isLength({ min: 2, max: 150 }).withMessage('Office name must be 2–150 characters')
    : body('office_name').optional().isString().trim().isLength({ min: 2, max: 150 })
      .withMessage('Office name must be 2–150 characters'),
  optionalText('address', 255),
  optionalText('chairperson_name', 120),
  optionalText('secretary_name', 120),
  body('contact_number').optional({ values: 'falsy' }).isString().trim()
    .matches(/^[0-9+\-\s/]{6,30}$/).withMessage('Enter a valid contact number'),
  body('email').optional({ values: 'falsy' }).isEmail().withMessage('Enter a valid email')
    .normalizeEmail({ gmail_remove_dots: false }),
  optionalText('remarks', 2000),
  body('is_active').optional().isBoolean().withMessage('is_active must be true or false').toBoolean(),
];

export const createWardRules = rules(true);
export const updateWardRules = [idParam(), ...rules(false)];
export const wardIdRules = [idParam()];
export const assignUsersRules = [
  idParam(),
  body('user_ids').isArray({ max: 500 }).withMessage('user_ids must be a list'),
  body('user_ids.*').isInt({ min: 1 }).toInt(),
];

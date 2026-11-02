import { body, query } from 'express-validator';
import { idParam, optionalText, passwordRule } from './common.js';
import { ALL_ROLES } from '../utils/roles.js';

// Required on create, optional on update
const field = (name, isCreate, requiredMsg) =>
  (isCreate ? body(name).exists({ values: 'falsy' }).withMessage(requiredMsg) : body(name).optional());

const base = (isCreate) => [
  field('full_name', isCreate, 'Full name is required')
    .isString().trim().isLength({ min: 2, max: 120 }).withMessage('Full name must be 2–120 characters'),
  field('username', isCreate, 'Username is required')
    .isString().trim().toLowerCase()
    .matches(/^[a-z0-9._-]{3,50}$/)
    .withMessage('Username: 3–50 characters, letters, numbers, dot, dash or underscore'),
  body('email').optional({ values: 'falsy' }).isEmail().withMessage('Enter a valid email')
    .normalizeEmail({ gmail_remove_dots: false }).isLength({ max: 150 }),
  body('phone').optional({ values: 'falsy' }).isString().trim()
    .matches(/^[0-9+\-\s]{7,20}$/).withMessage('Enter a valid phone number'),
  optionalText('designation', 100),
  field('role', isCreate, 'Role is required')
    .isIn(ALL_ROLES).withMessage('Unknown role'),
  body('ward_ids').optional().isArray({ max: 11 }).withMessage('ward_ids must be a list'),
  body('ward_ids.*').isInt({ min: 1 }).withMessage('Invalid ward').toInt(),
];

export const createUserRules = [...base(true), passwordRule('password')];

export const updateUserRules = [
  idParam(),
  ...base(false),
  passwordRule('password').optional({ values: 'falsy' }),
  body('is_active').optional().isBoolean().withMessage('is_active must be true or false').toBoolean(),
];

export const listUserRules = [
  query('role').optional().isIn(ALL_ROLES),
  query('ward_id').optional().isInt({ min: 1 }).toInt(),
  query('active').optional().isIn(['true', 'false']),
  query('search').optional().isString().trim().isLength({ max: 100 }),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
];

export const userIdRules = [idParam()];

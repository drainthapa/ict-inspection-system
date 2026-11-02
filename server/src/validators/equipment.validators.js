import { body, query } from 'express-validator';
import { idParam, optionalText } from './common.js';

export const CONDITIONS = ['good', 'partial', 'not_operational', 'damaged'];
export const EQUIPMENT_STATUSES = ['active', 'replaced', 'disposed'];
export const CHECKLIST_GROUPS = ['computer', 'printer', 'biometric', 'cctv', 'networking', 'ups', 'presentation'];
export const SORTS = ['asset_id', 'name', 'ward', 'category', 'condition', 'updated', 'created'];

const dateRule = (f) => body(f).optional({ values: 'falsy' }).isISO8601({ strict: true })
  .withMessage('Enter a valid date').customSanitizer((v) => v || null);

const equipmentRules = (isCreate) => {
  const req = (f, msg) => (isCreate ? body(f).exists({ values: 'falsy' }).withMessage(msg) : body(f).optional());
  return [
    req('asset_id', 'Asset ID is required').isString().trim().toUpperCase()
      .matches(/^[A-Z0-9][A-Z0-9\-_/.]{1,49}$/).withMessage('Asset ID: 2–50 letters, numbers, - _ / .'),
    req('ward_id', 'Choose a ward').isInt({ min: 1 }).withMessage('Choose a ward').toInt(),
    req('category_id', 'Choose a category').isInt({ min: 1 }).withMessage('Choose a category').toInt(),
    req('name', 'Equipment name is required').isString().trim()
      .isLength({ min: 2, max: 150 }).withMessage('Name must be 2–150 characters'),
    optionalText('equipment_type', 60),
    optionalText('brand', 80),
    optionalText('model', 80),
    optionalText('serial_number', 100),
    optionalText('installation_location', 150),
    body('quantity').optional().isInt({ min: 1, max: 100000 }).withMessage('Quantity must be at least 1').toInt(),
    dateRule('purchase_date'),
    dateRule('warranty_expiry'),
    body('status').optional().isIn(EQUIPMENT_STATUSES).withMessage('Unknown status'),
    optionalText('remarks', 2000),
  ];
};

export const createEquipmentRules = equipmentRules(true);
export const updateEquipmentRules = [idParam(), ...equipmentRules(false)];
export const equipmentIdRules = [idParam()];

export const listEquipmentRules = [
  query('search').optional().isString().trim().isLength({ max: 100 }),
  query('ward_id').optional().isInt({ min: 1 }).toInt(),
  query('category_id').optional().isInt({ min: 1 }).toInt(),
  query('group').optional().isString().isLength({ max: 80 }),
  query('condition').optional().isIn([...CONDITIONS, 'not_inspected']),
  query('status').optional().isIn([...EQUIPMENT_STATUSES, 'all']),
  query('sort').optional().isIn(SORTS),
  query('dir').optional().isIn(['asc', 'desc']),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
];

export const nextAssetIdRules = [
  query('ward_id').isInt({ min: 1 }).withMessage('Choose a ward').toInt(),
  query('category_id').isInt({ min: 1 }).withMessage('Choose a category').toInt(),
];

const categoryRules = (isCreate) => {
  const req = (f, msg) => (isCreate ? body(f).exists({ values: 'falsy' }).withMessage(msg) : body(f).optional());
  return [
    req('name', 'Category name is required').isString().trim()
      .isLength({ min: 2, max: 120 }).withMessage('Name must be 2–120 characters'),
    req('code', 'Code is required').isString().trim().toUpperCase()
      .matches(/^[A-Z0-9_]{2,30}$/).withMessage('Code: 2–30 capital letters, numbers or _'),
    req('group_name', 'Group is required').isString().trim()
      .isLength({ min: 2, max: 80 }).withMessage('Group must be 2–80 characters'),
    body('type_options').optional().isArray({ max: 30 }).withMessage('Types must be a list'),
    body('type_options.*').isString().trim().isLength({ min: 1, max: 60 }).withMessage('Each type: 1–60 characters'),
    body('checklist_group').optional({ values: 'falsy' }).isIn(CHECKLIST_GROUPS).withMessage('Unknown checklist')
      .customSanitizer((v) => v || null),
    optionalText('description', 1000),
    body('sort_order').optional().isInt({ min: 0, max: 999 }).toInt(),
    body('is_active').optional().isBoolean().toBoolean(),
  ];
};

export const createCategoryRules = categoryRules(true);
export const updateCategoryRules = [idParam(), ...categoryRules(false)];

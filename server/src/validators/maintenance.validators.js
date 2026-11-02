import { body, query, param } from 'express-validator';
import { idParam, optionalText } from './common.js';

export const MAINT_STATUSES = ['pending', 'under_assessment', 'approved', 'in_progress', 'completed', 'not_repairable', 'cancelled'];
export const REPL_STATUSES = ['pending', 'approved', 'rejected', 'purchased', 'delivered'];

const date = (f) => body(f).optional({ values: 'null' }).isISO8601({ strict: true }).withMessage('Enter a valid date');
const money = (f) => body(f).optional({ values: 'null' }).isFloat({ min: 0, max: 100000000 }).withMessage('Enter an amount of 0 or more').toFloat();

const listCommon = [
  query('search').optional().isString().trim().isLength({ max: 100 }),
  query('ward_id').optional().isInt({ min: 1 }).toInt(),
  query('category_id').optional().isInt({ min: 1 }).toInt(),
  query('equipment_id').optional().isInt({ min: 1 }).toInt(),
  query('date_from').optional().isISO8601({ strict: true }),
  query('date_to').optional().isISO8601({ strict: true }),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
];

export const listMaintenanceRules = [...listCommon, query('status').optional().isIn([...MAINT_STATUSES, 'open']),
  query('source').optional().isIn(['inspection', 'ward_report', 'manual'])];
export const createMaintenanceRules = [
  body('equipment_id').isInt({ min: 1 }).withMessage('Choose the equipment').toInt(),
  body('reported_problem').isString().trim().isLength({ min: 3, max: 4000 }).withMessage('Describe the problem (at least 3 characters)'),
  optionalText('required_repair', 4000),
  optionalText('remarks', 4000),
];
export const updateMaintenanceRules = [
  idParam(),
  body('status').optional().isIn(MAINT_STATUSES).withMessage('Unknown status'),
  optionalText('required_repair', 4000),
  body('technician_id').optional({ values: 'null' }).isInt({ min: 1 }).toInt(),
  optionalText('technician_name', 120),
  date('maintenance_date'),
  date('completion_date'),
  money('repair_cost'),
  optionalText('remarks', 4000),
  body('spare_parts').optional().isArray({ max: 50 }),
  body('spare_parts.*.part_name').isString().trim().isLength({ min: 1, max: 150 }).withMessage('Enter the part name'),
  body('spare_parts.*.quantity').optional().isInt({ min: 1, max: 10000 }).withMessage('Quantity must be at least 1').toInt(),
  body('spare_parts.*.unit_cost').optional().isFloat({ min: 0, max: 100000000 }).withMessage('Enter a cost of 0 or more').toFloat(),
  body('spare_parts.*.remarks').optional({ values: 'null' }).isString().isLength({ max: 500 }),
];
export const idRules = [idParam()];
export const photoIdRules = [idParam(), param('photoId').isInt({ min: 1 }).toInt()];

export const listReplacementRules = [...listCommon, query('status').optional().isIn(REPL_STATUSES)];
export const createReplacementRules = [
  body('equipment_id').isInt({ min: 1 }).withMessage('Choose the equipment').toInt(),
  body('reason').isString().trim().isLength({ min: 3, max: 4000 }).withMessage('Give the reason for replacement'),
  body('technical_recommendation').isString().trim().isLength({ min: 3, max: 4000 }).withMessage('Give the technical recommendation'),
  money('estimated_cost'),
  optionalText('remarks', 4000),
];
export const updateReplacementRules = [
  idParam(),
  body('status').optional().isIn(REPL_STATUSES).withMessage('Unknown status'),
  body('reason').optional().isString().trim().isLength({ min: 3, max: 4000 }),
  body('technical_recommendation').optional().isString().trim().isLength({ min: 3, max: 4000 }),
  money('estimated_cost'),
  optionalText('remarks', 4000),
  optionalText('review_remarks', 4000),
];

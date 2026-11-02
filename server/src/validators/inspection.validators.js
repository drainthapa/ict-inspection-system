import { body, query, param } from 'express-validator';
import { idParam, optionalText } from './common.js';
import { CONDITIONS } from './equipment.validators.js';

export const ACTIONS = [
  'no_action', 'general_maintenance', 'hardware_repair', 'software_update', 'network_configuration',
  'cctv_configuration', 'biometric_configuration', 'electrical_repair', 'spare_parts_replacement',
  'device_replacement', 'new_purchase', 'further_assessment',
];
export const PHOTO_TYPES = ['general', 'front_view', 'serial_number', 'damage', 'installation', 'network_rack', 'cable_management'];

const fields = [
  body('ward_id').optional().isInt({ min: 1 }).withMessage('Choose a ward').toInt(),
  body('equipment_id').optional({ values: 'null' }).isInt({ min: 1 }).withMessage('Choose the equipment').toInt(),
  body('category_id').optional({ values: 'null' }).isInt({ min: 1 }).toInt(),
  body('inspection_date').optional().isISO8601({ strict: true }).withMessage('Enter a valid date'),
  body('inspection_type').optional().isIn(['initial', 'routine', 'follow_up']).withMessage('Choose the inspection type'),
  body('condition').optional({ values: 'null' }).isIn(CONDITIONS).withMessage('Choose the condition'),
  optionalText('problem_description', 4000),
  optionalText('technical_fault', 4000),
  body('repair_required').optional({ values: 'null' }).isBoolean().toBoolean(),
  optionalText('required_repair_work', 4000),
  optionalText('required_spare_parts', 4000),
  body('estimated_repair_cost').optional({ values: 'falsy' }).isFloat({ min: 0, max: 100000000 })
    .withMessage('Enter a cost of 0 or more').toFloat(),
  body('recommended_actions').optional().isArray({ max: 12 }),
  body('recommended_actions.*').isIn(ACTIONS).withMessage('Unknown action'),
  optionalText('recommendation', 4000),
  optionalText('replacement_reason', 4000),
  optionalText('technical_justification', 4000),
  body('estimated_replacement_cost').optional({ values: 'falsy' }).isFloat({ min: 0, max: 100000000 }).toFloat(),
  optionalText('inspector_remarks', 4000),
  body('checklist').optional().isArray({ max: 50 }),
  body('checklist.*.checklist_item_id').isInt({ min: 1 }).toInt(),
  body('checklist.*.result').isIn(['good', 'problem', 'not_applicable']).withMessage('Invalid checklist result'),
  body('checklist.*.remarks').optional({ values: 'null' }).isString().isLength({ max: 500 }),
  body('submit').optional().isBoolean().toBoolean(),
];

export const createInspectionRules = [
  body('ward_id').exists({ values: 'falsy' }).withMessage('Choose a ward'),
  ...fields,
];
export const updateInspectionRules = [idParam(), ...fields];
export const inspectionIdRules = [idParam()];
export const photoDeleteRules = [idParam(), param('photoId').isInt({ min: 1 }).toInt()];
export const photoMetaRules = [idParam(), body('photo_type').optional().isIn(PHOTO_TYPES), optionalText('caption', 255)];

export const listInspectionRules = [
  query('search').optional().isString().trim().isLength({ max: 100 }),
  query('ward_id').optional().isInt({ min: 1 }).toInt(),
  query('category_id').optional().isInt({ min: 1 }).toInt(),
  query('equipment_id').optional().isInt({ min: 1 }).toInt(),
  query('inspector_id').optional().isInt({ min: 1 }).toInt(),
  query('condition').optional().isIn(CONDITIONS),
  query('status').optional().isIn(['draft', 'submitted']),
  query('inspection_type').optional().isIn(['initial', 'routine', 'follow_up']),
  query('repair_required').optional().isIn(['true', 'false']),
  query('replacement').optional().isIn(['true']),
  query('date_from').optional().isISO8601({ strict: true }),
  query('date_to').optional().isISO8601({ strict: true }),
  query('mine').optional().isIn(['true']),
  query('sort').optional().isIn(['date', 'ward', 'equipment', 'condition']),
  query('dir').optional().isIn(['asc', 'desc']),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
];

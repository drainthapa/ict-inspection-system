import { Router } from 'express';
import { query, param } from 'express-validator';
import * as d from '../controllers/dashboard.controller.js';
import * as r from '../controllers/report.controller.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { REPORT_TYPES, REPORT_ALIASES } from '../services/report.service.js';
import { CONDITIONS } from '../validators/equipment.validators.js';
import { MAINT_STATUSES, REPL_STATUSES } from '../validators/maintenance.validators.js';

const types = [...Object.keys(REPORT_TYPES), ...Object.keys(REPORT_ALIASES)];
const filters = [
  query('ward_id').optional().isInt({ min: 1 }).toInt(),
  query('category_id').optional().isInt({ min: 1 }).toInt(),
  query('condition').optional().isIn([...CONDITIONS, 'not_inspected']),
  query('maintenance_status').optional().isIn(MAINT_STATUSES),
  query('replacement_status').optional().isIn(REPL_STATUSES),
  query('date_from').optional().isISO8601({ strict: true }),
  query('date_to').optional().isISO8601({ strict: true }),
];

export const dashboardRoutes = Router();
dashboardRoutes.use(authenticate);
dashboardRoutes.get('/summary', validate(filters), d.summary);
dashboardRoutes.get('/charts', validate(filters), d.charts);

export const reportRoutes = Router();
reportRoutes.use(authenticate);
reportRoutes.get('/', r.listReports);
reportRoutes.get('/export/excel', validate([query('type').isIn(types).withMessage('Choose a report'), ...filters]), r.exportExcel);
reportRoutes.get('/export/pdf', validate([query('type').isIn(types).withMessage('Choose a report'), ...filters]), r.exportPdf);
reportRoutes.get('/:type', validate([param('type').isIn(types).withMessage('Unknown report'), ...filters]), r.getReport);

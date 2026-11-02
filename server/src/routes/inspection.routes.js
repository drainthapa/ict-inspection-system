import { Router } from 'express';
import { query } from 'express-validator';
import * as c from '../controllers/inspection.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { photoUpload } from '../utils/uploads.js';
import { ROLES } from '../utils/roles.js';
import {
  createInspectionRules, updateInspectionRules, inspectionIdRules, listInspectionRules, photoDeleteRules, photoMetaRules,
} from '../validators/inspection.validators.js';

const r = Router();
const inspectors = authorize(ROLES.SUPER_ADMIN, ROLES.INSPECTOR);
r.use(authenticate);
r.get('/checklist', validate([query('category_id').isInt({ min: 1 }).withMessage('Choose a category').toInt()]), c.getChecklist);
r.get('/', validate(listInspectionRules), c.listInspections);
r.get('/:id', validate(inspectionIdRules), c.getInspection);
r.post('/', inspectors, validate(createInspectionRules), c.createInspection);
r.put('/:id', inspectors, validate(updateInspectionRules), c.updateInspection);
r.delete('/:id', inspectors, validate(inspectionIdRules), c.deleteInspection);
r.post('/:id/photos', inspectors, photoUpload('photos', 10), validate(photoMetaRules), c.uploadPhotos);
r.delete('/:id/photos/:photoId', inspectors, validate(photoDeleteRules), c.deletePhoto);
export default r;

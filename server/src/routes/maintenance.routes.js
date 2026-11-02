import { Router } from 'express';
import * as m from '../controllers/maintenance.controller.js';
import * as rp from '../controllers/replacement.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { photoUpload } from '../utils/uploads.js';
import { ROLES } from '../utils/roles.js';
import * as v from '../validators/maintenance.validators.js';

const inspectors = authorize(ROLES.SUPER_ADMIN, ROLES.INSPECTOR);

export const maintenanceRoutes = Router();
maintenanceRoutes.use(authenticate);
maintenanceRoutes.get('/', validate(v.listMaintenanceRules), m.listMaintenance);
maintenanceRoutes.get('/:id', validate(v.idRules), m.getMaintenance);
maintenanceRoutes.post('/', validate(v.createMaintenanceRules), m.createMaintenance); // all roles, ward-scoped
maintenanceRoutes.put('/:id', inspectors, validate(v.updateMaintenanceRules), m.updateMaintenance);
maintenanceRoutes.post('/:id/photos', inspectors, photoUpload('photos', 10), validate(v.idRules), m.uploadMaintenancePhotos);
maintenanceRoutes.delete('/:id/photos/:photoId', inspectors, validate(v.photoIdRules), m.deleteMaintenancePhoto);

export const replacementRoutes = Router();
replacementRoutes.use(authenticate);
replacementRoutes.get('/', validate(v.listReplacementRules), rp.listReplacements);
replacementRoutes.get('/:id', validate(v.idRules), rp.getReplacement);
replacementRoutes.post('/', inspectors, validate(v.createReplacementRules), rp.createReplacement);
replacementRoutes.put('/:id', inspectors, validate(v.updateReplacementRules), rp.updateReplacement);

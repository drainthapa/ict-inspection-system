import { Router } from 'express';
import * as e from '../controllers/equipment.controller.js';
import * as cat from '../controllers/category.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { ROLES } from '../utils/roles.js';
import { idParam } from '../validators/common.js';
import {
  createEquipmentRules, updateEquipmentRules, equipmentIdRules, listEquipmentRules,
  nextAssetIdRules, createCategoryRules, updateCategoryRules,
} from '../validators/equipment.validators.js';

const r = Router();
const admin = authorize(ROLES.SUPER_ADMIN);
const editors = authorize(ROLES.SUPER_ADMIN, ROLES.INSPECTOR);

r.use(authenticate);

// Categories (declared before /:id so "categories" is not read as an id)
r.get('/categories', cat.listCategories);
r.get('/categories/groups', cat.listGroups);
r.post('/categories', admin, validate(createCategoryRules), cat.createCategory);
r.put('/categories/:id', admin, validate(updateCategoryRules), cat.updateCategory);
r.delete('/categories/:id', admin, validate([idParam()]), cat.deleteCategory);

// Equipment (ward scoping is enforced inside each handler)
r.get('/next-asset-id', editors, validate(nextAssetIdRules), e.nextAssetId);
r.get('/', validate(listEquipmentRules), e.listEquipment);
r.get('/:id', validate(equipmentIdRules), e.getEquipment);
r.post('/', editors, validate(createEquipmentRules), e.createEquipment);
r.put('/:id', editors, validate(updateEquipmentRules), e.updateEquipment);
r.delete('/:id', admin, validate(equipmentIdRules), e.deleteEquipment);
export default r;

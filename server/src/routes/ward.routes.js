import { Router } from 'express';
import * as c from '../controllers/ward.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { ROLES } from '../utils/roles.js';
import {
  createWardRules, updateWardRules, wardIdRules, assignUsersRules,
} from '../validators/ward.validators.js';

const r = Router();
const admin = authorize(ROLES.SUPER_ADMIN);

r.use(authenticate);
r.get('/', c.listWards);                                   // scoped
r.get('/:id', validate(wardIdRules), c.getWard);           // scoped
r.post('/', admin, validate(createWardRules), c.createWard);
r.put('/:id', admin, validate(updateWardRules), c.updateWard);
r.delete('/:id', admin, validate(wardIdRules), c.deleteWard);
r.put('/:id/users', admin, validate(assignUsersRules), c.setWardUsers);
export default r;

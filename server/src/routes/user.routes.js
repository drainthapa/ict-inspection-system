import { Router } from 'express';
import * as c from '../controllers/user.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { ROLES } from '../utils/roles.js';
import {
  createUserRules, updateUserRules, listUserRules, userIdRules,
} from '../validators/user.validators.js';

const r = Router();
const admin = authorize(ROLES.SUPER_ADMIN);

r.use(authenticate);
r.get('/roles', admin, c.listRoles);
r.get('/', admin, validate(listUserRules), c.listUsers);
r.get('/:id', validate(userIdRules), c.getUser);         // admin or self (checked in controller)
r.post('/', admin, validate(createUserRules), c.createUser);
r.put('/:id', admin, validate(updateUserRules), c.updateUser);
r.delete('/:id', admin, validate(userIdRules), c.deactivateUser);
export default r;

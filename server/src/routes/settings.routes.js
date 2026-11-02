import { Router } from 'express';
import * as c from '../controllers/settings.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { ROLES } from '../utils/roles.js';

const r = Router();
r.use(authenticate);
r.get('/', c.getSettings);
r.put('/', authorize(ROLES.SUPER_ADMIN), c.updateSettings);
export default r;

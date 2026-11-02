import { Router } from 'express';
import * as c from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.js';
import { loginLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { loginRules, changePasswordRules } from '../validators/auth.validators.js';

const r = Router();
r.post('/login', loginLimiter, validate(loginRules), c.login);
r.post('/logout', authenticate, c.logout);
r.get('/me', authenticate, c.me);
r.post('/change-password', authenticate, loginLimiter, validate(changePasswordRules), c.changePassword);
export default r;

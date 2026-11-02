import { body } from 'express-validator';
import { passwordRule } from './common.js';

export const loginRules = [
  body('username').isString().trim().toLowerCase().notEmpty().withMessage('Enter your username')
    .isLength({ max: 50 }),
  body('password').isString().notEmpty().withMessage('Enter your password').isLength({ max: 72 }),
];

export const changePasswordRules = [
  body('currentPassword').isString().notEmpty().withMessage('Enter your current password'),
  passwordRule('newPassword'),
];

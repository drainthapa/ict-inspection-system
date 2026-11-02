import { Router } from 'express';
import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import wardRoutes from './ward.routes.js';
import equipmentRoutes from './equipment.routes.js';
import settingsRoutes from './settings.routes.js';
import inspectionRoutes from './inspection.routes.js';
import { maintenanceRoutes, replacementRoutes } from './maintenance.routes.js';
import { dashboardRoutes, reportRoutes } from './report.routes.js';
import { query } from '../config/db.js';

const r = Router();

r.get('/health', async (_req, res) => {
  try {
    await query('SELECT 1');
    res.json({ success: true, data: { status: 'ok', database: 'connected' } });
  } catch {
    res.status(503).json({ success: false, message: 'Database unavailable' });
  }
});

r.use('/auth', authRoutes);
r.use('/users', userRoutes);
r.use('/wards', wardRoutes);
r.use('/equipment', equipmentRoutes);
r.use('/settings', settingsRoutes);
r.use('/inspections', inspectionRoutes);
r.use('/maintenance', maintenanceRoutes);
r.use('/replacements', replacementRoutes);
r.use('/dashboard', dashboardRoutes);
r.use('/reports', reportRoutes);

export default r;

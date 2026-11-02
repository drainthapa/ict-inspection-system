import { query, withTransaction } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ok } from '../utils/response.js';
import { audit } from '../utils/audit.js';

// Only these keys can be changed through the API, each with its own check
export const SETTING_RULES = {
  municipality_name: (v) => v.length >= 2 && v.length <= 150,
  office_name: (v) => v.length >= 2 && v.length <= 150,
  municipality_address: (v) => v.length >= 2 && v.length <= 255,
  currency: (v) => /^[A-Z]{3}$/.test(v),
  max_photos_per_inspection: (v) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 30,
};

const HINTS = {
  municipality_name: '2–150 characters',
  office_name: '2–150 characters',
  municipality_address: '2–255 characters',
  currency: 'Three capital letters, e.g. NPR',
  max_photos_per_inspection: 'A number from 1 to 30',
};

// GET /api/settings  (any signed-in user: report headers need these)
export const getSettings = asyncHandler(async (_req, res) => {
  const { rows } = await query('SELECT key, value, description, updated_at FROM system_settings ORDER BY key');
  ok(res, rows);
});

// PUT /api/settings  { values: { key: value, ... } }
export const updateSettings = asyncHandler(async (req, res) => {
  const values = req.body?.values;
  if (!values || typeof values !== 'object' || Array.isArray(values)) {
    throw ApiError.badRequest('Send settings as { values: { key: value } }');
  }
  const errors = {};
  const entries = Object.entries(values).map(([k, v]) => [k, String(v ?? '').trim()]);
  for (const [k, v] of entries) {
    if (!SETTING_RULES[k]) errors[k] = 'Unknown setting';
    else if (!SETTING_RULES[k](v)) errors[k] = HINTS[k];
  }
  if (Object.keys(errors).length) throw new ApiError(422, 'Please correct the highlighted fields', errors);

  await withTransaction(async (db) => {
    for (const [k, v] of entries) {
      await db.query(
        `INSERT INTO system_settings (key, value, updated_by) VALUES ($1, $2, $3)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by`,
        [k, v, req.user.id],
      );
    }
    await audit(req, 'settings.updated', { entityType: 'settings', details: { keys: entries.map(([k]) => k) } }, db);
  });
  const { rows } = await query('SELECT key, value, description, updated_at FROM system_settings ORDER BY key');
  ok(res, rows, { message: 'Settings saved' });
});

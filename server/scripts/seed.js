import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/config/db.js';

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '../database/seed.sql');

try {
  await pool.query(await fs.readFile(file, 'utf8'));
  const { rows } = await pool.query(`
    SELECT (SELECT COUNT(*) FROM roles)::int AS roles,
           (SELECT COUNT(*) FROM wards)::int AS wards,
           (SELECT COUNT(*) FROM equipment_categories)::int AS categories,
           (SELECT COUNT(*) FROM inspection_checklist_items)::int AS checklist_items`);
  console.log('Seed complete:', rows[0]);
} catch (err) {
  console.error('Seed failed:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}

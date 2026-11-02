// Applies database/migrations/*.sql in filename order, once each.
// Each file runs in its own transaction and is recorded in schema_migrations.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/config/db.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../database/migrations');

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename    VARCHAR(255) PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

  const files = (await fs.readdir(dir)).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
  const { rows } = await pool.query('SELECT filename FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.filename));

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await fs.readFile(path.join(dir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`  applied ${file}`);
      count += 1;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`  FAILED ${file}: ${err.message}`);
      throw err;
    } finally {
      client.release();
    }
  }
  console.log(count ? `Migrations complete (${count} applied).` : 'Database is up to date.');
}

main()
  .catch(() => { process.exitCode = 1; })
  .finally(() => pool.end());

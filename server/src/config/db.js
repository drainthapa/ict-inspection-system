import pg from 'pg';
import { env } from './env.js';

// Return NUMERIC as JS numbers (costs fit comfortably in a double)
pg.types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
// Return DATE columns as 'YYYY-MM-DD' strings, avoiding timezone shifts
pg.types.setTypeParser(1082, (v) => v);

export const pool = new pg.Pool({
  host: env.db.host,
  port: env.db.port,
  database: env.db.database,
  user: env.db.user,
  password: env.db.password,
  max: env.db.max,
  ssl: env.db.ssl,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error', err);
});

/** Run a parameterized query on the pool. */
export const query = (text, params) => pool.query(text, params);

/**
 * Run `fn(client)` inside a transaction. Commits on success,
 * rolls back on any thrown error, and always releases the client.
 */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

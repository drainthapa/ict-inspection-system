// Creates the initial Super Admin from environment variables.
// If ADMIN_PASSWORD is not set, prompts for it (input hidden).
// Does nothing if an active Super Admin already exists.
import readline from 'node:readline';
import { pool, withTransaction } from '../src/config/db.js';
import { hashPassword } from '../src/services/auth.service.js';

function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl._writeToOutput = (s) => { if (s.includes(question)) rl.output.write(s); };
    rl.question(question, (answer) => { rl.close(); process.stdout.write('\n'); resolve(answer); });
  });
}

const validPassword = (p) => p.length >= 8 && p.length <= 72 && /[A-Za-z]/.test(p) && /\d/.test(p);

try {
  const existing = await pool.query(
    `SELECT u.username FROM users u JOIN roles r ON r.id = u.role_id
      WHERE r.name = 'super_admin' AND u.is_active LIMIT 1`,
  );
  if (existing.rows[0]) {
    console.log(`A Super Admin already exists (${existing.rows[0].username}). Nothing to do.`);
  } else {
    const username = (process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
    const fullName = process.env.ADMIN_FULL_NAME || 'System Administrator';
    const email = process.env.ADMIN_EMAIL || null;
    let password = process.env.ADMIN_PASSWORD;

    if (!password) {
      if (!process.stdin.isTTY) throw new Error('Set ADMIN_PASSWORD or run this script in a terminal');
      password = await promptHidden(`Password for Super Admin "${username}": `);
    }
    if (!validPassword(password)) {
      throw new Error('Password must be 8–72 characters and include a letter and a number');
    }

    const passwordHash = await hashPassword(password);
    await withTransaction(async (db) => {
      const { rows } = await db.query(
        `INSERT INTO users (full_name, username, email, password_hash, role_id)
         VALUES ($1, $2, $3, $4, (SELECT id FROM roles WHERE name = 'super_admin'))
         RETURNING id`,
        [fullName, username, email, passwordHash],
      );
      await db.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
         VALUES ($1::int, 'user.created', 'user', $1::text, '{"via":"setup:admin"}')`,
        [rows[0].id],
      );
    });
    console.log(`Super Admin "${username}" created. Remove ADMIN_PASSWORD from .env now.`);
  }
} catch (err) {
  console.error('Could not create Super Admin:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}

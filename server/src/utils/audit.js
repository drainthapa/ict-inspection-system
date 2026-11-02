import { query } from '../config/db.js';

/**
 * Record an important activity. Never throws: a failed audit write is logged
 * but does not break the user's request. Pass a transaction client as `db`
 * to make the audit row part of the same transaction.
 */
export async function audit(req, action, { entityType, entityId, details } = {}, db) {
  const runner = db ?? { query };
  try {
    await runner.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        req.user?.id ?? null,
        action,
        entityType ?? null,
        entityId != null ? String(entityId) : null,
        JSON.stringify(details ?? {}),
        req.ip ?? null,
        (req.get?.('user-agent') || '').slice(0, 255) || null,
      ],
    );
  } catch (err) {
    if (db) throw err; // inside a transaction, let the caller roll back
    console.error('Audit log write failed:', err.message);
  }
}

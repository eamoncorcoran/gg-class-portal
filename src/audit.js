import { query } from './db.js';

export async function audit({ actorId = null, action, entityType = null, entityId = null, metadata = {}, ip = null }) {
  try {
    await query(
      `INSERT INTO audit_logs(actor_id, action, entity_type, entity_id, metadata, ip)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6)`,
      [actorId, action, entityType, entityId ? String(entityId) : null, JSON.stringify(metadata), ip],
    );
  } catch (error) {
    console.error('Audit log failure', error);
  }
}

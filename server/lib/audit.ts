import { db } from '../db';

// Log centralizzato di ogni azione del sistema (requisito: ogni azione deve essere loggata).
export function logAction(
  entityType: string,
  entityId: string,
  action: string,
  actor: string,
  details: Record<string, unknown> = {}
): void {
  db.prepare(
    'INSERT INTO audit_log (id, entityType, entityId, action, actor, details, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    'log-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    entityType,
    entityId,
    action,
    actor,
    JSON.stringify(details),
    new Date().toISOString()
  );
}

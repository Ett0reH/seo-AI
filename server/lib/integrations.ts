import { db } from '../db';
import type { IntegrationRow } from '../types';

// Lettura centralizzata di una riga della tabella integrations (config JSON parsata).
// Estratta da publishers/index.ts in MVP-3: serve anche all'agente di visibilità
// senza creare un import circolare con il registry dei connettori.
export function getIntegration(platformId: string): IntegrationRow | null {
  const row = db.prepare('SELECT * FROM integrations WHERE platform = ?').get(platformId) as any;
  if (!row) return null;
  let config: Record<string, string> = {};
  try { config = JSON.parse(row.config || '{}'); } catch { /* config corrotta → vuota */ }
  return { ...row, config };
}

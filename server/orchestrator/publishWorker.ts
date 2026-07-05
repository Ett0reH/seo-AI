// Worker di pubblicazione (MVP-2).
//
// Ogni minuto pubblica AL MASSIMO UNA variante il cui slot (scheduledAt) è
// scaduto — così due pubblicazioni non partono mai nello stesso minuto,
// coerente con lo scheduling naturale dell'MVP-1. Agisce solo su varianti:
//   - in stato 'scheduled' (quindi già approvate quando richiesto),
//   - con metodo api/scheduler,
//   - la cui integrazione è configurata e abilitata.
// Tutto il resto rimane fermo a "bozza pronta" per il flusso manuale.

import { db } from '../db';
import { publishVariant, isAutoPublishable, getIntegration } from '../publishers';
import { logAction } from '../lib/audit';
import type { VariantRow } from '../types';

const TICK_MS = 60_000;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MIN = 15; // backoff: 15min * numero tentativi

// Pubblica una variante e persiste l'esito (usata dal worker e da publish-now).
export async function executePublish(
  variant: VariantRow,
  actor: string
): Promise<{ ok: boolean; publicationId?: string; error?: string }> {
  const result = await publishVariant(variant);

  if (result.ok) {
    const pubId = 'pub-' + Date.now();
    const isScheduler = variant.publishMethod === 'scheduler';
    db.prepare(
      `INSERT INTO publications (id, variantId, platform, publishedUrl, publishedAt, author, utm, method, engagement, clicks, referral, screenshotPath, notes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, '{}', 0, 0, '', ?, 'published')`
    ).run(
      pubId, variant.id, variant.platform, result.publishedUrl || '',
      new Date().toISOString(), actor, variant.utm, variant.publishMethod,
      isScheduler && !result.publishedUrl
        ? 'Inviato allo scheduler autorizzato: pubblicherà allo slot configurato.'
        : ''
    );
    db.prepare("UPDATE platform_variants SET status = 'published', lastError = NULL WHERE id = ?").run(variant.id);
    logAction('variant', variant.id, 'published_auto', actor, {
      publicationId: pubId,
      publishedUrl: result.publishedUrl || '',
      method: variant.publishMethod,
    });
    return { ok: true, publicationId: pubId };
  }

  // Fallimento: retry con backoff, poi 'failed' definitivo.
  const attempts = (variant.attempts || 0) + 1;
  if (attempts >= MAX_ATTEMPTS) {
    db.prepare(
      "UPDATE platform_variants SET status = 'failed', attempts = ?, lastError = ? WHERE id = ?"
    ).run(attempts, result.error || 'errore sconosciuto', variant.id);
    logAction('variant', variant.id, 'publish_failed', actor, { attempts, error: result.error });
  } else {
    const retryAt = new Date(Date.now() + RETRY_DELAY_MIN * attempts * 60_000).toISOString();
    db.prepare(
      'UPDATE platform_variants SET attempts = ?, lastError = ?, scheduledAt = ? WHERE id = ?'
    ).run(attempts, result.error || 'errore sconosciuto', retryAt, variant.id);
    logAction('variant', variant.id, 'publish_retry_scheduled', actor, {
      attempts, retryAt, error: result.error,
    });
  }
  return { ok: false, error: result.error };
}

async function tick(): Promise<void> {
  const now = new Date().toISOString();
  const due = db.prepare(
    `SELECT * FROM platform_variants
     WHERE status = 'scheduled' AND publishMethod IN ('api', 'scheduler') AND scheduledAt <= ?
     ORDER BY scheduledAt ASC`
  ).all(now) as VariantRow[];

  // Prima variante con integrazione attiva: le altre aspettano il tick successivo.
  const next = due.find((v) => {
    if (!isAutoPublishable(v.platform, v.publishMethod)) return false;
    const integration = getIntegration(v.platform);
    return Boolean(integration && integration.enabled);
  });
  if (!next) return;

  console.log(`[PublishWorker] Pubblico ${next.id} su ${next.platform} (slot ${next.scheduledAt})`);
  const outcome = await executePublish(next, 'system');
  if (!outcome.ok) {
    console.warn(`[PublishWorker] Pubblicazione fallita per ${next.id}: ${outcome.error}`);
  }
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startPublishWorker(): void {
  if (timer) return;
  timer = setInterval(() => {
    tick().catch((e) => console.error('[PublishWorker] Errore tick:', e));
  }, TICK_MS);
  console.log('[PublishWorker] Attivo: 1 pubblicazione max al minuto, solo API/scheduler autorizzati.');
}

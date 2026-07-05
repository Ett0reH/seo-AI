// Registry dei connettori di pubblicazione (MVP-2).
//
// Vincolo architetturale: SOLO API ufficiali e webhook verso scheduler
// autorizzati. Le piattaforme semi_automatic e manual_guided non hanno
// connettore e non sono mai pubblicabili automaticamente: restano al
// flusso di approvazione + pacchetto manuale dell'MVP-1.

import { db } from '../db';
import { devtoPublisher } from './devto';
import { wordpressPublisher } from './wordpress';
import { githubPublisher } from './github';
import { webhookPublisher } from './webhook';
import type { ConnectorId, IntegrationRow, Publisher, PublishMethod, PublishResult, VariantRow } from '../types';

const CONNECTORS: Record<ConnectorId, Publisher> = {
  devto: devtoPublisher,
  wordpress: wordpressPublisher,
  github: githubPublisher,
  webhook: webhookPublisher,
};

// Connettore di default per le sole piattaforme con metodo api/scheduler.
// YouTube passa dal webhook (Data API richiede OAuth: lo gestisce lo scheduler).
export const DEFAULT_CONNECTOR: Record<string, ConnectorId> = {
  devto: 'devto',
  wordpress: 'wordpress',
  github: 'github',
  youtube: 'webhook',
  linkedin_company: 'webhook',
  instagram: 'webhook',
  facebook: 'webhook',
};

export function isAutoPublishable(platformId: string, method: PublishMethod): boolean {
  return (method === 'api' || method === 'scheduler') && platformId in DEFAULT_CONNECTOR;
}

export function getIntegration(platformId: string): IntegrationRow | null {
  const row = db.prepare('SELECT * FROM integrations WHERE platform = ?').get(platformId) as any;
  if (!row) return null;
  let config: Record<string, string> = {};
  try { config = JSON.parse(row.config || '{}'); } catch { /* config corrotta → vuota */ }
  return { ...row, config };
}

export async function publishVariant(variant: VariantRow): Promise<PublishResult> {
  if (!isAutoPublishable(variant.platform, variant.publishMethod)) {
    return {
      ok: false,
      error: `La piattaforma ${variant.platform} (${variant.publishMethod}) non è pubblicabile automaticamente: usa il pacchetto manuale.`,
    };
  }
  const integration = getIntegration(variant.platform);
  if (!integration || !integration.enabled) {
    return { ok: false, error: `Integrazione non configurata o disabilitata per ${variant.platform}` };
  }
  const connector = CONNECTORS[integration.connector] || CONNECTORS[DEFAULT_CONNECTOR[variant.platform]];
  try {
    return await connector.publish(variant, integration.config);
  } catch (e) {
    return { ok: false, error: `Errore connettore: ${String(e)}` };
  }
}

export async function testIntegration(platformId: string): Promise<PublishResult> {
  const integration = getIntegration(platformId);
  if (!integration) return { ok: false, error: 'Integrazione non configurata' };
  const connector = CONNECTORS[integration.connector];
  if (!connector) return { ok: false, error: `Connettore sconosciuto: ${integration.connector}` };
  try {
    return await connector.test(integration.config);
  } catch (e) {
    return { ok: false, error: `Errore test: ${String(e)}` };
  }
}

// Connettore webhook verso SCHEDULER AUTORIZZATI (Make / n8n / Zapier / Publer).
// Invia il pacchetto della variante: è lo scheduler, autorizzato dall'utente
// sulla piattaforma social, a pubblicare allo slot. Nessuna automazione browser.
// Il payload è firmato HMAC-SHA256 (stesso pattern del webhook WordPress del repo).

import crypto from 'crypto';
import type { Publisher, PublishResult, VariantRow } from '../types';

function parse(raw: string): unknown {
  try { return JSON.parse(raw); } catch { return raw; }
}

function buildPayload(variant: VariantRow): string {
  return JSON.stringify({
    variantId: variant.id,
    platform: variant.platform,
    title: variant.title,
    body: variant.body,
    hashtags: parse(variant.hashtags),
    cta: variant.cta,
    link: variant.link,
    anchorText: variant.anchorText,
    utm: parse(variant.utm),
    mediaSuggestion: variant.mediaSuggestion,
    scheduledAt: variant.scheduledAt,
    opNotes: variant.opNotes,
  });
}

async function post(url: string, payload: string, secret?: string): Promise<Response> {
  const reqHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
  if (secret) {
    reqHeaders['X-Distribution-Signature'] =
      crypto.createHmac('sha256', secret).update(payload).digest('hex');
  }
  return fetch(url, { method: 'POST', headers: reqHeaders, body: payload });
}

export const webhookPublisher: Publisher = {
  async publish(variant, config): Promise<PublishResult> {
    if (!config.webhookUrl) return { ok: false, error: 'webhookUrl mancante' };
    const payload = buildPayload(variant);
    const res = await post(config.webhookUrl, payload, config.secret);
    const text = await res.text();
    if (!res.ok) return { ok: false, error: `Webhook ${res.status}: ${text.slice(0, 300)}` };
    // Lo scheduler può restituire subito l'URL, oppure pubblicare più tardi allo slot.
    try {
      const json = JSON.parse(text);
      return { ok: true, publishedUrl: json.url || json.publishedUrl || '' };
    } catch {
      return { ok: true, publishedUrl: '' };
    }
  },

  async test(config): Promise<PublishResult> {
    if (!config.webhookUrl) return { ok: false, error: 'webhookUrl mancante' };
    const payload = JSON.stringify({ test: true, source: 'seo-ai-distribution' });
    const res = await post(config.webhookUrl, payload, config.secret);
    if (!res.ok) return { ok: false, error: `Webhook ${res.status}: endpoint non raggiungibile` };
    return { ok: true };
  },
};

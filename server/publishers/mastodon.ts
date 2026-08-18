// Connettore Mastodon (REST API ufficiale). Nessun browser: solo HTTPS + token.
// Auth: access token (Bearer) generato dall'app OAuth sull'istanza dell'utente.
// Docs: https://docs.joinmastodon.org/methods/statuses/#create

import type { Publisher, PublishResult, VariantRow } from '../types';

const MAX_CHARS = 500; // limite di default; le istanze possono alzarlo, mai abbassarlo sotto 500.

function instance(config: Record<string, string>): string {
  return (config.instanceUrl || '').replace(/\/+$/, '');
}

function parseJsonArray(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

function sanitizeHashtags(variant: VariantRow, limit: number): string[] {
  const clean = parseJsonArray(variant.hashtags)
    .map((t) => t.replace(/[^a-zA-Z0-9]/g, ''))
    .filter((t) => t.length >= 2);
  return [...new Set(clean)].slice(0, limit);
}

function truncate(s: string, n: number): string {
  const a = Array.from(s);
  if (a.length <= n) return s;
  return a.slice(0, Math.max(0, n - 1)).join('') + '…';
}

// Mastodon auto-linka URL e hashtag: basta testo semplice.
function buildStatus(variant: VariantRow): string {
  const link = (variant.link || '').trim();
  const tagLine = sanitizeHashtags(variant, 4).map((t) => `#${t}`).join(' ');
  const suffixParts = [link, tagLine].filter(Boolean);
  const suffix = suffixParts.length ? '\n\n' + suffixParts.join('\n\n') : '';
  const budget = MAX_CHARS - Array.from(suffix).length;
  let bodyText = variant.body.trim();
  if (variant.cta) bodyText += '\n\n' + variant.cta.trim();
  bodyText = truncate(bodyText, Math.max(0, budget));
  return (bodyText + suffix).trim();
}

export const mastodonPublisher: Publisher = {
  async publish(variant, config): Promise<PublishResult> {
    if (!config.instanceUrl) return { ok: false, error: 'instanceUrl Mastodon mancante (es. https://mastodon.social)' };
    if (!config.token) return { ok: false, error: 'token Mastodon mancante' };
    const res = await fetch(`${instance(config)}/api/v1/statuses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: buildStatus(variant),
        visibility: 'public',
        language: 'it',
      }),
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, error: `Mastodon ${res.status}: ${text.slice(0, 300)}` };
    try {
      const json = JSON.parse(text);
      return { ok: true, publishedUrl: json.url || json.uri || '' };
    } catch {
      return { ok: true, publishedUrl: '' };
    }
  },

  async test(config): Promise<PublishResult> {
    if (!config.instanceUrl) return { ok: false, error: 'instanceUrl Mastodon mancante' };
    if (!config.token) return { ok: false, error: 'token Mastodon mancante' };
    const res = await fetch(`${instance(config)}/api/v1/accounts/verify_credentials`, {
      headers: { Authorization: `Bearer ${config.token}` },
    });
    if (!res.ok) return { ok: false, error: `Mastodon ${res.status}: credenziali non valide` };
    return { ok: true };
  },
};

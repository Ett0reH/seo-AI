// Connettore Dev.to (Forem API ufficiale). Nessun browser: solo HTTPS + api-key.
// Docs: https://developers.forem.com/api

import type { Publisher, PublishResult, VariantRow } from '../types';

const API_BASE = 'https://dev.to/api';

function parseJsonArray(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

// Dev.to accetta max 4 tag, solo alfanumerici lowercase.
function sanitizeTags(variant: VariantRow): string[] {
  const source = [...parseJsonArray(variant.tags), ...parseJsonArray(variant.hashtags)];
  const clean = source
    .map((t) => t.replace(/[^a-zA-Z0-9]/g, '').toLowerCase())
    .filter((t) => t.length >= 2);
  return [...new Set(clean)].slice(0, 4);
}

function buildMarkdown(variant: VariantRow): string {
  const parts = [variant.body.trim()];
  if (variant.cta) parts.push(variant.cta.trim());
  if (variant.link && variant.anchorText) {
    parts.push(`[${variant.anchorText}](${variant.link})`);
  }
  return parts.filter(Boolean).join('\n\n');
}

export const devtoPublisher: Publisher = {
  async publish(variant, config): Promise<PublishResult> {
    if (!config.apiKey) return { ok: false, error: 'apiKey Dev.to mancante' };
    const res = await fetch(`${API_BASE}/articles`, {
      method: 'POST',
      headers: { 'api-key': config.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        article: {
          title: variant.title,
          published: true,
          body_markdown: buildMarkdown(variant),
          tags: sanitizeTags(variant),
        },
      }),
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, error: `Dev.to ${res.status}: ${text.slice(0, 300)}` };
    try {
      const json = JSON.parse(text);
      return { ok: true, publishedUrl: json.url || '' };
    } catch {
      return { ok: true, publishedUrl: '' };
    }
  },

  async test(config): Promise<PublishResult> {
    if (!config.apiKey) return { ok: false, error: 'apiKey Dev.to mancante' };
    const res = await fetch(`${API_BASE}/articles/me?per_page=1`, {
      headers: { 'api-key': config.apiKey },
    });
    if (!res.ok) return { ok: false, error: `Dev.to ${res.status}: credenziali non valide` };
    return { ok: true };
  },
};

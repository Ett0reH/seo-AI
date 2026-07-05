// Connettore WordPress REST API (application password). Nessun browser.
// Docs: https://developer.wordpress.org/rest-api/

import type { Publisher, PublishResult, VariantRow } from '../types';

function authHeader(config: Record<string, string>): string {
  const raw = `${config.username}:${config.appPassword}`;
  return 'Basic ' + Buffer.from(raw, 'utf8').toString('base64');
}

function restUrl(config: Record<string, string>, path: string): string {
  const base = (config.baseUrl || '').replace(/\/+$/, '');
  return `${base}/wp-json/wp/v2${path}`;
}

// Il body delle varianti è testo con paragrafi separati da riga vuota → HTML minimo.
function toHtml(variant: VariantRow): string {
  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const paragraphs = variant.body
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p>${escape(p).replace(/\n/g, '<br>')}</p>`);
  if (variant.cta) paragraphs.push(`<p>${escape(variant.cta)}</p>`);
  if (variant.link && variant.anchorText) {
    paragraphs.push(`<p><a href="${variant.link}">${escape(variant.anchorText)}</a></p>`);
  }
  return paragraphs.join('\n');
}

export const wordpressPublisher: Publisher = {
  async publish(variant, config): Promise<PublishResult> {
    if (!config.baseUrl || !config.username || !config.appPassword) {
      return { ok: false, error: 'baseUrl, username e appPassword sono obbligatori' };
    }
    const res = await fetch(restUrl(config, '/posts'), {
      method: 'POST',
      headers: { Authorization: authHeader(config), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: variant.title,
        content: toHtml(variant),
        // postStatus 'draft' consente di fermarsi comunque a bozza sul sito.
        status: config.postStatus === 'draft' ? 'draft' : 'publish',
      }),
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, error: `WordPress ${res.status}: ${text.slice(0, 300)}` };
    try {
      const json = JSON.parse(text);
      return { ok: true, publishedUrl: json.link || '' };
    } catch {
      return { ok: true, publishedUrl: '' };
    }
  },

  async test(config): Promise<PublishResult> {
    if (!config.baseUrl || !config.username || !config.appPassword) {
      return { ok: false, error: 'baseUrl, username e appPassword sono obbligatori' };
    }
    const res = await fetch(restUrl(config, '/users/me'), {
      headers: { Authorization: authHeader(config) },
    });
    if (!res.ok) return { ok: false, error: `WordPress ${res.status}: credenziali non valide` };
    return { ok: true };
  },
};

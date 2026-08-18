// Connettore Bluesky (AT Protocol ufficiale). Nessun browser: solo HTTPS.
// Auth: createSession con identifier (handle) + app password → accessJwt.
// Docs: https://docs.bsky.app  (com.atproto.server.createSession,
//        com.atproto.repo.createRecord)

import type { Publisher, PublishResult, VariantRow } from '../types';

const DEFAULT_SERVICE = 'https://bsky.social';
const MAX_GRAPHEMES = 300;

function service(config: Record<string, string>): string {
  return (config.service || DEFAULT_SERVICE).replace(/\/+$/, '');
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

// Conteggio "grafemi" approssimato via code point (le API contano graphemi).
function glen(s: string): number {
  return Array.from(s).length;
}

function truncate(s: string, n: number): string {
  const a = Array.from(s);
  if (a.length <= n) return s;
  return a.slice(0, Math.max(0, n - 1)).join('') + '…';
}

function utf8Len(s: string): number {
  return Buffer.byteLength(s, 'utf8');
}

// Bluesky non auto-linka: i link e gli hashtag vanno dichiarati come facet con
// offset in BYTE UTF-8 sul testo finale.
function buildFacets(text: string, link: string): unknown[] {
  const facets: unknown[] = [];
  if (link) {
    const idx = text.indexOf(link);
    if (idx >= 0) {
      const byteStart = utf8Len(text.slice(0, idx));
      facets.push({
        index: { byteStart, byteEnd: byteStart + utf8Len(link) },
        features: [{ $type: 'app.bsky.richtext.facet#link', uri: link }],
      });
    }
  }
  const re = /#([A-Za-z0-9]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const byteStart = utf8Len(text.slice(0, m.index));
    facets.push({
      index: { byteStart, byteEnd: byteStart + utf8Len(m[0]) },
      features: [{ $type: 'app.bsky.richtext.facet#tag', tag: m[1] }],
    });
  }
  return facets;
}

function buildText(variant: VariantRow): string {
  const link = (variant.link || '').trim();
  const tagLine = sanitizeHashtags(variant, 3).map((t) => `#${t}`).join(' ');
  const suffixParts = [link, tagLine].filter(Boolean);
  const suffix = suffixParts.length ? '\n\n' + suffixParts.join('\n\n') : '';
  const budget = MAX_GRAPHEMES - glen(suffix);
  let bodyText = variant.body.trim();
  if (variant.cta) bodyText += '\n\n' + variant.cta.trim();
  bodyText = truncate(bodyText, Math.max(0, budget));
  return (bodyText + suffix).trim();
}

interface Session {
  ok: boolean;
  accessJwt?: string;
  did?: string;
  error?: string;
}

async function createSession(config: Record<string, string>): Promise<Session> {
  if (!config.identifier) return { ok: false, error: 'identifier (handle) Bluesky mancante' };
  if (!config.appPassword) return { ok: false, error: 'appPassword Bluesky mancante' };
  const res = await fetch(`${service(config)}/xrpc/com.atproto.server.createSession`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: config.identifier, password: config.appPassword }),
  });
  const text = await res.text();
  if (!res.ok) return { ok: false, error: `Bluesky auth ${res.status}: ${text.slice(0, 200)}` };
  try {
    const json = JSON.parse(text);
    if (!json.accessJwt || !json.did) return { ok: false, error: 'Bluesky: risposta auth incompleta' };
    return { ok: true, accessJwt: json.accessJwt, did: json.did };
  } catch {
    return { ok: false, error: 'Bluesky: risposta auth non valida' };
  }
}

export const blueskyPublisher: Publisher = {
  async publish(variant, config): Promise<PublishResult> {
    const session = await createSession(config);
    if (!session.ok) return { ok: false, error: session.error };

    const text = buildText(variant);
    const record = {
      $type: 'app.bsky.feed.post',
      text,
      facets: buildFacets(text, (variant.link || '').trim()),
      createdAt: new Date().toISOString(),
      langs: ['it'],
    };
    const res = await fetch(`${service(config)}/xrpc/com.atproto.repo.createRecord`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.accessJwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        repo: session.did,
        collection: 'app.bsky.feed.post',
        record,
      }),
    });
    const body = await res.text();
    if (!res.ok) return { ok: false, error: `Bluesky ${res.status}: ${body.slice(0, 300)}` };
    try {
      const json = JSON.parse(body);
      const rkey = String(json.uri || '').split('/').pop() || '';
      const url = rkey
        ? `https://bsky.app/profile/${config.identifier}/post/${rkey}`
        : '';
      return { ok: true, publishedUrl: url };
    } catch {
      return { ok: true, publishedUrl: '' };
    }
  },

  async test(config): Promise<PublishResult> {
    const session = await createSession(config);
    if (!session.ok) return { ok: false, error: session.error };
    return { ok: true };
  },
};

// Connettore GitHub REST API: pubblica la variante come file markdown nel repo
// configurato (es. blog/knowledge base). Nessun browser: solo HTTPS + token.
// Docs: https://docs.github.com/rest/repos/contents

import type { Publisher, PublishResult, VariantRow } from '../types';

const API_BASE = 'https://api.github.com';

function headers(config: Record<string, string>): Record<string, string> {
  return {
    Authorization: `Bearer ${config.token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'User-Agent': 'seo-ai-distribution',
  };
}

function fileSlug(title: string): string {
  return title
    .normalize('NFD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'post';
}

function buildMarkdown(variant: VariantRow): string {
  const parts = [`# ${variant.title}`, variant.body.trim()];
  if (variant.cta) parts.push(variant.cta.trim());
  if (variant.link && variant.anchorText) {
    parts.push(`[${variant.anchorText}](${variant.link})`);
  }
  return parts.filter(Boolean).join('\n\n') + '\n';
}

export const githubPublisher: Publisher = {
  async publish(variant, config): Promise<PublishResult> {
    if (!config.token || !config.owner || !config.repo) {
      return { ok: false, error: 'token, owner e repo sono obbligatori' };
    }
    const dir = (config.dir || 'content').replace(/^\/+|\/+$/g, '');
    const path = `${dir}/${fileSlug(variant.title)}-${variant.id.slice(-4)}.md`;
    const body: Record<string, unknown> = {
      message: `content: ${variant.title}`,
      content: Buffer.from(buildMarkdown(variant), 'utf8').toString('base64'),
    };
    if (config.branch) body.branch = config.branch;

    const res = await fetch(
      `${API_BASE}/repos/${config.owner}/${config.repo}/contents/${path}`,
      { method: 'PUT', headers: headers(config), body: JSON.stringify(body) }
    );
    const text = await res.text();
    if (!res.ok) return { ok: false, error: `GitHub ${res.status}: ${text.slice(0, 300)}` };
    try {
      const json = JSON.parse(text);
      return { ok: true, publishedUrl: json.content?.html_url || '' };
    } catch {
      return { ok: true, publishedUrl: '' };
    }
  },

  async test(config): Promise<PublishResult> {
    if (!config.token || !config.owner || !config.repo) {
      return { ok: false, error: 'token, owner e repo sono obbligatori' };
    }
    const res = await fetch(`${API_BASE}/repos/${config.owner}/${config.repo}`, {
      headers: headers(config),
    });
    if (!res.ok) return { ok: false, error: `GitHub ${res.status}: repo non raggiungibile con questo token` };
    return { ok: true };
  },
};

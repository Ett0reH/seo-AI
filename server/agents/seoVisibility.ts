import { Type } from '@google/genai';
import { db } from '../db';
import { generateGrounded, generateJson, normalizeDomain } from './geminiClient';
import { getIntegration } from '../lib/integrations';
import { inspectUrl } from '../lib/gsc';
import type { Publisher, PublishResult, VariantRow, VisibilityConfig } from '../types';

// SEO/LLM Visibility Agent (MVP-3, attivo).
//
// Misura la visibilità dei contenuti distribuiti usando SOLO API ufficiali:
// - presenza SERP e menzioni brand: Gemini + Google Search grounding
//   (il tool googleSearch non è combinabile con responseSchema → i segnali
//   si estraggono in modo deterministico da testo + groundingMetadata);
// - visibilità LLM "a memoria": chiamata non-grounded che chiede al modello
//   cosa sa del brand SENZA cercare (stima delle citazioni negli LLM);
// - entity matching: intersezione tra le entità del master e quelle che
//   l'LLM associa al brand;
// - indicizzazione: Google Search Console URL Inspection (solo property
//   propria: il sito del master, non gli URL su piattaforme terze).
//
// Vincolo invariato: nessuna automazione browser, nessuno scraping.

export interface VisibilitySignals {
  serpPresence: boolean;
  brandMentions: number;
  llmCited: boolean | null;   // solo master
  indexedGsc: boolean | null; // solo master con GSC configurata
  entityMatches: { matched: string[]; missing: string[] };
  topSources: { domain: string; title: string; matched: 'publication' | 'site' | null }[];
  queries: string[];
  answerText: string;
  score: number; // 0-100
  notes: string;
}

// Input master già parsato (keywords/entities come array, non JSON string).
export interface MasterForVisibility {
  id: string;
  title: string;
  theme: string;
  keywords: string[];
  entities: { name: string; type: string }[];
  sourceUrl: string;
  siteUrl: string;
}

// Config della pseudo-integrazione 'visibility' con default applicati.
export function getVisibilityConfig(): { enabled: boolean; cfg: VisibilityConfig } {
  const row = getIntegration('visibility');
  const raw = (row?.config || {}) as Record<string, string>;
  return {
    enabled: Boolean(row?.enabled),
    cfg: {
      brand: raw.brand || '',
      siteDomain: raw.siteDomain || '',
      profileUrl: raw.profileUrl || '',
      intervalHours: raw.intervalHours || '24',
      autoOptimize: raw.autoOptimize || 'false',
      maxDailyChecks: raw.maxDailyChecks || '40',
    },
  };
}

export function visibilityIntervalHours(cfg: VisibilityConfig): number {
  return Math.max(1, Number(cfg.intervalHours) || 24);
}

export function visibilityDailyCap(cfg: VisibilityConfig): number {
  return Math.max(1, Number(cfg.maxDailyChecks) || 40);
}

// Conta le menzioni del brand nel testo (word boundary, case-insensitive).
function countBrandMentions(text: string, brand: string): number {
  const b = (brand || '').trim();
  if (!b) return 0;
  const escaped = b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = text.match(new RegExp(`(^|\\W)${escaped}(\\W|$)`, 'gi'));
  return matches ? matches.length : 0;
}

// Un dominio fonte corrisponde a un dominio target? (sottodomini inclusi)
function domainMatches(source: string, target: string): boolean {
  if (!source || !target) return false;
  return source === target || source.endsWith('.' + target) || target.endsWith('.' + source);
}

function emptyEntityMatches(): { matched: string[]; missing: string[] } {
  return { matched: [], missing: [] };
}

// Segnali "vuoti" per i check falliti (persistiti con status='failed').
export function emptySignals(notes: string): VisibilitySignals {
  return {
    serpPresence: false,
    brandMentions: 0,
    llmCited: null,
    indexedGsc: null,
    entityMatches: emptyEntityMatches(),
    topSources: [],
    queries: [],
    answerText: '',
    score: 0,
    notes,
  };
}

// ── Check di una PUBBLICAZIONE (1 chiamata grounded, zero extra) ──
// serpPresence = il dominio della pubblicazione compare tra le fonti grounded
// (o l'URL esatto compare nella risposta); il punteggio premia anche la
// presenza del sito principale tra le fonti.
export async function checkPublication(
  pub: { id: string; publishedUrl: string; platform: string },
  variant: { title: string; angle: string },
  cfg: VisibilityConfig
): Promise<VisibilitySignals> {
  const pubDomain = normalizeDomain(pub.publishedUrl);
  const siteDomain = normalizeDomain(cfg.siteDomain);

  const prompt = `Cerca su Google: "${variant.title}" ${cfg.brand}.
Riporta in massimo 200 parole: quali fonti ne parlano, se il contenuto risulta presente su ${pubDomain || 'piattaforme note'} e se "${cfg.brand}" viene menzionato nei risultati.`;

  const g = await generateGrounded(prompt);

  const topSources = g.sources.slice(0, 8).map((s) => {
    let matched: 'publication' | 'site' | null = null;
    if (domainMatches(s.domain, pubDomain)) matched = 'publication';
    else if (domainMatches(s.domain, siteDomain)) matched = 'site';
    return { domain: s.domain, title: s.title, matched };
  });

  const serpPresence =
    topSources.some((s) => s.matched === 'publication') ||
    (Boolean(pub.publishedUrl) && g.text.includes(pub.publishedUrl));
  const brandMentions = countBrandMentions(g.text, cfg.brand);
  const siteAmongSources = topSources.some((s) => s.matched === 'site');

  // Score pubblicazione: SERP 55 + menzioni ≤25 + sito tra le fonti 20.
  const score = (serpPresence ? 55 : 0) + Math.min(brandMentions, 5) * 5 + (siteAmongSources ? 20 : 0);

  return {
    serpPresence,
    brandMentions,
    llmCited: null,
    indexedGsc: null,
    entityMatches: emptyEntityMatches(),
    topSources,
    queries: g.queries,
    answerText: g.text.slice(0, 4000),
    score,
    notes: g.sources.length === 0 ? 'Il modello non ha eseguito ricerche web per questa verifica.' : '',
  };
}

// ── Check di un MASTER (1 grounded + 1 probe non-grounded + GSC opzionale) ──
export async function checkMaster(master: MasterForVisibility, cfg: VisibilityConfig): Promise<VisibilitySignals> {
  const siteDomain = normalizeDomain(cfg.siteDomain);
  const noteParts: string[] = [];

  // (a) SERP: il sito/brand compare cercando il tema del master?
  const kw = master.keywords.slice(0, 3).join(', ');
  const groundedPrompt = `Cerca su Google informazioni su: ${master.theme}${kw ? ` (${kw})` : ''}.
Riporta in massimo 200 parole quali fonti risultano più autorevoli sull'argomento e se "${cfg.brand}" o il sito ${cfg.siteDomain} compaiono tra i risultati.`;
  const g = await generateGrounded(groundedPrompt);

  const topSources = g.sources.slice(0, 8).map((s) => ({
    domain: s.domain,
    title: s.title,
    matched: domainMatches(s.domain, siteDomain) ? ('site' as const) : null,
  }));
  const profileInText = Boolean(cfg.profileUrl && g.text.includes(cfg.profileUrl));
  const serpPresence = topSources.some((s) => s.matched === 'site') || profileInText;
  const brandMentions = countBrandMentions(g.text, cfg.brand);
  if (g.sources.length === 0) noteParts.push('Il modello non ha eseguito ricerche web per questa verifica.');

  // (b) Visibilità LLM "a memoria": il modello conosce il brand SENZA cercare?
  const probeSchema = {
    type: Type.OBJECT,
    properties: {
      llmCited: { type: Type.BOOLEAN },
      knownEntities: { type: Type.ARRAY, items: { type: Type.STRING } },
      association: { type: Type.STRING },
    },
    required: ['llmCited', 'knownEntities', 'association'],
  };
  const probePrompt = `Basandoti SOLO sulla tua conoscenza interna, NON cercare sul web. Rispondi in JSON.
Conosci il brand/sito "${cfg.brand}" (${cfg.siteDomain}) in relazione al tema "${master.theme}"?
- llmCited: true solo se conosci davvero questo brand/sito e lo citeresti parlando del tema
- knownEntities: entità, argomenti o prodotti che associ a questo brand (array vuoto se non lo conosci)
- association: una frase su cosa sai del brand (oppure "sconosciuto")`;

  let llmCited: boolean | null = null;
  let entityMatches = emptyEntityMatches();
  try {
    const probe = await generateJson<{ llmCited: boolean; knownEntities: string[]; association: string }>(
      probePrompt,
      probeSchema
    );
    llmCited = Boolean(probe.llmCited);
    const known = (probe.knownEntities || []).map((e) => e.trim().toLowerCase()).filter(Boolean);
    const matched: string[] = [];
    const missing: string[] = [];
    for (const ent of master.entities) {
      const name = ent.name.trim();
      const nameLc = name.toLowerCase();
      const hit = known.some((k) => k.includes(nameLc) || nameLc.includes(k));
      (hit ? matched : missing).push(name);
    }
    entityMatches = { matched, missing };
  } catch (e) {
    noteParts.push(`Probe LLM fallito: ${String(e)}`);
  }

  // (c) Indicizzazione GSC (solo se configurata e URL dentro la property).
  let indexedGsc: boolean | null = null;
  const gsc = getIntegration('search_console');
  const inspectTarget = master.sourceUrl || master.siteUrl;
  if (gsc?.enabled && inspectTarget) {
    try {
      const result = await inspectUrl(gsc.config, inspectTarget);
      if (result) {
        indexedGsc = result.indexed;
        if (result.coverageState) noteParts.push(`GSC: ${result.coverageState}.`);
      } else {
        noteParts.push('GSC: URL del master fuori dalla property configurata.');
      }
    } catch (e) {
      noteParts.push(`GSC non disponibile: ${String(e)}`);
    }
  }

  // Score master: SERP 30 + menzioni ≤20 + citazione LLM 30 + entity match ≤20.
  // indexedGsc resta un badge separato: non entra nello score per mantenere
  // i punteggi comparabili anche senza GSC configurata.
  const totalEntities = entityMatches.matched.length + entityMatches.missing.length;
  const entityScore = totalEntities > 0 ? Math.round((20 * entityMatches.matched.length) / totalEntities) : 0;
  const score = (serpPresence ? 30 : 0) + Math.min(brandMentions, 5) * 4 + (llmCited ? 30 : 0) + entityScore;

  return {
    serpPresence,
    brandMentions,
    llmCited,
    indexedGsc,
    entityMatches,
    topSources,
    queries: g.queries,
    answerText: g.text.slice(0, 4000),
    score,
    notes: noteParts.join(' '),
  };
}

// Persiste un check e ne restituisce l'id.
export function saveCheck(
  scope: 'publication' | 'master',
  refId: string,
  platform: string,
  url: string,
  s: VisibilitySignals,
  status: 'ok' | 'failed'
): string {
  const id = 'vis-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  db.prepare(
    `INSERT INTO visibility_checks
       (id, scope, refId, platform, url, serpPresence, brandMentions, llmCited, indexedGsc,
        entityMatches, topSources, queries, answerText, score, status, notes, checkedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    scope,
    refId,
    platform,
    url,
    s.serpPresence ? 1 : 0,
    s.brandMentions,
    s.llmCited === null ? null : s.llmCited ? 1 : 0,
    s.indexedGsc === null ? null : s.indexedGsc ? 1 : 0,
    JSON.stringify(s.entityMatches),
    JSON.stringify(s.topSources),
    JSON.stringify(s.queries),
    s.answerText,
    s.score,
    status,
    s.notes,
    new Date().toISOString()
  );
  return id;
}

// ── Insights per il feedback loop (solo SQL, zero chiamate LLM) ──
// Confronta la variante da migliorare con l'angolo più performante del master
// (click dal Tracking + score di visibilità più recente per pubblicazione).
export function buildOptimizationInsights(masterId: string, targetVariantId: string): string {
  const rows = db
    .prepare(
      `SELECT v.id, v.platform, v.angle,
              COALESCE((SELECT SUM(p.clicks) FROM publications p WHERE p.variantId = v.id), 0) AS clicks,
              (SELECT c.score FROM visibility_checks c
                JOIN publications p2 ON p2.id = c.refId
                WHERE c.scope = 'publication' AND p2.variantId = v.id
                ORDER BY c.checkedAt DESC LIMIT 1) AS score
       FROM platform_variants v
       WHERE v.masterId = ? AND v.status = 'published'`
    )
    .all(masterId) as Array<{ id: string; platform: string; angle: string; clicks: number; score: number | null }>;

  const target = rows.find((r) => r.id === targetVariantId);
  const best = rows
    .filter((r) => r.id !== targetVariantId)
    .sort((a, b) => b.clicks - a.clicks || (b.score || 0) - (a.score || 0))[0];

  const lines: string[] = [];
  if (best) {
    lines.push(
      `- L'angolo più performante di questa campagna è "${best.angle}" (${best.platform}): ${best.clicks} click, score visibilità ${best.score ?? 'n/d'}.`
    );
    lines.push('- Riprendi il taglio e il tipo di aggancio di quell\'angolo, adattandolo alla piattaforma di destinazione.');
  }
  if (target) {
    lines.push(
      `- La variante da migliorare ("${target.angle}", ${target.platform}) ha ${target.clicks} click e score visibilità ${target.score ?? 'n/d'}: cambia hook e struttura, non ripetere lo stesso testo.`
    );
  }
  if (lines.length === 0) {
    lines.push('- Nessun dato di performance disponibile: punta su un hook più concreto e su un beneficio esplicito nelle prime righe.');
  }
  return lines.join('\n');
}

// ── Connettore pseudo-integrazione 'visibility' (solo config + test) ──
export const geminiVisibilityConnector: Publisher = {
  async publish(_variant: VariantRow, _config: Record<string, string>): Promise<PublishResult> {
    return { ok: false, error: 'Connettore di sola configurazione (Visibilità): non pubblica contenuti.' };
  },

  // Test: config minima presente + una chiamata grounded economica.
  async test(config: Record<string, string>): Promise<PublishResult> {
    if (!config.brand || !config.siteDomain) {
      return { ok: false, error: 'brand e siteDomain sono obbligatori per la Visibilità.' };
    }
    const g = await generateGrounded(`Cerca su Google: "${config.brand}". Rispondi in una frase: di cosa si occupa?`);
    if (!g.text) return { ok: false, error: 'Nessuna risposta dal modello.' };
    return { ok: true };
  },
};

// Worker di visibilità SEO/LLM (MVP-3).
//
// Ogni 10 minuti esegue AL MASSIMO UN check di visibilità (controllo costi:
// ogni check è 1-2 chiamate Gemini), solo se la pseudo-integrazione
// 'visibility' è abilitata e sotto il cap giornaliero. Prima le pubblicazioni
// con URL reale, poi i master con almeno una pubblicazione. I check falliti
// vengono persistiti con status='failed' e ritentati solo al prossimo
// intervallo: nessun retry storm.
//
// Feedback loop (opzionale, cfg.autoOptimize='true'): dopo un check master
// riuscito rigenera al massimo UNA variante ottimizzata per la peggior
// variante pubblicata (score < 40), come bozza. Il gate di approvazione umana
// è preservato strutturalmente: la nuova variante nasce draft/pending_approval
// e il publishWorker pesca solo lo stato 'scheduled'.

import { db } from '../db';
import { adaptToPlatform } from '../agents/platformAdapter';
import { assessVariants, type VariantForRisk } from '../agents/complianceRisk';
import { initialStatus } from '../agents/publishingRouter';
import { buildUtm, slugify } from '../lib/utm';
import { pickAnchor } from '../lib/anchors';
import { logAction } from '../lib/audit';
import {
  buildOptimizationInsights,
  checkMaster,
  checkPublication,
  emptySignals,
  getVisibilityConfig,
  saveCheck,
  visibilityDailyCap,
  visibilityIntervalHours,
  type MasterForVisibility,
} from '../agents/seoVisibility';
import type { MasterContext, PlatformConfig, VariantRow } from '../types';

const TICK_MS = 600_000; // 10 minuti
const MAX_AUTO_OPTIMIZE_PER_MASTER = 3;
const LOW_SCORE_THRESHOLD = 40;

function safeParseArray<T>(json: string | null | undefined): T[] {
  try {
    const v = JSON.parse(json || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function loadMasterForVisibility(masterId: string): MasterForVisibility | null {
  const row = db.prepare('SELECT * FROM master_contents WHERE id = ?').get(masterId) as any;
  if (!row) return null;
  return {
    id: row.id,
    title: row.title || '',
    theme: row.theme || '',
    keywords: safeParseArray<string>(row.keywords),
    entities: safeParseArray<{ name: string; type: string }>(row.entities),
    sourceUrl: row.sourceUrl || '',
    siteUrl: row.siteUrl || '',
  };
}

// Esegue e persiste un check (usato dal worker e dall'endpoint manuale).
export async function runVisibilityCheck(
  scope: 'publication' | 'master',
  refId: string,
  actor: string
): Promise<{ ok: boolean; checkId?: string; error?: string }> {
  const { enabled, cfg } = getVisibilityConfig();
  if (!enabled) return { ok: false, error: 'Integrazione Visibilità non abilitata: attivala in Integrazioni.' };

  if (scope === 'publication') {
    const pub = db.prepare('SELECT * FROM publications WHERE id = ?').get(refId) as any;
    if (!pub) return { ok: false, error: 'Pubblicazione non trovata.' };
    if (!pub.publishedUrl) {
      return { ok: false, error: 'Pubblicazione senza URL: registralo dal Tracking per abilitare la verifica.' };
    }
    const variant = (db
      .prepare('SELECT title, angle FROM platform_variants WHERE id = ?')
      .get(pub.variantId) as { title: string; angle: string } | undefined) || { title: '', angle: '' };
    try {
      const signals = await checkPublication(
        { id: pub.id, publishedUrl: pub.publishedUrl, platform: pub.platform },
        variant,
        cfg
      );
      const checkId = saveCheck('publication', pub.id, pub.platform, pub.publishedUrl, signals, 'ok');
      logAction('publication', pub.id, 'visibility_check', actor, { checkId, score: signals.score });
      return { ok: true, checkId };
    } catch (e) {
      const checkId = saveCheck('publication', pub.id, pub.platform, pub.publishedUrl, emptySignals(String(e)), 'failed');
      logAction('publication', pub.id, 'visibility_check_failed', actor, { checkId, error: String(e) });
      return { ok: false, checkId, error: String(e) };
    }
  }

  // scope === 'master'
  const master = loadMasterForVisibility(refId);
  if (!master) return { ok: false, error: 'Master non trovato.' };
  if (!master.theme) return { ok: false, error: 'Master non ancora analizzato: attendi la pipeline.' };
  try {
    const signals = await checkMaster(master, cfg);
    const checkId = saveCheck('master', master.id, '', master.sourceUrl || master.siteUrl, signals, 'ok');
    logAction('master', master.id, 'visibility_check', actor, { checkId, score: signals.score });
    return { ok: true, checkId };
  } catch (e) {
    const checkId = saveCheck('master', master.id, '', master.sourceUrl || master.siteUrl, emptySignals(String(e)), 'failed');
    logAction('master', master.id, 'visibility_check_failed', actor, { checkId, error: String(e) });
    return { ok: false, checkId, error: String(e) };
  }
}

// ── Feedback loop: rigenera una variante ottimizzata (bozza, mai pubblicata) ──
export async function reoptimizeVariant(
  variantId: string,
  actor: string
): Promise<{ ok: boolean; newVariantId?: string; error?: string }> {
  const variant = db.prepare('SELECT * FROM platform_variants WHERE id = ?').get(variantId) as VariantRow | undefined;
  if (!variant) return { ok: false, error: 'Variante non trovata.' };
  if (variant.status !== 'published') {
    return { ok: false, error: 'Solo varianti pubblicate possono essere rigenerate dal feedback loop.' };
  }
  const already = db
    .prepare('SELECT id FROM platform_variants WHERE optimizedFromId = ?')
    .get(variantId) as { id: string } | undefined;
  if (already) {
    return { ok: false, error: `Variante già ottimizzata (nuova variante: ${already.id}).` };
  }

  const masterRow = db.prepare('SELECT * FROM master_contents WHERE id = ?').get(variant.masterId) as any;
  if (!masterRow) return { ok: false, error: 'Master della variante non trovato.' };
  const platform = db.prepare('SELECT * FROM platforms WHERE id = ?').get(variant.platform) as PlatformConfig | undefined;
  if (!platform) return { ok: false, error: 'Piattaforma della variante non trovata.' };

  // Ricostruisce il contesto master dalle colonne persistite dalla pipeline.
  const keywords = safeParseArray<string>(masterRow.keywords);
  const entities = safeParseArray<{ name: string; type: string }>(masterRow.entities);
  const master: MasterContext = {
    id: masterRow.id,
    title: masterRow.title || '',
    linkTarget: masterRow.linkTarget || '',
    siteUrl: masterRow.siteUrl || '',
    analysis: {
      theme: masterRow.theme || '',
      intent: masterRow.intent || '',
      keywords,
      entities,
      audience: masterRow.audience || '',
      cta: masterRow.cta || '',
      format: masterRow.format || '',
    },
  };

  const insights = buildOptimizationInsights(variant.masterId, variantId);
  const adapted = await adaptToPlatform(
    master,
    platform,
    { platform: platform.id, angle: variant.angle, keyPoints: [] },
    insights
  );

  const newId = `var-${Date.now()}-opt-${Math.random().toString(36).slice(2, 6)}`;

  // Anchor variata: l'indice prosegue dal numero di varianti già esistenti del master.
  const variantCount = (db
    .prepare('SELECT COUNT(*) c FROM platform_variants WHERE masterId = ?')
    .get(variant.masterId) as { c: number }).c;
  const anchorText = pickAnchor(variantCount, master.analysis.theme, entities[0]?.name);

  // UTM nuovi (utm_content = nuovo id), stessa base link dell'originale.
  const baseUrl = stripUtmParams(safeUtmUrl(variant.utm)) || master.siteUrl || master.linkTarget;
  const utm = buildUtm({
    baseUrl,
    platformId: platform.id,
    campaignSlug: slugify(master.title || master.analysis.theme),
    variantId: newId,
    term: keywords[0],
  });
  const link = platform.linkPolicy === 'none' ? '' : utm.url;

  // Compliance: valuta la nuova variante INSIEME all'originale (aliasato per
  // evitare la collisione di chiave piattaforma) → rileva similarità vs originale.
  const forRisk: VariantForRisk[] = [
    {
      platform: platform.id + '#orig',
      body: variant.body,
      anchorText: variant.anchorText,
      link: variant.link,
      linkPolicy: platform.linkPolicy,
    },
    {
      platform: platform.id,
      body: adapted.body,
      anchorText: platform.linkPolicy === 'none' ? '' : anchorText,
      link,
      linkPolicy: platform.linkPolicy,
    },
  ];
  const risk = assessVariants(forRisk).get(platform.id) ?? { riskScore: 0, riskFlags: [] };
  const status = initialStatus(variant.publishMethod, risk.riskScore);

  db.prepare(
    `INSERT INTO platform_variants
       (id, masterId, platform, angle, title, body, mediaSuggestion, link, anchorText, utm, hashtags,
        category, tags, cta, opNotes, publishMethod, riskScore, riskFlags, status, scheduledAt, createdAt, optimizedFromId)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    newId,
    variant.masterId,
    platform.id,
    variant.angle,
    adapted.title,
    adapted.body,
    adapted.mediaSuggestion,
    link,
    platform.linkPolicy === 'none' ? '' : anchorText,
    JSON.stringify(utm),
    JSON.stringify(adapted.hashtags),
    adapted.category,
    JSON.stringify(adapted.tags),
    adapted.cta,
    `Variante rigenerata dal feedback loop di visibilità (origine: ${variantId}). Richiede revisione e approvazione.`,
    variant.publishMethod,
    risk.riskScore,
    JSON.stringify(risk.riskFlags),
    status,
    null,
    new Date().toISOString(),
    variantId
  );

  logAction('variant', variantId, 'variant_reoptimized', actor, {
    newVariantId: newId,
    riskScore: risk.riskScore,
    status,
  });
  return { ok: true, newVariantId: newId };
}

// Rimuove i parametri utm_* per recuperare la base link dell'originale.
function stripUtmParams(url: string): string {
  if (!url) return '';
  try {
    const u = new URL(url);
    for (const p of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
      u.searchParams.delete(p);
    }
    return u.toString();
  } catch {
    return url;
  }
}

function safeUtmUrl(utmJson: string): string {
  try {
    const utm = JSON.parse(utmJson || '{}');
    return typeof utm.url === 'string' ? utm.url : '';
  } catch {
    return '';
  }
}

// Auto-optimize (solo se cfg.autoOptimize='true'): al massimo UNA bozza per
// tick, cap per master, mai la stessa variante due volte (guard lineage).
async function maybeAutoOptimize(masterId: string, cfgAutoOptimize: string | undefined): Promise<void> {
  if (cfgAutoOptimize !== 'true') return;

  const optimizedCount = (db
    .prepare('SELECT COUNT(*) c FROM platform_variants WHERE masterId = ? AND optimizedFromId IS NOT NULL')
    .get(masterId) as { c: number }).c;
  if (optimizedCount >= MAX_AUTO_OPTIMIZE_PER_MASTER) return;

  const rows = db
    .prepare(
      `SELECT v.id, v.platform,
              COALESCE((SELECT SUM(p.clicks) FROM publications p WHERE p.variantId = v.id), 0) AS clicks,
              (SELECT c.score FROM visibility_checks c
                JOIN publications p2 ON p2.id = c.refId
                WHERE c.scope = 'publication' AND p2.variantId = v.id
                ORDER BY c.checkedAt DESC LIMIT 1) AS score
       FROM platform_variants v
       WHERE v.masterId = ? AND v.status = 'published'
         AND NOT EXISTS (SELECT 1 FROM platform_variants o WHERE o.optimizedFromId = v.id)`
    )
    .all(masterId) as Array<{ id: string; platform: string; clicks: number; score: number | null }>;

  // Serve un confronto: senza almeno 2 varianti pubblicate non c'è "angolo migliore".
  if (rows.length < 2) return;
  const candidates = rows.filter((r) => r.score !== null && r.score < LOW_SCORE_THRESHOLD);
  if (candidates.length === 0) return;
  candidates.sort((a, b) => (a.score! - b.score!) || (a.clicks - b.clicks));
  const worst = candidates[0];

  console.log(`[VisibilityWorker] Auto-optimize: rigenero variante ${worst.id} (score ${worst.score})`);
  const outcome = await reoptimizeVariant(worst.id, 'system');
  if (!outcome.ok) {
    console.warn(`[VisibilityWorker] Auto-optimize fallito per ${worst.id}: ${outcome.error}`);
  }
}

async function tick(): Promise<void> {
  const { enabled, cfg } = getVisibilityConfig();
  if (!enabled) return;

  // Cap giornaliero (da mezzanotte UTC).
  const midnight = new Date();
  midnight.setUTCHours(0, 0, 0, 0);
  const checksToday = (db
    .prepare('SELECT COUNT(*) c FROM visibility_checks WHERE checkedAt >= ?')
    .get(midnight.toISOString()) as { c: number }).c;
  if (checksToday >= visibilityDailyCap(cfg)) return;

  const cutoff = new Date(Date.now() - visibilityIntervalHours(cfg) * 3_600_000).toISOString();

  // 1) Una pubblicazione con URL reale senza check recente.
  const pub = db
    .prepare(
      `SELECT p.id FROM publications p
       WHERE p.publishedUrl != ''
         AND NOT EXISTS (SELECT 1 FROM visibility_checks c
                         WHERE c.scope = 'publication' AND c.refId = p.id AND c.checkedAt > ?)
       ORDER BY p.publishedAt ASC LIMIT 1`
    )
    .get(cutoff) as { id: string } | undefined;
  if (pub) {
    console.log(`[VisibilityWorker] Verifico pubblicazione ${pub.id}`);
    await runVisibilityCheck('publication', pub.id, 'system');
    return; // max 1 check per tick
  }

  // 2) Un master pronto con almeno una pubblicazione e senza check recente.
  const master = db
    .prepare(
      `SELECT m.id FROM master_contents m
       WHERE m.status = 'ready'
         AND EXISTS (SELECT 1 FROM publications p JOIN platform_variants v ON v.id = p.variantId
                     WHERE v.masterId = m.id)
         AND NOT EXISTS (SELECT 1 FROM visibility_checks c
                         WHERE c.scope = 'master' AND c.refId = m.id AND c.checkedAt > ?)
       ORDER BY m.createdAt ASC LIMIT 1`
    )
    .get(cutoff) as { id: string } | undefined;
  if (master) {
    console.log(`[VisibilityWorker] Verifico master ${master.id}`);
    const outcome = await runVisibilityCheck('master', master.id, 'system');
    if (outcome.ok) {
      await maybeAutoOptimize(master.id, cfg.autoOptimize);
    }
  }
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startVisibilityWorker(): void {
  if (timer) return;
  timer = setInterval(() => {
    tick().catch((e) => console.error('[VisibilityWorker] Errore tick:', e));
  }, TICK_MS);
  console.log('[VisibilityWorker] Attivo: max 1 check di visibilità ogni 10 minuti, solo API ufficiali.');
}

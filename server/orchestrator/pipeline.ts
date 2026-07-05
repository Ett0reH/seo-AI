import { db } from '../db';
import { analyzeMaster } from '../agents/contentMaster';
import { splitIntoAngles } from '../agents/semanticSplitter';
import { adaptToPlatform } from '../agents/platformAdapter';
import { assessVariants, type VariantForRisk } from '../agents/complianceRisk';
import { resolvePublishMethod, initialStatus } from '../agents/publishingRouter';
import { buildDraftPackage, type DraftVariant } from '../agents/draftPackage';
import { proposeSlots } from '../agents/scheduler';
import { buildUtm, slugify } from '../lib/utm';
import { pickAnchor } from '../lib/anchors';
import { logAction } from '../lib/audit';
import type { MasterAnalysis, MasterContext, PlatformConfig } from '../types';

function loadPlatforms(): PlatformConfig[] {
  return db.prepare('SELECT * FROM platforms WHERE enabled = 1').all() as PlatformConfig[];
}

// Sceglie il target del link per diversificarli (evita link wheel: alcune varianti
// puntano al sito, altre al profilo LinkedIn target).
function linkBaseFor(index: number, siteUrl: string, linkTarget: string): string {
  const targets = [siteUrl, linkTarget].filter(Boolean);
  if (targets.length === 0) return siteUrl || linkTarget || '';
  return targets[index % targets.length];
}

// Esegue l'intera catena di agenti per un master e persiste le varianti come bozze.
export async function runDistributionPipeline(masterId: string): Promise<void> {
  const row = db.prepare('SELECT * FROM master_contents WHERE id = ?').get(masterId) as any;
  if (!row) throw new Error(`Master ${masterId} non trovato`);

  logAction('master', masterId, 'pipeline_started', 'system');

  // 1. Content Master: analisi.
  const analysis: MasterAnalysis = await analyzeMaster({
    title: row.title,
    rawContent: row.rawContent,
    sourceUrl: row.sourceUrl,
  });

  db.prepare(
    `UPDATE master_contents SET theme=?, intent=?, keywords=?, entities=?, audience=?, cta=?, format=?, status='ready' WHERE id=?`
  ).run(
    analysis.theme,
    analysis.intent,
    JSON.stringify(analysis.keywords),
    JSON.stringify(analysis.entities),
    analysis.audience,
    analysis.cta,
    analysis.format,
    masterId
  );

  const master: MasterContext = {
    id: masterId,
    title: row.title,
    linkTarget: row.linkTarget || '',
    siteUrl: row.siteUrl || '',
    analysis,
  };

  // 2. Semantic Splitter: un angolo distinto per piattaforma.
  const platforms = loadPlatforms();
  const angles = await splitIntoAngles(master, platforms);
  const angleByPlatform = new Map(angles.map((a) => [a.platform, a]));

  // 3. Platform Adapter: contenuto nativo per ogni piattaforma (in parallelo).
  const campaignSlug = slugify(master.title || analysis.theme);
  const primaryEntity = analysis.entities[0]?.name;
  const primaryKeyword = analysis.keywords[0];

  const adaptedList = await Promise.all(
    platforms.map((p) => adaptToPlatform(master, p, angleByPlatform.get(p.id)!))
  );

  // 4. Prepara id, anchor, UTM e link per ciascuna variante.
  const prepared = platforms.map((platform, i) => {
    const id = `var-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`;
    const anchorText = pickAnchor(i, analysis.theme, primaryEntity);
    const base = linkBaseFor(i, master.siteUrl, master.linkTarget);
    const utm = buildUtm({ baseUrl: base, platformId: platform.id, campaignSlug, variantId: id, term: primaryKeyword });
    return { id, platform, adapted: adaptedList[i], anchorText, utm };
  });

  // 5. Compliance & Risk: valutazione sull'intero set (similarità, anchor, over-linking).
  const forRisk: VariantForRisk[] = prepared.map((p) => ({
    platform: p.platform.id,
    body: p.adapted.body,
    anchorText: p.anchorText,
    link: p.platform.linkPolicy === 'none' ? '' : p.utm.url,
    linkPolicy: p.platform.linkPolicy,
  }));
  const risks = assessVariants(forRisk);

  // 6. Scheduler: slot naturali su 24-72h (proposta, nessuna pubblicazione automatica).
  const slots = proposeSlots(prepared.length);

  // 7. Publishing Router + Draft Package: metodo, stato iniziale, pacchetto finale.
  const drafts: DraftVariant[] = prepared.map((p, i) => {
    const method = resolvePublishMethod(p.platform);
    const risk = risks.get(p.platform.id) ?? { riskScore: 0, riskFlags: [] };
    const status = initialStatus(method, risk.riskScore);
    const angle = angleByPlatform.get(p.platform.id)!;
    return buildDraftPackage({
      id: p.id,
      master,
      platform: p.platform,
      angle,
      adapted: p.adapted,
      utm: p.utm,
      anchorText: p.anchorText,
      method,
      status,
      risk,
      scheduledAt: slots[i],
    });
  });

  // 8. Persistenza.
  const insert = db.prepare(`
    INSERT INTO platform_variants
      (id, masterId, platform, angle, title, body, mediaSuggestion, link, anchorText, utm, hashtags,
       category, tags, cta, opNotes, publishMethod, riskScore, riskFlags, status, scheduledAt, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertMany = db.transaction((rows: DraftVariant[]) => {
    for (const d of rows) {
      insert.run(
        d.id, d.masterId, d.platform, d.angle, d.title, d.body, d.mediaSuggestion, d.link, d.anchorText,
        JSON.stringify(d.utm), JSON.stringify(d.hashtags), d.category, JSON.stringify(d.tags), d.cta,
        d.opNotes, d.publishMethod, d.riskScore, JSON.stringify(d.riskFlags), d.status, d.scheduledAt, d.createdAt
      );
    }
  });
  insertMany(drafts);

  logAction('master', masterId, 'pipeline_completed', 'system', { variants: drafts.length });
}

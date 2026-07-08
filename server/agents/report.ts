import { db } from '../db';
import { getVisibilityConfig } from './seoVisibility';

// Report Agent
// Produce un report operativo: contenuti per stato, errori, piattaforme più
// efficaci, rischi e raccomandazioni con prossime azioni.
// MVP-3: sezione visibility con i segnali SEO/LLM e gli angoli più performanti.
export interface OperationalReport {
  generatedAt: string;
  totals: {
    masters: number;
    variants: number;
    publications: number;
  };
  byStatus: Record<string, number>;
  byPlatform: Array<{ platform: string; variants: number; published: number; clicks: number }>;
  highRisk: Array<{ id: string; platform: string; riskScore: number; riskFlags: string[] }>;
  visibility?: {
    enabled: boolean;
    checkedPublications: number;
    serpPresent: number;
    avgScore: number;
    llmCitedMasters: number;
    topAngles: Array<{ angle: string; platform: string; clicks: number; score: number | null }>;
  };
  recommendations: string[];
}

export function buildReport(): OperationalReport {
  const totals = {
    masters: (db.prepare('SELECT COUNT(*) c FROM master_contents').get() as { c: number }).c,
    variants: (db.prepare('SELECT COUNT(*) c FROM platform_variants').get() as { c: number }).c,
    publications: (db.prepare('SELECT COUNT(*) c FROM publications').get() as { c: number }).c,
  };

  const statusRows = db
    .prepare('SELECT status, COUNT(*) c FROM platform_variants GROUP BY status')
    .all() as Array<{ status: string; c: number }>;
  const byStatus: Record<string, number> = {};
  for (const r of statusRows) byStatus[r.status] = r.c;

  const platformRows = db
    .prepare(
      `SELECT v.platform AS platform,
              COUNT(*) AS variants,
              SUM(CASE WHEN v.status = 'published' THEN 1 ELSE 0 END) AS published,
              COALESCE((SELECT SUM(clicks) FROM publications p WHERE p.platform = v.platform), 0) AS clicks
       FROM platform_variants v GROUP BY v.platform ORDER BY published DESC, variants DESC`
    )
    .all() as Array<{ platform: string; variants: number; published: number; clicks: number }>;

  const highRiskRows = db
    .prepare('SELECT id, platform, riskScore, riskFlags FROM platform_variants WHERE riskScore >= 40 ORDER BY riskScore DESC LIMIT 20')
    .all() as Array<{ id: string; platform: string; riskScore: number; riskFlags: string }>;
  const highRisk = highRiskRows.map((r) => ({
    id: r.id,
    platform: r.platform,
    riskScore: r.riskScore,
    riskFlags: safeParse(r.riskFlags),
  }));

  // ── Visibilità SEO/LLM (MVP-3): ultimo check per pubblicazione/master ──
  const { enabled: visibilityEnabled } = getVisibilityConfig();
  const latestPubChecks = db
    .prepare(
      `SELECT c.refId, c.serpPresence, c.score, c.status FROM visibility_checks c
       WHERE c.scope = 'publication'
         AND c.checkedAt = (SELECT MAX(c2.checkedAt) FROM visibility_checks c2
                            WHERE c2.scope = 'publication' AND c2.refId = c.refId)`
    )
    .all() as Array<{ refId: string; serpPresence: number | null; score: number; status: string }>;
  const okPubChecks = latestPubChecks.filter((c) => c.status === 'ok');
  const latestMasterChecks = db
    .prepare(
      `SELECT c.refId, c.llmCited FROM visibility_checks c
       WHERE c.scope = 'master' AND c.status = 'ok'
         AND c.checkedAt = (SELECT MAX(c2.checkedAt) FROM visibility_checks c2
                            WHERE c2.scope = 'master' AND c2.refId = c.refId)`
    )
    .all() as Array<{ refId: string; llmCited: number | null }>;

  // Angoli più performanti: click dal Tracking + score di visibilità più recente.
  const topAngles = db
    .prepare(
      `SELECT v.angle, v.platform,
              COALESCE((SELECT SUM(p.clicks) FROM publications p WHERE p.variantId = v.id), 0) AS clicks,
              (SELECT c.score FROM visibility_checks c
                JOIN publications p2 ON p2.id = c.refId
                WHERE c.scope = 'publication' AND c.status = 'ok' AND p2.variantId = v.id
                ORDER BY c.checkedAt DESC LIMIT 1) AS score
       FROM platform_variants v
       WHERE v.status = 'published'
       ORDER BY clicks DESC, score DESC LIMIT 5`
    )
    .all() as Array<{ angle: string; platform: string; clicks: number; score: number | null }>;

  const visibility = {
    enabled: visibilityEnabled,
    checkedPublications: okPubChecks.length,
    serpPresent: okPubChecks.filter((c) => c.serpPresence === 1).length,
    avgScore: okPubChecks.length
      ? Math.round(okPubChecks.reduce((sum, c) => sum + (c.score || 0), 0) / okPubChecks.length)
      : 0,
    llmCitedMasters: latestMasterChecks.filter((c) => c.llmCited === 1).length,
    topAngles,
  };

  const recommendations: string[] = [];
  if ((byStatus['pending_approval'] || 0) > 0)
    recommendations.push(`${byStatus['pending_approval']} varianti in attesa di approvazione umana: revisionale prima di programmare.`);
  if (highRisk.length > 0)
    recommendations.push(`${highRisk.length} varianti ad alto rischio: rivedi duplicazione/anchor/over-linking prima della pubblicazione.`);
  if ((byStatus['scheduled'] || 0) > 0)
    recommendations.push(`${byStatus['scheduled']} varianti programmate: verifica gli slot su 24-72h ed esporta i pacchetti.`);
  if (totals.publications === 0)
    recommendations.push('Nessuna pubblicazione tracciata: dopo aver pubblicato manualmente, registra URL e metriche nel Tracking.');
  if (!visibilityEnabled && totals.publications > 0)
    recommendations.push('Abilita l\'integrazione Visibilità (Integrazioni) per verificare SERP, menzioni brand e citazioni LLM delle pubblicazioni.');
  if (visibilityEnabled && okPubChecks.length > 0 && visibility.avgScore < 40)
    recommendations.push(`Score medio di visibilità basso (${visibility.avgScore}/100): valuta la rigenerazione ottimizzata delle varianti peggiori dalla pagina Visibilità.`);
  if (visibilityEnabled && topAngles.length > 0 && topAngles[0].clicks > 0)
    recommendations.push(`L'angolo "${topAngles[0].angle}" (${topAngles[0].platform}) è il più efficace: valuta di replicarne il taglio su altre piattaforme.`);
  if (recommendations.length === 0)
    recommendations.push('Nessuna azione urgente: crea un nuovo contenuto master per generare altre varianti.');

  return {
    generatedAt: new Date().toISOString(),
    totals,
    byStatus,
    byPlatform: platformRows,
    highRisk,
    visibility,
    recommendations,
  };
}

function safeParse(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

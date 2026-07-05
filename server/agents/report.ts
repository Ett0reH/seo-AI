import { db } from '../db';

// Report Agent
// Produce un report operativo: contenuti per stato, errori, piattaforme più
// efficaci, rischi e raccomandazioni con prossime azioni.
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

  const recommendations: string[] = [];
  if ((byStatus['pending_approval'] || 0) > 0)
    recommendations.push(`${byStatus['pending_approval']} varianti in attesa di approvazione umana: revisionale prima di programmare.`);
  if (highRisk.length > 0)
    recommendations.push(`${highRisk.length} varianti ad alto rischio: rivedi duplicazione/anchor/over-linking prima della pubblicazione.`);
  if ((byStatus['scheduled'] || 0) > 0)
    recommendations.push(`${byStatus['scheduled']} varianti programmate: verifica gli slot su 24-72h ed esporta i pacchetti.`);
  if (totals.publications === 0)
    recommendations.push('Nessuna pubblicazione tracciata: dopo aver pubblicato manualmente, registra URL e metriche nel Tracking.');
  if (recommendations.length === 0)
    recommendations.push('Nessuna azione urgente: crea un nuovo contenuto master per generare altre varianti.');

  return {
    generatedAt: new Date().toISOString(),
    totals,
    byStatus,
    byPlatform: platformRows,
    highRisk,
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

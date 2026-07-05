import type {
  AdaptedContent,
  MasterContext,
  PlatformConfig,
  PublishMethod,
  RiskAssessment,
  SemanticAngle,
  Utm,
  VariantStatus,
} from '../types';

// Pacchetto pubblicabile completo per una piattaforma (riga di platform_variants).
export interface DraftVariant {
  id: string;
  masterId: string;
  platform: string;
  angle: string;
  title: string;
  body: string;
  mediaSuggestion: string;
  link: string;
  anchorText: string;
  utm: Utm;
  hashtags: string[];
  category: string;
  tags: string[];
  cta: string;
  opNotes: string;
  publishMethod: PublishMethod;
  riskScore: number;
  riskFlags: string[];
  status: VariantStatus;
  scheduledAt: string | null;
  createdAt: string;
}

// Note operative auto-generate per il metodo di pubblicazione (guida l'operatore).
function operationalNotes(platform: PlatformConfig, method: PublishMethod): string {
  const base: Record<PublishMethod, string> = {
    api: `Pubblicazione via API ufficiale di ${platform.name}.`,
    scheduler: `Caricare su scheduler autorizzato (Buffer/Publer/Metricool) e programmare per ${platform.name}.`,
    semi_automatic: `Preparare la bozza e richiedere approvazione umana prima di pubblicare su ${platform.name}.`,
    manual_guided: `Pubblicazione MANUALE guidata su ${platform.name}: incollare il testo nativamente, senza forzare la community.`,
  };
  let note = base[method];
  if (platform.linkPolicy === 'first_comment') note += ' Inserire il link nel PRIMO COMMENTO, non nel corpo.';
  if (platform.linkPolicy === 'bio_only') note += ' Nessun link nel testo: rimandare al link in bio.';
  if (platform.linkPolicy === 'none') note += ' NESSUN link promozionale: contenuto puramente nativo/utile.';
  return note;
}

// Draft Package Agent: assembla il pacchetto finale pronto per approvazione/pubblicazione.
export function buildDraftPackage(params: {
  id: string;
  master: MasterContext;
  platform: PlatformConfig;
  angle: SemanticAngle;
  adapted: AdaptedContent;
  utm: Utm;
  anchorText: string;
  method: PublishMethod;
  status: VariantStatus;
  risk: RiskAssessment;
  scheduledAt: string | null;
}): DraftVariant {
  const { id, master, platform, angle, adapted, utm, anchorText, method, status, risk, scheduledAt } = params;
  // Il link finale è quello con UTM; per policy "none" (community) non si allega link.
  const link = platform.linkPolicy === 'none' ? '' : utm.url;
  return {
    id,
    masterId: master.id,
    platform: platform.id,
    angle: angle.angle,
    title: adapted.title,
    body: adapted.body,
    mediaSuggestion: adapted.mediaSuggestion,
    link,
    anchorText: platform.linkPolicy === 'none' ? '' : anchorText,
    utm,
    hashtags: adapted.hashtags,
    category: adapted.category,
    tags: adapted.tags,
    cta: adapted.cta,
    opNotes: operationalNotes(platform, method),
    publishMethod: method,
    riskScore: risk.riskScore,
    riskFlags: risk.riskFlags,
    status,
    scheduledAt,
    createdAt: new Date().toISOString(),
  };
}

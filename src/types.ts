export interface Site {
  id: string;
  name: string;
  url: string;
  status: 'connected' | 'syncing' | 'error';
  lastSync: string;
  pageCount: number;
}

export interface AnalyzedPage {
  id: string;
  siteId: string;
  title: string;
  url: string;
  status: 'draft' | 'auto-published' | 'manual-override';
  lastAnalyzed: string;
  topic: string;
  searchIntent: 'Informational' | 'Navigational' | 'Transactional' | 'Commercial';
  entityCount: number;
  schemaType: string;
  jsonLd: string;
}

export interface Entity {
  id: string;
  name: string;
  type: string;
  wikipediaUrl?: string;
  mentions: number;
}

// ── Multi-agent content distribution (MVP-1) ──────────────────

export type VariantStatus =
  | 'draft'
  | 'pending_approval'
  | 'scheduled'
  | 'published'
  | 'failed'
  | 'skipped'
  | 'archived';

export interface MasterContent {
  id: string;
  title: string;
  sourceUrl: string;
  rawContent: string;
  theme?: string;
  intent?: string;
  keywords?: string[];
  entities?: { name: string; type: string }[];
  audience?: string;
  cta?: string;
  linkTarget?: string;
  siteUrl?: string;
  format?: string;
  status: 'analyzing' | 'ready' | 'failed';
  createdAt: string;
}

export interface Utm {
  source: string;
  medium: string;
  campaign: string;
  content: string;
  term?: string;
  url: string;
}

export interface PlatformVariant {
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
  publishMethod: 'api' | 'scheduler' | 'semi_automatic' | 'manual_guided';
  riskScore: number;
  riskFlags: string[];
  status: VariantStatus;
  scheduledAt: string | null;
  createdAt: string;
  attempts?: number;
  lastError?: string | null;
}

// ── Integrazioni di pubblicazione (MVP-2) ─────────────────────

export interface Integration {
  platform: string;
  platformName: string;
  publishMethod: string;
  connector: 'devto' | 'wordpress' | 'github' | 'webhook' | 'gemini' | 'gsc';
  enabled: boolean;
  config: Record<string, string>;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
}

export interface OperationalReport {
  generatedAt: string;
  totals: { masters: number; variants: number; publications: number };
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

// ── Visibilità SEO/LLM (MVP-3) ────────────────────────────────

export interface VisibilityCheck {
  id: string;
  scope: 'publication' | 'master';
  refId: string;
  platform: string;
  url: string;
  serpPresence: number | null;
  brandMentions: number;
  llmCited: number | null;
  indexedGsc: number | null;
  entityMatches: { matched: string[]; missing: string[] };
  topSources: Array<{ domain: string; title: string; matched: 'publication' | 'site' | null }>;
  queries: string[];
  score: number;
  status: 'ok' | 'failed';
  notes: string;
  checkedAt: string;
}

export interface VisibilityOverview {
  enabled: boolean;
  config: {
    brand: string;
    siteDomain: string;
    profileUrl?: string;
    intervalHours?: string;
    autoOptimize?: string;
    maxDailyChecks?: string;
  };
  gscEnabled: boolean;
  kpis: {
    checkedPublications: number;
    serpPresent: number;
    avgScore: number;
    llmCitedMasters: number;
    checksToday: number;
  };
  publications: Array<{
    publicationId: string;
    variantId: string;
    platform: string;
    publishedUrl: string;
    clicks: number;
    title: string;
    angle: string;
    optimized: boolean;
    check: VisibilityCheck | null;
  }>;
  masters: Array<{
    id: string;
    title: string;
    theme: string;
    check: VisibilityCheck | null;
  }>;
}

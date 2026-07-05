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
}

export interface OperationalReport {
  generatedAt: string;
  totals: { masters: number; variants: number; publications: number };
  byStatus: Record<string, number>;
  byPlatform: Array<{ platform: string; variants: number; published: number; clicks: number }>;
  highRisk: Array<{ id: string; platform: string; riskScore: number; riskFlags: string[] }>;
  recommendations: string[];
}

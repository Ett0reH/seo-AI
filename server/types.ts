// Tipi condivisi tra gli agenti e l'orchestratore della pipeline di distribuzione.

export type PublishMethod = 'api' | 'scheduler' | 'semi_automatic' | 'manual_guided';

export type LinkPolicy = 'inline' | 'first_comment' | 'bio_only' | 'none';

export type VariantStatus =
  | 'draft'
  | 'pending_approval'
  | 'scheduled'
  | 'published'
  | 'failed'
  | 'skipped'
  | 'archived';

export interface PlatformConfig {
  id: string;
  name: string;
  publishMethod: PublishMethod;
  maxLength: number;      // 0 = nessun limite pratico
  hashtagLimit: number;
  linkPolicy: LinkPolicy;
  toneHint: string;
  enabled: number;
}

// Output del Content Master Agent.
export interface MasterAnalysis {
  theme: string;
  intent: string;
  keywords: string[];
  entities: { name: string; type: string }[];
  audience: string;
  cta: string;
  format: string;
}

// Output del Semantic Splitter Agent: un angolo distinto per piattaforma.
export interface SemanticAngle {
  platform: string;      // id piattaforma
  angle: string;         // taglio semantico unico
  keyPoints: string[];   // punti da sviluppare (non frasi finali)
}

// Output del Platform Adapter Agent: contenuto nativo per la piattaforma.
export interface AdaptedContent {
  title: string;
  body: string;
  hashtags: string[];
  cta: string;
  mediaSuggestion: string;
  category: string;
  tags: string[];
}

// Output del Compliance & Risk Agent.
export interface RiskAssessment {
  riskScore: number;     // 0-100
  riskFlags: string[];
}

// Contesto immutabile del master usato dagli agenti a valle.
export interface MasterContext {
  id: string;
  title: string;
  linkTarget: string;    // profilo LinkedIn target
  siteUrl: string;       // sito principale
  analysis: MasterAnalysis;
}

export interface Utm {
  source: string;
  medium: string;
  campaign: string;
  content: string;
  term?: string;
  url: string;           // URL finale con parametri UTM
}

// ── Pubblicazione reale via API / scheduler autorizzati (MVP-2) ──
// Vincolo: solo API ufficiali o webhook verso scheduler autorizzati.
// Nessuna automazione browser in nessun connettore.
// 'gemini' e 'gsc' (MVP-3) sono connettori di sola configurazione/lettura:
// non pubblicano mai nulla.

export type ConnectorId =
  | 'devto'
  | 'wordpress'
  | 'github'
  | 'webhook'
  | 'bluesky'
  | 'mastodon'
  | 'gemini'
  | 'gsc';

export interface IntegrationRow {
  platform: string;
  connector: ConnectorId;
  config: Record<string, string>;
  enabled: number;
  lastTestedAt: string | null;
  lastTestOk: number | null;
  updatedAt: string | null;
}

export interface PublishResult {
  ok: boolean;
  publishedUrl?: string;  // vuoto per gli scheduler (pubblicano loro allo slot)
  error?: string;
}

// Riga variante come letta dal DB (campi JSON ancora serializzati).
export interface VariantRow {
  id: string;
  masterId: string;
  platform: string;
  angle: string;
  title: string;
  body: string;
  mediaSuggestion: string;
  link: string;
  anchorText: string;
  utm: string;
  hashtags: string;
  category: string;
  tags: string;
  cta: string;
  opNotes: string;
  publishMethod: PublishMethod;
  riskScore: number;
  riskFlags: string;
  status: VariantStatus;
  scheduledAt: string | null;
  createdAt: string;
  attempts: number;
  lastError: string | null;
  optimizedFromId?: string | null; // MVP-3: id della variante da cui è stata rigenerata
}

export interface Publisher {
  // Pubblica la variante tramite l'integrazione configurata.
  publish(variant: VariantRow, config: Record<string, string>): Promise<PublishResult>;
  // Verifica credenziali/raggiungibilità senza pubblicare contenuti reali.
  test(config: Record<string, string>): Promise<PublishResult>;
}

// ── Visibilità SEO/LLM (MVP-3) ───────────────────────────────────
// Config della pseudo-integrazione 'visibility' (tabella integrations).
// Tutti i valori sono stringhe (stesso stile di postStatus su WordPress).
export interface VisibilityConfig {
  brand: string;           // nome brand da cercare
  siteDomain: string;      // dominio del sito principale (es. miosito.it)
  profileUrl?: string;     // profilo target (es. LinkedIn) opzionale
  intervalHours?: string;  // intervallo tra check per elemento (default 24)
  autoOptimize?: string;   // 'true' per rigenerare bozze ottimizzate in automatico
  maxDailyChecks?: string; // cap giornaliero di check (default 40)
}

// Riga di visibility_checks come letta dal DB (campi JSON serializzati).
export interface VisibilityCheckRow {
  id: string;
  scope: 'publication' | 'master';
  refId: string;
  platform: string;
  url: string;
  serpPresence: number | null;
  brandMentions: number;
  llmCited: number | null;
  indexedGsc: number | null;
  entityMatches: string; // JSON {matched,missing}
  topSources: string;    // JSON [{domain,title,matched}]
  queries: string;       // JSON string[]
  answerText: string;
  score: number;
  status: 'ok' | 'failed';
  notes: string;
  checkedAt: string;
}

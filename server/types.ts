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

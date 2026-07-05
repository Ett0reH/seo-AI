// SEO/LLM Visibility Agent — STUB (MVP-3, non attivo in MVP-1).
//
// Responsabilità pianificate:
// - verificare indicizzazione degli URL pubblicati (Search Console API / site: check via API)
// - rilevare citazioni del brand/profilo e menzioni (mentions API, non browser)
// - tracciare nuove SERP, segnali di authority, entity matching
// - stimare la visibilità nei motori LLM
//
// Vincolo: nessuna automazione browser. In MVP-3 useremo solo API ufficiali
// (Google Search Console, Bing Webmaster, mentions provider) e i dati di tracking.

export interface VisibilitySignal {
  variantId: string;
  indexed: boolean | null;
  brandMentions: number;
  notes: string;
}

export function collectVisibilitySignals(): VisibilitySignal[] {
  // Placeholder: implementazione in MVP-3.
  return [];
}

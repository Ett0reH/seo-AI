import type { LinkPolicy, RiskAssessment } from '../types';

// Compliance & Risk Agent
// Valuta rischio spam, duplicazione, over-linking, anchor ripetute, tono troppo
// promozionale. Logica LOCALE e deterministica (nessuna chiamata browser/LLM).

export interface VariantForRisk {
  platform: string;
  body: string;
  anchorText: string;
  link: string;
  linkPolicy: LinkPolicy;
}

// Jaccard su shingle di parole: misura similarità tra due testi (0..1).
function shingles(text: string, size = 3): Set<string> {
  const words = text.toLowerCase().replace(/[^a-z0-9à-ù\s]/gi, ' ').split(/\s+/).filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + size <= words.length; i++) {
    out.add(words.slice(i, i + size).join(' '));
  }
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const s of a) if (b.has(s)) inter++;
  return inter / (a.size + b.size - inter);
}

const PROMO_TERMS = [
  'compra', 'acquista', 'sconto', 'offerta', 'clicca qui', 'iscriviti ora', 'non perdere',
  'occasione', 'garantito', 'gratis', 'promo', 'affrettati', 'solo oggi',
];

const DUPLICATE_THRESHOLD = 0.5;

// Valuta l'intero set di varianti insieme (serve per similarità e anchor cross-variante).
export function assessVariants(variants: VariantForRisk[]): Map<string, RiskAssessment> {
  const sh = variants.map((v) => shingles(v.body));
  const anchorCounts = new Map<string, number>();
  for (const v of variants) {
    const k = v.anchorText.trim().toLowerCase();
    if (k) anchorCounts.set(k, (anchorCounts.get(k) || 0) + 1);
  }

  const result = new Map<string, RiskAssessment>();

  variants.forEach((v, i) => {
    const flags: string[] = [];
    let score = 0;

    // 1. Duplicazione con un'altra variante.
    let maxSim = 0;
    variants.forEach((_, j) => {
      if (i === j) return;
      maxSim = Math.max(maxSim, jaccard(sh[i], sh[j]));
    });
    if (maxSim >= DUPLICATE_THRESHOLD) {
      flags.push(`contenuto troppo simile ad altra variante (${Math.round(maxSim * 100)}%)`);
      score += 40;
    }

    // 2. Anchor ripetuta su più piattaforme.
    const anchorKey = v.anchorText.trim().toLowerCase();
    if (anchorKey && (anchorCounts.get(anchorKey) || 0) > 1) {
      flags.push('anchor text ripetuta su più piattaforme');
      score += 20;
    }

    // 3. Over-linking (più di un URL nel corpo).
    const links = v.body.match(/https?:\/\/[^\s)]+/g) || [];
    if (links.length > 1) {
      flags.push(`over-linking: ${links.length} link nel corpo`);
      score += 15;
    }

    // 4. Violazione policy link (link dove non consentito).
    if ((v.linkPolicy === 'none' || v.linkPolicy === 'bio_only') && (links.length > 0)) {
      flags.push('link presente dove non consentito dalla policy della piattaforma');
      score += 25;
    }

    // 5. Tono troppo promozionale.
    const lower = v.body.toLowerCase();
    const promoHits = PROMO_TERMS.filter((t) => lower.includes(t)).length;
    if (promoHits >= 2) {
      flags.push('tono troppo promozionale');
      score += 15;
    }

    result.set(v.platform, { riskScore: Math.min(100, score), riskFlags: flags });
  });

  return result;
}

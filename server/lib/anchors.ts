// Pool di anchor text variate per evitare la ripetizione della stessa ancora
// (requisito: non usare anchor text sempre identiche, no link wheel artificiale).

const GENERIC_ANCHORS = [
  'approfondisci qui',
  'leggi la versione completa',
  "l'articolo originale",
  'guida completa',
  'continua a leggere',
  'scopri di più',
  'dettagli e fonti',
  'la versione estesa',
];

// Restituisce un'anchor deterministica ma variata in base all'indice della variante.
// Alterna riferimenti al tema, all'entità principale e ancore generiche.
export function pickAnchor(index: number, theme: string, primaryEntity?: string): string {
  const themed = theme ? `${theme}: la guida` : null;
  const entityed = primaryEntity ? `tutto su ${primaryEntity}` : null;
  const pool = [themed, entityed, ...GENERIC_ANCHORS].filter(Boolean) as string[];
  return pool[index % pool.length];
}

// Verifica se un insieme di anchor ha troppe ripetizioni (usato dalla Compliance).
export function hasRepeatedAnchors(anchors: string[]): boolean {
  const counts = new Map<string, number>();
  for (const a of anchors) {
    const k = a.trim().toLowerCase();
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  for (const c of counts.values()) {
    if (c > 1) return true;
  }
  return false;
}

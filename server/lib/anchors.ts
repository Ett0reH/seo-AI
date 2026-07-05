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
  'il metodo passo passo',
  'esempi e casi reali',
  'il framework completo',
  'come funziona in pratica',
  'note e riferimenti utili',
  'la spiegazione dettagliata',
  'il punto di partenza',
];

// Il tema può arrivare dall'LLM come frase intera: per un'anchor leggibile
// servono poche parole, senza punteggiatura finale.
function shortPhrase(text: string, maxWords = 6, maxChars = 60): string {
  const words = text.trim().replace(/[.,:;!?]+$/, '').split(/\s+/).slice(0, maxWords).join(' ');
  return words.length > maxChars ? words.slice(0, maxChars).trim() : words;
}

// Restituisce un'anchor deterministica ma variata in base all'indice della variante.
// Alterna riferimenti al tema, all'entità principale e ancore generiche.
// Il pool (2 dinamiche + 15 generiche) copre tutte le 15 piattaforme senza ripetizioni.
export function pickAnchor(index: number, theme: string, primaryEntity?: string): string {
  const themed = theme ? `${shortPhrase(theme)}: la guida` : null;
  const entityed = primaryEntity ? `tutto su ${shortPhrase(primaryEntity, 4, 40)}` : null;
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

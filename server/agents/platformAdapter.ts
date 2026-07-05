import { Type } from '@google/genai';
import { generateJson } from './geminiClient';
import type { AdaptedContent, MasterContext, PlatformConfig, SemanticAngle } from '../types';

// Platform Adapter Agent
// Adatta tono, formato, lunghezza, hashtag, titolo, CTA e struttura in base
// alla piattaforma e al suo linkPolicy. Produce contenuto NATIVO, non un copia-incolla.
export async function adaptToPlatform(
  master: MasterContext,
  platform: PlatformConfig,
  angle: SemanticAngle
): Promise<AdaptedContent> {
  const a = master.analysis;
  const lengthHint = platform.maxLength > 0 ? `Lunghezza massima ~${platform.maxLength} caratteri.` : 'Nessun limite stretto di lunghezza.';
  const hashtagHint = platform.hashtagLimit > 0 ? `Usa al massimo ${platform.hashtagLimit} hashtag pertinenti.` : 'Non usare hashtag.';
  const linkHint = {
    inline: 'Il link può essere inserito nel corpo del testo.',
    first_comment: 'NON mettere il link nel corpo: verrà messo nel primo commento (indica questa nota).',
    bio_only: 'NON inserire link nel testo: rimanda al link in bio.',
    none: 'NON inserire alcun link promozionale: è una community, sii nativo e utile.',
  }[platform.linkPolicy];

  const prompt = `Sei un copywriter madrelingua esperto di ${platform.name}. Crea un contenuto NATIVO per questa piattaforma, seguendo l'angolo assegnato. Non riscrivere il master parola per parola: adatta struttura e stile alla piattaforma. Rispondi SOLO in JSON.

TONO PIATTAFORMA: ${platform.toneHint}
${lengthHint}
${hashtagHint}
POLICY LINK: ${linkHint}

TEMA MASTER: ${a.theme}
ANGOLO DA SVILUPPARE (unico per questa piattaforma): ${angle.angle}
PUNTI CHIAVE: ${angle.keyPoints.join('; ')}
PUBBLICO: ${a.audience}
CTA DI RIFERIMENTO (adattala, non copiarla): ${a.cta}

Produci:
- title: titolo/hook nativo per la piattaforma
- body: il testo completo, pronto e nativo (rispetta tono e lunghezza)
- hashtags: array (vuoto se non previsti)
- cta: call-to-action adattata alla piattaforma
- mediaSuggestion: suggerimento media (es. "carosello 5 slide", "screenshot codice", "nessuno")
- category: categoria/rubrica suggerita
- tags: 3-6 tag/argomenti`;

  const schema = {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING },
      body: { type: Type.STRING },
      hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
      cta: { type: Type.STRING },
      mediaSuggestion: { type: Type.STRING },
      category: { type: Type.STRING },
      tags: { type: Type.ARRAY, items: { type: Type.STRING } },
    },
    required: ['title', 'body', 'hashtags', 'cta', 'mediaSuggestion', 'category', 'tags'],
  };

  return generateJson<AdaptedContent>(prompt, schema);
}

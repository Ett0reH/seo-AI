import { Type } from '@google/genai';
import { generateJson } from './geminiClient';
import type { MasterAnalysis } from '../types';

// Content Master Agent
// Riceve il contenuto principale ed estrae tema, intent, keyword, entità,
// pubblico, CTA e formato consigliato.
export async function analyzeMaster(input: {
  title: string;
  rawContent: string;
  sourceUrl?: string;
}): Promise<MasterAnalysis> {
  const prompt = `Sei un content strategist SEO/LLM. Analizza il contenuto master seguente ed estrai i suoi elementi fondamentali. Rispondi SOLO in JSON.

Titolo: ${input.title}
${input.sourceUrl ? `URL sorgente: ${input.sourceUrl}` : ''}
Contenuto:
${input.rawContent}

Estrai:
- theme: il tema centrale in una frase
- intent: search intent dominante (Informational | Navigational | Transactional | Commercial)
- keywords: 5-10 keyword/frasi chiave rilevanti
- entities: fino a 6 entità principali con tipo (persona, organizzazione, tecnologia, luogo, concetto...)
- audience: il pubblico target
- cta: la call-to-action più naturale per questo contenuto
- format: il formato consigliato del contenuto master (es. guida, tutorial, case study, opinione, annuncio)`;

  const schema = {
    type: Type.OBJECT,
    properties: {
      theme: { type: Type.STRING },
      intent: { type: Type.STRING, enum: ['Informational', 'Navigational', 'Transactional', 'Commercial'] },
      keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
      entities: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: { name: { type: Type.STRING }, type: { type: Type.STRING } },
          required: ['name', 'type'],
        },
      },
      audience: { type: Type.STRING },
      cta: { type: Type.STRING },
      format: { type: Type.STRING },
    },
    required: ['theme', 'intent', 'keywords', 'entities', 'audience', 'cta', 'format'],
  };

  return generateJson<MasterAnalysis>(prompt, schema);
}

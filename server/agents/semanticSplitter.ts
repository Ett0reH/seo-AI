import { Type } from '@google/genai';
import { generateJson } from './geminiClient';
import type { MasterContext, PlatformConfig, SemanticAngle } from '../types';

// Semantic Splitter Agent
// Trasforma il contenuto master in angoli semantici DISTINTI, uno per piattaforma,
// esplicitamente non sovrapposti (requisito: mai contenuti identici / no duplicazione).
export async function splitIntoAngles(
  master: MasterContext,
  platforms: PlatformConfig[]
): Promise<SemanticAngle[]> {
  const a = master.analysis;
  const platformList = platforms
    .map((p) => `- ${p.id} (${p.name}) — tono: ${p.toneHint}`)
    .join('\n');

  const prompt = `Sei un semantic content splitter. A partire da UN contenuto master, devi produrre un ANGOLO semantico UNICO per ciascuna piattaforma elencata. Ogni angolo deve trattare un taglio diverso dello stesso tema: NON riformulare lo stesso messaggio, cambia proprio la prospettiva (es. how-to, opinione, dato controintuitivo, caso reale, errore comune, checklist, dietro le quinte, domanda alla community). Rispondi SOLO in JSON.

TEMA MASTER: ${a.theme}
INTENT: ${a.intent}
KEYWORD: ${a.keywords.join(', ')}
ENTITÀ: ${a.entities.map((e) => e.name).join(', ')}
PUBBLICO: ${a.audience}
FORMATO MASTER: ${a.format}

PIATTAFORME:
${platformList}

Regole:
1. Un oggetto per piattaforma, con lo stesso "platform" id fornito.
2. "angle" = descrizione breve del taglio unico (max 1 frase). Angoli diversi tra piattaforme.
3. "keyPoints" = 2-4 punti da sviluppare (spunti, NON testo finale).
4. Evita che due piattaforme abbiano lo stesso angle.`;

  const schema = {
    type: Type.OBJECT,
    properties: {
      angles: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            platform: { type: Type.STRING },
            angle: { type: Type.STRING },
            keyPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ['platform', 'angle', 'keyPoints'],
        },
      },
    },
    required: ['angles'],
  };

  const result = await generateJson<{ angles: SemanticAngle[] }>(prompt, schema);
  // Garantiamo un angolo per ogni piattaforma richiesta, anche se l'LLM ne omette qualcuna.
  const byId = new Map(result.angles.map((x) => [x.platform, x]));
  return platforms.map(
    (p) =>
      byId.get(p.id) ?? {
        platform: p.id,
        angle: `${a.theme} — prospettiva per ${p.name}`,
        keyPoints: a.keywords.slice(0, 3),
      }
  );
}

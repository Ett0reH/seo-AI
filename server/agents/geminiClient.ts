import { GoogleGenAI } from '@google/genai';

// Client Gemini lazy condiviso da tutti gli agenti (stesso pattern di server/ai.ts).
let aiClient: GoogleGenAI | null = null;

export function getAiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not set');
    }
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

export const GEMINI_MODEL = 'gemini-3-flash-preview';

// Helper: genera JSON strutturato e lo parsa, con errore chiaro se vuoto.
export async function generateJson<T>(prompt: string, responseSchema: unknown): Promise<T> {
  const ai = getAiClient();
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: responseSchema as any,
    },
  });
  const text = response.text;
  if (!text) throw new Error('No response from AI');
  return JSON.parse(text) as T;
}

// ── Grounding con Google Search (MVP-3) ─────────────────────────
// API ufficiale Gemini: nessun browser, nessuno scraping. Il tool googleSearch
// NON è combinabile con responseSchema sul modello in uso: i segnali si
// estraggono in modo deterministico da testo + groundingMetadata.

export interface GroundedSource {
  uri: string;    // redirect vertexaisearch (non è l'URL reale)
  title: string;  // di norma contiene il dominio della fonte
  domain: string; // normalizzato da title (o dal campo domain se presente)
}

export interface GroundedResult {
  text: string;
  sources: GroundedSource[];
  queries: string[]; // query di ricerca eseguite dal modello
  supports: { text: string; chunkIndices: number[] }[];
}

// Normalizza un dominio/URL per il confronto: minuscolo, senza protocollo,
// senza "www." e senza path.
export function normalizeDomain(input: string): string {
  return (input || '')
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/^www\./, '')
    .split(/[/?#]/)[0];
}

// Chiamata grounded: testo libero + metadati di grounding (fonti e query).
export async function generateGrounded(prompt: string): Promise<GroundedResult> {
  const ai = getAiClient();
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
    },
  });
  const text = response.text;
  if (!text) throw new Error('No response from AI');

  // Parsing difensivo: groundingMetadata può mancare se il modello non ha cercato.
  const meta = (response.candidates?.[0] as any)?.groundingMetadata || {};
  const chunks: any[] = Array.isArray(meta.groundingChunks) ? meta.groundingChunks : [];
  const sources: GroundedSource[] = chunks
    .map((c) => c?.web)
    .filter(Boolean)
    .map((w: any) => ({
      uri: String(w.uri || ''),
      title: String(w.title || ''),
      domain: normalizeDomain(String(w.domain || w.title || '')),
    }));
  const queries: string[] = Array.isArray(meta.webSearchQueries)
    ? meta.webSearchQueries.map((q: unknown) => String(q))
    : [];
  const rawSupports: any[] = Array.isArray(meta.groundingSupports) ? meta.groundingSupports : [];
  const supports = rawSupports.map((s) => ({
    text: String(s?.segment?.text || ''),
    chunkIndices: Array.isArray(s?.groundingChunkIndices)
      ? s.groundingChunkIndices.map((i: unknown) => Number(i))
      : [],
  }));

  return { text, sources, queries, supports };
}

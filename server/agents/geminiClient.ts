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

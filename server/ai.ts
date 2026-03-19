import { GoogleGenAI, Type } from '@google/genai';

let aiClient: GoogleGenAI | null = null;

function getAiClient() {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not set');
    }
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

export async function analyzeContent(title: string, content: string) {
  const ai = getAiClient();
  const prompt = `Analyze the following WordPress post.
Title: ${title}
Content: ${content}

Extract the main topic, the search intent, the schema.org type that best fits this content, and generate the full JSON-LD schema.org object. Also extract up to 3 main entities.

CRITICAL INSTRUCTION FOR jsonLd:
You MUST generate a complete, valid JSON-LD object for the 'jsonLd' field. It must include "@context": "https://schema.org" and the appropriate "@type". 
Because of schema constraints, you MUST return the JSON-LD object as a stringified JSON (a string containing the JSON). Do not leave it empty.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          topic: { type: Type.STRING },
          searchIntent: { 
            type: Type.STRING, 
            enum: ['Informational', 'Navigational', 'Transactional', 'Commercial'] 
          },
          schemaType: { type: Type.STRING },
          jsonLd: { type: Type.STRING, description: "The stringified JSON-LD object" },
          entities: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                type: { type: Type.STRING },
                wikipediaUrl: { type: Type.STRING }
              }
            }
          }
        },
        required: ['topic', 'searchIntent', 'schemaType', 'jsonLd', 'entities']
      }
    }
  });

  const text = response.text;
  if (!text) throw new Error('No response from AI');
  
  const parsed = JSON.parse(text);
  
  // Parse the stringified JSON-LD back into an object so the rest of the app works as expected
  try {
    if (typeof parsed.jsonLd === 'string') {
      parsed.jsonLd = JSON.parse(parsed.jsonLd);
    }
  } catch (e) {
    console.error("Failed to parse jsonLd string from AI:", e);
    parsed.jsonLd = {};
  }
  
  return parsed;
}

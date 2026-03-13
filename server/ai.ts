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

Extract the main topic, the search intent, the schema.org type that best fits this content, and generate the full JSON-LD schema.org object. Also extract up to 3 main entities.`;

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
          jsonLd: { type: Type.OBJECT },
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
  return JSON.parse(text);
}

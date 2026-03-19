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

export async function analyzeContent(title: string, content: string, postUrl: string) {
  const ai = getAiClient();
  const prompt = `Analyze the following WordPress post.
Title: ${title}
URL: ${postUrl}
Content: ${content}

Extract the main topic, the search intent, the schema.org type that best fits this content, and generate the full JSON-LD schema.org object. Also extract up to 3 main entities.

CRITICAL INSTRUCTION FOR jsonLd:
You MUST generate a complete, valid JSON object for the 'jsonLd' field. 
Because of schema constraints, you MUST return this entire combined JSON object as a stringified JSON (a string containing the JSON). Do not leave it empty.

The stringified JSON MUST contain TWO main parts merged into one single object:
1. A complete Schema.org representation using "@context": "https://schema.org" and an "@graph" array containing WebPage, Person (Author), BlogPosting/Article, and Organization.
2. A "Semantic AI Layer" with custom keys at the root level to help LLMs understand the page. These keys include: "page", "search_context", "topics", "entities", "concepts", "relationships", "knowledge_units", "questions", and "ai_summary".

IMPORTANT RULES: 
1. Use the EXACT URL provided (${postUrl}) for any "@id" or "url" fields. Do NOT use example.com.
2. If the author is not explicitly mentioned in the text, use "Autore Anonimo" or omit the author name. Do NOT use a hardcoded name unless found in the text.
3. Extract the actual organization name and domain from the URL if possible.

Example of the expected structure for the stringified JSON:
{
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "WebPage", "@id": "${postUrl}#webpage", "url": "${postUrl}", ... },
    { "@type": "Person", ... },
    { "@type": "BlogPosting", ... },
    { "@type": "Organization", ... }
  ],
  "page": { "page_id": "...", "page_type": "...", "primary_topic": "...", "content_goal": "...", "target_audience": "..." },
  "search_context": { "search_intent": "...", "difficulty_level": "...", "content_depth": "..." },
  "topics": ["..."],
  "entities": [ { "name": "...", "type": "...", "role": "..." } ],
  "concepts": [ { "term": "...", "definition": "..." } ],
  "relationships": [ { "subject": "...", "predicate": "...", "object": "..." } ],
  "knowledge_units": [ { "id": "KU1", "statement": "...", "confidence": 0.9 } ],
  "questions": [ { "question": "...", "short_answer": "..." } ],
  "ai_summary": "..."
}`;

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

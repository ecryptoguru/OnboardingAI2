import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY || '' });

async function run() {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: "Tell me about Xavier University in Digha Ghat, India.",
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: 'application/json',
        responseSchema: {
          type: "OBJECT",
          properties: {
            "demographics": {
                "type": "OBJECT",
                properties: { "total_students": { "type": "INTEGER" } }
            }
          }
        }
      }
    });

    console.log("METADATA:", JSON.stringify(response.candidates?.[0]?.groundingMetadata, null, 2));
  } catch (e) {
    if (e instanceof Error) {
        console.error("FAIL:", e.message, JSON.stringify((e as any).error, null, 2));
        console.dir(e);
    }
  }
}
run();

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { GoogleGenAI } from '@google/genai';

async function run() {
  const token = process.env.GOOGLE_API_KEY;
  if (!token) return console.log("NO TOKEN");
  const ai = new GoogleGenAI({ apiKey: token });

  console.log("Testing gemini-3-flash-preview natively...");
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: "Tell me about Xavier University in Digha Ghat, India.",
      config: {
        tools: [{ googleSearch: {} }],
        // Let's test precisely what our Code does!
        responseMimeType: 'application/json',
        responseSchema: {
          type: "OBJECT",
          properties: { "test": { "type": "STRING" } }
        },
        thinkingConfig: { thinkingLevel: 'LOW' }
      }
    });

    console.log("TEXT:\n", response.text?.slice(0, 50));
    console.log("METADATA:\n", JSON.stringify(response.candidates?.[0]?.groundingMetadata, null, 2));
  } catch (e: any) {
    console.error("FAIL:", e.message, e.error);
  }
}
run();

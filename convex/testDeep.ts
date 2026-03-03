import dotenv from 'dotenv';
dotenv.config({ path: '../.env.local' });
import { GoogleGenAI } from '@google/genai';

const token = process.env.GOOGLE_API_KEY;
if (!token) throw new Error("No token");

const ai = new GoogleGenAI({ apiKey: token });

async function run({ apiKey }: { apiKey: string }) {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: "Tell me about Xavier University in Digha Ghat, India.",
      config: {
        tools: [{ googleSearch: {} }]
      }
    });

    // Check if groundingChunks has .web.uri or web.link natively in gemini-3
    const md = response.candidates?.[0]?.groundingMetadata;
    console.log("METADATA DUMP:", JSON.stringify(md, null, 2));
  } catch (e) {
    console.error("FAIL:", e);
  }
}

run({ apiKey: token });

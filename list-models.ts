import { GoogleGenAI } from "@google/genai";

async function listModels() {
  const ai = new GoogleGenAI({ 
    apiKey: process.env.GOOGLE_API_KEY || ""
  });
  
  try {
    const models = await ai.models.list();
    console.log("Available Models:");
    for await (const model of models) {
      console.log(`- ${model.name}`);
    }
  } catch (error) {
    console.error("Error listing models:", error);
  }
}

listModels();

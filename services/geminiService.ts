import { GoogleGenAI } from "@google/genai";

// Initialize Gemini Client
const apiKey = process.env.API_KEY;
// We will handle the case where API Key is missing in the UI layer gracefully
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

export const generateCreativeBio = async (name: string, keywords: string): Promise<string> => {
  if (!ai) {
    throw new Error("Gemini API Key is missing.");
  }

  try {
    const model = 'gemini-2.5-flash';
    const prompt = `
      You are a neo-brutalist creative writer for a Web3 protocol called Linera.
      Write a short, punchy, cryptic, and cool bio for a user named "${name}".
      
      Context keywords: ${keywords}.
      
      Style guidelines:
      - Max 200 characters.
      - Use technical jargon mixed with philosophy.
      - No emojis.
      - Tone: Cyberpunk, precise, high-tech.
      - Return ONLY the raw text of the bio.
    `;

    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
    });

    return response.text.trim();
  } catch (error) {
    console.error("Gemini generation error:", error);
    return "Error: Signal interrupted. Neural link failed.";
  }
};

export const generateSupportMessage = async (creatorName: string, amount: number): Promise<string> => {
  if (!ai) {
    throw new Error("Gemini API Key is missing.");
  }

  try {
    const model = 'gemini-2.5-flash';
    const prompt = `
      Write a short, high-energy, crypto-native support message for a donation of ${amount} tokens to a creator named "${creatorName}".
      
      Style guidelines:
      - Max 100 characters.
      - Use terms like "WAGMI", "LFG", "Signal", "Boost".
      - Enthusiastic but cool.
      - Return ONLY the raw text.
    `;

    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
    });

    return response.text.trim();
  } catch (error) {
    console.error("Gemini generation error:", error);
    return "FULL SEND! LFG!";
  }
};
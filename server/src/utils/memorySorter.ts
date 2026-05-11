import { GoogleGenAI, Type } from '@google/genai';
import { env } from '../config/env.js';
import { CONSTANTS } from '../config/constants.js';

const ai = new GoogleGenAI({ apiKey: env.GOOGLE_API_KEY });

export async function sortMemory(transcript: string) {
    if (!env.GOOGLE_API_KEY) {
        console.warn("GOOGLE_API_KEY is missing.");
        return null;
    }

    const systemInstruction = "You are the EchoMind Sorting Engine. Analyze the following transcript. If it contains a long-term fact, task, or significant event, output a JSON object. If not, output NULL.\n\nOutput Schema: { \"title\": \"string\", \"summary\": \"string\", \"category\": \"Task|Fact|Idea\", \"importance\": 0.0-1.0 }";

    try {
        const response = await ai.models.generateContent({
            model: CONSTANTS.GEMINI_MODEL,
            contents: [{ role: 'user', parts: [{ text: transcript }] }],
            config: {
                systemInstruction,
                responseMimeType: 'application/json',
                responseJsonSchema: {
                    type: Type.OBJECT,
                    properties: {
                        title: { type: Type.STRING },
                        summary: { type: Type.STRING },
                        category: { type: Type.STRING, description: 'Task, Fact, or Idea' },
                        importance: { type: Type.NUMBER }
                    },
                    required: ['title', 'summary', 'category', 'importance']
                }
            }
        });

        const text = response.text?.trim() || '';
        if (text === 'NULL' || text === 'null' || text === '') {
            return null;
        }

        return JSON.parse(text);
    } catch (err) {
        console.error("Gemini memory sorting error:", err);
        return null;
    }
}

import { GoogleGenAI, Type } from '@google/genai';
import { CONSTANTS } from '../config/constants.js';
import { env } from '../config/env.js';

const ai = new GoogleGenAI({ 
  apiKey: env.GOOGLE_API_KEY 
});

const SYSTEM_INSTRUCTIONS = `You are a high-speed memory sorting engine. Analyze the provided transcript.
If the content is a task, a factual piece of information, or a creative idea, output a JSON object.
If the content is small talk, incomplete, or noise, output NULL.
JSON Schema: { "title": "string", "summary": "string", "category": "Task|Fact|Idea", "importance": 0.0-1.0 }`;

export async function sortMemory(transcript: string) {
  try {
    const response = await ai.models.generateContent({
      model: CONSTANTS.GEMINI_MODEL,
      contents: [{ role: 'user', parts: [{ text: transcript }] }],
      config: {
        systemInstruction: SYSTEM_INSTRUCTIONS,
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

    const outputText = response.text?.trim() || '';
    if (!outputText || outputText === 'NULL') {
      return null;
    }

    return JSON.parse(outputText);
  } catch (error) {
    console.error('Error in sortMemory:', error);
    return null;
  }
}

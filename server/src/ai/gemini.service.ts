import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { createLogger } from '@echomind/logger';
import { MemoryExtractionSchema, type MemoryExtraction } from '@echomind/types';
import { env } from '../config/env.js';
import { CONSTANTS } from '../config/constants.js';
import { detectLanguage, getLanguageInstruction, type SupportedLanguage } from '../nlp/language.service.js';
import { extractEntities } from '../nlp/entity-extractor.js';

const log = createLogger('gemini');

const genAI = new GoogleGenerativeAI(env.GOOGLE_API_KEY);

/**
 * Memory extraction using Gemini with bilingual support.
 * Detects language, applies NLP entity extraction, and generates structured output.
 *
 * Supported:
 * - Pure English
 * - Pure Hindi (Devanagari)
 * - Code-switched Hindi-English (Hinglish)
 */
export async function extractMemory(transcript: string): Promise<MemoryExtraction | null> {
  const now = new Date();
  const langResult = detectLanguage(transcript);
  const entities = extractEntities(transcript);
  const langInstruction = getLanguageInstruction(langResult.language);

  const systemPrompt = `You are the EchoMind Memory Engine — an intelligent "Second Brain" that works in both English and Hindi.

Current Time: ${now.toISOString()} (${now.toLocaleDateString('en-IN')} ${now.toLocaleTimeString('en-IN')})
Detected Language: ${langResult.language} (confidence: ${langResult.confidence.toFixed(2)})
Code-Switched: ${langResult.isCodeSwitched}

${langInstruction}

Pre-extracted entities:
- People: ${entities.people.join(', ') || 'none'}
- Dates: ${entities.dates.join(', ') || 'none'}
- Times: ${entities.times.join(', ') || 'none'}
- Tasks: ${entities.tasks.join(', ') || 'none'}
- Deadlines: ${entities.deadlines.join(', ') || 'none'}

INSTRUCTIONS:
1. Write a concise, declarative title (in the same language as the transcript).
2. Write a summary (present-tense, actionable, same language).
3. Categorize: "Task", "Fact", or "Idea".
4. Score importance: 0.0 to 1.0.
5. Extract 2-5 tags (English keywords for cross-language searchability).

BILINGUAL EXAMPLES:
- "Kal Rahul ko call karna" → Task, title: "Call Rahul Tomorrow", importance: 0.7
- "Project deadline next Monday hai" → Task, title: "Project Deadline Next Monday", importance: 0.9
- "Meeting notes: discussed Q3 targets" → Fact, title: "Q3 Target Discussion Notes", importance: 0.6

REMINDER EXTRACTION:
If time/date/deadline is mentioned, extract a "reminder" object:
- dueAt: ISO 8601 datetime. Resolve relative dates using Current Time.
- "kal" / "tomorrow" → tomorrow same time
- "agle hafte" / "next week" → next Monday
- "5 baje" → today/tomorrow at 5:00 PM
- category: work, health, meeting, personal, study, family, payment, errands
- priority: low, medium, high (deadlines = high, casual = low)
- repeatRule: daily, weekly, monthly, weekdays, or null
- isCritical: true if urgent language detected ("zaroor", "must", "critical", "urgent")`;

  try {
    const model = genAI.getGenerativeModel({ model: CONSTANTS.GEMINI_MODEL });
    const result = await model.generateContent({
      contents: [
        { role: 'user', parts: [{ text: systemPrompt }] },
        { role: 'user', parts: [{ text: `Transcript: "${transcript}"` }] },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            title: { type: SchemaType.STRING },
            summary: { type: SchemaType.STRING },
            category: { type: SchemaType.STRING, description: 'Fact, Task, or Idea' },
            importance: { type: SchemaType.NUMBER },
            tags: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
            reminder: {
              type: SchemaType.OBJECT,
              nullable: true,
              properties: {
                title: { type: SchemaType.STRING },
                description: { type: SchemaType.STRING },
                dueAt: { type: SchemaType.STRING, description: 'ISO 8601' },
                category: { type: SchemaType.STRING },
                priority: { type: SchemaType.STRING },
                repeatRule: { type: SchemaType.STRING, nullable: true },
                isCritical: { type: SchemaType.BOOLEAN },
              },
              required: ['title', 'dueAt', 'category', 'priority'],
            },
          },
          required: ['title', 'summary', 'category', 'importance'],
        },
      },
    });

    const text = result.response.text();
    if (!text) {
      log.warn('Gemini returned empty response');
      return null;
    }

    const rawJson = JSON.parse(text);
    const parsed = MemoryExtractionSchema.safeParse(rawJson);

    if (parsed.success) {
      log.info({
        language: langResult.language,
        category: parsed.data.category,
        hasReminder: !!parsed.data.reminder,
      }, 'Memory extracted');
      return parsed.data;
    }

    // Fallback for partial Zod failures
    log.warn({ errors: parsed.error.errors }, 'Zod validation failed — applying fallback');
    return {
      title: rawJson.title || 'Captured Memory',
      summary: rawJson.summary || transcript.substring(0, 200),
      category: ['Task', 'Fact', 'Idea'].includes(rawJson.category) ? rawJson.category : 'Fact',
      importance: typeof rawJson.importance === 'number' ? rawJson.importance : 0.5,
      tags: Array.isArray(rawJson.tags) ? rawJson.tags : [],
    };
  } catch (error) {
    if (env.DEMO_MODE) {
      log.warn('DEMO_MODE: Returning mock memory');
      return {
        title: langResult.language === 'en' ? 'Research Neural Interfaces' : 'न्यूरल इंटरफेस रिसर्च',
        summary: 'Explored advancements in brain-computer interfaces.',
        category: 'Idea',
        importance: 0.95,
        tags: ['research', 'neural', 'AI'],
      };
    }
    log.error({ error }, 'Failed to extract memory');
    return null;
  }
}

/**
 * Answer a user query using memory context.
 * Supports bilingual queries like "Meri kal ki reminders kya hain?"
 */
export async function answerQuery(
  query: string,
  memoryContext: string,
  language: SupportedLanguage = 'en',
): Promise<string | null> {
  const langInstruction = getLanguageInstruction(language);

  try {
    const model = genAI.getGenerativeModel({ model: CONSTANTS.GEMINI_MODEL });
    const result = await model.generateContent({
      contents: [{
        role: 'user',
        parts: [{
          text: `You are EchoMind, a bilingual AI memory assistant.
${langInstruction}
Respond in the same language as the query. Be concise and helpful.

User's Memory Context:
${memoryContext}

User Query: "${query}"

Answer based ONLY on the provided memory context. If you don't have enough information, say so honestly.`
        }]
      }],
    });

    return result.response.text() || null;
  } catch (error) {
    log.error({ error }, 'Failed to answer query');
    return null;
  }
}

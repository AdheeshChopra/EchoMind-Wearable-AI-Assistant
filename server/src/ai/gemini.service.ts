import { GoogleGenAI, Type } from '@google/genai';
import { createLogger } from '../utils/logger.js';
import { MemoryExtractionSchema, type MemoryExtraction } from '@echomind/types';
import { env } from '../config/env.js';
import { CONSTANTS } from '../config/constants.js';
import { detectLanguage, getLanguageInstruction, type SupportedLanguage } from '../nlp/language.service.js';
import { extractEntities } from '../nlp/entity-extractor.js';

export interface MeetingInsights {
  mainPoints: string[];
  decisions: string[];
  actionItems: Array<{ task: string; assignee: string; dueDate?: string }>;
  nextSteps: string[];
}

const log = createLogger('gemini');

// Initialize the new @google/genai client
const ai = new GoogleGenAI({ apiKey: env.GOOGLE_API_KEY });

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
    const response = await ai.models.generateContent({
      model: CONSTANTS.GEMINI_MODEL,
      contents: [
        { role: 'user', parts: [{ text: systemPrompt }] },
        { role: 'user', parts: [{ text: `Transcript: "${transcript}"` }] },
      ],
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            summary: { type: Type.STRING },
            category: { type: Type.STRING, description: 'Fact, Task, or Idea' },
            importance: { type: Type.NUMBER },
            tags: { type: Type.ARRAY, items: { type: Type.STRING } },
            reminder: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                dueAt: { type: Type.STRING, description: 'ISO 8601' },
                category: { type: Type.STRING },
                priority: { type: Type.STRING },
                repeatRule: { type: Type.STRING },
                isCritical: { type: Type.BOOLEAN },
              },
              required: ['title', 'dueAt', 'category', 'priority'],
            },
          },
          required: ['title', 'summary', 'category', 'importance'],
        },
      },
    });

    const text = response.text;
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
    const response = await ai.models.generateContent({
      model: CONSTANTS.GEMINI_MODEL,
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

    return response.text || null;
  } catch (error) {
    log.error({ error }, 'Failed to answer query');
    return null;
  }
}

/**
 * Specialized extraction for long-form meeting transcripts.
 * Focuses on diarized context, speaker dynamics, and project-level insights.
 */
export async function extractMeetingInsights(transcript: string): Promise<MeetingInsights | null> {
  const systemPrompt = `You are the EchoMind Meeting Analyst. Your goal is to process a meeting transcript (potentially with multiple speakers) and extract high-level strategic insights.

INSTRUCTIONS:
1. Identify the 3-5 most critical "Main Points" discussed.
2. List any specific "Decisions" that were finalized during the meeting.
3. Extract "Action Items" including the task description, the person assigned (if mentioned), and any deadlines.
4. Summarize the "Next Steps" for the team.

If the transcript is in Hindi or Hinglish, provide the insights in the same language style but ensure the structure remains JSON.

FORMAT:
Provide the output in a clean JSON object matching the requested schema.`;

  try {
    const response = await ai.models.generateContent({
      model: CONSTANTS.GEMINI_MODEL,
      contents: [
        { role: 'user', parts: [{ text: systemPrompt }] },
        { role: 'user', parts: [{ text: `Meeting Transcript:\n${transcript}` }] },
      ],
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema: {
          type: Type.OBJECT,
          properties: {
            mainPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
            decisions: { type: Type.ARRAY, items: { type: Type.STRING } },
            actionItems: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  task: { type: Type.STRING },
                  assignee: { type: Type.STRING },
                  dueDate: { type: Type.STRING },
                },
                required: ['task', 'assignee'],
              },
            },
            nextSteps: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ['mainPoints', 'decisions', 'actionItems', 'nextSteps'],
        },
      },
    });

    const text = response.text;
    return text ? JSON.parse(text) : null;
  } catch (error) {
    log.error({ error }, 'Failed to extract meeting insights');
    return null;
  }
}

/**
 * Extract useful context or entities from text (legacy debug helper).
 */
export async function extractContext(text: string) {
  try {
    const response = await ai.models.generateContent({
      model: CONSTANTS.GEMINI_MODEL,
      contents: [{
        role: 'user',
        parts: [{ text: `Extract useful context or entities from the following text and summarize them concisely:\n\n"${text}"` }]
      }]
    });
    return { context: response.text };
  } catch (error: any) {
    log.error({ error }, 'Failed to extract context');
    return { context: null, error: error.message || 'Extraction failed' };
  }
}

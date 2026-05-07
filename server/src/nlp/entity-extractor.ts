import { createLogger } from '../utils/logger.js';
import { detectLanguage, normalizeTranscript, type SupportedLanguage } from './language.service.js';

const log = createLogger('nlp');

// ─── NLP Extraction Types ─────────────────────────────────────
export interface NLPEntities {
  people: string[];
  dates: string[];
  times: string[];
  locations: string[];
  organizations: string[];
  tasks: string[];
  deadlines: string[];
}

// ─── Time Expression Patterns ─────────────────────────────────
// English
const EN_TIME_PATTERNS = [
  /\b(today|tomorrow|yesterday|next\s+\w+|this\s+\w+|in\s+\d+\s+\w+)\b/gi,
  /\b(\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM))\b/g,
  /\b(morning|afternoon|evening|night|noon|midnight)\b/gi,
  /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,
  /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}\b/gi,
  /\b(next\s+week|next\s+month|end\s+of\s+(?:the\s+)?(?:day|week|month))\b/gi,
];

// Hindi (Romanized + Devanagari)
const HI_TIME_PATTERNS = [
  /\b(kal|aaj|parso|agla\s+\w+|is\s+\w+|agle\s+\w+)\b/gi,
  /\b(subah|dopahar|shaam|raat)\b/gi,
  /\b(somvar|mangalvar|budhvar|guruvar|shukravar|shanivar|ravivar)\b/gi,
  /\b(सोमवार|मंगलवार|बुधवार|गुरुवार|शुक्रवार|शनिवार|रविवार)\b/g,
  /\b(कल|आज|परसो|सुबह|दोपहर|शाम|रात)\b/g,
  /\b(\d+\s+(?:baje|minute|ghanta|din|hafta|mahina))\b/gi,
  /\b(\d+\s+(?:बजे|मिनट|घंटे|दिन|हफ्ता|महीना))\b/g,
];

// ─── Person Name Patterns ─────────────────────────────────────
const PERSON_MARKERS_EN = /\b(?:call|email|message|tell|ask|meet|with|from)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g;
const PERSON_MARKERS_HI = /\b(?:ko|se|ka|ki|ke|wala|wali)\s+(?:call|phone|baat|mil)\b/gi;

// ─── Task Indicators ─────────────────────────────────────────
const TASK_INDICATORS_EN = [
  /\b(need\s+to|have\s+to|must|should|will|going\s+to|want\s+to|plan\s+to)\s+(\w[\w\s]{3,40})/gi,
  /\b(remind\s+me\s+to|don't\s+forget\s+to|remember\s+to)\s+(\w[\w\s]{3,40})/gi,
];

const TASK_INDICATORS_HI = [
  /\b(karna\s+hai|karna\s+hoga|karna\s+chahiye|karna\s+padega|yaad\s+rakhna|yaad\s+dilana)\b/gi,
  /\b(करना\s+है|करना\s+होगा|करना\s+चाहिए|याद\s+रखना|याद\s+दिलाना)\b/g,
];

/**
 * Extract structured entities from bilingual text.
 * Combines English and Hindi pattern matching.
 */
export function extractEntities(text: string): NLPEntities {
  const normalized = normalizeTranscript(text);
  const { language } = detectLanguage(text);

  const entities: NLPEntities = {
    people: [],
    dates: [],
    times: [],
    locations: [],
    organizations: [],
    tasks: [],
    deadlines: [],
  };

  // Extract time expressions
  const timePatterns = language === 'en'
    ? EN_TIME_PATTERNS
    : [...EN_TIME_PATTERNS, ...HI_TIME_PATTERNS];

  for (const pattern of timePatterns) {
    const matches = normalized.matchAll(pattern);
    for (const match of matches) {
      const value = match[1] || match[0];
      if (!entities.dates.includes(value) && !entities.times.includes(value)) {
        // Rough heuristic: if it looks like a time (has digits or am/pm), it's a time
        if (/\d|am|pm|baje|बजे/i.test(value)) {
          entities.times.push(value.trim());
        } else {
          entities.dates.push(value.trim());
        }
      }
    }
  }

  // Extract people
  const personMatches = normalized.matchAll(PERSON_MARKERS_EN);
  for (const match of personMatches) {
    if (match[1] && !entities.people.includes(match[1])) {
      entities.people.push(match[1]);
    }
  }

  // Capitalized words following Hindi relational markers
  const hindiPersonPattern = /([A-Z][a-z]+)\s+(?:ko|se|ka|ki|ke)\b/g;
  const hindiPersonMatches = normalized.matchAll(hindiPersonPattern);
  for (const match of hindiPersonMatches) {
    if (match[1] && !entities.people.includes(match[1])) {
      entities.people.push(match[1]);
    }
  }

  // Extract task phrases
  const taskPatterns = language === 'en'
    ? TASK_INDICATORS_EN
    : [...TASK_INDICATORS_EN, ...TASK_INDICATORS_HI];

  for (const pattern of taskPatterns) {
    const matches = normalized.matchAll(pattern);
    for (const match of matches) {
      const task = (match[2] || match[0]).trim();
      if (task.length > 3 && !entities.tasks.includes(task)) {
        entities.tasks.push(task);
      }
    }
  }

  // If dates/times + tasks detected together, mark as deadlines
  if (entities.dates.length > 0 && entities.tasks.length > 0) {
    entities.deadlines.push(`${entities.tasks[0]} by ${entities.dates[0]}`);
  }

  log.debug({ language, entities }, 'Entities extracted');
  return entities;
}

/**
 * Determine if a transcript likely contains a query (vs. a statement to remember).
 * Bilingual query detection.
 */
export function isQueryIntent(text: string): boolean {
  const lower = text.toLowerCase().trim();

  // English question patterns
  const enQueryPatterns = [
    /^(what|when|where|who|how|which|why|do\s+i|did\s+i|have\s+i|show\s+me|find|search|any\s+pending|list)\b/i,
    /\?$/,
  ];

  // Hindi question patterns (Romanized)
  const hiQueryPatterns = [
    /\b(kya|kab|kahan|kaun|kaise|kitna|kitne|dikha|bata|khoj|dhundh|meri|mere)\b/i,
    /\b(hai\s*\?|hain\s*\?|tha\s*\?|thi\s*\?)/i,
  ];

  for (const pattern of [...enQueryPatterns, ...hiQueryPatterns]) {
    if (pattern.test(lower)) return true;
  }

  return false;
}

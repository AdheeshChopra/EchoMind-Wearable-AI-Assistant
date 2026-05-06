import { createLogger } from '@echomind/logger';

const log = createLogger('language');

// ─── Supported Languages ──────────────────────────────────────
export type SupportedLanguage = 'en' | 'hi' | 'hi-en';

export interface LanguageDetectionResult {
  language: SupportedLanguage;
  confidence: number;
  isCodeSwitched: boolean;
}

// ─── Hindi Unicode Ranges ─────────────────────────────────────
// Devanagari: U+0900–U+097F
const DEVANAGARI_REGEX = /[\u0900-\u097F]/;
const DEVANAGARI_WORD_REGEX = /[\u0900-\u097F]+/g;

// Common Hindi words in Romanized form (code-switching detection)
const ROMANIZED_HINDI_MARKERS = new Set([
  'hai', 'hain', 'kya', 'nahi', 'nahin', 'ko', 'ka', 'ki', 'ke', 'se',
  'mein', 'par', 'bhi', 'aur', 'ya', 'ek', 'do', 'teen', 'char',
  'kal', 'aaj', 'abhi', 'baad', 'pehle', 'yeh', 'woh', 'kuch',
  'karo', 'karna', 'raha', 'rahi', 'rahe', 'tha', 'thi', 'the',
  'hoga', 'hogi', 'chahiye', 'sakta', 'sakti', 'sakte',
  'mujhe', 'tujhe', 'uske', 'mere', 'tera', 'mera', 'koi',
  'wala', 'wali', 'waale', 'bahut', 'thoda', 'zyada', 'kam',
  'achha', 'accha', 'theek', 'sahi', 'galat', 'zaroor', 'bilkul',
  'dhanyavaad', 'shukriya', 'namaste', 'bhaya', 'bhaiya', 'ji',
  'yaad', 'dilana', 'batao', 'dekho', 'suno', 'jao', 'aao',
  'lena', 'dena', 'milna', 'bolna', 'likhna', 'padhna',
  'subah', 'shaam', 'raat', 'dopahar', 'samay', 'din', 'hafta',
  'mahina', 'saal', 'paisa', 'rupee', 'kaam', 'ghar', 'daftar',
]);

/**
 * Detect language from transcript text.
 * Handles three cases:
 * 1. Pure English text
 * 2. Pure Hindi (Devanagari) text
 * 3. Code-switched Hindi-English (Hinglish)
 */
export function detectLanguage(text: string): LanguageDetectionResult {
  const words = text.trim().split(/\s+/);
  if (words.length === 0) {
    return { language: 'en', confidence: 0.5, isCodeSwitched: false };
  }

  // Count Devanagari characters
  const devanagariMatches = text.match(DEVANAGARI_WORD_REGEX) || [];
  const devanagariCharCount = devanagariMatches.join('').length;
  const totalCharCount = text.replace(/\s/g, '').length;
  const devanagariRatio = totalCharCount > 0 ? devanagariCharCount / totalCharCount : 0;

  // Count Romanized Hindi markers
  const lowerWords = words.map(w => w.toLowerCase().replace(/[^a-z]/g, ''));
  const hindiMarkerCount = lowerWords.filter(w => ROMANIZED_HINDI_MARKERS.has(w)).length;
  const hindiMarkerRatio = words.length > 0 ? hindiMarkerCount / words.length : 0;

  // Pure Devanagari Hindi
  if (devanagariRatio > 0.5) {
    return {
      language: 'hi',
      confidence: Math.min(0.95, 0.5 + devanagariRatio * 0.5),
      isCodeSwitched: hindiMarkerRatio > 0 && hindiMarkerRatio < 0.8,
    };
  }

  // Code-switched (Hinglish): significant Hindi markers in Latin script
  if (hindiMarkerRatio >= 0.15 || (devanagariRatio > 0 && devanagariRatio <= 0.5)) {
    return {
      language: 'hi-en',
      confidence: Math.min(0.9, 0.5 + hindiMarkerRatio + devanagariRatio * 0.3),
      isCodeSwitched: true,
    };
  }

  // Default: English
  return {
    language: 'en',
    confidence: Math.min(0.95, 0.5 + (1 - hindiMarkerRatio) * 0.5),
    isCodeSwitched: false,
  };
}

/**
 * Get the appropriate BCP-47 locale for STT configuration.
 */
export function getSTTLocale(language: SupportedLanguage): string {
  switch (language) {
    case 'hi': return 'hi-IN';
    case 'hi-en': return 'hi-IN'; // Whisper handles code-switching well with Hindi primary
    default: return 'en-US';
  }
}

/**
 * Normalize a bilingual transcript for consistent downstream processing.
 * - Trims whitespace
 * - Normalizes unicode (NFC form)
 * - Removes excessive spaces
 */
export function normalizeTranscript(text: string): string {
  return text
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Get Gemini prompt language instruction based on detected language.
 */
export function getLanguageInstruction(language: SupportedLanguage): string {
  switch (language) {
    case 'hi':
      return 'The transcript is in Hindi. Respond with a title and summary in Hindi (Devanagari script). Tags can be in English.';
    case 'hi-en':
      return 'The transcript is in mixed Hindi-English (Hinglish). Respond with a title and summary in the same mixed style the user used. Preserve the natural code-switching. Tags can be in English.';
    default:
      return 'The transcript is in English.';
  }
}

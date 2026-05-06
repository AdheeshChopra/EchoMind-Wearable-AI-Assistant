/**
 * Language Detection Utility for Mobile (Client-Side).
 * Lightweight detection for choosing STT locale before sending to backend.
 * The server performs the authoritative detection.
 */

export type MobileLanguage = 'en' | 'hi' | 'hi-en';

// Devanagari Unicode range
const DEVANAGARI_REGEX = /[\u0900-\u097F]/;

// Common Romanized Hindi markers (subset for speed)
const HINDI_MARKERS = new Set([
  'hai', 'hain', 'kya', 'nahi', 'ko', 'ka', 'ki', 'ke', 'se',
  'mein', 'par', 'bhi', 'aur', 'ya', 'ek', 'do', 'kal', 'aaj',
  'abhi', 'yeh', 'woh', 'kuch', 'karo', 'karna', 'hoga',
  'chahiye', 'mujhe', 'mere', 'tera', 'mera', 'achha', 'theek',
  'yaad', 'dilana', 'batao', 'suno', 'subah', 'shaam', 'raat',
]);

/**
 * Fast client-side language detection for STT locale selection.
 * Returns the best BCP-47 locale for expo-speech-recognition.
 */
export function detectLanguageForSTT(text: string): {
  language: MobileLanguage;
  sttLocale: string;
} {
  // Check for Devanagari characters
  if (DEVANAGARI_REGEX.test(text)) {
    return { language: 'hi', sttLocale: 'hi-IN' };
  }

  // Check for Romanized Hindi markers
  const words = text.toLowerCase().split(/\s+/);
  const hindiCount = words.filter(w => HINDI_MARKERS.has(w.replace(/[^a-z]/g, ''))).length;
  const ratio = words.length > 0 ? hindiCount / words.length : 0;

  if (ratio >= 0.15) {
    return { language: 'hi-en', sttLocale: 'hi-IN' };
  }

  return { language: 'en', sttLocale: 'en-US' };
}

/**
 * Get available STT locales for bilingual mode.
 */
export function getAvailableLocales(): { label: string; value: string; flag: string }[] {
  return [
    { label: 'English', value: 'en-US', flag: '🇺🇸' },
    { label: 'Hindi', value: 'hi-IN', flag: '🇮🇳' },
    { label: 'Auto (Bilingual)', value: 'auto', flag: '🌐' },
  ];
}

/**
 * useEchoMindVoice — Production-grade bilingual voice capture hook for EchoMind.
 *
 * Supports 3 capture modes:
 *   1. Auto Voice Detection  — Listens silently, auto-records on speech
 *   2. Manual Passive Capture — User taps to enable passive listening
 *   3. Manual Instant Record  — Hold to record, release to stop
 *
 * Bilingual Support:
 *   - English (en-US)
 *   - Hindi (hi-IN)
 *   - Auto-detect (starts en-US, switches to hi-IN on Hindi detection)
 *
 * Privacy:
 *   - Requires explicit user consent for passive modes
 *   - No raw audio stored
 *   - All data transmitted via authenticated WebSocket
 *
 * State machine:
 *   idle → passive_listening → speech_detected → recording → processing → saved → idle
 *                                                                       → error → idle
 *
 * Uses expo-speech-recognition for STT with continuous mode + interim results.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { Vibration, Platform } from 'react-native';
import { EchoMindSocket } from '../lib/socket';
import {
  getVoiceSettings,
  getSTTLocale,
  isPassiveListeningAllowed,
  SENSITIVITY_THRESHOLDS,
  type VoiceSettings,
  type LanguageMode,
} from '../lib/voiceSettings';
import { detectLanguageForSTT, type MobileLanguage } from '../lib/languageDetection';

// ─── Types ──────────────────────────────────────────────────────────────────

export type VoiceCaptureState =
  | 'idle'
  | 'passive_listening'
  | 'speech_detected'
  | 'recording'
  | 'processing'
  | 'saved'
  | 'error'
  | 'consent_required';

export type CaptureMode = 'auto' | 'manual_passive' | 'manual_instant';

export interface VoiceState {
  captureState: VoiceCaptureState;
  captureMode: CaptureMode | null;
  sentences: string[];
  partialTranscript: string;
  audioLevel: number;    // 0.0 – 1.0
  error: string | null;
  sessionCount: number;  // Total captures this session
  detectedLanguage: MobileLanguage;
  sttLocale: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const PARTIAL_FLUSH_CHARS = 40;
const PARTIAL_FLUSH_TIMEOUT_MS = 800;
const SPEECH_DEBOUNCE_MS = 300;
const SAVED_DISPLAY_DURATION_MS = 2500;
const AUTO_RESTART_DELAY_MS = 500;
const LANGUAGE_SWITCH_CHECK_INTERVAL = 3; // Check every N words

// ─── Hook ───────────────────────────────────────────────────────────────────

export const useEchoMindVoice = () => {
  const [state, setState] = useState<VoiceState>({
    captureState: 'idle',
    captureMode: null,
    sentences: [],
    partialTranscript: '',
    audioLevel: 0,
    error: null,
    sessionCount: 0,
    detectedLanguage: 'en',
    sttLocale: 'en-US',
  });

  // Refs for timers and tracking
  const lastSentText = useRef<string>('');
  const partialFlushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speechDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoRestartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSpeechActive = useRef(false);
  const captureStateRef = useRef<VoiceCaptureState>('idle');
  const captureModeRef = useRef<CaptureMode | null>(null);
  const isManualInstantRef = useRef(false);
  const sessionSentences = useRef<string[]>([]);
  const wordCountSinceCheck = useRef(0);
  const currentLocaleRef = useRef('en-US');

  // Keep refs in sync with state
  useEffect(() => {
    captureStateRef.current = state.captureState;
  }, [state.captureState]);
  useEffect(() => {
    captureModeRef.current = state.captureMode;
  }, [state.captureMode]);

  // ─── Helpers ──────────────────────────────────────────────────────────────

  const vibrate = useCallback((pattern: number | number[] = 30) => {
    const settings = getVoiceSettings();
    if (settings.vibrationFeedback) {
      Vibration.vibrate(pattern);
    }
  }, []);

  const clearAllTimers = useCallback(() => {
    if (partialFlushTimer.current) clearTimeout(partialFlushTimer.current);
    if (silenceTimer.current) clearTimeout(silenceTimer.current);
    if (speechDebounceTimer.current) clearTimeout(speechDebounceTimer.current);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    if (autoRestartTimer.current) clearTimeout(autoRestartTimer.current);
    partialFlushTimer.current = null;
    silenceTimer.current = null;
    speechDebounceTimer.current = null;
    savedTimer.current = null;
    autoRestartTimer.current = null;
  }, []);

  const sendToBackend = useCallback((text: string) => {
    const trimmed = text.trim();
    if (
      trimmed.length > 5 &&
      trimmed !== lastSentText.current &&
      !lastSentText.current.startsWith(trimmed)
    ) {
      EchoMindSocket.getInstance().streamTranscript(trimmed);
      lastSentText.current = trimmed;
    }
  }, []);

  const resetPartialTimer = useCallback(() => {
    if (partialFlushTimer.current) clearTimeout(partialFlushTimer.current);
    partialFlushTimer.current = null;
  }, []);

  // ─── Language Detection (Auto Mode) ───────────────────────────────────────

  const checkAndSwitchLanguage = useCallback((text: string) => {
    const settings = getVoiceSettings();
    if (settings.languageMode !== 'auto') return; // Only in auto mode

    const { language, sttLocale } = detectLanguageForSTT(text);

    if (sttLocale !== currentLocaleRef.current) {
      currentLocaleRef.current = sttLocale;
      setState(s => ({
        ...s,
        detectedLanguage: language,
        sttLocale,
      }));
    }
  }, []);

  // ─── Core STT Control ────────────────────────────────────────────────────

  const startSTT = useCallback(async (): Promise<boolean> => {
    const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!result.granted) {
      setState(s => ({
        ...s,
        captureState: 'error',
        error: 'Microphone permission denied. Enable in Settings.',
      }));
      return false;
    }

    const settings = getVoiceSettings();
    const locale = settings.languageMode === 'auto'
      ? currentLocaleRef.current
      : getSTTLocale(settings.languageMode);

    try {
      lastSentText.current = '';
      sessionSentences.current = [];
      wordCountSinceCheck.current = 0;

      ExpoSpeechRecognitionModule.start({
        lang: locale,
        interimResults: true,
        continuous: true,
      });

      currentLocaleRef.current = locale;
      setState(s => ({
        ...s,
        sttLocale: locale,
        detectedLanguage: locale === 'hi-IN' ? 'hi' : 'en',
      }));

      return true;
    } catch (e: any) {
      setState(s => ({
        ...s,
        captureState: 'error',
        error: `Failed to start: ${e.message}`,
      }));
      return false;
    }
  }, []);

  const stopSTT = useCallback(() => {
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      // Already stopped
    }
  }, []);

  // ─── Speech Recognition Events ───────────────────────────────────────────

  useSpeechRecognitionEvent('start', () => {
    const mode = captureModeRef.current;
    if (mode === 'manual_instant') {
      setState(s => ({
        ...s,
        captureState: 'recording',
        error: null,
        sentences: [],
      }));
      vibrate(50);
    } else if (mode === 'auto' || mode === 'manual_passive') {
      setState(s => ({
        ...s,
        captureState: 'passive_listening',
        error: null,
        sentences: [],
        partialTranscript: '',
      }));
    }
  });

  useSpeechRecognitionEvent('end', () => {
    resetPartialTimer();
    const currentState = captureStateRef.current;
    const mode = captureModeRef.current;

    if (currentState === 'recording' || currentState === 'speech_detected') {
      if (sessionSentences.current.length > 0) {
        const fullText = sessionSentences.current.join(' ');
        sendToBackend(fullText);
        setState(s => ({
          ...s,
          captureState: 'processing',
          partialTranscript: '',
        }));
        vibrate([0, 30, 60, 30]);
      } else {
        if (mode === 'auto' || mode === 'manual_passive') {
          autoRestartTimer.current = setTimeout(() => {
            if (captureModeRef.current) {
              startSTT();
            }
          }, AUTO_RESTART_DELAY_MS);
        } else {
          setState(s => ({ ...s, captureState: 'idle', captureMode: null }));
        }
      }
    } else {
      setState(s => ({ ...s, captureState: 'idle', partialTranscript: '' }));
    }
    isSpeechActive.current = false;
  });

  useSpeechRecognitionEvent('result', (event) => {
    const result = event.results[0];
    if (!result) return;

    const currentState = captureStateRef.current;
    const mode = captureModeRef.current;
    const settings = getVoiceSettings();

    if (event.isFinal) {
      resetPartialTimer();
      const text = result.transcript.trim();
      if (text.length > 0) {
        sessionSentences.current.push(text);
        setState(s => ({
          ...s,
          captureState: 'recording',
          sentences: [...s.sentences, text],
          partialTranscript: '',
        }));

        // Check language in auto mode
        wordCountSinceCheck.current += text.split(/\s+/).length;
        if (wordCountSinceCheck.current >= LANGUAGE_SWITCH_CHECK_INTERVAL) {
          checkAndSwitchLanguage(sessionSentences.current.join(' '));
          wordCountSinceCheck.current = 0;
        }

        // Reset silence timer
        if (mode !== 'manual_instant') {
          if (silenceTimer.current) clearTimeout(silenceTimer.current);
          silenceTimer.current = setTimeout(() => {
            stopSTT();
          }, settings.silenceTimeoutMs);
        }
      }
    } else {
      const currentPartial = result.transcript;
      
      // Transition from passive to speech_detected/recording
      if (
        (currentState === 'passive_listening' || currentState === 'speech_detected') &&
        currentPartial.trim().length > 0
      ) {
        if (!isSpeechActive.current) {
          isSpeechActive.current = true;
          if (speechDebounceTimer.current) clearTimeout(speechDebounceTimer.current);
          speechDebounceTimer.current = setTimeout(() => {
            setState(s => ({ ...s, captureState: 'recording' }));
            vibrate(40);
          }, SPEECH_DEBOUNCE_MS);

          setState(s => ({ ...s, captureState: 'speech_detected' }));
        }
      }

      setState(s => ({ ...s, partialTranscript: currentPartial }));

      // Silence timer
      if (mode !== 'manual_instant') {
        if (silenceTimer.current) clearTimeout(silenceTimer.current);
        silenceTimer.current = setTimeout(() => {
          stopSTT();
        }, settings.silenceTimeoutMs);
      }

      // Smart partial flush
      resetPartialTimer();
      if (currentPartial.length >= PARTIAL_FLUSH_CHARS) {
        partialFlushTimer.current = setTimeout(() => {
          sendToBackend(currentPartial);
        }, PARTIAL_FLUSH_TIMEOUT_MS);
      }
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    clearAllTimers();
    const mode = captureModeRef.current;

    // "no-speech" errors in passive mode — just restart
    if (
      event.error === 'no-speech' &&
      (mode === 'auto' || mode === 'manual_passive')
    ) {
      autoRestartTimer.current = setTimeout(() => {
        if (captureModeRef.current) {
          startSTT();
        }
      }, AUTO_RESTART_DELAY_MS);
      return;
    }

    setState(s => ({
      ...s,
      captureState: 'error',
      error: event.message || event.error || 'Speech recognition error',
    }));

    // Auto-recover from errors after 3s
    setTimeout(() => {
      setState(s => {
        if (s.captureState === 'error') {
          return { ...s, captureState: 'idle', captureMode: null, error: null };
        }
        return s;
      });
    }, 3000);
  });

  useSpeechRecognitionEvent('volumechange', (event) => {
    const raw = (event as any).value ?? 0;
    const normalized = Math.min(1, Math.max(0, (raw + 2) / 12));
    setState(s => ({ ...s, audioLevel: normalized }));
  });

  // ─── WebSocket Event Handling ─────────────────────────────────────────────

  useEffect(() => {
    const socket = EchoMindSocket.getInstance();

    const onMemorySaved = (data: any) => {
      setState(s => ({
        ...s,
        captureState: 'saved',
        sessionCount: s.sessionCount + 1,
        detectedLanguage: data?.data?.language || s.detectedLanguage,
      }));
      vibrate([0, 50, 100, 50]);

      savedTimer.current = setTimeout(() => {
        const mode = captureModeRef.current;
        if (mode === 'auto' || mode === 'manual_passive') {
          setState(s => ({ ...s, captureState: 'passive_listening', sentences: [], partialTranscript: '' }));
          startSTT();
        } else {
          setState(s => ({ ...s, captureState: 'idle', captureMode: null }));
        }
      }, SAVED_DISPLAY_DURATION_MS);
    };

    const onQueryResult = (data: any) => {
      setState(s => ({ ...s, captureState: 'idle' }));
    };

    const onError = (data: any) => {
      setState(s => ({
        ...s,
        captureState: 'error',
        error: data?.message || 'Backend processing error',
      }));
    };

    socket.on('MEMORY_SAVED', onMemorySaved);
    socket.on('QUERY_RESULT', onQueryResult);
    socket.on('ERROR', onError);

    return () => {
      socket.off('MEMORY_SAVED', onMemorySaved);
      socket.off('QUERY_RESULT', onQueryResult);
      socket.off('ERROR', onError);
    };
  }, [vibrate, startSTT]);

  // ─── Cleanup ──────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      clearAllTimers();
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch {}
    };
  }, [clearAllTimers]);

  // ─── Public API: Mode Controls ────────────────────────────────────────────

  /**
   * Enable Auto Voice Detection mode.
   * Requires user consent for passive listening.
   */
  const enableAutoMode = useCallback(async () => {
    if (!isPassiveListeningAllowed()) {
      setState(s => ({
        ...s,
        captureState: 'consent_required',
        error: 'Passive listening requires your consent. Enable in Settings.',
      }));
      return;
    }

    clearAllTimers();
    isManualInstantRef.current = false;
    setState(s => ({
      ...s,
      captureMode: 'auto',
      captureState: 'passive_listening',
      error: null,
      sentences: [],
      partialTranscript: '',
    }));
    vibrate(30);
    await startSTT();
  }, [clearAllTimers, startSTT, vibrate]);

  /**
   * Toggle Manual Passive Capture mode.
   */
  const togglePassiveMode = useCallback(async () => {
    if (captureModeRef.current === 'manual_passive') {
      clearAllTimers();
      stopSTT();
      setState(s => ({
        ...s,
        captureMode: null,
        captureState: 'idle',
        sentences: [],
        partialTranscript: '',
      }));
      vibrate(20);
      return;
    }

    clearAllTimers();
    isManualInstantRef.current = false;
    setState(s => ({
      ...s,
      captureMode: 'manual_passive',
      captureState: 'passive_listening',
      error: null,
      sentences: [],
      partialTranscript: '',
    }));
    vibrate(30);
    await startSTT();
  }, [clearAllTimers, startSTT, stopSTT, vibrate]);

  /**
   * Start Manual Instant Record mode (hold-to-record).
   */
  const startInstantRecord = useCallback(async () => {
    clearAllTimers();
    isManualInstantRef.current = true;
    setState(s => ({
      ...s,
      captureMode: 'manual_instant',
      captureState: 'recording',
      error: null,
      sentences: [],
      partialTranscript: '',
    }));
    vibrate(50);
    await startSTT();
  }, [clearAllTimers, startSTT, vibrate]);

  /**
   * Stop Manual Instant Record (release button).
   */
  const stopInstantRecord = useCallback(() => {
    isManualInstantRef.current = false;
    stopSTT();
    vibrate(30);
  }, [stopSTT, vibrate]);

  /**
   * Disable all capture modes and return to idle.
   */
  const disableCapture = useCallback(() => {
    clearAllTimers();
    stopSTT();
    isManualInstantRef.current = false;
    isSpeechActive.current = false;
    setState(s => ({
      ...s,
      captureMode: null,
      captureState: 'idle',
      sentences: [],
      partialTranscript: '',
      error: null,
    }));
  }, [clearAllTimers, stopSTT]);

  /**
   * Dismiss error and return to idle.
   */
  const dismissError = useCallback(() => {
    setState(s => ({
      ...s,
      captureState: 'idle',
      captureMode: null,
      error: null,
    }));
  }, []);

  /**
   * Switch STT language manually.
   */
  const setLanguage = useCallback((mode: LanguageMode) => {
    const locale = getSTTLocale(mode);
    currentLocaleRef.current = locale;
    setState(s => ({
      ...s,
      sttLocale: locale,
      detectedLanguage: mode === 'hi' ? 'hi' : mode === 'auto' ? s.detectedLanguage : 'en',
    }));
  }, []);

  return {
    ...state,
    // Mode controls
    enableAutoMode,
    togglePassiveMode,
    startInstantRecord,
    stopInstantRecord,
    disableCapture,
    dismissError,
    setLanguage,
  };
};

export default useEchoMindVoice;

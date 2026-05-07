import { createLogger } from '../utils/logger.js';

const log = createLogger('transcript-sync');

/**
 * Transcript Synchronization Layer
 *
 * Whisper streaming produces evolving partial outputs that overlap, duplicate,
 * and self-correct. This layer:
 *
 * 1. Deduplicates overlapping transcript segments
 * 2. Reconciles partial → final transitions
 * 3. Detects sentence boundaries for segmentation
 * 4. Emits finalized, stable transcript blocks
 * 5. Prevents downstream NLP from processing duplicated text
 *
 * Per-session state — create one instance per WebSocket connection.
 */

interface TranscriptSegment {
  text: string;
  isFinal: boolean;
  timestamp: number;
  sequenceId: number;
}

interface FinalizedBlock {
  text: string;
  segments: string[];
  startTime: number;
  endTime: number;
  sequenceRange: [number, number];
}

export class TranscriptSynchronizer {
  private segments: TranscriptSegment[] = [];
  private finalizedTexts: Set<string> = new Set();
  private lastFinalizedText = '';
  private sequenceCounter = 0;
  private pendingPartial = '';
  private lastPartialTimestamp = 0;

  // Configurable thresholds
  private readonly SIMILARITY_THRESHOLD = 0.75;
  private readonly STALE_PARTIAL_MS = 3000;
  private readonly MAX_SEGMENTS_BUFFER = 50;

  /**
   * Process an incoming transcript segment (partial or final).
   * Returns finalized text if a stable block is ready, null otherwise.
   */
  process(text: string, isFinal: boolean): string | null {
    const trimmed = text.trim();
    if (!trimmed) return null;

    const now = Date.now();
    const sequenceId = this.sequenceCounter++;

    const segment: TranscriptSegment = {
      text: trimmed,
      isFinal,
      timestamp: now,
      sequenceId,
    };

    this.segments.push(segment);

    // Trim old segments to prevent memory leaks
    if (this.segments.length > this.MAX_SEGMENTS_BUFFER) {
      this.segments = this.segments.slice(-this.MAX_SEGMENTS_BUFFER);
    }

    if (isFinal) {
      return this.handleFinal(segment);
    } else {
      return this.handlePartial(segment);
    }
  }

  /**
   * Flush any pending partial transcript (e.g., on session end).
   * Returns remaining text or null.
   */
  flush(): string | null {
    if (this.pendingPartial && !this.isDuplicate(this.pendingPartial)) {
      const text = this.pendingPartial;
      this.pendingPartial = '';
      this.finalizedTexts.add(this.normalizeForComparison(text));
      this.lastFinalizedText = text;
      return text;
    }
    this.pendingPartial = '';
    return null;
  }

  /**
   * Reset all state (new session).
   */
  reset(): void {
    this.segments = [];
    this.finalizedTexts.clear();
    this.lastFinalizedText = '';
    this.sequenceCounter = 0;
    this.pendingPartial = '';
    this.lastPartialTimestamp = 0;
  }

  /**
   * Get all finalized text joined as a single transcript.
   */
  getFullTranscript(): string {
    return Array.from(this.finalizedTexts).join(' ');
  }

  // ─── Private ────────────────────────────────────────────────

  private handleFinal(segment: TranscriptSegment): string | null {
    const text = segment.text;

    // Check for duplicates
    if (this.isDuplicate(text)) {
      log.debug({ text: text.substring(0, 40) }, 'Duplicate final segment — skipping');
      return null;
    }

    // Remove overlap with last finalized text
    const deduped = this.removeOverlap(text);
    if (!deduped || deduped.length < 3) {
      return null;
    }

    // Mark as finalized
    this.finalizedTexts.add(this.normalizeForComparison(deduped));
    this.lastFinalizedText = deduped;
    this.pendingPartial = ''; // Clear any pending partial

    log.debug({ text: deduped.substring(0, 60), seq: segment.sequenceId }, 'Final segment accepted');
    return deduped;
  }

  private handlePartial(segment: TranscriptSegment): string | null {
    const now = segment.timestamp;

    // If there's a stale pending partial, flush it
    if (
      this.pendingPartial &&
      now - this.lastPartialTimestamp > this.STALE_PARTIAL_MS &&
      !this.isDuplicate(this.pendingPartial)
    ) {
      const staleText = this.pendingPartial;
      this.finalizedTexts.add(this.normalizeForComparison(staleText));
      this.lastFinalizedText = staleText;
      this.pendingPartial = segment.text;
      this.lastPartialTimestamp = now;
      log.debug({ text: staleText.substring(0, 40) }, 'Stale partial flushed');
      return staleText;
    }

    // Update pending partial (latest always wins for partials)
    this.pendingPartial = segment.text;
    this.lastPartialTimestamp = now;

    return null; // Partials don't emit until finalized or stale
  }

  /**
   * Check if text is a duplicate of previously finalized content.
   */
  private isDuplicate(text: string): boolean {
    const normalized = this.normalizeForComparison(text);

    // Exact match
    if (this.finalizedTexts.has(normalized)) return true;

    // Substring of last finalized text
    if (this.lastFinalizedText && this.lastFinalizedText.includes(text)) return true;
    if (text && text.includes(this.lastFinalizedText) && this.lastFinalizedText.length > 10) return false; // Extension, not duplicate

    // Similarity check (Jaccard on word set)
    const similarity = this.wordSimilarity(text, this.lastFinalizedText);
    if (similarity >= this.SIMILARITY_THRESHOLD) return true;

    return false;
  }

  /**
   * Remove overlapping prefix with the last finalized text.
   * Handles the case where STT emits "Hello world" followed by "Hello world how are you".
   */
  private removeOverlap(text: string): string {
    if (!this.lastFinalizedText) return text;

    const lastWords = this.lastFinalizedText.toLowerCase().split(/\s+/);
    const newWords = text.toLowerCase().split(/\s+/);
    const originalWords = text.split(/\s+/);

    // Find longest overlapping suffix of last → prefix of new
    let overlapLength = 0;
    const maxOverlap = Math.min(lastWords.length, newWords.length);

    for (let len = 1; len <= maxOverlap; len++) {
      const lastSuffix = lastWords.slice(-len).join(' ');
      const newPrefix = newWords.slice(0, len).join(' ');
      if (lastSuffix === newPrefix) {
        overlapLength = len;
      }
    }

    if (overlapLength > 0) {
      return originalWords.slice(overlapLength).join(' ');
    }

    return text;
  }

  /**
   * Jaccard word-set similarity: |A ∩ B| / |A ∪ B|
   */
  private wordSimilarity(a: string, b: string): number {
    if (!a || !b) return 0;
    const setA = new Set(a.toLowerCase().split(/\s+/));
    const setB = new Set(b.toLowerCase().split(/\s+/));
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);
    return union.size === 0 ? 0 : intersection.size / union.size;
  }

  private normalizeForComparison(text: string): string {
    return text.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
  }
}

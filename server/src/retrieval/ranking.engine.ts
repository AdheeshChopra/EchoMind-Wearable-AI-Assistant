import { createLogger } from '../utils/logger.js';

const log = createLogger('ranking');

/**
 * Multi-Signal Ranking Engine
 *
 * Replaces naive vector-only similarity with a weighted composite score using:
 *  1. Semantic similarity (pgvector cosine distance)
 *  2. Keyword match (full-text search rank)
 *  3. Recency decay (exponential time decay)
 *  4. Importance weight (AI-assigned importance score)
 *  5. Reminder priority (upcoming reminders ranked higher)
 *  6. Follow-up relevance (tasks pending action ranked higher)
 *
 * All signals are normalized to [0,1] before weighting.
 */

// ─── Configuration ────────────────────────────────────────────

export interface RankingWeights {
  semantic: number;
  keyword: number;
  recency: number;
  importance: number;
  reminderPriority: number;
  followUpRelevance: number;
}

export const DEFAULT_WEIGHTS: RankingWeights = {
  semantic: 0.35,
  keyword: 0.20,
  recency: 0.15,
  importance: 0.12,
  reminderPriority: 0.10,
  followUpRelevance: 0.08,
};

// ─── Types ────────────────────────────────────────────────────

export interface RankableMemory {
  id: string;
  title: string;
  summary: string;
  category: string;
  importance: number;
  createdAt: Date | string;
  tags: string[];

  // Search scores (set by retrieval layer)
  similarity?: number;      // 0-1 from pgvector
  keywordRank?: number;     // Position in keyword results (0-indexed)

  // Reminder metadata
  reminderStatus?: string;
  reminderDueAt?: Date | string | null;
  reminderPriority?: string;

  // Follow-up metadata
  nextActionDate?: Date | string | null;

  // Raw data passthrough
  [key: string]: any;
}

export interface RankedMemory extends RankableMemory {
  compositeScore: number;
  scoreBreakdown: {
    semantic: number;
    keyword: number;
    recency: number;
    importance: number;
    reminderPriority: number;
    followUpRelevance: number;
  };
}

// ─── Ranking Engine ───────────────────────────────────────────

/**
 * Rank a set of memories using multi-signal composite scoring.
 * Returns memories sorted by descending composite score.
 */
export function rankMemories(
  memories: RankableMemory[],
  weights: RankingWeights = DEFAULT_WEIGHTS,
  limit: number = 10,
): RankedMemory[] {
  if (memories.length === 0) return [];

  const now = Date.now();
  const totalCount = memories.length;

  const ranked: RankedMemory[] = memories.map((mem, idx) => {
    // 1. Semantic score (already 0-1 from pgvector)
    const semantic = mem.similarity ?? 0;

    // 2. Keyword rank → normalized score (higher rank = higher score)
    const keyword = mem.keywordRank !== undefined
      ? Math.max(0, 1 - (mem.keywordRank / Math.max(totalCount, 1)))
      : 0;

    // 3. Recency: exponential decay — half-life of 7 days
    const createdAt = new Date(mem.createdAt).getTime();
    const ageMs = now - createdAt;
    const halfLifeMs = 7 * 24 * 60 * 60 * 1000; // 7 days
    const recency = Math.exp(-0.693 * (ageMs / halfLifeMs)); // ln(2) ≈ 0.693

    // 4. Importance (already 0-1 from AI extraction)
    const importance = clamp(mem.importance ?? 0.5);

    // 5. Reminder priority
    const reminderPriority = computeReminderScore(mem, now);

    // 6. Follow-up relevance
    const followUpRelevance = computeFollowUpScore(mem, now);

    // Composite score
    const compositeScore =
      weights.semantic * semantic +
      weights.keyword * keyword +
      weights.recency * recency +
      weights.importance * importance +
      weights.reminderPriority * reminderPriority +
      weights.followUpRelevance * followUpRelevance;

    return {
      ...mem,
      compositeScore,
      scoreBreakdown: {
        semantic,
        keyword,
        recency,
        importance,
        reminderPriority,
        followUpRelevance,
      },
    };
  });

  // Sort by composite score descending
  ranked.sort((a, b) => b.compositeScore - a.compositeScore);

  log.info({
    inputCount: memories.length,
    outputCount: Math.min(ranked.length, limit),
    topScore: ranked[0]?.compositeScore.toFixed(3),
  }, 'Memories ranked');

  return ranked.slice(0, limit);
}

// ─── Signal Scorers ───────────────────────────────────────────

/**
 * Score based on reminder urgency.
 * Upcoming/overdue reminders score higher.
 */
function computeReminderScore(mem: RankableMemory, now: number): number {
  if (!mem.reminderDueAt || mem.reminderStatus === 'completed') return 0;

  const dueAt = new Date(mem.reminderDueAt).getTime();
  const hoursUntilDue = (dueAt - now) / (60 * 60 * 1000);

  // Priority multiplier
  const priorityMultiplier =
    mem.reminderPriority === 'high' ? 1.0 :
    mem.reminderPriority === 'medium' ? 0.6 :
    0.3;

  // Urgency curve: peaks around due time
  if (hoursUntilDue < 0) {
    // Overdue — high urgency that decays over time
    return clamp(priorityMultiplier * Math.exp(hoursUntilDue / 24));
  } else if (hoursUntilDue < 24) {
    // Due within 24 hours — highest urgency
    return clamp(priorityMultiplier * (1 - hoursUntilDue / 24));
  } else {
    // More than 24h out — low urgency
    return clamp(priorityMultiplier * 0.2);
  }
}

/**
 * Score based on follow-up/action date proximity.
 * Tasks needing action soon score higher.
 */
function computeFollowUpScore(mem: RankableMemory, now: number): number {
  if (mem.category !== 'Task' || !mem.nextActionDate) return 0;

  const actionDate = new Date(mem.nextActionDate).getTime();
  const hoursUntilAction = (actionDate - now) / (60 * 60 * 1000);

  if (hoursUntilAction < 0) {
    // Overdue action
    return clamp(Math.exp(hoursUntilAction / 48)); // Slower decay
  } else if (hoursUntilAction < 48) {
    return clamp(1 - hoursUntilAction / 48);
  }
  return 0.1;
}

function clamp(val: number): number {
  return Math.max(0, Math.min(1, val));
}

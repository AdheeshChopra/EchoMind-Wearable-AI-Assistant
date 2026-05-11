import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import { createLogger, withCorrelation } from '../utils/logger.js';
import { AuthService } from '../auth/auth.service.js';
import { extractMemory, answerQuery } from '../ai/gemini.service.js';
import { memoryService } from '../services/memory.service.js';
import { ReminderService } from '../reminders/reminder.service.js';
import { retrievalService } from '../retrieval/retrieval.service.js';
import { ReminderExtractionSchema } from '@echomind/types';
import { CONSTANTS } from '../config/constants.js';
import { detectLanguage, normalizeTranscript } from '../nlp/language.service.js';
import { isQueryIntent, extractEntities } from '../nlp/entity-extractor.js';
import { TranscriptSynchronizer } from '../streaming/transcript-sync.js';
import { enqueueEmbedding } from '../queues/embedding.queue.js';
import type {
  WSAuthMessage,
  WSTextTranscript,
  WSMemorySaved,
  WSError,
  WSStatusChange,
  AuthUser,
} from '@echomind/types';
import { randomUUID } from 'crypto';

const log = createLogger('websocket');

interface AuthenticatedSocket extends WebSocket {
  isAlive: boolean;
  user?: AuthUser;
  sessionId: string;
  transcriptSync: TranscriptSynchronizer;
}

/**
 * Production WebSocket server with JWT authentication and bilingual support.
 *
 * Protocol:
 * 1. Client connects → must send AUTH message with JWT within 5 seconds
 * 2. Server validates token → sends AUTH_OK or AUTH_FAIL
 * 3. After auth, client can send:
 *    - TEXT_TRANSCRIPT: Raw text for memory extraction (voice or typed)
 *    - QUERY: Semantic search query (supports English + Hindi)
 *    - PING: Heartbeat
 * 4. Server processes and responds with:
 *    - MEMORY_SAVED: Memory extracted and stored
 *    - QUERY_RESULT: Semantic search results
 *    - STATUS_CHANGE: Pipeline status updates
 *    - ERROR: Error messages
 *
 * Bilingual Pipeline:
 * - Detects language (en / hi / hi-en)
 * - Routes to appropriate Gemini prompt
 * - NLP entity extraction (bilingual)
 * - Embedding generation (queued via BullMQ)
 */
export function setupWebSocket(wss: WebSocketServer) {
  // ─── Heartbeat ──────────────────────────────────────────────
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      const client = ws as AuthenticatedSocket;
      if (!client.isAlive) {
        log.info({ sessionId: client.sessionId }, 'Client heartbeat timeout — terminating');
        client.terminate();
        return;
      }
      client.isAlive = false;
      client.ping();
    });
  }, CONSTANTS.WS_HEARTBEAT_INTERVAL_MS);

  wss.on('close', () => clearInterval(interval));

  // ─── Connection Handler ─────────────────────────────────────
  wss.on('connection', (ws: WebSocket, _req: IncomingMessage) => {
    const client = ws as AuthenticatedSocket;
    client.isAlive = true;
    client.sessionId = randomUUID();
    client.transcriptSync = new TranscriptSynchronizer();

    const connLog = withCorrelation(log, client.sessionId);
    connLog.info('Client connected — awaiting authentication');

    // ── Auth Timeout (5 seconds to authenticate) ──
    const authTimeout = setTimeout(() => {
      if (!client.user) {
        sendMessage(client, { type: 'AUTH_FAIL', message: 'Authentication timeout' });
        client.close(4001, 'Authentication timeout');
      }
    }, 5000);

    client.on('pong', () => { client.isAlive = true; });

    // ─── Message Handler ──────────────────────────────────────
    client.on('message', async (raw: Buffer) => {
      let data: any;

      try {
        data = JSON.parse(raw.toString());
      } catch {
        // Not JSON — ignore (binary audio for future phases)
        return;
      }

      // ── Authentication ──
      if (data.type === 'AUTH') {
        clearTimeout(authTimeout);
        try {
          const authMsg = data as WSAuthMessage;
          const user = AuthService.verifyAccessToken(authMsg.token);
          client.user = user;
          sendMessage(client, { type: 'AUTH_OK' });
          connLog.info({ userId: user.userId }, 'Client authenticated');
        } catch (err) {
          sendMessage(client, { type: 'AUTH_FAIL', message: 'Invalid token' });
          client.close(4002, 'Invalid token');
        }
        return;
      }

      // ── Reject unauthenticated messages ──
      if (!client.user) {
        sendMessage(client, { type: 'AUTH_FAIL', message: 'Not authenticated' });
        return;
      }

      // ── Ping/Pong ──
      if (data.type === 'PING') {
        sendMessage(client, { type: 'PONG' });
        return;
      }

      // ── Text Transcript (bilingual) ──
      if (data.type === 'TEXT_TRANSCRIPT') {
        await handleTextTranscript(client, data as WSTextTranscript, connLog);
        return;
      }

      // ── Semantic Query (bilingual) ──
      if (data.type === 'QUERY') {
        await handleQuery(client, data, connLog);
        return;
      }

      connLog.warn({ type: data.type }, 'Unknown message type');
    });

    // ─── Disconnect ───────────────────────────────────────────
    client.on('close', async () => {
      clearTimeout(authTimeout);

      // Flush any remaining partial transcript before cleanup
      if (client.user) {
        const flushed = client.transcriptSync.flush();
        if (flushed) {
          connLog.info({ textLength: flushed.length }, 'Flushing remaining partial on disconnect');
          // Process the flushed text asynchronously (best-effort)
          handleTextTranscript(
            client,
            { type: 'TEXT_TRANSCRIPT', text: flushed } as WSTextTranscript,
            connLog,
          ).catch(err => connLog.warn({ err }, 'Failed to process flushed partial'));
        }
      }

      client.transcriptSync.reset();
      connLog.info('Client disconnected');
    });

    client.on('error', (err) => {
      connLog.error({ err }, 'WebSocket error');
    });
  });

  return { interval };
}

// ─── Text Transcript Handler (Bilingual) ──────────────────────
async function handleTextTranscript(
  client: AuthenticatedSocket,
  msg: WSTextTranscript,
  connLog: ReturnType<typeof withCorrelation>,
) {
  const rawText = msg.text?.trim();
  if (!rawText || rawText.length < CONSTANTS.TRANSCRIPT_MIN_LENGTH) return;

  // Pass through transcript synchronizer to deduplicate streaming partials
  const isFinal = msg.isFinal !== false; // Default to final if not specified
  const syncedText = client.transcriptSync.process(rawText, isFinal);

  // Synchronizer returns null if this is a duplicate or non-finalized partial
  if (!syncedText) return;

  const text = normalizeTranscript(syncedText);
  const userId = client.user!.userId;
  const langResult = detectLanguage(text);

  connLog.info({
    textLength: text.length,
    language: langResult.language,
    confidence: langResult.confidence,
    codeSwitched: langResult.isCodeSwitched,
  }, 'Processing bilingual transcript');

  // Check if this is a query (semantic search) vs a memory to store
  if (isQueryIntent(text)) {
    connLog.info('Detected query intent — routing to search');
    await handleQuery(client, { text, language: langResult.language }, connLog);
    return;
  }

  // Status: analyzing
  sendMessage(client, {
    type: 'STATUS_CHANGE',
    status: 'analyzing',
    correlationId: msg.correlationId,
    language: langResult.language,
  });

  try {
    // Extract entities (bilingual NLP)
    const entities = extractEntities(text);
    connLog.debug({
      people: entities.people,
      dates: entities.dates,
      tasks: entities.tasks,
    }, 'NLP entities extracted');

    // AI memory extraction (bilingual Gemini)
    const extraction = await extractMemory(text);
    if (!extraction) {
      sendMessage(client, {
        type: 'ERROR',
        message: 'Could not extract memory from transcript',
        code: 'AI_PROCESSING_FAILED',
      });
      return;
    }

    // Save memory (embedding generated async via BullMQ)
    const memory = await memoryService.saveFromExtraction(userId, extraction, [{ speakerId: 'Speaker 0', text, startTime: 0, endTime: 0 }], 'voice');

    // Enqueue embedding generation (background job)
    await enqueueEmbedding({
      memoryId: memory.id,
      title: extraction.title,
      summary: extraction.summary,
    });

    // Save reminder if extracted
    let reminder = null;
    if (extraction.reminder) {
      const parsed = ReminderExtractionSchema.safeParse(extraction.reminder);
      if (parsed.success) {
        const savedReminder = await ReminderService.createReminder(userId, memory.id, parsed.data);
        reminder = {
          id: savedReminder.id,
          title: savedReminder.title,
          dueAt: savedReminder.dueAt.toISOString(),
        };
      }
    }

    // Send result with language metadata
    const response: WSMemorySaved = {
      type: 'MEMORY_SAVED',
      data: {
        id: memory.id,
        title: memory.title,
        summary: memory.summary,
        category: memory.category,
        importance: memory.importance,
        language: langResult.language,
        segments: (memory as any).segments,
      },
      reminder,
    };

    sendMessage(client, response);
    connLog.info({
      memoryId: memory.id,
      language: langResult.language,
      hasReminder: !!reminder,
    }, 'Memory saved via WebSocket');
  } catch (err) {
    connLog.error({ err }, 'Failed to process transcript');
    sendMessage(client, {
      type: 'ERROR',
      message: 'Failed to process transcript',
      code: 'INTERNAL_ERROR',
    } as WSError);
  }
}

// ─── Semantic Query Handler (Bilingual) ───────────────────────
async function handleQuery(
  client: AuthenticatedSocket,
  msg: { text: string; language?: string },
  connLog: ReturnType<typeof withCorrelation>,
) {
  const query = normalizeTranscript(msg.text || '');
  if (!query || query.length < 2) return;

  const userId = client.user!.userId;
  const langResult = detectLanguage(query);

  connLog.info({ query: query.substring(0, 50), language: langResult.language }, 'Processing query');

  sendMessage(client, {
    type: 'STATUS_CHANGE',
    status: 'searching',
    language: langResult.language,
  });

  try {
    // Hybrid semantic search (pgvector + keyword)
    const results = await retrievalService.hybridSearch(userId, query);

    if (results.length === 0) {
      sendMessage(client, {
        type: 'QUERY_RESULT',
        query,
        results: [],
        aiAnswer: langResult.language === 'en'
          ? "I don't have any memories matching that query yet."
          : 'अभी इस query से related कोई memory नहीं मिली।',
      });
      return;
    }

    // Build context from results
    const contextSnippets = results.slice(0, 5).map((m, i) =>
      `${i + 1}. [${m.category}] ${m.title}: ${m.summary}`
    ).join('\n');

    // AI-powered answer from memory context
    const aiAnswer = await answerQuery(query, contextSnippets, langResult.language);

    sendMessage(client, {
      type: 'QUERY_RESULT',
      query,
      language: langResult.language,
      results: results.slice(0, 10).map(m => ({
        id: m.id,
        title: m.title,
        summary: m.summary,
        category: m.category,
        importance: m.importance,
        createdAt: m.createdAt,
      })),
      aiAnswer,
    });

    connLog.info({ resultCount: results.length }, 'Query answered');
  } catch (err) {
    connLog.error({ err }, 'Query failed');
    sendMessage(client, {
      type: 'ERROR',
      message: 'Search query failed',
      code: 'QUERY_FAILED',
    } as WSError);
  }
}

// ─── Helper ───────────────────────────────────────────────────
function sendMessage(client: WebSocket, message: any) {
  if (client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify({ ...message, timestamp: Date.now() }));
  }
}

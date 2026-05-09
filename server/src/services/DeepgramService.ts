import { DeepgramClient } from '@deepgram/sdk';
import fs from 'fs';
import { env } from '../config/env.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('deepgram-service');

export interface DeepgramSegment {
  speakerId: string;
  text: string;
  startTime: number;
  endTime: number;
}

export class DeepgramService {
  private client: DeepgramClient;

  constructor() {
    this.client = new DeepgramClient({ apiKey: env.DEEPGRAM_API_KEY });
  }

  /**
   * Transcribe a local audio file with speaker diarization.
   * @param filePath Path to the local audio file.
   * @returns Array of speaker-labeled segments.
   */
  async transcribeFile(filePath: string, language: string = 'en'): Promise<DeepgramSegment[]> {
    try {
      log.info({ filePath, language }, 'Starting diarized transcription with Deepgram');

      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const audioBuffer = fs.readFileSync(filePath);

      const response = await (this.client.listen.v1.media as any).transcribeFile(
        audioBuffer,
        {
          model: 'nova-2',
          language,
          smart_format: true,
          diarize: true,
          utterances: true,
          punctuate: true,
        }
      );

      // In SDK v5, the result is often the response itself or has a results property
      const result = response.result || response;
      
      log.info({ resultKeys: Object.keys(result) }, 'Received Deepgram response');

      // Extract utterances which contain speaker and timing info
      const utterances = result.results?.utterances || [];
      
      const segments: DeepgramSegment[] = utterances.map((u: any) => ({
        speakerId: `Speaker ${u.speaker}`,
        text: u.transcript,
        startTime: u.start,
        endTime: u.end,
      }));

      log.info({ segmentCount: segments.length }, 'Diarized transcription complete');
      return segments;
    } catch (err) {
      log.error({ err, filePath }, 'Deepgram transcription failed');
      throw err;
    }
  }
}

export const deepgramService = new DeepgramService();

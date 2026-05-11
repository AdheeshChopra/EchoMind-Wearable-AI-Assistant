import { DeepgramClient } from '@deepgram/sdk';
import 'dotenv/config';

async function check() {
  const client = new DeepgramClient({ apiKey: process.env.DEEPGRAM_API_KEY || 'fake' });
  console.log('Listen:', typeof client.listen);
  console.log('V1:', typeof (client.listen as any).v1);
  console.log('Media:', typeof (client.listen as any).v1.media);
  console.log('TranscribeFile:', typeof (client.listen as any).v1.media.transcribeFile);
}

check().catch(console.error);

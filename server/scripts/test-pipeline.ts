import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';

const API_URL = 'http://localhost:8080/api';

async function testPipeline() {
  console.log('🚀 Starting EchoMind-AI Backend Pipeline Test');
  console.log('--------------------------------------------');

  try {
    console.log('1. Registering test device...');
    const regResponse = await axios.post(`${API_URL}/auth/register`, {
      deviceId: 'test-device-' + Date.now(),
      platform: 'android',
      deviceName: 'Test Runner',
    });

    const token = regResponse.data.data.accessToken;
    console.log('   ✅ Authenticated. Token acquired.');

    const headers = { Authorization: `Bearer ${token}` };

    console.log('\n2. Uploading audio file...');
    const audioPath = path.resolve('test_audio.wav');
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Test audio file not found at ${audioPath}`);
    }

    const form = new FormData();
    form.append('audio', fs.createReadStream(audioPath));

    const uploadResponse = await axios.post(`${API_URL}/memories/upload`, form, {
      headers: {
        ...headers,
        ...form.getHeaders(),
      },
    });

    console.log('   ✅ Upload successful! Job queued:', JSON.stringify(uploadResponse.data.data, null, 2));
    const memoryId = uploadResponse.data.data.memoryId;

    console.log('\n3. Waiting for AI processing (45s)...');
    console.log('   (Deepgram transcription + Gemini extraction + pgvector embedding)');
    await new Promise(resolve => setTimeout(resolve, 45000));

    console.log('\n4. Verifying memory creation...');
    const getResponse = await axios.get(`${API_URL}/memories`, { headers });
    const memories = getResponse.data.data;
    
    const processedMemory = memories.find((m: any) => m.id === memoryId);
    if (processedMemory && processedMemory.status === 'processed') {
      console.log('   ✅ SUCCESS: Memory processed successfully.');
      console.log('   Title:', processedMemory.title);
      console.log('   Summary:', processedMemory.summary?.substring(0, 100) + '...');
    } else if (processedMemory) {
      console.log(`   ⏳ Status: ${processedMemory.status}. Still working?`);
    } else {
      console.warn('   ❌ FAILED: Memory not found in list.');
    }

    console.log('\n5. Testing semantic search...');
    const searchResponse = await axios.get(`${API_URL}/memories/search`, {
      headers,
      params: { query: 'test conversation' },
    });
    
    if (searchResponse.data.success) {
      console.log(`   ✅ Search successful! Found ${searchResponse.data.data.length} matches.`);
      if (searchResponse.data.data.length > 0) {
        console.log('   Top match title:', searchResponse.data.data[0].title);
        console.log('   Score:', searchResponse.data.data[0].score);
      }
    } else {
      console.error('   ❌ Search failed:', searchResponse.data.error);
    }

    console.log('\n--------------------------------------------');
    console.log('🏁 Pipeline test sequence completed.');
  } catch (error: any) {
    console.error('\n❌ ERROR during pipeline test:');
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Data:`, JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(`   Message: ${error.message}`);
    }
    process.exit(1);
  }
}

testPipeline();

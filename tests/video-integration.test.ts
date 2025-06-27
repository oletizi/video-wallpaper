import { describe, it, expect } from 'vitest';
import fetch from 'node-fetch';
import FormData from 'form-data';
import * as fs from 'fs';
import * as path from 'path';

const API_URL = 'http://localhost:4321'; // Adjust if running on a different port
const TEST_AUDIO_PATH = path.join(__dirname, 'test-audio-short.mp3');

function getResultFilePath(jobId: string) {
  const os = require('os');
  return `${os.tmpdir()}/vw_result_${jobId}.json`;
}

describe('Video Generation Integration', () => {
  it('should upload audio and generate a video', async () => {
    // 1. Upload audio file
    const formData = new FormData();
    formData.append('audio', fs.createReadStream(TEST_AUDIO_PATH), {
      filename: 'test-audio.mp3',
      contentType: 'audio/mp3',
    });
    formData.append('title', 'Integration Test');
    formData.append('stylePreset', 'default');
    formData.append('guest', 'Test Guest');
    formData.append('sponsor', 'Test Sponsor');

    const uploadRes = await fetch(`${API_URL}/api/upload`, {
      method: 'POST',
      body: formData,
      headers: formData.getHeaders(),
    });
    expect(uploadRes.status).toBe(202);
    const uploadJson = await uploadRes.json() as any;
    expect(uploadJson.success).toBe(true);
    expect(uploadJson.jobId).toBeDefined();
    const jobId = uploadJson.jobId;

    // 2. Wait for the result file to appear (poll every 2s, up to 3 min)
    const resultFile = getResultFilePath(jobId);
    let result = null;
    let attempts = 0;
    const maxAttempts = 90; // 3 minutes
    while (attempts < maxAttempts) {
      if (fs.existsSync(resultFile)) {
        result = JSON.parse(fs.readFileSync(resultFile, 'utf-8'));
        break;
      }
      await new Promise((r) => setTimeout(r, 2000));
      attempts++;
    }
    expect(result).toBeDefined();
    expect(result.videoPath).toBeDefined();
    expect(fs.existsSync(result.videoPath)).toBe(true);
  }, 200_000); // 200s timeout
}); 
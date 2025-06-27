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

describe('Creative Brief Conformance Integration', () => {
  it('should process audio and produce a YouTube-ready, branded, AI-visual video', async () => {
    // 1. Upload audio with all metadata
    const formData = new FormData();
    formData.append('audio', fs.createReadStream(TEST_AUDIO_PATH), {
      filename: 'test-audio.mp3',
      contentType: 'audio/mp3',
    });
    formData.append('title', 'Creative Brief Test Episode');
    formData.append('stylePreset', "'80s Retro Chromatic");
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
    expect(result.success).toBe(true);
    expect(result.videoPath).toBeDefined();
    expect(result.thumbnailPath).toBeDefined();
    expect(result.duration).toBeGreaterThan(0);
    expect(result.jobId).toBe(jobId);
    expect(result.analysis).toBeDefined();
    expect(Array.isArray(result.analysis.rms)).toBe(true);
    expect(Array.isArray(result.analysis.vocalEnergy)).toBe(true);
    expect(Array.isArray(result.analysis.silence)).toBe(true);
    expect(fs.existsSync(result.videoPath)).toBe(true);
    expect(fs.existsSync(result.thumbnailPath)).toBe(true);
    expect(result.videoPath.endsWith('.mp4')).toBe(true);
    expect(result.thumbnailPath.endsWith('.jpg') || result.thumbnailPath.endsWith('.png')).toBe(true);

    // 3. Check that the video is not the temp video (overlay step ran)
    expect(result.videoPath.includes('final_')).toBe(true);

    // 4. Check that the video is a valid MP4 (basic check: file starts with ftyp)
    const videoFd = fs.openSync(result.videoPath, 'r');
    const header = Buffer.alloc(12);
    fs.readSync(videoFd, header, 0, 12, 0);
    fs.closeSync(videoFd);
    expect(header.toString('utf8', 4, 8)).toBe('ftyp');
  }, 200_000); // 200s timeout
}); 
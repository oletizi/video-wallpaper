import { describe, it, expect } from 'vitest';
import fetch from 'node-fetch';
import FormData from 'form-data';
import * as fs from 'fs';
import * as path from 'path';

const API_URL = 'http://localhost:4321';
const TEST_AUDIO_PATH = path.join(__dirname, 'test-audio-short.mp3');

function getResultFilePath(jobId: string) {
  const os = require('os');
  return `${os.tmpdir()}/vw_result_${jobId}.json`;
}

describe('French New Wave RMS Reactivity', () => {
  it('should generate French New Wave visuals that react to RMS levels', async () => {
    // Upload audio with French New Wave preset
    const formData = new FormData();
    formData.append('audio', fs.createReadStream(TEST_AUDIO_PATH), {
      filename: 'test-audio-short.mp3',
      contentType: 'audio/mp3',
    });
    formData.append('title', 'French New Wave RMS Test');
    formData.append('guest', 'Test Guest');
    formData.append('sponsor', 'Test Sponsor');
    formData.append('stylePreset', 'French New Wave');

    const uploadRes = await fetch(`${API_URL}/api/upload`, {
      method: 'POST',
      body: formData,
    });

    expect(uploadRes.ok).toBe(true);
    const uploadJson = await uploadRes.json() as any;
    expect(uploadJson.success).toBe(true);
    expect(uploadJson.jobId).toBeDefined();
    const jobId = uploadJson.jobId;

    // Wait for result
    let result = null;
    let attempts = 0;
    const maxAttempts = 60;
    
    while (!result && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      attempts++;
      
      const res = await fetch(`${API_URL}/api/job-result?jobId=${encodeURIComponent(jobId)}`);
      if (res.status === 200) {
        result = await res.json();
      }
    }

    expect(result).toBeDefined();
    expect((result as any).success).toBe(true);
    expect((result as any).videoPath).toBeDefined();
    expect((result as any).analysis).toBeDefined();

    // Verify the video file exists
    expect(fs.existsSync((result as any).videoPath)).toBe(true);

    // Verify the analysis contains RMS data
    expect((result as any).analysis.rms).toBeDefined();
    expect(Array.isArray((result as any).analysis.rms)).toBe(true);
    expect((result as any).analysis.rms.length).toBeGreaterThan(0);

    // Verify RMS values are within expected range
    const rmsValues = (result as any).analysis.rms;
    const hasVariation = rmsValues.some((val: number) => val > 0.1) && 
                        rmsValues.some((val: number) => val < 0.05);
    
    expect(hasVariation).toBe(true);

    console.log(`✅ French New Wave RMS test completed successfully`);
    console.log(`📊 RMS range: ${Math.min(...rmsValues).toFixed(3)} - ${Math.max(...rmsValues).toFixed(3)}`);
    console.log(`🎬 Video generated: ${(result as any).videoPath}`);
  }, 60000); // 60 second timeout
}); 
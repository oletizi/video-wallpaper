import type { APIRoute } from 'astro';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { AudioAnalyzer } from '../../lib/audio-analyzer';
import { VideoGenerator } from '../../lib/video-generator';
import { OverlayGenerator } from '../../lib/overlay-generator';
import { writeFileSync } from 'fs';
import { tmpdir } from 'os';

function getResultFilePath(jobId: string) {
  return `${tmpdir()}/vw_result_${jobId}.json`;
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;
    const title = formData.get('title') as string;
    const stylePreset = formData.get('stylePreset') as string;
    const guest = formData.get('guest') as string;
    const sponsor = formData.get('sponsor') as string;

    if (!audioFile) {
      return new Response(JSON.stringify({ error: 'No audio file provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate file size (250MB limit)
    if (audioFile.size > 250 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: 'File size exceeds 250MB limit' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate file type
    if (!audioFile.type.startsWith('audio/')) {
      return new Response(JSON.stringify({ error: 'Invalid file type. Please upload an audio file.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Create uploads directory
    const uploadsDir = join(process.cwd(), 'uploads');
    await mkdir(uploadsDir, { recursive: true });

    // Save uploaded file
    const audioBuffer = await audioFile.arrayBuffer();
    const audioPath = join(uploadsDir, `audio_${Date.now()}.${audioFile.name.split('.').pop()}`);
    await writeFile(audioPath, Buffer.from(audioBuffer));

    // Generate a jobId for progress tracking
    const jobId = randomUUID();

    // Create progress file immediately for polling
    const progressFile = `${tmpdir()}/vw_progress_${jobId}.txt`;
    writeFileSync(progressFile, `0/1`); // Placeholder, will be updated in video generation

    // Start processing in the background
    setImmediate(async () => {
      try {
        console.log(`[DEBUG] [${jobId}] Background job started`);
        // Analyze audio
        const audioAnalyzer = new AudioAnalyzer();
        console.log(`[DEBUG] [${jobId}] Starting audio analysis`);
        const audioAnalysis = await audioAnalyzer.analyzeAudio(audioPath);
        console.log(`[DEBUG] [${jobId}] Audio analysis complete`);

        // Generate video
        const videoGenerator = new VideoGenerator();
        const tempVideoPath = join(uploadsDir, `video_${Date.now()}.mp4`);
        console.log(`[DEBUG] [${jobId}] Starting video generation`);
        const videoPath = await videoGenerator.generateVideo(
          audioPath,
          tempVideoPath,
          stylePreset,
          audioAnalysis,
          jobId
        );
        console.log(`[DEBUG] [${jobId}] Video generation complete: ${videoPath}`);

        // Add overlays
        const overlayGenerator = new OverlayGenerator();
        const finalVideoPath = join(uploadsDir, `final_${Date.now()}.mp4`);
        console.log(`[DEBUG] [${jobId}] Starting overlay generation`);
        await overlayGenerator.addOverlays(videoPath, finalVideoPath, {
          title: title || 'Untitled Episode',
          guest,
          sponsor,
          duration: audioAnalysis.duration,
          width: 1920,
          height: 1080
        });
        console.log(`[DEBUG] [${jobId}] Overlay generation complete: ${finalVideoPath}`);

        // Generate thumbnail
        const thumbnailPath = join(uploadsDir, `thumbnail_${Date.now()}.jpg`);
        console.log(`[DEBUG] [${jobId}] Starting thumbnail generation`);
        await overlayGenerator.generateThumbnail(finalVideoPath, thumbnailPath);
        console.log(`[DEBUG] [${jobId}] Thumbnail generation complete: ${thumbnailPath}`);

        // Store result for later retrieval
        console.log(`[DEBUG] [${jobId}] Writing result file`);
        writeFileSync(getResultFilePath(jobId), JSON.stringify({
          success: true,
          videoPath: finalVideoPath,
          thumbnailPath,
          duration: audioAnalysis.duration,
          jobId,
          analysis: {
            rms: audioAnalysis.rms.slice(0, 100),
            vocalEnergy: audioAnalysis.vocalEnergy.slice(0, 100),
            silence: audioAnalysis.silence.slice(0, 100)
          }
        }));
        console.log(`[DEBUG] [${jobId}] Result file written`);
      } catch (error) {
        console.error(`[ERROR] [${jobId}] Failed to process upload:`, (error as any)?.stack || error);
        writeFileSync(getResultFilePath(jobId), JSON.stringify({
          error: 'Failed to process upload',
          details: error instanceof Error ? (error.stack || error.message) : String(error),
          jobId
        }));
      }
    });

    // Respond immediately with jobId
    return new Response(JSON.stringify({
      success: true,
      jobId
    }), {
      status: 202,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Upload processing error:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to process upload',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}; 
import type { APIRoute } from 'astro';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { AudioAnalyzer } from '../../lib/audio-analyzer';
import { VideoGenerator } from '../../lib/video-generator';
import { OverlayGenerator } from '../../lib/overlay-generator';

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

    // Analyze audio
    const audioAnalyzer = new AudioAnalyzer();
    const audioAnalysis = await audioAnalyzer.analyzeAudio(audioPath);

    // Generate video
    const videoGenerator = new VideoGenerator();
    const tempVideoPath = join(uploadsDir, `video_${Date.now()}.mp4`);
    const videoPath = await videoGenerator.generateVideo(
      audioPath,
      tempVideoPath,
      stylePreset,
      audioAnalysis
    );

    // Add overlays
    const overlayGenerator = new OverlayGenerator();
    const finalVideoPath = join(uploadsDir, `final_${Date.now()}.mp4`);
    await overlayGenerator.addOverlays(videoPath, finalVideoPath, {
      title: title || 'Untitled Episode',
      guest,
      sponsor,
      duration: audioAnalysis.duration,
      width: 1920,
      height: 1080
    });

    // Generate thumbnail
    const thumbnailPath = join(uploadsDir, `thumbnail_${Date.now()}.jpg`);
    await overlayGenerator.generateThumbnail(finalVideoPath, thumbnailPath);

    return new Response(JSON.stringify({
      success: true,
      videoPath: finalVideoPath,
      thumbnailPath,
      duration: audioAnalysis.duration,
      analysis: {
        rms: audioAnalysis.rms.slice(0, 100), // Sample for preview
        vocalEnergy: audioAnalysis.vocalEnergy.slice(0, 100),
        silence: audioAnalysis.silence.slice(0, 100)
      }
    }), {
      status: 200,
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
import type { APIRoute } from 'astro';
import { getFrameProgress } from '../../lib/video-generator';

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const jobId = url.searchParams.get('jobId');
  if (!jobId) {
    return new Response(JSON.stringify({ error: 'Missing jobId' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  console.log(`[DEBUG] Progress API called for jobId: ${jobId}`);

  // Add a timeout for getFrameProgress
  let progress: any = null;
  let error: any = null;
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Progress read timeout')), 500)
  );
  try {
    progress = await Promise.race([
      Promise.resolve(getFrameProgress(jobId)),
      timeoutPromise
    ]);
  } catch (e) {
    error = e;
  }

  if (error) {
    console.log(`[ERROR] Progress API error for jobId ${jobId}:`, error);
    return new Response(JSON.stringify({ error: error.message || 'Timeout' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (!progress) {
    console.log(`[DEBUG] No progress found for jobId: ${jobId}`);
    return new Response(JSON.stringify({ error: 'No progress found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const responseBody = JSON.stringify(progress);
  console.log(`[DEBUG] Progress API returning for jobId ${jobId}: ${responseBody}`);
  
  return new Response(responseBody, {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}; 
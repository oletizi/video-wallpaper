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
  const progress = getFrameProgress(jobId);
  if (!progress) {
    return new Response(JSON.stringify({ error: 'No progress found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  return new Response(JSON.stringify(progress), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}; 
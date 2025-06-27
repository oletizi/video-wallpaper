import type { APIRoute } from 'astro';
import { existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';

function getResultFilePath(jobId: string) {
  return `${tmpdir()}/vw_result_${jobId}.json`;
}

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const jobId = url.searchParams.get('jobId');
  if (!jobId) {
    return new Response(JSON.stringify({ error: 'Missing jobId' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  const resultFile = getResultFilePath(jobId);
  if (!existsSync(resultFile)) {
    return new Response(JSON.stringify({ status: 'pending' }), {
      status: 202,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  const result = JSON.parse(readFileSync(resultFile, 'utf-8'));
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}; 
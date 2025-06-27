import type { APIRoute } from 'astro';
import { createReadStream, existsSync } from 'fs';
import { join, basename } from 'path';

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const fileParam = url.searchParams.get('file');

  if (!fileParam) {
    return new Response('Missing file parameter', { status: 400 });
  }

  // Only allow files from uploads directory
  const uploadsDir = join(process.cwd(), 'uploads');
  const filePath = join(uploadsDir, basename(fileParam));

  if (!existsSync(filePath)) {
    return new Response('File not found', { status: 404 });
  }

  const stream = createReadStream(filePath);
  const headers = new Headers();
  headers.set('Content-Type', 'application/octet-stream');
  headers.set('Content-Disposition', `attachment; filename="${basename(filePath)}"`);

  return new Response(stream as any, { status: 200, headers });
}; 
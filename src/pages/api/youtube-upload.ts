import type { APIRoute } from 'astro';
import { YouTubeIntegration } from '../../lib/youtube-integration';
import { existsSync } from 'fs';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { videoPath, title, description, tags, privacyStatus, thumbnailPath } = body;

    if (!videoPath || !existsSync(videoPath)) {
      return new Response(JSON.stringify({ error: 'Video file not found' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const youtube = new YouTubeIntegration();

    if (!youtube.isAuthenticated()) {
      return new Response(JSON.stringify({ 
        error: 'YouTube not authenticated',
        authUrl: youtube.getAuthUrl()
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const uploadConfig = {
      title: title || 'Untitled Video',
      description: description || '',
      tags: tags || [],
      categoryId: '22', // People & Blogs
      privacyStatus: privacyStatus || 'private',
      thumbnailPath: thumbnailPath && existsSync(thumbnailPath) ? thumbnailPath : undefined
    };

    const videoId = await youtube.uploadVideo(videoPath, uploadConfig);

    return new Response(JSON.stringify({
      success: true,
      videoId,
      videoUrl: `https://www.youtube.com/watch?v=${videoId}`
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('YouTube upload error:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to upload to YouTube',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const GET: APIRoute = async () => {
  try {
    const youtube = new YouTubeIntegration();
    
    if (!youtube.isAuthenticated()) {
      return new Response(JSON.stringify({ 
        authenticated: false,
        authUrl: youtube.getAuthUrl()
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const videos = await youtube.getChannelVideos(10);

    return new Response(JSON.stringify({
      authenticated: true,
      videos
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('YouTube status error:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to get YouTube status',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}; 
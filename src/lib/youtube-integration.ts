import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { readFileSync, existsSync } from 'fs';

export interface YouTubeUploadConfig {
  title: string;
  description: string;
  tags: string[];
  categoryId: string;
  privacyStatus: 'private' | 'unlisted' | 'public';
  thumbnailPath?: string;
}

export interface YouTubeVideo {
  id: string;
  title: string;
  description: string;
  publishedAt: string;
  thumbnails: {
    default: { url: string; width: number; height: number };
    medium: { url: string; width: number; height: number };
    high: { url: string; width: number; height: number };
  };
  statistics: {
    viewCount: string;
    likeCount: string;
    commentCount: string;
  };
}

export class YouTubeIntegration {
  private youtube: any;
  private oauth2Client!: OAuth2Client;

  constructor() {
    this.initializeYouTubeAPI();
  }

  private initializeYouTubeAPI(): void {
    // Initialize OAuth2 client
    this.oauth2Client = new OAuth2Client(
      process.env.YOUTUBE_CLIENT_ID,
      process.env.YOUTUBE_CLIENT_SECRET,
      process.env.YOUTUBE_REDIRECT_URI
    );

    // Set credentials if available
    if (process.env.YOUTUBE_REFRESH_TOKEN) {
      this.oauth2Client.setCredentials({
        refresh_token: process.env.YOUTUBE_REFRESH_TOKEN
      });
    }

    // Initialize YouTube API
    this.youtube = google.youtube({
      version: 'v3',
      auth: this.oauth2Client
    });
  }

  async uploadVideo(
    videoPath: string,
    config: YouTubeUploadConfig
  ): Promise<string> {
    try {
      console.log('Starting YouTube upload...');

      const requestBody = {
        snippet: {
          title: config.title,
          description: config.description,
          tags: config.tags,
          categoryId: config.categoryId
        },
        status: {
          privacyStatus: config.privacyStatus
        }
      };

      const media = {
        body: readFileSync(videoPath)
      };

      const response = await this.youtube.videos.insert({
        part: ['snippet', 'status'],
        requestBody,
        media
      });

      const videoId = response.data.id;
      console.log(`Video uploaded successfully! ID: ${videoId}`);

      // Upload thumbnail if provided
      if (config.thumbnailPath && existsSync(config.thumbnailPath)) {
        await this.uploadThumbnail(videoId, config.thumbnailPath);
      }

      return videoId;
    } catch (error) {
      console.error('YouTube upload failed:', error);
      throw new Error('Failed to upload video to YouTube');
    }
  }

  async uploadThumbnail(videoId: string, thumbnailPath: string): Promise<void> {
    try {
      const media = {
        body: readFileSync(thumbnailPath)
      };

      await this.youtube.thumbnails.set({
        videoId,
        media
      });

      console.log('Thumbnail uploaded successfully!');
    } catch (error) {
      console.error('Thumbnail upload failed:', error);
      throw new Error('Failed to upload thumbnail');
    }
  }

  async getVideoInfo(videoId: string): Promise<YouTubeVideo> {
    try {
      const response = await this.youtube.videos.list({
        part: ['snippet', 'statistics'],
        id: [videoId]
      });

      if (!response.data.items || response.data.items.length === 0) {
        throw new Error('Video not found');
      }

      const video = response.data.items[0];
      return {
        id: video.id,
        title: video.snippet.title,
        description: video.snippet.description,
        publishedAt: video.snippet.publishedAt,
        thumbnails: video.snippet.thumbnails,
        statistics: video.statistics
      };
    } catch (error) {
      console.error('Failed to get video info:', error);
      throw new Error('Failed to retrieve video information');
    }
  }

  async updateVideoMetadata(
    videoId: string,
    updates: Partial<YouTubeUploadConfig>
  ): Promise<void> {
    try {
      const requestBody: any = {};

      if (updates.title || updates.description || updates.tags || updates.categoryId) {
        requestBody.snippet = {};
        if (updates.title) requestBody.snippet.title = updates.title;
        if (updates.description) requestBody.snippet.description = updates.description;
        if (updates.tags) requestBody.snippet.tags = updates.tags;
        if (updates.categoryId) requestBody.snippet.categoryId = updates.categoryId;
      }

      if (updates.privacyStatus) {
        requestBody.status = { privacyStatus: updates.privacyStatus };
      }

      await this.youtube.videos.update({
        part: ['snippet', 'status'],
        requestBody,
        id: videoId
      });

      console.log('Video metadata updated successfully!');
    } catch (error) {
      console.error('Failed to update video metadata:', error);
      throw new Error('Failed to update video metadata');
    }
  }

  async deleteVideo(videoId: string): Promise<void> {
    try {
      await this.youtube.videos.delete({
        id: videoId
      });

      console.log('Video deleted successfully!');
    } catch (error) {
      console.error('Failed to delete video:', error);
      throw new Error('Failed to delete video');
    }
  }

  async getChannelVideos(maxResults: number = 50): Promise<YouTubeVideo[]> {
    try {
      const response = await this.youtube.search.list({
        part: ['snippet'],
        forMine: true,
        type: ['video'],
        order: 'date',
        maxResults
      });

      if (!response.data.items) {
        return [];
      }

      const videoIds = response.data.items.map((item: any) => item.id.videoId);
      const videos = await this.getVideosByIds(videoIds);

      return videos;
    } catch (error) {
      console.error('Failed to get channel videos:', error);
      throw new Error('Failed to retrieve channel videos');
    }
  }

  private async getVideosByIds(videoIds: string[]): Promise<YouTubeVideo[]> {
    try {
      const response = await this.youtube.videos.list({
        part: ['snippet', 'statistics'],
        id: videoIds
      });

      if (!response.data.items) {
        return [];
      }

      return response.data.items.map((video: any) => ({
        id: video.id,
        title: video.snippet.title,
        description: video.snippet.description,
        publishedAt: video.snippet.publishedAt,
        thumbnails: video.snippet.thumbnails,
        statistics: video.statistics
      }));
    } catch (error) {
      console.error('Failed to get videos by IDs:', error);
      throw new Error('Failed to retrieve videos');
    }
  }

  getAuthUrl(): string {
    const scopes = [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube',
      'https://www.googleapis.com/auth/youtube.force-ssl'
    ];

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes
    });
  }

  async handleAuthCallback(code: string): Promise<string> {
    try {
      const { tokens } = await this.oauth2Client.getToken(code);
      this.oauth2Client.setCredentials(tokens);

      console.log('Authentication successful!');
      console.log('Refresh token:', tokens.refresh_token);

      return tokens.refresh_token || '';
    } catch (error) {
      console.error('Authentication failed:', error);
      throw new Error('Failed to authenticate with YouTube');
    }
  }

  isAuthenticated(): boolean {
    return !!this.oauth2Client.credentials.refresh_token;
  }

  // Helper method to generate video description template
  generateVideoDescription(
    title: string,
    guest?: string,
    summary?: string,
    sponsor?: string,
    links?: { text: string; url: string }[]
  ): string {
    let description = `${title}\n\n`;

    if (guest) {
      description += `Guest: ${guest}\n\n`;
    }

    if (summary) {
      description += `${summary}\n\n`;
    }

    if (links && links.length > 0) {
      description += 'Links:\n';
      links.forEach(link => {
        description += `${link.text}: ${link.url}\n`;
      });
      description += '\n';
    }

    if (sponsor) {
      description += `Sponsored by ${sponsor}\n\n`;
    }

    description += '---\n';
    description += 'Daedalus Howell & Co.\n';
    description += 'Subscribe for more content!\n';

    return description;
  }

  // Helper method to generate video tags
  generateVideoTags(
    title: string,
    guest?: string,
    topics?: string[]
  ): string[] {
    const tags = [
      'podcast',
      'audio',
      'Daedalus Howell',
      'video wallpaper'
    ];

    // Add title-based tags
    const titleWords = title.toLowerCase().split(' ').filter(word => word.length > 3);
    tags.push(...titleWords.slice(0, 5));

    // Add guest-based tags
    if (guest) {
      tags.push(guest.toLowerCase().replace(' ', ''));
    }

    // Add topic-based tags
    if (topics) {
      tags.push(...topics);
    }

    return tags.slice(0, 15); // YouTube limit
  }
} 
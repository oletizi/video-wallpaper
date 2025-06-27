import { spawn } from 'child_process';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

export interface OverlayConfig {
  logoPath?: string;
  title: string;
  guest?: string;
  sponsor?: string;
  duration: number;
  width: number;
  height: number;
}

export interface OverlayElement {
  type: 'intro' | 'lower-third' | 'title-card' | 'end-screen';
  startTime: number;
  duration: number;
  content: string;
  position: { x: number; y: number };
  style: {
    fontSize: number;
    fontFamily: string;
    color: string;
    backgroundColor?: string;
    opacity: number;
  };
}

export class OverlayGenerator {
  private readonly safeMargins = {
    top: 90,
    bottom: 90,
    left: 90,
    right: 90
  };

  async addOverlays(
    videoPath: string,
    outputPath: string,
    config: OverlayConfig
  ): Promise<string> {
    const overlays = this.generateOverlayElements(config);
    const filterComplex = this.buildFilterComplex(overlays, config);
    
    return this.applyOverlays(videoPath, outputPath, filterComplex);
  }

  private generateOverlayElements(config: OverlayConfig): OverlayElement[] {
    const overlays: OverlayElement[] = [];
    const { width, height, duration } = config;

    // Logo intro (first 5 seconds)
    overlays.push({
      type: 'intro',
      startTime: 0,
      duration: 5,
      content: 'DAEDALUS HOWELL & CO.',
      position: { x: width / 2, y: height / 2 },
      style: {
        fontSize: 72,
        fontFamily: 'Arial, sans-serif',
        color: '#ffffff',
        backgroundColor: '#000000',
        opacity: 0.9
      }
    });

    // Title card (5-10 seconds)
    overlays.push({
      type: 'title-card',
      startTime: 5,
      duration: 5,
      content: config.title,
      position: { x: width / 2, y: height / 2 },
      style: {
        fontSize: 48,
        fontFamily: 'Arial, sans-serif',
        color: '#ffffff',
        backgroundColor: '#6366f1',
        opacity: 0.8
      }
    });

    // Lower-thirds every ~10 minutes
    const lowerThirdInterval = 600; // 10 minutes
    for (let time = 15; time < duration - 10; time += lowerThirdInterval) {
      overlays.push({
        type: 'lower-third',
        startTime: time,
        duration: 8,
        content: config.guest || config.title,
        position: { x: this.safeMargins.left, y: height - this.safeMargins.bottom - 100 },
        style: {
          fontSize: 32,
          fontFamily: 'Arial, sans-serif',
          color: '#ffffff',
          backgroundColor: '#000000',
          opacity: 0.7
        }
      });
    }

    // End screen (last 10 seconds)
    overlays.push({
      type: 'end-screen',
      startTime: duration - 10,
      duration: 10,
      content: `Thanks for listening!\n${config.sponsor ? `Sponsored by ${config.sponsor}` : ''}`,
      position: { x: width / 2, y: height / 2 },
      style: {
        fontSize: 36,
        fontFamily: 'Arial, sans-serif',
        color: '#ffffff',
        backgroundColor: '#000000',
        opacity: 0.9
      }
    });

    return overlays;
  }

  private buildFilterComplex(overlays: OverlayElement[], config: OverlayConfig): string {
    // Build a comma-separated list of drawtext filters for FFmpeg
    const { width, height } = config;
    return overlays.map(overlay => this.createTextFilter(overlay, width, height)).join(',');
  }

  private createTextFilter(overlay: OverlayElement, width: number, height: number): string {
    const { content, position, style, startTime, duration } = overlay;
    
    // Escape special characters for FFmpeg
    const escapedContent = content.replace(/['\\]/g, '\\$&');
    
    return `drawtext=text='${escapedContent}':` +
           `fontsize=${style.fontSize}:` +
           `fontcolor=${style.color}:` +
           `x=${position.x}:` +
           `y=${position.y}:` +
           `enable='between(t,${startTime},${startTime + duration})':` +
           `fontfile=/System/Library/Fonts/Arial.ttf:` +
           `box=1:boxcolor=${style.backgroundColor || '#000000'}:` +
           `boxborderw=5:alpha=${style.opacity}`;
  }

  private async applyOverlays(
    videoPath: string,
    outputPath: string,
    filterComplex: string
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-i', videoPath,
        '-vf', filterComplex,
        '-c:v', 'libx264',
        '-c:a', 'copy',
        '-y',
        outputPath
      ]);

      ffmpeg.stderr.on('data', (data: Buffer) => {
        console.log('FFmpeg overlay:', data.toString());
      });

      ffmpeg.on('close', (code: number) => {
        if (code === 0) {
          resolve(outputPath);
        } else {
          reject(new Error(`FFmpeg overlay failed with code ${code}`));
        }
      });
    });
  }

  async generateThumbnail(videoPath: string, outputPath: string, timestamp: number = 5): Promise<string> {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-i', videoPath,
        '-ss', timestamp.toString(),
        '-vframes', '1',
        '-q:v', '2',
        '-y',
        outputPath
      ]);

      ffmpeg.stderr.on('data', (data: Buffer) => {
        console.log('FFmpeg thumbnail:', data.toString());
      });

      ffmpeg.on('close', (code: number) => {
        if (code === 0) {
          resolve(outputPath);
        } else {
          reject(new Error(`FFmpeg thumbnail generation failed with code ${code}`));
        }
      });
    });
  }

  async addLogoIntro(
    videoPath: string,
    logoPath: string,
    outputPath: string,
    duration: number = 5
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-i', logoPath,
        '-i', videoPath,
        '-filter_complex', `[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2[logo];[logo][1:v]concat=n=2:v=1:a=0[outv]`,
        '-map', '[outv]',
        '-map', '1:a',
        '-c:v', 'libx264',
        '-c:a', 'copy',
        '-y',
        outputPath
      ]);

      ffmpeg.stderr.on('data', (data: Buffer) => {
        console.log('FFmpeg logo intro:', data.toString());
      });

      ffmpeg.on('close', (code: number) => {
        if (code === 0) {
          resolve(outputPath);
        } else {
          reject(new Error(`FFmpeg logo intro failed with code ${code}`));
        }
      });
    });
  }

  async addLowerThird(
    videoPath: string,
    text: string,
    outputPath: string,
    startTime: number,
    duration: number = 8
  ): Promise<string> {
    const escapedText = text.replace(/['\\]/g, '\\$&');
    
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-i', videoPath,
        '-vf', `drawtext=text='${escapedText}':fontsize=32:fontcolor=white:x=90:y=890:enable='between(t,${startTime},${startTime + duration})':box=1:boxcolor=black:boxborderw=5`,
        '-c:v', 'libx264',
        '-c:a', 'copy',
        '-y',
        outputPath
      ]);

      ffmpeg.stderr.on('data', (data: Buffer) => {
        console.log('FFmpeg lower third:', data.toString());
      });

      ffmpeg.on('close', (code: number) => {
        if (code === 0) {
          resolve(outputPath);
        } else {
          reject(new Error(`FFmpeg lower third failed with code ${code}`));
        }
      });
    });
  }
} 
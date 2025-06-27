import { spawn } from 'child_process';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { AudioAnalysis, AudioSegment } from './audio-analyzer';
import { createCanvas } from 'canvas';
import { tmpdir } from 'os';

export interface StylePreset {
  name: string;
  description: string;
  visualParams: {
    colorPalette: string[];
    motionStyle: 'smooth' | 'jumpy' | 'drift';
    textureType: 'grainy' | 'clean' | 'painterly';
    reactivity: 'subtle' | 'moderate' | 'strong';
  };
}

export interface VideoConfig {
  width: number;
  height: number;
  fps: number;
  duration: number;
  stylePreset: StylePreset;
  audioAnalysis: AudioAnalysis;
}

export function getFrameProgress(jobId: string): { currentFrame: number, totalFrames: number } | null {
  const progressFile = getProgressFilePath(jobId);
  if (!existsSync(progressFile)) return null;
  try {
    let content = readFileSync(progressFile, 'utf-8').trim();
    // Remove any non-numeric, non-slash characters (e.g., stray % or control chars)
    content = content.replace(/[^0-9\/]/g, '');
    console.log(`[DEBUG] Sanitized progress content for job ${jobId}: "${content}"`);
    const match = content.match(/(\d+)\/(\d+)/);
    if (!match) {
      console.log(`[DEBUG] Failed to parse progress format for job ${jobId}: "${content}"`);
      return null;
    }
    const current = parseInt(match[1], 10);
    const total = parseInt(match[2], 10);
    console.log(`[DEBUG] Parsed progress for job ${jobId}: ${current}/${total}`);
    return { currentFrame: current, totalFrames: total };
  } catch (e) {
    console.log(`[DEBUG] Failed to read progress for job ${jobId}:`, e);
    return null;
  }
}

function getProgressFilePath(jobId: string) {
  return `${tmpdir()}/vw_progress_${jobId}.txt`;
}

export class VideoGenerator {
  private readonly presets: StylePreset[] = [
    {
      name: 'French New Wave',
      description: 'Black & white jump cuts, freeze frames, grainy film look with RMS-reactive elements',
      visualParams: {
        colorPalette: ['#000000', '#ffffff', '#808080', '#404040'],
        motionStyle: 'jumpy',
        textureType: 'grainy',
        reactivity: 'strong'
      }
    },
    {
      name: "'80s Retro Chromatic",
      description: 'Neon gridlines, VHS textures, synthwave aesthetic',
      visualParams: {
        colorPalette: ['#ff00ff', '#00ffff', '#000000', '#ffffff'],
        motionStyle: 'drift',
        textureType: 'grainy',
        reactivity: 'strong'
      }
    },
    {
      name: 'Wine-Country Dreamscape',
      description: 'Abstract vineyards, painterly textures, soft camera drifts',
      visualParams: {
        colorPalette: ['#8B4513', '#DAA520', '#F4A460', '#DEB887'],
        motionStyle: 'smooth',
        textureType: 'painterly',
        reactivity: 'subtle'
      }
    }
  ];

  async generateVideo(
    audioPath: string,
    outputPath: string,
    stylePresetName: string,
    audioAnalysis: AudioAnalysis,
    jobId?: string
  ): Promise<string> {
    const preset = this.presets.find(p => p.name === stylePresetName);
    if (!preset) {
      throw new Error(`Style preset "${stylePresetName}" not found`);
    }

    const config: VideoConfig = {
      width: 1920,
      height: 1080,
      fps: 30,
      duration: audioAnalysis.duration,
      stylePreset: preset,
      audioAnalysis
    };

    // Create frames directory
    const framesDir = join(process.cwd(), 'temp', 'frames');
    if (!existsSync(framesDir)) {
      mkdirSync(framesDir, { recursive: true });
    }

    // Generate frames
    await this.generateFrames(config, framesDir, jobId);

    // Compile video with audio
    const finalVideoPath = await this.compileVideo(framesDir, audioPath, outputPath, config);

    return finalVideoPath;
  }

  private async generateFrames(config: VideoConfig, framesDir: string, jobId?: string): Promise<void> {
    const { width, height, fps, duration, stylePreset, audioAnalysis } = config;
    const totalFrames = Math.floor(duration * fps);
    const frameInterval = 1 / fps;

    console.log(`Generating ${totalFrames} frames for ${duration}s video...`);

    for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
      const time = frameIndex * frameInterval;
      const frameData = this.generateFrameData(time, config);
      
      const framePath = join(framesDir, `frame_${frameIndex.toString().padStart(6, '0')}.png`);
      await this.renderFrame(frameData, framePath, width, height);
      
      if (frameIndex % 30 === 0) {
        console.log(`Generated frame ${frameIndex}/${totalFrames}`);
      }
      if (jobId) {
        const progressFile = getProgressFilePath(jobId);
        const progressContent = `${frameIndex}/${totalFrames}\n`;
        writeFileSync(progressFile, progressContent);
        console.log(`[DEBUG] Wrote progress for job ${jobId}: "${progressContent}" to ${progressFile}`);
      }
    }
    if (jobId) {
      const progressFile = getProgressFilePath(jobId);
      const finalProgressContent = `${totalFrames}/${totalFrames}\n`;
      writeFileSync(progressFile, finalProgressContent);
      console.log(`[DEBUG] Wrote final progress for job ${jobId}: "${finalProgressContent}" to ${progressFile}`);
    }
  }

  private generateFrameData(time: number, config: VideoConfig): any {
    const { stylePreset, audioAnalysis } = config;
    const frameIndex = Math.floor(time * config.fps);
    
    // Get audio data for this frame
    const audioFrameIndex = Math.floor(time * audioAnalysis.sampleRate / 1024);
    const rms = audioAnalysis.rms[audioFrameIndex] || 0.1;
    const vocalEnergy = audioAnalysis.vocalEnergy[audioFrameIndex] || 0.5;
    const frequency = audioAnalysis.frequencies[audioFrameIndex] || 150;

    // Generate visual parameters based on audio and style
    const visualParams = this.calculateVisualParams(
      time,
      rms,
      vocalEnergy,
      frequency,
      stylePreset
    );

    return {
      time,
      rms,
      vocalEnergy,
      frequency,
      visualParams
    };
  }

  private calculateVisualParams(
    time: number,
    rms: number,
    vocalEnergy: number,
    frequency: number,
    preset: StylePreset
  ) {
    const baseHue = (time * 10) % 360;
    const energyMultiplier = 1 + (rms * 2);
    const vocalMultiplier = 1 + (vocalEnergy * 0.5);

    let hue = baseHue;
    let saturation = 50 + (rms * 100);
    let brightness = 50 + (vocalEnergy * 30);

    // Apply style-specific modifications
    switch (preset.name) {
      case 'French New Wave':
        hue = 0; // Black and white
        saturation = 0;
        // RMS-reactive brightness with jump cut effect
        const rmsThreshold = 0.15;
        const jumpCutIntensity = rms > rmsThreshold ? 1 : 0;
        brightness = jumpCutIntensity > 0 ? 
          (20 + (rms * 60)) : // High contrast when RMS is high
          (10 + (rms * 20));  // Low contrast when RMS is low
        break;
      case "'80s Retro Chromatic":
        hue = (baseHue + frequency * 0.1) % 360;
        saturation = 80 + (rms * 20);
        brightness = 60 + (vocalEnergy * 40);
        break;
      case 'Wine-Country Dreamscape':
        hue = 30 + (time * 5) % 60; // Warm colors
        saturation = 40 + (rms * 30);
        brightness = 70 + (vocalEnergy * 20);
        break;
    }

    return {
      hue: Math.max(0, Math.min(360, hue)),
      saturation: Math.max(0, Math.min(100, saturation)),
      brightness: Math.max(0, Math.min(100, brightness)),
      energyMultiplier,
      vocalMultiplier,
      motionIntensity: rms * 2,
      textureIntensity: vocalEnergy * 3,
      // French New Wave specific parameters
      jumpCutIntensity: preset.name === 'French New Wave' ? (rms > 0.15 ? 1 : 0) : 0,
      filmGrainIntensity: preset.name === 'French New Wave' ? (rms * 0.8) : 0,
      contrastMultiplier: preset.name === 'French New Wave' ? (1 + rms * 2) : 1
    };
  }

  private async renderFrame(frameData: any, outputPath: string, width: number, height: number): Promise<void> {
    // Create a simple SVG frame for MVP
    const svg = this.generateSVGFrame(frameData, width, height);
    writeFileSync(outputPath.replace('.png', '.svg'), svg);
    
    // Convert SVG to PNG using ImageMagick or similar
    // For MVP, we'll use a placeholder approach
    await this.convertSVGToPNG(outputPath.replace('.png', '.svg'), outputPath);
  }

  private generateSVGFrame(frameData: any, width: number, height: number): string {
    const { hue, saturation, brightness, energyMultiplier, motionIntensity, jumpCutIntensity, filmGrainIntensity, contrastMultiplier } = frameData;
    
    // Create animated background
    const bgColor = `hsl(${hue}, ${saturation}%, ${brightness}%)`;
    const accentColor = `hsl(${hue + 180}, ${saturation}%, ${brightness + 20}%)`;
    
    // Generate animated elements based on audio and style
    let circles, lines, specialElements;
    
    // Check if this is French New Wave style
    if (jumpCutIntensity !== undefined && jumpCutIntensity > 0) {
      // French New Wave specific elements
      circles = this.generateFrenchNewWaveCircles(frameData, width, height);
      lines = this.generateFrenchNewWaveLines(frameData, width, height);
      specialElements = this.generateFrenchNewWaveElements(frameData, width, height);
    } else {
      // Default elements for other styles
      circles = this.generateAudioReactiveCircles(frameData, width, height);
      lines = this.generateAudioReactiveLines(frameData, width, height);
      specialElements = '';
    }
    
    return `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="bgGradient">
            <stop offset="0%" style="stop-color:${bgColor};stop-opacity:1" />
            <stop offset="100%" style="stop-color:${accentColor};stop-opacity:0.3" />
          </radialGradient>
          ${filmGrainIntensity > 0 ? `
          <filter id="filmGrain">
            <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" result="noise"/>
            <feColorMatrix type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 ${filmGrainIntensity} 0"/>
          </filter>
          ` : ''}
        </defs>
        
        <rect width="100%" height="100%" fill="url(#bgGradient)" ${filmGrainIntensity > 0 ? 'filter="url(#filmGrain)"' : ''} />
        
        ${circles}
        ${lines}
        ${specialElements}
        
        <!-- Audio-reactive pulse -->
        <circle 
          cx="${width / 2}" 
          cy="${height / 2}" 
          r="${50 * energyMultiplier}" 
          fill="none" 
          stroke="${accentColor}" 
          stroke-width="${2 * motionIntensity}"
          opacity="0.6"
        />
      </svg>
    `;
  }

  private generateAudioReactiveCircles(frameData: any, width: number, height: number): string {
    const { hue, saturation, brightness, energyMultiplier } = frameData;
    const circles = [];
    
    for (let i = 0; i < 5; i++) {
      const x = (width * 0.2) + (i * width * 0.15);
      const y = height * 0.5 + Math.sin(frameData.time + i) * 50;
      const radius = 20 + (energyMultiplier * 30);
      const opacity = 0.3 + (energyMultiplier * 0.4);
      
      circles.push(`
        <circle 
          cx="${x}" 
          cy="${y}" 
          r="${radius}" 
          fill="hsl(${hue + i * 30}, ${saturation}%, ${brightness}%)" 
          opacity="${opacity}"
        />
      `);
    }
    
    return circles.join('');
  }

  private generateAudioReactiveLines(frameData: any, width: number, height: number): string {
    const { hue, saturation, brightness, motionIntensity } = frameData;
    const lines = [];
    
    for (let i = 0; i < 3; i++) {
      const y1 = height * 0.3 + (i * height * 0.2);
      const y2 = y1 + Math.sin(frameData.time + i) * 100;
      const strokeWidth = 2 + (motionIntensity * 3);
      
      lines.push(`
        <line 
          x1="0" 
          y1="${y1}" 
          x2="${width}" 
          y2="${y2}" 
          stroke="hsl(${hue + i * 60}, ${saturation}%, ${brightness}%)" 
          stroke-width="${strokeWidth}"
          opacity="0.7"
        />
      `);
    }
    
    return lines.join('');
  }

  private generateFrenchNewWaveCircles(frameData: any, width: number, height: number): string {
    const { rms, jumpCutIntensity, contrastMultiplier } = frameData;
    const circles = [];
    
    // RMS-reactive number of circles
    const numCircles = Math.floor(3 + (rms * 8));
    
    for (let i = 0; i < numCircles; i++) {
      // Jump cut effect: circles appear/disappear based on RMS
      if (jumpCutIntensity > 0 || Math.random() > 0.3) {
        const x = (width * 0.1) + (i * width * 0.2) + (rms * 100 * Math.sin(frameData.time + i));
        const y = height * 0.3 + (i * height * 0.15) + (rms * 50 * Math.cos(frameData.time + i * 2));
        const radius = 15 + (rms * 40) + (jumpCutIntensity * 20);
        const opacity = 0.2 + (rms * 0.6) + (jumpCutIntensity * 0.3);
        
        // High contrast black/white based on RMS
        const fillColor = rms > 0.2 ? '#ffffff' : '#000000';
        
        circles.push(`
          <circle 
            cx="${x}" 
            cy="${y}" 
            r="${radius}" 
            fill="${fillColor}" 
            opacity="${opacity}"
            stroke="${rms > 0.15 ? '#000000' : '#ffffff'}"
            stroke-width="${1 + (rms * 3)}"
          />
        `);
      }
    }
    
    return circles.join('');
  }

  private generateFrenchNewWaveLines(frameData: any, width: number, height: number): string {
    const { rms, jumpCutIntensity, contrastMultiplier } = frameData;
    const lines = [];
    
    // RMS-reactive number of lines
    const numLines = Math.floor(2 + (rms * 6));
    
    for (let i = 0; i < numLines; i++) {
      // Jump cut effect: lines appear/disappear based on RMS
      if (jumpCutIntensity > 0 || Math.random() > 0.4) {
        const y1 = height * 0.2 + (i * height * 0.25);
        const y2 = y1 + Math.sin(frameData.time + i) * (50 + rms * 150);
        const strokeWidth = 1 + (rms * 5) + (jumpCutIntensity * 3);
        const opacity = 0.3 + (rms * 0.5) + (jumpCutIntensity * 0.4);
        
        // High contrast black/white based on RMS
        const strokeColor = rms > 0.18 ? '#ffffff' : '#000000';
        
        lines.push(`
          <line 
            x1="0" 
            y1="${y1}" 
            x2="${width}" 
            y2="${y2}" 
            stroke="${strokeColor}" 
            stroke-width="${strokeWidth}"
            opacity="${opacity}"
          />
        `);
      }
    }
    
    return lines.join('');
  }

  private generateFrenchNewWaveElements(frameData: any, width: number, height: number): string {
    const { rms, jumpCutIntensity, filmGrainIntensity } = frameData;
    const elements = [];
    
    // RMS-reactive geometric shapes
    if (rms > 0.12) {
      // High RMS: add sharp geometric elements
      const numShapes = Math.floor(2 + (rms * 4));
      
      for (let i = 0; i < numShapes; i++) {
        const x = width * 0.2 + (i * width * 0.3);
        const y = height * 0.4 + (i * height * 0.2);
        const size = 20 + (rms * 60);
        const opacity = 0.4 + (rms * 0.4);
        
        // Alternating triangles and rectangles
        if (i % 2 === 0) {
          elements.push(`
            <polygon 
              points="${x-size},${y+size} ${x+size},${y+size} ${x},${y-size}" 
              fill="${rms > 0.2 ? '#ffffff' : '#000000'}" 
              opacity="${opacity}"
              stroke="${rms > 0.2 ? '#000000' : '#ffffff'}"
              stroke-width="${1 + (rms * 2)}"
            />
          `);
        } else {
          elements.push(`
            <rect 
              x="${x-size}" 
              y="${y-size}" 
              width="${size*2}" 
              height="${size*2}" 
              fill="${rms > 0.2 ? '#000000' : '#ffffff'}" 
              opacity="${opacity}"
              stroke="${rms > 0.2 ? '#ffffff' : '#000000'}"
              stroke-width="${1 + (rms * 2)}"
            />
          `);
        }
      }
    }
    
    // Jump cut flash effect
    if (jumpCutIntensity > 0) {
      elements.push(`
        <rect 
          x="0" 
          y="0" 
          width="${width}" 
          height="${height}" 
          fill="#ffffff" 
          opacity="0.1"
        />
      `);
    }
    
    return elements.join('');
  }

  private async convertSVGToPNG(svgPath: string, pngPath: string): Promise<void> {
    // For MVP, we'll use a simple approach
    // In production, use ImageMagick or similar
    try {
      const { spawn } = require('child_process');
      const convert = spawn('convert', [svgPath, pngPath]);
      
      return new Promise((resolve, reject) => {
        convert.on('close', (code: number) => {
          if (code === 0) {
            resolve();
          } else {
            // Fallback: create a simple colored PNG
            this.createFallbackPNG(pngPath);
            resolve();
          }
        });
      });
    } catch (error) {
      // Fallback: create a simple colored PNG
      this.createFallbackPNG(pngPath);
    }
  }

  private createFallbackPNG(pngPath: string): void {
    // Create a simple colored PNG as fallback
    const canvasInstance = createCanvas(1920, 1080);
    const ctx = canvasInstance.getContext('2d');
    
    // Create gradient background
    const gradient = ctx.createLinearGradient(0, 0, 1920, 1080);
    gradient.addColorStop(0, '#6366f1');
    gradient.addColorStop(1, '#8b5cf6');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1920, 1080);
    
    // Add some text
    ctx.fillStyle = 'white';
    ctx.font = '48px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Video Wallpaper Generator', 960, 540);
    
    const buffer = canvasInstance.toBuffer('image/png');
    writeFileSync(pngPath, buffer);
  }

  private async compileVideo(
    framesDir: string,
    audioPath: string,
    outputPath: string,
    config: VideoConfig
  ): Promise<string> {
    const { fps, width, height } = config;
    
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-framerate', fps.toString(),
        '-i', join(framesDir, 'frame_%06d.png'),
        '-i', audioPath,
        '-c:v', 'libx264',
        '-c:a', 'aac',
        '-pix_fmt', 'yuv420p',
        '-shortest',
        '-y',
        outputPath
      ]);

      ffmpeg.stderr.on('data', (data: Buffer) => {
        console.log('FFmpeg:', data.toString());
      });

      ffmpeg.on('close', (code: number) => {
        if (code === 0) {
          resolve(outputPath);
        } else {
          reject(new Error(`FFmpeg compilation failed with code ${code}`));
        }
      });
    });
  }

  getPresets(): StylePreset[] {
    return this.presets;
  }
} 
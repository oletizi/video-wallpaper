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
  seed?: number;
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

  // Simple seeded random number generator
  private seededRandom(seed: number): () => number {
    let state = seed;
    return () => {
      state = (state * 9301 + 49297) % 233280;
      return state / 233280;
    };
  }

  // Get random value between min and max using seeded random
  private randomRange(seed: number, min: number, max: number): number {
    const random = this.seededRandom(seed);
    return min + (random() * (max - min));
  }

  // Get random integer between min and max using seeded random
  private randomInt(seed: number, min: number, max: number): number {
    return Math.floor(this.randomRange(seed, min, max + 1));
  }

  // Pick random element from array using seeded random
  private randomChoice<T>(seed: number, array: T[]): T {
    return array[this.randomInt(seed, 0, array.length - 1)];
  }

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

    // Generate a unique seed for this video generation
    const seed = Date.now() + Math.floor(Math.random() * 1000000);

    const config: VideoConfig = {
      width: 1920,
      height: 1080,
      fps: 30,
      duration: audioAnalysis.duration,
      stylePreset: preset,
      audioAnalysis,
      seed
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
    const { stylePreset, audioAnalysis, seed } = config;
    const frameIndex = Math.floor(time * config.fps);
    
    // Ensure seed is always defined
    const baseSeed = seed || Date.now();
    
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
      stylePreset,
      baseSeed + frameIndex // Use frame-specific seed for variation
    );

    return {
      time,
      rms,
      vocalEnergy,
      frequency,
      visualParams,
      seed: baseSeed + frameIndex // Pass seed to visual generation methods
    };
  }

  private calculateVisualParams(
    time: number,
    rms: number,
    vocalEnergy: number,
    frequency: number,
    preset: StylePreset,
    seed: number
  ) {
    const baseHue = (time * 10) % 360;
    const energyMultiplier = 1 + (rms * 2);
    const vocalMultiplier = 1 + (vocalEnergy * 0.5);

    // Add randomization to base parameters
    const hueVariation = this.randomRange(seed, -30, 30);
    const saturationVariation = this.randomRange(seed, -20, 20);
    const brightnessVariation = this.randomRange(seed, -15, 15);

    let hue = (baseHue + hueVariation) % 360;
    let saturation = Math.max(20, Math.min(100, 50 + (rms * 100) + saturationVariation));
    let brightness = Math.max(20, Math.min(80, 50 + (vocalEnergy * 30) + brightnessVariation));

    // Apply style-specific modifications
    switch (preset.name) {
      case 'French New Wave':
        return {
          hue: 0, // Force black/white
          saturation: 0,
          brightness: rms > 0.2 ? 80 : 20,
          energyMultiplier,
          motionIntensity: 1 + (rms * 3),
          jumpCutIntensity: rms > 0.15 ? 0.8 : 0,
          filmGrainIntensity: 0.3 + (rms * 0.4),
          contrastMultiplier: 1 + (rms * 2)
        };
      
      case "'80s Retro Chromatic":
        return {
          hue: this.randomChoice(seed, [0, 180, 300, 60]), // Neon colors
          saturation: 80 + (rms * 20),
          brightness: 60 + (vocalEnergy * 20),
          energyMultiplier,
          motionIntensity: 0.5 + (rms * 2),
          jumpCutIntensity: 0,
          filmGrainIntensity: 0.2 + (rms * 0.3),
          contrastMultiplier: 1.2 + (rms * 1.5)
        };
      
      case 'Wine-Country Dreamscape':
        return {
          hue: this.randomChoice(seed, [30, 45, 60, 15]), // Earth tones
          saturation: 40 + (rms * 30),
          brightness: 50 + (vocalEnergy * 15),
          energyMultiplier,
          motionIntensity: 0.3 + (rms * 1),
          jumpCutIntensity: 0,
          filmGrainIntensity: 0.1 + (rms * 0.2),
          contrastMultiplier: 0.8 + (rms * 0.5)
        };
      
      default:
        return {
          hue,
          saturation,
          brightness,
          energyMultiplier,
          motionIntensity: 1 + (rms * 2),
          jumpCutIntensity: 0,
          filmGrainIntensity: 0.1 + (rms * 0.2),
          contrastMultiplier: 1 + (rms * 1)
        };
    }
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
    const { hue, saturation, brightness, energyMultiplier, seed } = frameData;
    const circles = [];
    
    // Randomize number of circles
    const numCircles = this.randomInt(seed, 3, 8);
    
    for (let i = 0; i < numCircles; i++) {
      // Randomize positions with seeded randomness
      const baseX = this.randomRange(seed + i * 100, width * 0.1, width * 0.9);
      const baseY = this.randomRange(seed + i * 200, height * 0.1, height * 0.9);
      const x = baseX + Math.sin(frameData.time + i) * this.randomRange(seed + i * 300, 20, 80);
      const y = baseY + Math.cos(frameData.time + i * 2) * this.randomRange(seed + i * 400, 20, 80);
      
      // Randomize circle properties
      const radius = this.randomRange(seed + i * 500, 15, 25) + (energyMultiplier * 30);
      const opacity = this.randomRange(seed + i * 600, 0.2, 0.4) + (energyMultiplier * 0.4);
      const hueOffset = this.randomRange(seed + i * 700, -60, 60);
      
      circles.push(`
        <circle 
          cx="${x}" 
          cy="${y}" 
          r="${radius}" 
          fill="hsl(${hue + hueOffset}, ${saturation}%, ${brightness}%)" 
          opacity="${opacity}"
        />
      `);
    }
    
    return circles.join('');
  }

  private generateAudioReactiveLines(frameData: any, width: number, height: number): string {
    const { hue, saturation, brightness, motionIntensity, seed } = frameData;
    const lines = [];
    
    // Randomize number of lines
    const numLines = this.randomInt(seed, 2, 6);
    
    for (let i = 0; i < numLines; i++) {
      // Randomize line positions and properties
      const y1 = this.randomRange(seed + i * 100, height * 0.1, height * 0.9);
      const y2 = y1 + Math.sin(frameData.time + i) * this.randomRange(seed + i * 200, 50, 150);
      const strokeWidth = this.randomRange(seed + i * 300, 1, 3) + (motionIntensity * 3);
      const hueOffset = this.randomRange(seed + i * 400, -90, 90);
      const opacity = this.randomRange(seed + i * 500, 0.5, 0.9);
      
      lines.push(`
        <line 
          x1="0" 
          y1="${y1}" 
          x2="${width}" 
          y2="${y2}" 
          stroke="hsl(${hue + hueOffset}, ${saturation}%, ${brightness}%)" 
          stroke-width="${strokeWidth}"
          opacity="${opacity}"
        />
      `);
    }
    
    return lines.join('');
  }

  private generateFrenchNewWaveCircles(frameData: any, width: number, height: number): string {
    const { rms, jumpCutIntensity, contrastMultiplier, seed } = frameData;
    const circles = [];
    
    // RMS-reactive number of circles with randomization
    const baseNumCircles = Math.floor(3 + (rms * 8));
    const numCircles = this.randomInt(seed, baseNumCircles - 1, baseNumCircles + 2);
    
    for (let i = 0; i < numCircles; i++) {
      // Jump cut effect: circles appear/disappear based on RMS
      if (jumpCutIntensity > 0 || this.randomRange(seed + i * 100, 0, 1) > 0.3) {
        // Randomize positions more dramatically
        const baseX = this.randomRange(seed + i * 200, width * 0.05, width * 0.95);
        const baseY = this.randomRange(seed + i * 300, height * 0.05, height * 0.95);
        const x = baseX + (rms * 100 * Math.sin(frameData.time + i));
        const y = baseY + (rms * 50 * Math.cos(frameData.time + i * 2));
        
        // Randomize circle properties
        const radius = this.randomRange(seed + i * 400, 10, 20) + (rms * 40) + (jumpCutIntensity * 20);
        const opacity = this.randomRange(seed + i * 500, 0.1, 0.3) + (rms * 0.6) + (jumpCutIntensity * 0.3);
        
        // High contrast black/white based on RMS with randomization
        const threshold = this.randomRange(seed + i * 600, 0.15, 0.25);
        const fillColor = rms > threshold ? '#ffffff' : '#000000';
        
        circles.push(`
          <circle 
            cx="${x}" 
            cy="${y}" 
            r="${radius}" 
            fill="${fillColor}" 
            opacity="${opacity}"
            stroke="${rms > threshold ? '#000000' : '#ffffff'}"
            stroke-width="${this.randomRange(seed + i * 700, 0.5, 2) + (rms * 3)}"
          />
        `);
      }
    }
    
    return circles.join('');
  }

  private generateFrenchNewWaveLines(frameData: any, width: number, height: number): string {
    const { rms, jumpCutIntensity, contrastMultiplier, seed } = frameData;
    const lines = [];
    
    // RMS-reactive number of lines with randomization
    const baseNumLines = Math.floor(2 + (rms * 6));
    const numLines = this.randomInt(seed, baseNumLines - 1, baseNumLines + 2);
    
    for (let i = 0; i < numLines; i++) {
      // Jump cut effect: lines appear/disappear based on RMS
      if (jumpCutIntensity > 0 || this.randomRange(seed + i * 100, 0, 1) > 0.4) {
        // Randomize line positions and properties
        const y1 = this.randomRange(seed + i * 200, height * 0.1, height * 0.9);
        const y2 = y1 + Math.sin(frameData.time + i) * this.randomRange(seed + i * 300, 30, 200);
        const strokeWidth = this.randomRange(seed + i * 400, 0.5, 2) + (rms * 5) + (jumpCutIntensity * 3);
        const opacity = this.randomRange(seed + i * 500, 0.2, 0.5) + (rms * 0.5) + (jumpCutIntensity * 0.4);
        
        // High contrast black/white based on RMS with randomization
        const threshold = this.randomRange(seed + i * 600, 0.15, 0.22);
        const strokeColor = rms > threshold ? '#ffffff' : '#000000';
        
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
    const { rms, jumpCutIntensity, filmGrainIntensity, seed, time } = frameData;
    const elements = [];
    
    // Add temporal variation to number of shapes
    const baseNumShapes = Math.floor(2 + (rms * 4) + Math.sin(time * 0.5) * 2);
    const numShapes = this.randomInt(seed, baseNumShapes - 2, baseNumShapes + 3);
    
    // Add temporal variation to shape properties
    for (let i = 0; i < numShapes; i++) {
      // Add temporal variation to position
      const baseX = this.randomRange(seed + i * 100, width * 0.1, width * 0.9);
      const baseY = this.randomRange(seed + i * 200, height * 0.1, height * 0.9);
      const x = baseX + Math.sin(time * (i + 1)) * 20;
      const y = baseY + Math.cos(time * (i + 2)) * 20;
      
      // Add temporal variation to size and opacity
      const baseSize = this.randomRange(seed + i * 300, 15, 25);
      const size = baseSize + (rms * 60) + Math.sin(time * (i + 3)) * 10;
      const opacity = this.randomRange(seed + i * 400, 0.3, 0.5) + (rms * 0.4) + Math.abs(Math.sin(time * (i + 4))) * 0.2;
      
      // Randomize shape types and properties
      const shapeType = this.randomInt(seed + i * 500, 0, 3); // 0: triangle, 1: rectangle, 2: circle, 3: polygon
      const threshold = this.randomRange(seed + i * 600, 0.15, 0.25);
      
      // Add temporal variation to colors
      const isWhite = Math.sin(time * (i + 5)) > 0;
      const fillColor = rms > threshold ? (isWhite ? '#ffffff' : '#000000') : (isWhite ? '#000000' : '#ffffff');
      const strokeColor = rms > threshold ? (isWhite ? '#000000' : '#ffffff') : (isWhite ? '#ffffff' : '#000000');
      
      // Add temporal variation to stroke width
      const strokeWidth = this.randomRange(seed + i * 700, 0.5, 2) + (rms * 2) + Math.abs(Math.sin(time * (i + 6))) * 2;
      
      if (shapeType === 0) {
        // Triangle with temporal variation
        elements.push(`
          <polygon 
            points="${x-size},${y+size} ${x+size},${y+size} ${x},${y-size}" 
            fill="${fillColor}" 
            opacity="${opacity}"
            stroke="${strokeColor}"
            stroke-width="${strokeWidth}"
          />
        `);
      } else if (shapeType === 1) {
        // Rectangle with temporal variation
        elements.push(`
          <rect 
            x="${x-size}" 
            y="${y-size}" 
            width="${size*2}" 
            height="${size*2}" 
            fill="${fillColor}" 
            opacity="${opacity}"
            stroke="${strokeColor}"
            stroke-width="${strokeWidth}"
          />
        `);
      } else if (shapeType === 2) {
        // Circle with temporal variation
        elements.push(`
          <circle 
            cx="${x}" 
            cy="${y}" 
            r="${size}" 
            fill="${fillColor}" 
            opacity="${opacity}"
            stroke="${strokeColor}"
            stroke-width="${strokeWidth}"
          />
        `);
      } else {
        // Polygon (star-like) with temporal variation
        const points = [];
        const numPoints = this.randomInt(seed + i * 800, 5, 8);
        for (let j = 0; j < numPoints; j++) {
          const angle = (j * 2 * Math.PI) / numPoints;
          const radius = j % 2 === 0 ? size : size * 0.5;
          const px = x + radius * Math.cos(angle + time * (j + 7));
          const py = y + radius * Math.sin(angle + time * (j + 8));
          points.push(`${px},${py}`);
        }
        elements.push(`
          <polygon 
            points="${points.join(' ')}" 
            fill="${fillColor}" 
            opacity="${opacity}"
            stroke="${strokeColor}"
            stroke-width="${strokeWidth}"
          />
        `);
      }
    }
    
    // Jump cut flash effect with randomization
    if (jumpCutIntensity > 0) {
      const flashOpacity = this.randomRange(seed, 0.05, 0.15);
      elements.push(`
        <rect 
          x="0" 
          y="0" 
          width="${width}" 
          height="${height}" 
          fill="#ffffff" 
          opacity="${flashOpacity}"
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
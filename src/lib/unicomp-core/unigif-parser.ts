/**
 * UniGIF Parser v1.0
 * Парсер для покадровой анимации.
 * Вес: ~10 KB (minified + gzip)
 * 
 * Назначение:
 * - GIF-подобная анимация
 * - Последовательность статических состояний
 * - Экспорт в видео-ряд
 */

import type { BaseSpec } from '../unicomp-core/types';
import { parseUniPNG, PngScene } from './unipng-parser';

export interface GifFrame {
  index: number;
  scene: PngScene;
  duration: number;
}

export interface GifScene extends BaseSpec {
  frames: GifFrame[];
  totalDuration: number;
  loop: boolean;
}

export function parseUniGIF(input: string): GifScene {
  const lines = input.split('\n').filter(l => l.trim() && !l.trim().startsWith('#'));
  const frames: GifFrame[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    let duration = 1.0;
    
    const tMatch = line.match(/\[t=([\d.]+)\]/);
    if (tMatch) {
      duration = parseFloat(tMatch[1]);
    }
    
    try {
      const scene = parseUniPNG(line.replace(/\[t=[\d.]+\]/g, ''));
      frames.push({ index: i, scene, duration });
    } catch (e) {
      console.warn(`Frame ${i} parse error:`, e);
    }
  }
  
  const totalDuration = frames.reduce((sum, f) => sum + f.duration, 0);
  
  return {
    grid: frames[0]?.scene.grid || { g: { x: 10, y: 10 } },
    symbols: frames[0]?.scene.symbols || [],
    frames,
    totalDuration,
    loop: true,
    version: '1.0'
  };
}

export function extractFrames(scene: GifScene): HTMLCanvasElement[] {
  const { pngToCanvas } = require('./unipng-parser');
  return scene.frames.map(f => pngToCanvas(f.scene, 20));
}

export function gifToUniMPG(scene: GifScene): string {
  return scene.frames.map((f, i) => 
    `[k=${i};t=${f.duration}]${stringifyScene(f.scene)}`
  ).join(';');
}

function stringifyScene(scene: PngScene): string {
  const grid = `(${scene.grid.g?.x}×${scene.grid.g?.y})`;
  const symbols = scene.symbols.map(s => 
    `${s.v || ''}${s.d.start}-${s.d.end}`
  ).join(';');
  return `${grid}:${symbols}`;
}
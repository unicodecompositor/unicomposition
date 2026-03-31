/**
 * UniPNG Parser v1.0
 * Парсер для статических цветных сцен.
 * Вес: ~8 KB (minified + gzip)
 * 
 * Назначение:
 * - Экспорт в PNG/WebP
 * - Превью для веба
 * - Базовый рендеринг без анимации
 */

import type { BaseSymbol, BaseSpec, TransformVector, LayerStyles, Vec3 } from '../unicomp-core/types';
import { parseBounds, parseAngleForce, parseVec3, bakeForExport } from '../unicomp-core/utils';

export interface PngSymbol extends BaseSymbol {
  tr?: TransformVector;
  lc?: LayerStyles;
  vp?: Vec3;
  zd?: Vec3;
  zi?: number;
}

export interface PngScene extends BaseSpec {
  symbols: PngSymbol[];
  gs?: { gc?: string; gb?: string };
}

export function parseUniPNG(input: string): PngScene {
  const symbols: PngSymbol[] = [];
  let gridW = 10, gridH = 10;
  let gs: { gc?: string; gb?: string } = {};
  
  const gridMatch = input.match(/^\((\d+)(?:×(\d+))?\)/);
  if (gridMatch) {
    gridW = parseInt(gridMatch[1], 10);
    gridH = gridMatch[2] ? parseInt(gridMatch[2], 10) : gridW;
  }
  
  const gsMatch = input.match(/\[([^\]]+)\]/);
  if (gsMatch) {
    const params = gsMatch[1].split(';');
    for (const p of params) {
      const [k, v] = p.split('=');
      if (k === 'gc') gs.gc = v.replace(/"/g, '');
      if (k === 'gb') gs.gb = v.replace(/"/g, '');
    }
  }
  
  const colonIdx = input.indexOf(':');
  const layersPart = colonIdx > 0 ? input.substring(colonIdx + 1) : input;
  
  const layerRegex = /([#@$]?\w+)?(\[[^\]]+\])?(\d+-\d+)/g;
  let match: RegExpExecArray | null;
  
  while ((match = layerRegex.exec(layersPart)) !== null) {
    const sym: PngSymbol = { v: match[1], d: parseBounds(match[3]) };
    
    if (match[2]) {
      const params = match[2].slice(1, -1).split(';');
      for (const p of params) {
        const [k, v] = p.split('=');
        if (!k || !v) continue;
        
        const val = v.replace(/"/g, '');
        
        switch (k.toLowerCase()) {
          case 'c': sym.lc = { ...sym.lc, c: val }; break;
          case 'b': sym.lc = { ...sym.lc, b: val }; break;
          case 'bc': sym.lc = { ...sym.lc, bc: val }; break;
          case 'bb': sym.lc = { ...sym.lc, bb: val }; break;
          case 'r': sym.tr = { ...sym.tr, r: parseFloat(val) }; break;
          case 'f': sym.tr = { ...sym.tr, f: val as 'h'|'v'|'hv' }; break;
          case 'sp': sym.tr = { ...sym.tr, sp: parseAngleForce(val, 'sp') }; break;
          case 'w': sym.tr = { ...sym.tr, w: parseAngleForce(val, 'w') }; break;
          case 'st': sym.tr = { ...sym.tr, st: parseAngleForce(val, 'st') }; break;
          case 'vp': sym.vp = parseVec3(val); break;
          case 'zd': sym.zd = parseVec3(val); break;
          case 'zi': sym.zi = parseInt(val, 10); break;
        }
      }
    }
    
    symbols.push(sym);
  }
  
  return {
    grid: { g: { x: gridW, y: gridH } },
    symbols,
    gs,
    version: '1.0'
  };
}

export function bakeUniPNG(input: string): PngScene {
  const parsed = parseUniPNG(input);
  // Для статики всё уже "запечено" в d=
  return parsed;
}

export function pngToCanvas(scene: PngScene, cellSize: number = 20): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const w = (scene.grid.g?.x || 10) * cellSize;
  const h = (scene.grid.g?.y || 10) * cellSize;
  canvas.width = w;
  canvas.height = h;
  
  const ctx = canvas.getContext('2d')!;
  
  // Grid background
  if (scene.gs?.gc) {
    ctx.fillStyle = scene.gs.gc;
    ctx.fillRect(0, 0, w, h);
  }
  
  // Symbols
  for (const sym of scene.symbols) {
    const x1 = (sym.d.start % (scene.grid.g?.x || 10)) * cellSize;
    const y1 = Math.floor(sym.d.start / (scene.grid.g?.x || 10)) * cellSize;
    const x2 = (sym.d.end % (scene.grid.g?.x || 10)) * cellSize + cellSize;
    const y2 = Math.floor(sym.d.end / (scene.grid.g?.x || 10)) * cellSize + cellSize;
    
    // Layer background
    if (sym.lc?.bc) {
      ctx.fillStyle = sym.lc.bc;
      ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
    }
    
    // Symbol face
    if (sym.lc?.c) {
      ctx.fillStyle = sym.lc.c;
      ctx.font = `${cellSize}px sans-serif`;
      ctx.fillText(sym.v || '?', x1, y1 + cellSize * 0.8);
    }
  }
  
  return canvas;
}
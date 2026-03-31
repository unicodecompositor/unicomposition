/**
 * UniAsc Parser v1.0
 * Минималистичный парсер для монохромных сцен.
 * Вес: ~2 KB (minified + gzip)
 * 
 * Назначение:
 * - Терминалы, текстовые превью
 * - Валидация геометрии без стилей
 * - Быстрая генерация масок для ИИ
 */

import type { BaseSymbol, BaseSpec, Bounds } from '../unicomp-core/types';
import { parseBounds } from '../unicomp-core/utils';

export interface AscSymbol extends BaseSymbol {
  char: string;
}

export interface AscScene extends BaseSpec {
  symbols: AscSymbol[];
  matrix?: number[][];
}

export function parseUniAsc(input: string, fixedSize?: number): AscScene {
  const symbols: AscSymbol[] = [];
  let maxEnd = 0;
  
  const tokens = input.split(';').filter(t => t.trim());
  for (const token of tokens) {
    if (!token.trim()) continue;
    
    const charMatch = token.match(/^([^\[\];\d]+)/);
    const dMatch = token.match(/d=([^;\]\s]+)/);
    
    if (dMatch) {
      const d = parseBounds(dMatch[1]);
      symbols.push({ char: charMatch ? charMatch[1] : '?', v: charMatch?.[1], d });
      if (d.end > maxEnd) maxEnd = d.end;
    }
  }
  
  const size = fixedSize || Math.ceil(Math.sqrt(maxEnd + 1));
  const scene: AscScene = {
    grid: { g: { x: size, y: size } },
    symbols,
    version: '1.0'
  };
  
  scene.matrix = toMatrix(scene);
  return scene;
}

export function toMatrix(scene: AscScene): number[][] {
  const size = scene.grid.g?.x || 10;
  const matrix = Array(size).fill(0).map(() => Array(size).fill(0));
  
  for (const sym of scene.symbols) {
    for (let i = sym.d.start; i <= sym.d.end; i++) {
      const x = i % size;
      const y = Math.floor(i / size);
      if (y < size && x < size) matrix[y][x] = 1;
    }
  }
  
  return matrix;
}

export function matrixToAscii(matrix: number[][]): string {
  return matrix.map(row => row.map(c => c ? '█' : ' ').join('')).join('\n');
}

export function parseAsciiMatrix(matrix: number[][]): AscScene {
  const symbols: AscSymbol[] = [];
  let id = 0;
  
  for (let y = 0; y < matrix.length; y++) {
    for (let x = 0; x < matrix[y].length; x++) {
      if (matrix[y][x] === 1) {
        const width = matrix[0]?.length || 0;
        const index = y * width + x;
        symbols.push({
          char: '#',
          v: `#block_${id++}`,
          d: { start: index, end: index }
        });
      }
    }
  }
  
  return {
    grid: { g: { x: matrix[0]?.length || 0, y: matrix.length } },
    symbols,
    version: '1.0'
  };
}
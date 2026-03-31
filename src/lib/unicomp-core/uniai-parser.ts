/**
 * UniAI Parser v1.0
 * Минимальный парсер для ИИ-генерации и маршрутизации.
 * Вес: ~3 KB (minified + gzip)
 * 
 * Назначение:
 * - Детекция формата по ключевым параметрам
 * - Извлечение v=, d= для базовой геометрии
 * - Маршрутизация на специализированные парсеры
 */

import type { BaseSymbol, BaseSpec, UniFormat } from '../unicomp-core/types';
import { parseBounds, detectFormat } from '../unicomp-core/utils';

export interface AIObject extends BaseSymbol {
  detectedFormat: UniFormat;
  confidence: number;
  compatibleEngines: string[];
}

export interface AIScene extends BaseSpec {
  format: UniFormat;
  meta: {
    hasAnimation: boolean;
    has3D: boolean;
    hasStreaming: boolean;
    compatibleEngines: string[];
  };
}

const ENGINE_MAP: Record<UniFormat, string[]> = {
  'uni3ds': ['WebGL3D', 'ThreeJS', 'BabylonJS'],
  'unimpg': ['PlayerJS', 'Canvas2D', 'WebGL'],
  'unistr': ['WebSocket', 'WebRTC', 'StreamProcessor'],
  'unipng': ['Canvas2D', 'ImageRenderer'],
  'unigif': ['Canvas2D', 'FramePlayer'],
  'uniasc': ['Terminal', 'TextRenderer'],
  'uniai': ['LLM', 'TextGenerator', 'Validator'],
  'unilib': ['Storage', 'CDN', 'AssetManager'],
  'unicomp': ['Editor', 'FullParser', 'SuperTransformer']
};

export function parseUniAI(input: string): AIScene {
  const objects: AIObject[] = [];
  const format = detectFormat(input);
  
  const tokens = input.split(';').filter(t => t.trim());
  for (const token of tokens) {
    if (!token.trim() || token.startsWith('#') && !token.includes('[')) continue;
    
    const obj: AIObject = {
      v: undefined,
      d: { start: 0, end: 0 },
      detectedFormat: format,
      confidence: 0.9,
      compatibleEngines: ENGINE_MAP[format]
    };
    
    const vMatch = token.match(/v=([^;\]\s]+)/);
    if (vMatch) obj.v = vMatch[1].replace(/"/g, '');
    else if (token.startsWith('#')) obj.v = `#${token.split(/[_\[\];]/)[0].slice(1)}`;
    
    const dMatch = token.match(/d=([^;\]\s]+)/);
    if (dMatch) obj.d = parseBounds(dMatch[1]);
    
    if (obj.v || obj.d) objects.push(obj);
  }
  
  return {
    format,
    grid: { g: { x: 10, y: 10 } },
    symbols: objects,
    meta: {
      hasAnimation: format === 'unimpg' || format === 'unigif',
      has3D: format === 'uni3ds',
      hasStreaming: format === 'unistr',
      compatibleEngines: ENGINE_MAP[format]
    }
  };
}

export function getRecommendedParser(format: UniFormat): string {
  const map: Record<UniFormat, string> = {
    'uniai': 'parseUniAI',
    'uniasc': 'parseUniAsc',
    'unipng': 'parseUniPNG',
    'unigif': 'parseUniGIF',
    'unimpg': 'parseUniMPG',
    'unistr': 'parseUniStr',
    'uni3ds': 'parseUni3DS',
    'unilib': 'parseUniLib',
    'unicomp': 'parseUniComp'
  };
  return map[format] || 'parseUniComp';
}
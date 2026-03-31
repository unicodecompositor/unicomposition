/**
 * ============================================================================
 * UniComp Format Converters v1.0
 * ============================================================================
 * 4 конвертера между форматами UniComp.
 * Основано на спецификации UniComp v1.0 (log.txt)
 * 
 * Импорт:
 *   import { uniaiToUnipng, unilibToUnigif, unistrToUnimpg, uniascToUnigif } from './unicomp-converters';
 * 
 * Вес: ~5 KB (minified + gzip)
 * ============================================================================
 */

import { parseUniComp, stringifySpec, type UniCompSpec, type SymbolSpec } from './unicomp-parser';

// ============================================================================
// 1. UNIAI → UNIPNG (AI-генерация → Статика)
// ============================================================================

/**
 * Конвертирует AI-формат (минимальный v + d) в статическую композицию.
 * Удаляет историю, схлопывает всё в финальные d=.
 * 
 * @param aiInput - Входная строка в формате .uniai
 * @returns Строка в формате .unipng
 */
export function uniaiToUnipng(aiInput: string): string {
  const result = parseUniComp(aiInput);
  
  if (!result.success) {
    throw new Error(`Parse error: ${result.error.message}`);
  }
  
  const spec = result.spec;
  
  // Удаляем всю историю, оставляем только финальные состояния
  const bakedSymbols = spec.symbols.map(sym => ({
    ...sym,
    history: undefined,
    keyframes: undefined,
    // Оставляем только v, d, lc, tr
  }));
  
  const bakedSpec: UniCompSpec = {
    ...spec,
    symbols: bakedSymbols,
  };
  
  return stringifySpec(bakedSpec);
}

// ============================================================================
// 2. UNILIB → UNIGIF (Библиотека → Анимация кадров)
// ============================================================================

export interface LibAsset {
  id: string;
  data: string;
  tags?: string[];
  duration?: number;
}

export interface LibManifest {
  name: string;
  version: string;
  assets: LibAsset[];
}

/**
 * Конвертирует библиотеку ассетов в покадровую анимацию.
 * Каждый ассет становится кадром k=N.
 * 
 * @param libInput - JSON или текст библиотеки .unilib
 * @param frameDuration - Длительность кадра в секундах (по умолчанию 1.0)
 * @returns Строка в формате .unigif
 */
export function unilibToUnigif(libInput: string, frameDuration: number = 1.0): string {
  let manifest: LibManifest;
  
  try {
    manifest = JSON.parse(libInput);
  } catch {
    // Парсинг текстового формата .unilib
    manifest = parseTextLib(libInput);
  }
  
  if (!manifest.assets || manifest.assets.length === 0) {
    throw new Error('Library has no assets');
  }
  
  const frames: string[] = [];
  
  for (let i = 0; i < manifest.assets.length; i++) {
    const asset = manifest.assets[i];
    const duration = asset.duration ?? frameDuration;
    
    // Парсим каждый ассет как отдельное правило
    const assetResult = parseUniComp(asset.data);
    
    if (assetResult.success) {
      // Добавляем маркер кадра k=i с длительностью t=duration
      const frameSpec = assetResult.spec;
      const symbolsWithKeyframe = frameSpec.symbols.map(sym => ({
        ...sym,
        keyframes: [{
          index: i,
          duration,
          p: i === manifest.assets.length - 1 ? 0 : 2, // 0=static, 2=forward
        }],
      }));
      
      frames.push(stringifySpec({
        ...frameSpec,
        symbols: symbolsWithKeyframe,
      }));
    }
  }
  
  // Многострочный формат: каждая строка = кадр
  return frames.join('\n');
}

function parseTextLib(input: string): LibManifest {
  const assets: LibAsset[] = [];
  const lines = input.split('\n');
  let currentAsset: Partial<LibAsset> = {};
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    if (trimmed.startsWith('#!')) {
      // Метаданные
      const [k, v] = trimmed.slice(2).split('=');
      if (k === 'name' || k === 'version') {
        (manifest as any)[k] = v;
      }
    } else if (trimmed.startsWith('#@')) {
      // Новый ассет: #@id:type
      if (currentAsset.id) assets.push(currentAsset as LibAsset);
      const match = trimmed.match(/#@([^:]+):(\w+)/);
      if (match) {
        currentAsset = { id: match[1], data: '' };
      }
    } else if (currentAsset.id) {
      currentAsset.data = (currentAsset.data || '') + trimmed;
    }
  }
  
  if (currentAsset.id) {
    assets.push(currentAsset as LibAsset);
  }
  
  return {
    name: 'UniLib',
    version: '1.0',
    assets,
  };
}

// ============================================================================
// 3. UNISTR → UNIMPG (Поток → Плеер)
// ============================================================================

export interface StreamFrame {
  id: string;
  timestamp: number;
  delta: {
    v?: string;
    d?: { start: number; end: number };
    tr?: any;
    lc?: any;
  };
}

export interface StreamState {
  frames: StreamFrame[];
  isActive: boolean;
}

/**
 * Конвертирует потоковые данные в полноценный плеер.
 * Сохраняет все кадры, игнорируя p=000 (удаление).
 * 
 * @param streamInput - Входная строка в формате .unistr
 * @param playState - Play State для финального кадра (по умолчанию 4 = ping-pong)
 * @returns Строка в формате .unimpg
 */
export function unistrToUnimpg(streamInput: string, playState: number = 4): string {
  const frames = parseStreamFrames(streamInput);
  
  if (frames.length === 0) {
    throw new Error('No frames in stream');
  }
  
  // Собираем все состояния, игнорируя p=000
  const validFrames = frames.filter(f => {
    // Пропускаем кадры с удалением (p=000)
    return !f.delta.tr?.p || f.delta.tr.p !== 8;
  });
  
  // Генерируем ключевые кадры k=0, k=1, k=2...
  const keyframeBlocks = validFrames.map((frame, i) => {
    const params: string[] = [`k=${i}`, `t=1`, `p=${i === validFrames.length - 1 ? playState : 2}`];
    
    if (frame.delta.v) params.push(`v="${frame.delta.v}"`);
    if (frame.delta.d) params.push(`d=${frame.delta.d.start}-${frame.delta.d.end}`);
    if (frame.delta.tr) {
      if (frame.delta.tr.r) params.push(`r=${frame.delta.tr.r}`);
      if (frame.delta.tr.f) params.push(`f=${frame.delta.tr.f}`);
    }
    if (frame.delta.lc) {
      if (frame.delta.lc.c) params.push(`c="${frame.delta.lc.c}"`);
      if (frame.delta.lc.bc) params.push(`bc="${frame.delta.lc.bc}"`);
    }
    
    return `[${params.join(';')}]`;
  });
  
  // Формируем итоговое правило
  const gridPart = '(10×10)';
  const symbolsPart = `#stream_layer${keyframeBlocks.join('')}0-99`;
  
  return `${gridPart}:${symbolsPart}`;
}

function parseStreamFrames(input: string): StreamFrame[] {
  const frames: StreamFrame[] = [];
  const markers = input.split(/(START|STOP|NEXT|DELTA)/g);
  let currentId: string | null = null;
  
  for (let i = 0; i < markers.length; i++) {
    const token = markers[i].trim();
    
    if (token === 'START') {
      if (i + 1 < markers.length) {
        currentId = markers[i + 1].trim();
        i++;
      }
    } else if (token === 'STOP') {
      currentId = null;
    } else if (token === 'DELTA' && currentId) {
      if (i + 1 < markers.length) {
        const deltaStr = markers[i + 1].trim();
        const delta = parseStreamDelta(deltaStr);
        
        frames.push({
          id: currentId,
          timestamp: Date.now(),
          delta,
        });
        i++;
      }
    }
  }
  
  return frames;
}

function parseStreamDelta(str: string): StreamFrame['delta'] {
  const delta: StreamFrame['delta'] = {};
  const params = str.split(';');
  
  for (const p of params) {
    const [k, v] = p.split('=');
    if (!k || !v) continue;
    
    const val = v.replace(/"/g, '');
    
    if (k === 'v') delta.v = val;
    else if (k === 'd') {
      const [start, end] = val.split('-').map(Number);
      delta.d = { start, end };
    }
    else if (k === 'tr' || k === 'lc') {
      try {
        delta[k] = JSON.parse(val);
      } catch {
        delta[k] = val;
      }
    }
  }
  
  return delta;
}

// ============================================================================
// 4. UNIASC → UNIGIF (ASCII-кадры → Анимация)
// ============================================================================

export interface AscFrame {
  matrix: number[][];
  duration?: number;
}

/**
 * Конвертирует многострочный ASCII в покадровую анимацию.
 * Каждая строка = один кадр монохромной матрицы.
 * 
 * @param ascInput - Многострочная ASCII-матрица
 * @param frameDuration - Длительность кадра в секундах
 * @returns Строка в формате .unigif
 */
export function uniascToUnigif(ascInput: string, frameDuration: number = 0.5): string {
  const lines = ascInput.split('\n').filter(l => l.trim() && !l.trim().startsWith('#'));
  
  if (lines.length === 0) {
    throw new Error('No ASCII frames found');
  }
  
  const frames: AscFrame[] = [];
  
  for (const line of lines) {
    const matrix = parseAsciiMatrix(line.trim());
    if (matrix) {
      frames.push({ matrix, duration: frameDuration });
    }
  }
  
  // Конвертируем каждый кадр в UniComp-правило
  const rules: string[] = [];
  
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    const symbols: string[] = [];
    
    // Находим все заполненные ячейки
    for (let y = 0; y < frame.matrix.length; y++) {
      for (let x = 0; x < frame.matrix[y].length; x++) {
        if (frame.matrix[y][x] === 1) {
          const index = y * frame.matrix[y].length + x;
          symbols.push(`█[${i === 0 ? 'k=0' : `k=${i};t=${frame.duration}`}];${index}-${index}`);
        }
      }
    }
    
    const gridW = frame.matrix[0]?.length || 10;
    const gridH = frame.matrix.length || 10;
    
    rules.push(`(${gridW}×${gridH}):${symbols.join(';')}`);
  }
  
  return rules.join('\n');
}

function parseAsciiMatrix(line: string): number[][] | null {
  // Поддержка форматов: [0001000], █░█, 101010
  const row: number[] = [];
  
  for (const char of line) {
    if (char === '0' || char === '░' || char === ' ') {
      row.push(0);
    } else if (char === '1' || char === '█' || char === '#') {
      row.push(1);
    }
  }
  
  if (row.length === 0) return null;
  
  // Возвращаем как однострочную матрицу
  return [row];
}

// ============================================================================
// 5. УТИЛИТЫ (общие helper-функции)
// ============================================================================

/**
 * Bake: схлопывает историю в финальные значения.
 * Используется перед экспортом в статические форматы.
 */
export function bakeSpec(spec: UniCompSpec): UniCompSpec {
  return {
    ...spec,
    symbols: spec.symbols.map(sym => ({
      ...sym,
      history: undefined,
      keyframes: undefined,
    })),
  };
}

/**
 * Detect format by content.
 */
export function detectFormat(input: string): 'uniai' | 'unipng' | 'unigif' | 'unimpg' | 'unistr' | 'unilib' | 'uniasc' | 'unicomp' {
  if (input.includes('zi=') || input.includes('vp=')) return 'uni3ds';
  if (input.includes('START') || input.includes('STOP') || input.includes('DELTA')) return 'unistr';
  if (input.startsWith('{') || input.includes('#@') || input.includes('#!')) return 'unilib';
  if (input.startsWith('#') && !input.includes('[')) return 'uniai';
  if (input.split('\n').length > 1 && input.includes('k=')) return 'unigif';
  if (input.includes('k=') || input.includes('p=')) return 'unimpg';
  if (input.match(/^[01░█#]+$/m)) return 'uniasc';
  if (input.includes('(×') || input.includes('[')) return 'unicomp';
  return 'unipng';
}

/**
 * Auto-convert: определяет формат и конвертирует в целевой.
 */
export function autoConvert(input: string, targetFormat: 'unipng' | 'unigif' | 'unimpg'): string {
  const sourceFormat = detectFormat(input);
  
  switch (sourceFormat) {
    case 'uniai':
      return targetFormat === 'unipng' ? uniaiToUnipng(input) : input;
    case 'unilib':
      return targetFormat === 'unigif' ? unilibToUnigif(input) : input;
    case 'unistr':
      return targetFormat === 'unimpg' ? unistrToUnimpg(input) : input;
    case 'uniasc':
      return targetFormat === 'unigif' ? uniascToUnigif(input) : input;
    default:
      return input;
  }
}
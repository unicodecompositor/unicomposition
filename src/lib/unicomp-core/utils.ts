/**
 * ============================================================================
 * UniComp Core Utils v1.0
 * ============================================================================
 * Общие утилиты для всех 9 форматов парсеров.
 * Основано на спецификации UniComp v1.0 (log.txt)
 * 
 * Ключевая модель:
 * - grid = объединённые bounds всех слоёв
 * - pg = якорь первичной сетки (движется с расширением grid)
 * - po = смещение слоя относительно pg
 * - d = pg + po (финальные координаты после "запекания")
 * 
 * УДАЛЕНО: me, se, el, et, hl, ht, o, s, debt-логика, DeltaOp
 * 
 * Импорт:
 *   import { parseBounds, bakeForExport, computeGridSize } from '../unicomp-core/utils';
 * 
 * Вес: ~4 KB (minified + gzip)
 * ============================================================================
 */

import type {
  Vec2,
  Vec3,
  Vec4,
  Bounds,
  BaseSpec,
  EditorSpec,
  BakedSpec,
  BaseSymbol,
  EditorSymbol,
  Keyframe
} from './types';

// ============================================================================
// 1. SECURITY LIMITS (Защита от DoS)
// ============================================================================

export const SECURITY_LIMITS = {
  MAX_INPUT_LENGTH: 100000,
  MAX_SYMBOLS: 5000,
  MAX_PARAMS_PER_SYMBOL: 50,
  MIN_GRID_SIZE: 2,
  MAX_GRID_SIZE: 500,
  TIMEOUT_MS: 500,
  MAX_LINES: 2000,
  MAX_HISTORY_DEPTH: 100,
  MAX_KEYFRAMES: 500,
} as const;

// ============================================================================
// 2. ПАРСИНГ ГРАНИЦ (Bounds Parsing)
// ============================================================================

/**
 * Парсит строку формата "start-end" или "start,end" в объект Bounds.
 */
export function parseBounds(str: string): Bounds {
  const trimmed = str.trim();
  const match = trimmed.match(/^\s*(-?\d+)\s*[-,\s]\s*(-?\d+)\s*$/);
  
  if (!match) {
    throw new Error(`Invalid bounds format: "${str}" (expected "start-end")`);
  }
  
  const start = parseInt(match[1], 10);
  const end = parseInt(match[2], 10);
  
  if (isNaN(start) || isNaN(end)) {
    throw new Error(`Invalid bounds values: "${str}"`);
  }
  
  return { start, end };
}

/**
 * Форматирует Bounds обратно в строку "start-end".
 */
export function formatBounds(bounds: Bounds): string {
  return `${bounds.start}-${bounds.end}`;
}

// ============================================================================
// 3. ПАРСИНГ УГЛА И СИЛЫ (Angle/Force Parsing)
// ============================================================================

/**
 * Парсит строку формата "angle,force" для трансформаций sp, w, st.
 */
export function parseAngleForce(str: string): { angle: number; force: number } {
  const normalized = str
    .replace(/[–—]/g, '-')
    .replace(/,/g, ' ')
    .replace(/[°]/g, '')
    .trim();
  
  const values = normalized.match(/-?\d*\.?\d+/g)?.map(v => parseFloat(v)) ?? [];
  
  if (values.length < 2 || values.some(Number.isNaN)) {
    throw new Error(`Invalid angle/force: "${str}" (expected "angle,force")`);
  }
  
  return {
    angle: values[0],
    force: Math.abs(values[1]),
  };
}

export function formatAngleForce(angle: number, force: number): string {
  return `${angle},${force}`;
}

// ============================================================================
// 4. ПАРСИНГ ВЕКТОРОВ (Vector Parsing)
// ============================================================================

export function parseVec2(str: string): Vec2 {
  const parts = str.split(/[,\s]+/).map(s => parseFloat(s.trim()));
  return { x: parts[0], y: parts[1] ?? parts[0] };
}

export function parseVec3(str: string): Vec3 {
  const parts = str.split(/[,\s]+/).map(s => parseFloat(s.trim()));
  return { x: parts[0], y: parts[1] ?? 0, z: parts[2] ?? 0 };
}

export function parseVec4(str: string): { top: number; right: number; bottom: number; left: number } {
  const parts = str.split(/[,\s]+/).map(s => parseFloat(s.trim()));
  return {
    top: parts[0] ?? 0,
    right: parts[1] ?? parts[0] ?? 0,
    bottom: parts[2] ?? parts[0] ?? 0,
    left: parts[3] ?? parts[1] ?? parts[0] ?? 0,
  };
}

// ============================================================================
// 5. GRID CALCULATIONS (Аффинная модель — БЕЗ me/se/debt)
// ============================================================================

/**
 * Вычисляет минимальный размер сетки, вмещающий все слои.
 * Формула: grid = объединённые bounds всех слоёв
 */
export function computeGridSize(symbols: Array<{ d?: Bounds; start?: number; end?: number }>): { width: number; height: number } {
  let minStart = Infinity;
  let maxEnd = -Infinity;
  
  for (const sym of symbols) {
    const start = sym.d?.start ?? sym.start ?? 0;
    const end = sym.d?.end ?? sym.end ?? 0;
    if (start < minStart) minStart = start;
    if (end > maxEnd) maxEnd = end;
  }
  
  if (minStart === Infinity || maxEnd === -Infinity) {
    return { width: 10, height: 10 };
  }
  
  const totalCells = maxEnd + 1;
  const size = Math.ceil(Math.sqrt(totalCells));
  
  return {
    width: Math.max(size, SECURITY_LIMITS.MIN_GRID_SIZE),
    height: Math.max(size, SECURITY_LIMITS.MIN_GRID_SIZE),
  };
}

/**
 * Вычисляет pg (Primary Grid anchor) для новой размерности сетки.
 * pg движется вместе с расширением grid, сохраняя относительное положение.
 */
export function computePgForGridResize(
  oldGrid: { width: number; height: number },
  newGrid: { width: number; height: number },
  oldPg: Bounds
): Bounds {
  const oldTotal = oldGrid.width * oldGrid.height;
  const newTotal = newGrid.width * newGrid.height;
  
  if (oldTotal === 0) {
    return { start: 0, end: newTotal - 1 };
  }
  
  const ratio = newTotal / oldTotal;
  
  return {
    start: Math.round(oldPg.start * ratio),
    end: Math.round(oldPg.end * ratio),
  };
}

/**
 * Вычисляет po (Primary Offset) для слоя относительно pg.
 * Формула: po = d - pg
 */
export function computePoFromD(d: Bounds, pg: Bounds): Bounds {
  return {
    start: d.start - pg.start,
    end: d.end - pg.end,
  };
}

/**
 * Вычисляет финальные координаты d из pg и po.
 * Формула: d = pg + po
 */
export function computeDFromPgPo(pg: Bounds, po: Bounds): Bounds {
  return {
    start: pg.start + po.start,
    end: pg.end + po.end,
  };
}

// ============================================================================
// 6. BAKING / UNBAKING (Аффинные преобразования)
// ============================================================================

/**
 * Bake: Редактор → Экспорт
 * Схлопывает аффинные параметры pg + po → d.
 * Удаляет pg, po из экспорта (они только для редактора).
 */
export function bakeForExport(spec: EditorSpec): BakedSpec {
  const pg = spec.grid.pg ?? { start: 0, end: (spec.grid.g?.x ?? 10) * (spec.grid.g?.y ?? 10) - 1 };
  
  const bakedSymbols = spec.symbols.map(sym => {
    const po = sym.po ?? { start: sym.start ?? 0, end: sym.end ?? 0 };
    const bakedD = computeDFromPgPo(pg, po);
    
    const baked: BaseSymbol = {
      v: sym.v,
      id: sym.id,
      class: sym.class,
      n: sym.n,
      d: bakedD,
      l: sym.l,
      z: sym.z,
      tr: sym.tr,
      lc: sym.lc,
      vp: sym.vp,
      zd: sym.zd,
      zi: sym.zi,
    };
    
    return baked;
  });
  
  return {
    grid: { g: spec.grid.g },
    symbols: bakedSymbols,
    raw: spec.raw,
    version: spec.version,
  };
}

/**
 * Unbake: Файл → Редактор
 * Инициализирует pg как "якорь", po как отклонение от pg.
 */
export function unbakeForEditor(spec: BakedSpec, gridSize?: number): EditorSpec {
  const gridW = spec.grid.g?.x ?? gridSize ?? 10;
  const gridH = spec.grid.g?.y ?? gridSize ?? 10;
  const gridEnd = gridW * gridH - 1;
  
  const pg: Bounds = { start: 0, end: gridEnd };
  
  const editorSymbols: EditorSymbol[] = spec.symbols.map(sym => ({
    ...sym,
    pg,
    po: computePoFromD(sym.d, pg),
  }));
  
  return {
    grid: {
      g: spec.grid.g ?? { x: gridW, y: gridH },
      pg,
      gs: (spec as any).gs,
    },
    symbols: editorSymbols,
    raw: spec.raw ?? '',
    version: spec.version ?? '1.0',
  };
}

// ============================================================================
// 7. HISTORY RESOLUTION (Сворачивание истории)
// ============================================================================

/**
 * Сворачивает стек истории в финальные значения.
 * Каждый следующий блок перезаписывает предыдущий (без дельт +=, -=).
 */
export function resolveHistory(steps: Array<{ pg?: Bounds; po?: Bounds; d?: Bounds; tr?: any; lc?: any }>): {
  pg?: Bounds;
  po?: Bounds;
  d?: Bounds;
  tr?: any;
  lc?: any;
} {
  let pg: Bounds | undefined;
  let po: Bounds | undefined;
  let d: Bounds | undefined;
  let tr: any;
  let lc: any;
  
  for (const step of steps) {
    if (step.pg) pg = step.pg;
    if (step.po) po = step.po;
    if (step.d) d = step.d;
    if (step.tr) tr = step.tr;
    if (step.lc) lc = step.lc;
  }
  
  return { pg, po, d, tr, lc };
}

/**
 * Вычисляет финальные координаты слоя с учётом pg и po.
 */
export function computeFinalBounds(
  pg: Bounds | undefined,
  po: Bounds | undefined,
  fallback: { start: number; end: number }
): Bounds {
  const pgStart = pg?.start ?? 0;
  const pgEnd = pg?.end ?? 0;
  const poStart = po?.start ?? fallback.start;
  const poEnd = po?.end ?? fallback.end;
  
  return {
    start: pgStart + poStart,
    end: pgEnd + poEnd,
  };
}

// ============================================================================
// 8. KEYFRAME AGGREGATION (Агрегация ключевых кадров)
// ============================================================================

/**
 * Агрегирует ключевые кадры для экспорта в анимированный формат.
 */
export function aggregateKeyframes(
  keyframes: Keyframe[],
  history: Array<{ pg?: Bounds; po?: Bounds; d?: Bounds }>
): Keyframe[] {
  if (keyframes.length === 0) return [];
  
  const aggregated: Keyframe[] = [];
  let historyIndex = 0;
  
  for (let i = 0; i < keyframes.length; i++) {
    const kf = keyframes[i];
    const nextKfIndex = keyframes[i + 1]?.k ?? Infinity;
    
    const stepsForThisFrame: Array<{ pg?: Bounds; po?: Bounds; d?: Bounds }> = [];
    while (historyIndex < history.length && history[historyIndex].d && history[historyIndex].d!.start < nextKfIndex) {
      stepsForThisFrame.push(history[historyIndex]);
      historyIndex++;
    }
    
    const resolved = resolveHistory(stepsForThisFrame);
    
    aggregated.push({
      ...kf,
      pg: resolved.pg ?? kf.pg,
      po: resolved.po ?? kf.po,
      d: resolved.d ?? kf.d,
    });
  }
  
  return aggregated;
}

// ============================================================================
// 9. VALIDATION HELPERS (Валидация)
// ============================================================================

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function isValidGridSize(size: number): boolean {
  return size >= SECURITY_LIMITS.MIN_GRID_SIZE && size <= SECURITY_LIMITS.MAX_GRID_SIZE;
}

export function isValidIndex(index: number, gridSize: number): boolean {
  return index >= 0 && index < gridSize;
}

export function isValidBounds(bounds: Bounds, gridSize: number): boolean {
  return bounds.start >= 0 && bounds.end >= bounds.start && bounds.end < gridSize;
}

// ============================================================================
// 10. FORMAT DETECTION (Детекция формата)
// ============================================================================

export function detectFormat(input: string): 
  | 'unicomp' | 'unipng' | 'unigif' | 'unimpg' | 'unistr'
  | 'uni3ds' | 'unilib' | 'uniai' | 'uniasc' {
  
  if (input.includes('zi=') || input.includes('vp=') || input.includes('zd=')) return 'uni3ds';
  if (input.includes('k=') || input.includes('p=') || input.includes('t=')) {
    return input.split('\n').length > 1 ? 'unigif' : 'unimpg';
  }
  if (input.includes('START') || input.includes('STOP')) return 'unistr';
  if (input.startsWith('#') && !input.includes('[')) return 'uniai';
  if (input.startsWith('{') || input.startsWith('[')) return 'unilib';
  if (input.includes('(×') || input.includes('[')) return 'unicomp';
  
  return 'uniasc';
}

// ============================================================================
// 11. STRING UTILITIES (Строковые утилиты)
// ============================================================================

export function escapeSpecialChars(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

export function unescapeSpecialChars(str: string): string {
  return str
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

export function isCommentLine(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.startsWith('#') ||
    trimmed.startsWith('//') ||
    trimmed.startsWith('--') ||
    trimmed.startsWith('/*') ||
    trimmed.startsWith('<!--') ||
    trimmed.startsWith("'''") ||
    trimmed.startsWith('"""')
  );
}

export function generateLayerId(prefix: string = 'layer'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================================================
// ЭКСПОРТ
// ============================================================================

export {
  parseBounds,
  formatBounds,
  parseAngleForce,
  formatAngleForce,
  parseVec2,
  parseVec3,
  parseVec4,
  computeGridSize,
  computePgForGridResize,
  computePoFromD,
  computeDFromPgPo,
  bakeForExport,
  unbakeForEditor,
  resolveHistory,
  computeFinalBounds,
  aggregateKeyframes,
  clamp,
  isValidGridSize,
  isValidIndex,
  isValidBounds,
  detectFormat,
  escapeSpecialChars,
  unescapeSpecialChars,
  isCommentLine,
  generateLayerId,
};

export { SECURITY_LIMITS };
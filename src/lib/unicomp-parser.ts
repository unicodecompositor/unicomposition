/**
 * ============================================================================
 * UniComp Parser v5.0 (FULL SPEC — Affine Space Model)
 * ============================================================================
 * Парсер для всех 11 форматов UniComp.
 * Основано на спецификации UniComp v1.0 (log.txt)
 * 
 * Ключевая модель:
 * - grid = объединённые bounds всех слоёв
 * - pg = якорь первичной сетки (движется с расширением grid)
 * - po = смещение слоя относительно pg
 * - d = pg + po (финальные координаты после "запекания")
 * 
 * УДАЛЕНО (taboo): me, se, el, et, hl, ht, o, s
 * СОХРАНЕНО: DeltaOp (=, +=, -=, >=, <=), k=, t=, p=
 * ============================================================================
 */

export type DeltaOp = '=' | '+=' | '-=' | '>=' | '<=';

export interface Vec2 { x: number; y: number; }
export interface Vec3 { x: number; y: number; z: number; }
export interface Vec4 { top: number; right: number; bottom: number; left: number; }

export interface Bounds {
  start: number;
  end: number;
}

export interface TransformVector {
  f?: 'h' | 'v' | 'hv';
  m?: Vec4;
  sp?: { angle: number; force: number; };
  w?: { angle: number; force: number; };
  r?: number;
  st?: { angle: number; force: number; };
}

export interface LayerStyles {
  c?: string;
  b?: string;
  bc?: string;
  bb?: string;
}

export interface GridStyles {
  gc?: string;
  gb?: string;
}

export interface ColorStruct {
  h: number; s: number; l: number; a: number; r?: number; // для c=, bc=, gc=
  w?: number; // для b=, bb=, gb=
}

export interface Space3D {
  vp?: Vec3;
  zd?: Vec3;
  zi?: number;
}

export interface HistoryStep {
  index: number;
  pg?: Bounds;
  po?: Bounds;
  d?: Bounds;
  tr?: TransformVector;
  lc?: LayerStyles;
  r?: number;
  sp?: { angle: number; force: number; };
  st?: { angle: number; force: number; };
  w?: { angle: number; force: number; };
  rotate?: number;           // для r=
  scale?: Bounds;            // для масштабирования (d)
  offset?: Bounds;           // для перемещения (po)
  colorGroup?: DeltaColor;   // для группы цветов
}

export interface DeltaColor {
  op?: DeltaOp;
  color?: string;
  opacity?: number;
  symbolBorderWidth?: number;
  symbolBorderColor?: string;
  symbolBorderOpacity?: number;
  background?: string;
  backgroundOpacity?: number;
  borderRadius?: string;
  layerBorderWidth?: number;
  layerBorderColor?: string;
  layerBorderOpacity?: number;
}

export const PLAY_STATES = {
  STATIC_START: 0,
  STATIC_END: 1,
  FORWARD: 2,
  REVERSE: 3,
  PING_PONG: 4,
  REVERSE_PING: 5,
  CLEAR_DROP_FIRST: 6,
  CLEAR_DROP_LAST: 7,
  DELETE: 8,
} as const;

export type PlayState = typeof PLAY_STATES[keyof typeof PLAY_STATES];

export interface KeyframeStep extends HistoryStep {
  k: number;
  t: number;
  p: PlayState;
}

export interface SymbolSpec {
  v?: string;
  id?: string;
  class?: string;
  n?: string;
  start: number;
  end: number;
  d?: Bounds;
  pg?: Bounds;
  po?: Bounds;
  l?: number;
  z?: number;
  tr?: TransformVector;
  f?: 'h' | 'v' | 'hv';
  m?: Vec4;
  sp?: { angle: number; force: number; };
  w?: { angle: number; force: number; };
  r?: number;
  st?: { angle: number; force: number; };
  lc?: LayerStyles;
  c?: string;
  b?: string;
  bc?: string;
  bb?: string;
  color?: string;
  opacity?: number;
  strokeColor?: string;
  strokeWidth?: number;
  strokeOpacity?: number;
  background?: string;
  backgroundOpacity?: number;
  borderRadius?: string;
  layerBorderWidth?: number;
  layerBorderColor?: string;
  layerBorderOpacity?: number;
  vp?: Vec3;
  zd?: Vec3;
  zi?: number;
  keyframes?: KeyframeStep[];
  history?: HistoryStep[];
  refId?: string;
  refName?: string;
  refClass?: string;
  refSrc?: string;
  scale?: { x: number; y: number };
  offset?: { x: number; y: number };
  bounds?: { w: number; h: number };
  flip?: 'h' | 'v' | 'hv';
  rotate?: number;
}

export interface GridSpec {
  g?: Vec2;
  pg?: Bounds;
  po?: Bounds;
  gs?: GridStyles;
  gc?: string;
  gb?: string;
  id?: string;
  class?: string;
  n?: string;
  background?: string;
  backgroundOpacity?: number;
  borderRadius?: string;
  strokeWidth?: number;
  strokeColor?: string;
  strokeOpacity?: number;
}

export interface UniCompSpec {
  grid: GridSpec;
  symbols: SymbolSpec[];
  raw: string;
  version: string;
  gridWidth: number;
  gridHeight: number;
  gridSize?: number;
  background?: string;
  backgroundOpacity?: number;
  borderRadius?: string;
  strokeWidth?: number;
  strokeColor?: string;
  strokeOpacity?: number;
  opacity?: number;
}

export interface BakedSymbol {
  v?: string;
  id?: string;
  class?: string;
  n?: string;
  d: Bounds;
  l?: number;
  z?: number;
  tr?: TransformVector;
  lc?: LayerStyles;
  vp?: Vec3;
  zd?: Vec3;
  zi?: number;
}

export interface BakedSpec {
  grid: { g?: Vec2; gs?: GridStyles };
  symbols: BakedSymbol[];
  version: string;
}

export type ParseResult = {
  success: true;
  spec: UniCompSpec;
} | {
  success: false;
  error: { message: string; line?: number; column?: number };
}

export interface MultiLineBlock {
  lineNumber: number;
  raw: string;
  result: ParseResult;
  name?: string;
}

export interface MultiLineParseResult {
  blocks: MultiLineBlock[];
  validCount: number;
  errorCount: number;
  errorLines: ErrorLine[];
}

export interface ErrorLine {
  lineNumber: number;
  column?: number;
  message: string;
  raw: string;
}

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

// ========== Утилиты ==========

export function parseBounds(str: string): Bounds {
  const trimmed = str.trim();
  // Новый формат: "start end" (пробел, end может быть отрицательным: "10 -30")
  const spaceMatch = trimmed.match(/^\s*(-?\d+)\s+(-?\d+)\s*$/);
  if (spaceMatch) {
    return { start: parseInt(spaceMatch[1], 10), end: parseInt(spaceMatch[2], 10) };
  }
  // Обратная совместимость: "start-end" или "start,end"
  const dashMatch = trimmed.match(/^\s*(-?\d+)[,-](-?\d+)\s*$/);
  if (dashMatch) {
    return { start: parseInt(dashMatch[1], 10), end: parseInt(dashMatch[2], 10) };
  }
  throw new Error(`Invalid bounds format: "${str}" (expected "start end")`);
}

export function formatBounds(bounds: Bounds): string {
  return `${bounds.start} ${bounds.end}`;
}

export function parseVec2(str: string): Vec2 {
  const parts = str.split(/[,\s]+/).map(s => parseFloat(s.trim()));
  return { x: parts[0], y: parts[1] ?? parts[0] };
}

export function parseVec3(str: string): Vec3 {
  const parts = str.split(/[,\s]+/).map(s => parseFloat(s.trim()));
  return { x: parts[0], y: parts[1] ?? 0, z: parts[2] ?? 0 };
}

export function parseVec4(str: string): Vec4 {
  const parts = str.split(/[,\s]+/).map(s => parseFloat(s.trim()));
  return {
    top: parts[0] ?? 0,
    right: parts[1] ?? parts[0] ?? 0,
    bottom: parts[2] ?? parts[0] ?? 0,
    left: parts[3] ?? parts[1] ?? parts[0] ?? 0,
  };
}

export function parseAngleForce(str: string): { angle: number; force: number } {
  const normalized = str.replace(/[–—]/g, '-').replace(/,/g, ' ').replace(/[°]/g, '').trim();
  const values = normalized.match(/-?\d*\.?\d+/g)?.map(v => parseFloat(v)) ?? [];
  if (values.length < 2) {
    throw new Error(`Invalid angle/force: "${str}" (expected "angle,force")`);
  }
  return { angle: values[0], force: Math.abs(values[1]) };
}

export function getRect(start: number, end: number, gridWidth: number): {
  x1: number; y1: number; x2: number; y2: number; width: number; height: number;
} {
  const x1 = start % gridWidth;
  const y1 = Math.floor(start / gridWidth);
  const x2 = end % gridWidth;
  const y2 = Math.floor(end / gridWidth);
  return {
    x1, y1, x2, y2,
    width: x2 - x1 + 1,
    height: y2 - y1 + 1
  };
}

export function normalizeDegrees(deg: number): number {
  deg = deg % 360;
  if (deg < 0) deg += 360;
  return deg;
}

export function computeDFromPgPo(pg: Bounds, po: Bounds): Bounds {
  return {
    start: pg.start + po.start,
    end: pg.end + po.end,
  };
}

export function computePoFromD(d: Bounds, pg: Bounds): Bounds {
  return {
    start: d.start - pg.start,
    end: d.end - pg.end,
  };
}

export function computeGridSize(symbols: SymbolSpec[]): { width: number; height: number } {
  let minStart = Infinity;
  let maxEnd = -Infinity;
  
  for (const sym of symbols) {
    const start = sym.d?.start ?? sym.start;
    const end = sym.d?.end ?? sym.end;
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

// ========== Афинная модель (новые функции) ==========

/**
 * Преобразует линейный индекс в координаты (x,y) на сетке
 */
export function indexToXY(index: number, width: number): Vec2 {
  return { x: index % width, y: Math.floor(index / width) };
}

/**
 * Преобразует координаты (x,y) в линейный индекс
 */
export function xyToIndex(x: number, y: number, width: number): number {
  return y * width + x;
}

/**
 * Вычисляет bounding box всех слоёв и pg в координатах сетки
 */
export function computeAllBounds(spec: UniCompSpec): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;

  const processBounds = (bounds: Bounds) => {
    const { x: x1, y: y1 } = indexToXY(bounds.start, spec.gridWidth);
    const { x: x2, y: y2 } = indexToXY(bounds.end, spec.gridWidth);
    minX = Math.min(minX, x1, x2);
    minY = Math.min(minY, y1, y2);
    maxX = Math.max(maxX, x1, x2);
    maxY = Math.max(maxY, y1, y2);
  };

  if (spec.grid.pg) processBounds(spec.grid.pg);

  for (const sym of spec.symbols) {
    const d = sym.d ?? { start: sym.start, end: sym.end };
    processBounds(d);
  }

  if (!isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: spec.gridWidth - 1, maxY: spec.gridHeight - 1 };
  }

  return { minX, minY, maxX, maxY };
}

/**
 * Нормализует spec: пересчитывает pg, grid size и po на основе текущих d всех слоёв
 */
export function normalizeSpec(spec: UniCompSpec): UniCompSpec {
  const newSpec = JSON.parse(JSON.stringify(spec)) as UniCompSpec;
  const { minX, minY, maxX, maxY } = computeAllBounds(newSpec);

  const newWidth = maxX - minX + 1;
  const newHeight = maxY - minY + 1;

  const shiftBounds = (bounds: Bounds, dx: number, dy: number): Bounds => {
    const startXY = indexToXY(bounds.start, newSpec.gridWidth);
    const endXY = indexToXY(bounds.end, newSpec.gridWidth);
    const newStart = xyToIndex(startXY.x + dx, startXY.y + dy, newWidth);
    const newEnd = xyToIndex(endXY.x + dx, endXY.y + dy, newWidth);
    return { start: newStart, end: newEnd };
  };

  // Сдвигаем pg
  if (newSpec.grid.pg) {
    newSpec.grid.pg = shiftBounds(newSpec.grid.pg, -minX, -minY);
  } else {
    newSpec.grid.pg = { start: 0, end: 0 };
  }

  // Сдвигаем все слои (d) и пересчитываем po
  for (const sym of newSpec.symbols) {
    const d = sym.d ?? { start: sym.start, end: sym.end };
    const newD = shiftBounds(d, -minX, -minY);
    sym.d = newD;
    sym.start = newD.start;
    sym.end = newD.end;

    sym.po = {
      start: newD.start - newSpec.grid.pg.start,
      end: newD.end - newSpec.grid.pg.end,
    };
  }

  newSpec.gridWidth = newWidth;
  newSpec.gridHeight = newHeight;
  newSpec.grid.g = { x: newWidth, y: newHeight };

  return newSpec;
}

/**
 * Перемещает группу слоёв на (deltaX, deltaY) в координатах сетки.
 * Работает в XY-пространстве на всём протяжении, чтобы избежать
 * wrap-артефактов при xyToIndex с отрицательными координатами.
 */
export function transformGroupMove(
  spec: UniCompSpec,
  indices: number[],
  deltaX: number,
  deltaY: number
): UniCompSpec {
  const newSpec = JSON.parse(JSON.stringify(spec)) as UniCompSpec;
  const gridWidth = newSpec.gridWidth;
  const gridHeight = newSpec.gridHeight;

  // Шаг 1: собираем XY-позиции всех символов (смещаем только выбранные)
  type SymXY = { sx: number; sy: number; ex: number; ey: number };
  const symXYs: SymXY[] = newSpec.symbols.map((sym, i) => {
    const d = sym.d ?? { start: sym.start, end: sym.end };
    const s = indexToXY(d.start, gridWidth);
    const e = indexToXY(d.end, gridWidth);
    const moved = indices.includes(i);
    return {
      sx: moved ? s.x + deltaX : s.x,
      sy: moved ? s.y + deltaY : s.y,
      ex: moved ? e.x + deltaX : e.x,
      ey: moved ? e.y + deltaY : e.y,
    };
  });

  // Шаг 2: XY-позиция Ghost Grid (pg)
  let pgSX = 0, pgSY = 0, pgEX = gridWidth - 1, pgEY = gridHeight - 1;
  if (newSpec.grid.pg) {
    const s = indexToXY(newSpec.grid.pg.start, gridWidth);
    const e = indexToXY(newSpec.grid.pg.end, gridWidth);
    pgSX = s.x; pgSY = s.y; pgEX = e.x; pgEY = e.y;
  }

  // Шаг 3: находим bbox всего контента + pg
  let minX = Math.min(pgSX, pgEX);
  let minY = Math.min(pgSY, pgEY);
  let maxX = Math.max(pgSX, pgEX);
  let maxY = Math.max(pgSY, pgEY);
  for (const { sx, sy, ex, ey } of symXYs) {
    minX = Math.min(minX, sx, ex);
    minY = Math.min(minY, sy, ey);
    maxX = Math.max(maxX, sx, ex);
    maxY = Math.max(maxY, sy, ey);
  }

  // Шаг 4: нормализуем сдвигом к (0,0)
  const shiftX = -minX;
  const shiftY = -minY;
  const newWidth = maxX - minX + 1;
  const newHeight = maxY - minY + 1;

  // Шаг 5: пересчитываем pg в новом пространстве
  const newPg: Bounds = {
    start: xyToIndex(pgSX + shiftX, pgSY + shiftY, newWidth),
    end: xyToIndex(pgEX + shiftX, pgEY + shiftY, newWidth),
  };
  newSpec.grid.pg = newPg;

  // Шаг 6: пересчитываем все символы
  for (let i = 0; i < newSpec.symbols.length; i++) {
    const sym = newSpec.symbols[i];
    const { sx, sy, ex, ey } = symXYs[i];
    const newStart = xyToIndex(sx + shiftX, sy + shiftY, newWidth);
    const newEnd = xyToIndex(ex + shiftX, ey + shiftY, newWidth);
    sym.d = { start: newStart, end: newEnd };
    sym.start = newStart;
    sym.end = newEnd;
    // po = d - pg (относительно Ghost Grid)
    sym.po = {
      start: newStart - newPg.start,
      end: newEnd - newPg.end,
    };
  }

  newSpec.gridWidth = newWidth;
  newSpec.gridHeight = newHeight;
  newSpec.gridSize = newWidth;
  newSpec.grid.g = { x: newWidth, y: newHeight };

  // Шаг 7: записываем историю для перемещённых слоёв
  for (const idx of indices) {
    const sym = newSpec.symbols[idx];
    const origSym = spec.symbols[idx];
    if (!sym || !origSym) continue;
    const newPo = sym.po;
    if (newPo) {
      sym.history = origSym.history ? JSON.parse(JSON.stringify(origSym.history)) : [];
      appendTransformToHistory(sym, 'offset', newPo);
    }
  }

  return newSpec;
}

/**
 * Масштабирует группу слоёв пропорционально в новый bounding box.
 * Каждый символ масштабируется относительно исходного bbox выделения,
 * не используя xyToIndex с потенциально выходящими за пределы координатами.
 */
export function transformGroupScale(
  spec: UniCompSpec,
  indices: number[],
  newStartX: number,
  newStartY: number,
  newEndX: number,
  newEndY: number
): UniCompSpec {
  const newSpec = JSON.parse(JSON.stringify(spec)) as UniCompSpec;
  const gridWidth = newSpec.gridWidth;
  const gridHeight = newSpec.gridHeight;

  // Вычисляем исходный bbox выделения в XY
  let origMinX = Infinity, origMinY = Infinity, origMaxX = -Infinity, origMaxY = -Infinity;
  for (const idx of indices) {
    const sym = newSpec.symbols[idx];
    if (!sym) continue;
    const d = sym.d ?? { start: sym.start, end: sym.end };
    const s = indexToXY(d.start, gridWidth);
    const e = indexToXY(d.end, gridWidth);
    origMinX = Math.min(origMinX, s.x, e.x);
    origMinY = Math.min(origMinY, s.y, e.y);
    origMaxX = Math.max(origMaxX, s.x, e.x);
    origMaxY = Math.max(origMaxY, s.y, e.y);
  }

  const origW = Math.max(1, origMaxX - origMinX);
  const origH = Math.max(1, origMaxY - origMinY);
  const targetW = newEndX - newStartX;
  const targetH = newEndY - newStartY;

  // Определяем, произошло ли зеркалирование группы (конец пересёк якорь начала)
  const groupFlipH = targetW < 0;
  const groupFlipV = targetH < 0;

  // Собираем новые XY для всех символов
  type SymXY = { sx: number; sy: number; ex: number; ey: number };
  const symXYs: SymXY[] = newSpec.symbols.map((sym, i) => {
    const d = sym.d ?? { start: sym.start, end: sym.end };
    const s = indexToXY(d.start, gridWidth);
    const e = indexToXY(d.end, gridWidth);
    if (!indices.includes(i)) return { sx: s.x, sy: s.y, ex: e.x, ey: e.y };
    // Пропорциональное масштабирование
    const rawSX = newStartX + Math.round((s.x - origMinX) / origW * targetW);
    const rawSY = newStartY + Math.round((s.y - origMinY) / origH * targetH);
    const rawEX = newStartX + Math.round((e.x - origMinX) / origW * targetW);
    const rawEY = newStartY + Math.round((e.y - origMinY) / origH * targetH);
    // Канонический порядок: start всегда top-left, end всегда bottom-right.
    // Это гарантирует, что getRect никогда не вернёт отрицательные width/height.
    return {
      sx: Math.min(rawSX, rawEX),
      sy: Math.min(rawSY, rawEY),
      ex: Math.max(rawSX, rawEX),
      ey: Math.max(rawSY, rawEY),
    };
  });

  // Ghost Grid pg XY
  let pgSX = 0, pgSY = 0, pgEX = gridWidth - 1, pgEY = gridHeight - 1;
  if (newSpec.grid.pg) {
    const s = indexToXY(newSpec.grid.pg.start, gridWidth);
    const e = indexToXY(newSpec.grid.pg.end, gridWidth);
    pgSX = s.x; pgSY = s.y; pgEX = e.x; pgEY = e.y;
  }

  // Находим новый общий bbox (все символы + pg)
  let minX = Math.min(pgSX, pgEX);
  let minY = Math.min(pgSY, pgEY);
  let maxX = Math.max(pgSX, pgEX);
  let maxY = Math.max(pgSY, pgEY);
  for (const { sx, sy, ex, ey } of symXYs) {
    minX = Math.min(minX, sx, ex);
    minY = Math.min(minY, sy, ey);
    maxX = Math.max(maxX, sx, ex);
    maxY = Math.max(maxY, sy, ey);
  }

  const shiftX = -minX;
  const shiftY = -minY;
  const newWidth = maxX - minX + 1;
  const newHeight = maxY - minY + 1;

  const newPg: Bounds = {
    start: xyToIndex(pgSX + shiftX, pgSY + shiftY, newWidth),
    end: xyToIndex(pgEX + shiftX, pgEY + shiftY, newWidth),
  };
  newSpec.grid.pg = newPg;

  for (let i = 0; i < newSpec.symbols.length; i++) {
    const sym = newSpec.symbols[i];
    const { sx, sy, ex, ey } = symXYs[i];
    const newStart = xyToIndex(sx + shiftX, sy + shiftY, newWidth);
    const newEnd = xyToIndex(ex + shiftX, ey + shiftY, newWidth);
    sym.d = { start: newStart, end: newEnd };
    sym.start = newStart;
    sym.end = newEnd;
    sym.po = { start: newStart - newPg.start, end: newEnd - newPg.end };
  }

  newSpec.gridWidth = newWidth;
  newSpec.gridHeight = newHeight;
  newSpec.gridSize = newWidth;
  newSpec.grid.g = { x: newWidth, y: newHeight };

  // Применяем flip к выделенным символам при пересечении якоря
  // (end пересёк start → зеркалирование Symbol/Figure по соответствующей оси)
  if (groupFlipH || groupFlipV) {
    for (const idx of indices) {
      const sym = newSpec.symbols[idx];
      const origSym = spec.symbols[idx];
      if (!sym || !origSym) continue;

      const origF = origSym.f;
      const hadH = origF === 'h' || origF === 'hv';
      const hadV = origF === 'v' || origF === 'hv';
      const newH = groupFlipH ? !hadH : hadH;
      const newV = groupFlipV ? !hadV : hadV;

      if (newH && newV) {
        sym.f = 'hv';
        sym.flip = 'hv';
      } else if (newH) {
        sym.f = 'h';
        sym.flip = 'h';
      } else if (newV) {
        sym.f = 'v';
        sym.flip = 'v';
      } else {
        sym.f = undefined;
        sym.flip = undefined;
      }
    }
  }

  // Записываем историю для масштабированных слоёв
  for (const idx of indices) {
    const sym = newSpec.symbols[idx];
    const origSym = spec.symbols[idx];
    if (!sym || !origSym) continue;
    const newD = sym.d;
    if (newD) {
      sym.history = origSym.history ? JSON.parse(JSON.stringify(origSym.history)) : [];
      appendTransformToHistory(sym, 'scale', newD);
    }
  }

  return newSpec;
}

// ========== Остальные функции (без изменений) ==========

export function bakeForExport(spec: UniCompSpec): BakedSpec {
  const pg = spec.grid.pg ?? { start: 0, end: spec.gridWidth * spec.gridHeight - 1 };
  
  const bakedSymbols: BakedSymbol[] = spec.symbols.map(sym => {
    const po = sym.po ?? { start: sym.start, end: sym.end };
    const bakedD = computeDFromPgPo(pg, po);
    
    return {
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
  });
  
  return {
    grid: { g: spec.grid.g, gs: spec.grid.gs },
    symbols: bakedSymbols,
    version: spec.version,
  };
}

export function unbakeForEditor(spec: BakedSpec, gridSize?: number): UniCompSpec {
  const gridW = spec.grid.g?.x ?? gridSize ?? 10;
  const gridH = spec.grid.g?.y ?? gridSize ?? 10;
  const gridEnd = gridW * gridH - 1;
  const pg: Bounds = { start: 0, end: gridEnd };
  
  const editorSymbols: SymbolSpec[] = spec.symbols.map(sym => ({
    v: sym.v,
    id: sym.id,
    class: sym.class,
    n: sym.n,
    start: sym.d.start,
    end: sym.d.end,
    d: sym.d,
    pg,
    po: computePoFromD(sym.d, pg),
    l: sym.l,
    z: sym.z,
    tr: sym.tr,
    lc: sym.lc,
    vp: sym.vp,
    zd: sym.zd,
    zi: sym.zi,
    history: [],
    keyframes: [],
  }));
  
  return {
    grid: {
      g: spec.grid.g ?? { x: gridW, y: gridH },
      pg,
      gs: spec.grid.gs,
    },
    symbols: editorSymbols,
    raw: '',
    version: spec.version,
    gridWidth: gridW,
    gridHeight: gridH,
  };
}

export function resolveHistory(steps: HistoryStep[]): {
  pg?: Bounds;
  po?: Bounds;
  d?: Bounds;
  tr?: TransformVector;
  lc?: LayerStyles;
  r?: number;
  sp?: { angle: number; force: number; };
  st?: { angle: number; force: number; };
  w?: { angle: number; force: number; };
  rotate?: number;
  scale?: Bounds;
  offset?: Bounds;
  colorGroup?: DeltaColor;
} {
  let pg: Bounds | undefined;
  let po: Bounds | undefined;
  let d: Bounds | undefined;
  let tr: TransformVector | undefined;
  let lc: LayerStyles | undefined;
  let r: number | undefined;
  let sp: { angle: number; force: number; } | undefined;
  let st: { angle: number; force: number; } | undefined;
  let w: { angle: number; force: number; } | undefined;
  let rotate: number | undefined;
  let scale: Bounds | undefined;
  let offset: Bounds | undefined;
  let colorGroup: DeltaColor | undefined;
  
  for (const step of steps) {
    if (step.pg) pg = step.pg;
    if (step.po) po = step.po;
    if (step.d) d = step.d;
    if (step.tr) tr = step.tr;
    if (step.lc) lc = step.lc;
    if (step.r !== undefined) r = step.r;
    if (step.sp) sp = step.sp;
    if (step.st) st = step.st;
    if (step.w) w = step.w;
    if (step.rotate !== undefined) rotate = step.rotate;
    if (step.scale) scale = step.scale;
    if (step.offset) offset = step.offset;
    if (step.colorGroup) colorGroup = step.colorGroup;
  }
  
  return { pg, po, d, tr, lc, r, sp, st, w, rotate, scale, offset, colorGroup };
}

export function appendTransformToHistory(
  sym: SymbolSpec,
  paramType: 'st' | 'sp' | 'w' | 'rotate' | 'scale' | 'offset' | 'd' | 'colorGroup',
  newValue: any
): void {
  if (!sym.history) sym.history = [];
  
  const nextIndex = sym.history.length > 0
    ? Math.max(...sym.history.map(s => s.index)) + 1
    : 0;
  
  const step: HistoryStep = { index: nextIndex };
  
  switch (paramType) {
    case 'st': step.st = newValue; break;
    case 'sp': step.sp = newValue; break;
    case 'w': step.w = newValue; break;
    case 'rotate': step.rotate = newValue; break;
    case 'scale': step.scale = newValue; break;
    case 'offset': step.offset = newValue; break;
    case 'd': step.d = newValue; break;
    case 'colorGroup': step.colorGroup = newValue; break;
  }
  
  sym.history.push(step);
}

export function undoLastHistoryParam(
  sym: SymbolSpec,
  paramType: 'st' | 'sp' | 'w' | 'rotate' | 'scale' | 'offset' | 'd' | 'colorGroup'
): boolean {
  if (!sym.history || sym.history.length === 0) return false;
  
  for (let i = sym.history.length - 1; i >= 0; i--) {
    const step = sym.history[i];
    let hasParam = false;
    
    switch (paramType) {
      case 'st': hasParam = !!step.st; break;
      case 'sp': hasParam = !!step.sp; break;
      case 'w': hasParam = !!step.w; break;
      case 'rotate': hasParam = step.rotate !== undefined; break;
      case 'scale': hasParam = !!step.scale; break;
      case 'offset': hasParam = !!step.offset; break;
      case 'd': hasParam = !!step.d; break;
      case 'colorGroup': hasParam = !!step.colorGroup; break;
    }
    
    if (hasParam) {
      sym.history.splice(i, 1);
      const resolved = resolveHistory(sym.history);
      if (resolved.st) sym.st = resolved.st; else sym.st = undefined;
      if (resolved.sp) sym.sp = resolved.sp; else sym.sp = undefined;
      if (resolved.w) sym.w = resolved.w; else sym.w = undefined;
      if (resolved.rotate !== undefined) { sym.rotate = resolved.rotate; sym.r = resolved.rotate; }
      else { sym.rotate = undefined; sym.r = undefined; }
      if (resolved.scale) sym.scale = resolved.scale;
      if (resolved.offset) sym.offset = resolved.offset;
      if (resolved.po) sym.po = resolved.po;
      if (resolved.d) sym.d = resolved.d;
      if (resolved.colorGroup) {
        const cg = resolved.colorGroup;
        if (cg.color !== undefined) { sym.color = cg.color; sym.c = cg.color; }
        if (cg.opacity !== undefined) sym.opacity = cg.opacity;
        if (cg.symbolBorderColor !== undefined) sym.strokeColor = cg.symbolBorderColor;
        if (cg.symbolBorderWidth !== undefined) sym.strokeWidth = cg.symbolBorderWidth;
        if (cg.symbolBorderOpacity !== undefined) sym.strokeOpacity = cg.symbolBorderOpacity;
        if (cg.background !== undefined) { sym.background = cg.background; sym.b = cg.background; }
        if (cg.backgroundOpacity !== undefined) sym.backgroundOpacity = cg.backgroundOpacity;
        if (cg.borderRadius !== undefined) sym.borderRadius = cg.borderRadius;
        if (cg.layerBorderWidth !== undefined) sym.layerBorderWidth = cg.layerBorderWidth;
        if (cg.layerBorderColor !== undefined) { sym.layerBorderColor = cg.layerBorderColor; sym.bc = cg.layerBorderColor; }
        if (cg.layerBorderOpacity !== undefined) sym.layerBorderOpacity = cg.layerBorderOpacity;
      }
      return true;
    }
  }
  
  return false;
}

export function parsePlayState(str: string): PlayState {
  const trimmed = str.trim();
  
  const map: Record<string, PlayState> = {
    '0': PLAY_STATES.STATIC_START,
    '1': PLAY_STATES.STATIC_END,
    '01': PLAY_STATES.FORWARD,
    '10': PLAY_STATES.REVERSE,
    '010': PLAY_STATES.PING_PONG,
    '101': PLAY_STATES.REVERSE_PING,
    '100': PLAY_STATES.CLEAR_DROP_FIRST,
    '001': PLAY_STATES.CLEAR_DROP_LAST,
    '000': PLAY_STATES.DELETE,
  };
  
  if (map[trimmed] !== undefined) {
    return map[trimmed];
  }
  
  const num = parseInt(trimmed, 10);
  if (!isNaN(num) && num >= 0 && num <= 8) {
    return num as PlayState;
  }
  
  return PLAY_STATES.FORWARD;
}

export function playStateToString(state: PlayState): string {
  const map: Record<PlayState, string> = {
    [PLAY_STATES.STATIC_START]: '0',
    [PLAY_STATES.STATIC_END]: '1',
    [PLAY_STATES.FORWARD]: '01',
    [PLAY_STATES.REVERSE]: '10',
    [PLAY_STATES.PING_PONG]: '010',
    [PLAY_STATES.REVERSE_PING]: '101',
    [PLAY_STATES.CLEAR_DROP_FIRST]: '100',
    [PLAY_STATES.CLEAR_DROP_LAST]: '001',
    [PLAY_STATES.DELETE]: '000',
  };
  return map[state] || '01';
}

export enum TokenType {
  LPAREN = 'LPAREN',
  RPAREN = 'RPAREN',
  LBRACKET = 'LBRACKET',
  RBRACKET = 'RBRACKET',
  COLON = 'COLON',
  SEMICOLON = 'SEMICOLON',
  COMMA = 'COMMA',
  DASH = 'DASH',
  PLUS = 'PLUS',
  GREATER = 'GREATER',
  LESS = 'LESS',
  EQUALS = 'EQUALS',
  NUMBER = 'NUMBER',
  SYMBOL = 'SYMBOL',
  QUOTED_STRING = 'QUOTED_STRING',
  IDENTIFIER = 'IDENTIFIER',
  TIMES = 'TIMES',
  HASH_REF = 'HASH_REF',
  AT_REF = 'AT_REF',
  DOT_REF = 'DOT_REF',
  DOLLAR_REF = 'DOLLAR_REF',
  EOF = 'EOF',
}

export interface Token {
  type: TokenType;
  value: string;
  position: number;
  line: number;
  column: number;
}

class Tokenizer {
  private input: string;
  private pos: number = 0;
  private line: number = 1;
  private col: number = 1;
  
  constructor(input: string) {
    if (input.length > SECURITY_LIMITS.MAX_INPUT_LENGTH) {
      throw new Error(`Input too long: ${input.length} chars`);
    }
    this.input = input;
  }
  
  private peek(): string | null {
    return this.pos < this.input.length ? this.input[this.pos] : null;
  }
  
  private advance(): string {
    const char = this.input[this.pos];
    if (char === '\n') { this.line++; this.col = 1; }
    else { this.col++; }
    this.pos++;
    return char;
  }
  
  private skipWhitespace(): void {
    while (this.peek() && /\s/.test(this.peek()!)) this.advance();
  }
  
  private readNumber(): Token {
    const startPos = this.pos, startLine = this.line, startCol = this.col;
    let value = '';
    while (this.peek() && /[0-9]/.test(this.peek()!)) value += this.advance();
    if (this.peek() === '.') {
      value += this.advance();
      while (this.peek() && /[0-9]/.test(this.peek()!)) value += this.advance();
    }
    return { type: TokenType.NUMBER, value, position: startPos, line: startLine, column: startCol };
  }
  
  private readIdentifier(): Token {
    const startPos = this.pos, startLine = this.line, startCol = this.col;
    let value = '';
    while (this.peek() && /[a-zA-Z_]/.test(this.peek()!)) value += this.advance();
    return { type: TokenType.IDENTIFIER, value, position: startPos, line: startLine, column: startCol };
  }
  
  private readQuotedString(quote: string): Token {
    const startPos = this.pos, startLine = this.line, startCol = this.col;
    this.advance();
    let value = '';
    while (this.peek() && this.peek() !== quote) {
      if (this.peek() === '\\') { this.advance(); value += this.advance(); }
      else value += this.advance();
    }
    if (this.peek() === quote) this.advance();
    return { type: TokenType.QUOTED_STRING, value, position: startPos, line: startLine, column: startCol };
  }
  
  private readRefToken(prefix: string, type: TokenType): Token {
    const startPos = this.pos, startLine = this.line, startCol = this.col;
    this.advance();
    let value = '';
    while (this.peek() && /[a-zA-Z0-9_]/.test(this.peek()!)) value += this.advance();
    return { type, value, position: startPos, line: startLine, column: startCol };
  }
  
  tokenize(): Token[] {
    const tokens: Token[] = [];
    while (this.pos < this.input.length) {
      this.skipWhitespace();
      if (this.pos >= this.input.length) break;
      const char = this.peek()!;
      
      switch (char) {
        case '(': tokens.push({ type: TokenType.LPAREN, value: '(', position: this.pos, line: this.line, column: this.col }); this.advance(); break;
        case ')': tokens.push({ type: TokenType.RPAREN, value: ')', position: this.pos, line: this.line, column: this.col }); this.advance(); break;
        case '[': tokens.push({ type: TokenType.LBRACKET, value: '[', position: this.pos, line: this.line, column: this.col }); this.advance(); break;
        case ']': tokens.push({ type: TokenType.RBRACKET, value: ']', position: this.pos, line: this.line, column: this.col }); this.advance(); break;
        case ':': tokens.push({ type: TokenType.COLON, value: ':', position: this.pos, line: this.line, column: this.col }); this.advance(); break;
        case ';': tokens.push({ type: TokenType.SEMICOLON, value: ';', position: this.pos, line: this.line, column: this.col }); this.advance(); break;
        case ',': tokens.push({ type: TokenType.COMMA, value: ',', position: this.pos, line: this.line, column: this.col }); this.advance(); break;
        case '-': tokens.push({ type: TokenType.DASH, value: '-', position: this.pos, line: this.line, column: this.col }); this.advance(); break;
        case '+': tokens.push({ type: TokenType.PLUS, value: '+', position: this.pos, line: this.line, column: this.col }); this.advance(); break;
        case '>': tokens.push({ type: TokenType.GREATER, value: '>', position: this.pos, line: this.line, column: this.col }); this.advance(); break;
        case '<': tokens.push({ type: TokenType.LESS, value: '<', position: this.pos, line: this.line, column: this.col }); this.advance(); break;
        case '=': tokens.push({ type: TokenType.EQUALS, value: '=', position: this.pos, line: this.line, column: this.col }); this.advance(); break;
        case '×': case 'x': case 'X': tokens.push({ type: TokenType.TIMES, value: char, position: this.pos, line: this.line, column: this.col }); this.advance(); break;
        case '"': case "'": case '`': tokens.push(this.readQuotedString(char)); break;
        case '#': tokens.push(this.readRefToken('#', TokenType.HASH_REF)); break;
        case '@': tokens.push(this.readRefToken('@', TokenType.AT_REF)); break;
        case '.': tokens.push(this.readRefToken('.', TokenType.DOT_REF)); break;
        case '$': tokens.push(this.readRefToken('$', TokenType.DOLLAR_REF)); break;
        default:
          if (/[0-9]/.test(char)) tokens.push(this.readNumber());
          else if (/[a-zA-Z_]/.test(char)) tokens.push(this.readIdentifier());
          else { tokens.push({ type: TokenType.SYMBOL, value: this.advance(), position: this.pos, line: this.line, column: this.col }); }
      }
    }
    tokens.push({ type: TokenType.EOF, value: '', position: this.pos, line: this.line, column: this.col });
    return tokens;
  }
}

class Parser {
  private tokens: Token[];
  private pos: number = 0;
  private source: string;
  
  constructor(tokens: Token[], source: string = '') {
    this.tokens = tokens;
    this.source = source;
  }
  
  private peek(): Token { return this.tokens[this.pos]; }
  private advance(): Token { return this.tokens[this.pos++]; }
  
  private expect(type: TokenType): Token {
    const token = this.peek();
    if (token.type !== type) {
      throw new Error(`Expected ${type} but got ${token.type} at line ${token.line}, col ${token.column}`);
    }
    return this.advance();
  }
  
  private parseValue(): string {
    const token = this.peek();
    if (token.type === TokenType.QUOTED_STRING) { this.advance(); return token.value; }
    // Используем позиции токенов для извлечения raw-подстроки из источника,
    // чтобы сохранить пробелы между числами (нужно для формата "d=10 -30").
    const startPos = this.peek().position;
    const consumed: Token[] = [];
    while (this.peek().type !== TokenType.SEMICOLON && this.peek().type !== TokenType.RBRACKET && this.peek().type !== TokenType.EOF) {
      consumed.push(this.advance());
    }
    const endPos = this.peek().position;
    if (this.source) return this.source.slice(startPos, endPos).trim();
    // Fallback (нет источника): склеиваем значения без пробелов
    return consumed.map(t => t.value).join('').trim();
  }
  
  private parseTransformVector(str: string): TransformVector {
    const tr: TransformVector = {};
    const params = str.split(';');
    for (const param of params) {
      const [k, v] = param.split('=');
      if (!k || !v) continue;
      const val = v.trim();
      switch (k.trim()) {
        case 'f': tr.f = val as 'h' | 'v' | 'hv'; break;
        case 'm': tr.m = parseVec4(val); break;
        case 'sp': tr.sp = parseAngleForce(val); break;
        case 'w': tr.w = parseAngleForce(val); break;
        case 'r': tr.r = parseFloat(val); break;
        case 'st': tr.st = parseAngleForce(val); break;
      }
    }
    return tr;
  }
  
  private parseLayerStyles(str: string): LayerStyles {
    const lc: LayerStyles = {};
    const params = str.split(';');
    for (const param of params) {
      const [k, v] = param.split('=');
      if (!k || !v) continue;
      const val = v.trim().replace(/"/g, '');
      switch (k.trim()) {
        case 'c': lc.c = val; break;
        case 'b': lc.b = val; break;
        case 'bc': lc.bc = val; break;
        case 'bb': lc.bb = val; break;
      }
    }
    return lc;
  }
  
  private parseSymbol(layerIndex: number): SymbolSpec {
    const sym: SymbolSpec = { start: 0, end: 0, l: layerIndex };
    
    const prefix = this.peek();
    if (prefix.type === TokenType.HASH_REF) { sym.refId = this.advance().value; sym.v = `#${sym.refId}`; }
    else if (prefix.type === TokenType.AT_REF) { sym.refName = this.advance().value; sym.v = `@${sym.refName}`; }
    else if (prefix.type === TokenType.DOLLAR_REF) { sym.refSrc = this.advance().value; sym.v = `$${sym.refSrc}`; }
    else if (prefix.type === TokenType.DOT_REF) { sym.refClass = this.advance().value; sym.v = `.${sym.refClass}`; }
    else if (prefix.type === TokenType.QUOTED_STRING) { sym.v = `"${this.advance().value}"`; }
    else if (prefix.type === TokenType.SYMBOL || prefix.type === TokenType.IDENTIFIER) { sym.v = this.advance().value; }
    
    if (this.peek().type === TokenType.LBRACKET) {
      this.advance();
      
      let currentKeyframe: KeyframeStep | null = null;
      
      while (this.peek().type !== TokenType.RBRACKET && this.peek().type !== TokenType.EOF) {
        const key = this.advance().value;
        this.expect(TokenType.EQUALS);
        const value = this.parseValue();
        
        if (key === 'k') {
          currentKeyframe = {
            index: sym.keyframes?.length ?? 0,
            k: parseInt(value, 10),
            t: 1.0,
            p: PLAY_STATES.FORWARD,
          };
          if (!sym.keyframes) sym.keyframes = [];
          sym.keyframes.push(currentKeyframe);
        }
        else if (key === 't' && currentKeyframe) {
          currentKeyframe.t = parseFloat(value);
        }
        else if (key === 'p' && currentKeyframe) {
          currentKeyframe.p = parsePlayState(value);
        }
        else if (key === 'h') {
          if (!sym.history) sym.history = [];
          const h: HistoryStep = { index: parseInt(value, 10) };
          
          while (this.peek().type !== TokenType.RBRACKET && this.peek().type !== TokenType.SEMICOLON && this.peek().type !== TokenType.EOF) {
            if (this.peek().type === TokenType.SEMICOLON) { this.advance(); continue; }
            const hKey = this.advance().value;
            this.expect(TokenType.EQUALS);
            const hVal = this.parseValue();
            
            if (hKey === 'pg') h.pg = parseBounds(hVal);
            else if (hKey === 'po') h.po = parseBounds(hVal);
            else if (hKey === 'd') h.d = parseBounds(hVal);
            else if (hKey === 'tr') h.tr = this.parseTransformVector(hVal);
            else if (hKey === 'lc') h.lc = this.parseLayerStyles(hVal);
            
            if (this.peek().type === TokenType.SEMICOLON) this.advance();
          }
          sym.history.push(h);
        }
        else if (key === 'tr') sym.tr = this.parseTransformVector(value);
        else if (key === 'lc') sym.lc = this.parseLayerStyles(value);
        else if (key === 'f') sym.f = value as 'h' | 'v' | 'hv';
        else if (key === 'm') sym.m = parseVec4(value);
        else if (key === 'sp') sym.sp = parseAngleForce(value);
        else if (key === 'w') sym.w = parseAngleForce(value);
        else if (key === 'r') sym.r = parseFloat(value);
        else if (key === 'st') sym.st = parseAngleForce(value);
        else if (key === 'c') sym.c = value;
        else if (key === 'b') sym.b = value;
        else if (key === 'bc') sym.bc = value;
        else if (key === 'bb') sym.bb = value;
        else if (key === 'vp') sym.vp = parseVec3(value);
        else if (key === 'zd') sym.zd = parseVec3(value);
        else if (key === 'zi') sym.zi = parseInt(value, 10);
        else if (key === 'id') sym.id = value;
        else if (key === 'class') sym.class = value;
        else if (key === 'n') sym.n = value;
        else if (key === 'd') sym.d = parseBounds(value);
        else if (key === 'pg') sym.pg = parseBounds(value);
        else if (key === 'po') sym.po = parseBounds(value);
        else if (key === 'l') sym.l = parseInt(value, 10);
        else if (key === 'z') sym.z = parseInt(value, 10);
        
        if (this.peek().type === TokenType.SEMICOLON) this.advance();
      }
      
      this.expect(TokenType.RBRACKET);
    }
    
    sym.start = parseInt(this.expect(TokenType.NUMBER).value, 10);
    this.expect(TokenType.DASH);
    sym.end = parseInt(this.expect(TokenType.NUMBER).value, 10);
    
    return sym;
  }
  
  parse(): UniCompSpec {
    this.expect(TokenType.LPAREN);
    const width = parseInt(this.expect(TokenType.NUMBER).value, 10);
    let height = width;
    if (this.peek().type === TokenType.TIMES) {
      this.advance();
      height = parseInt(this.expect(TokenType.NUMBER).value, 10);
    }
    this.expect(TokenType.RPAREN);
    
    const grid: GridSpec = { g: { x: width, y: height } };
    if (this.peek().type === TokenType.LBRACKET) {
      this.advance();
      while (this.peek().type !== TokenType.RBRACKET && this.peek().type !== TokenType.EOF) {
        const key = this.advance().value;
        this.expect(TokenType.EQUALS);
        const value = this.parseValue();
        
        switch (key) {
          case 'g': grid.g = parseVec2(value); break;
          case 'pg': grid.pg = parseBounds(value); break;
          case 'po': grid.po = parseBounds(value); break;
          case 'gc': grid.gc = value; break;
          case 'gb': grid.gb = value; break;
          case 'id': grid.id = value; break;
          case 'class': grid.class = value; break;
          case 'n': grid.n = value; break;
          case 'gs': grid.gs = this.parseLayerStyles(value); break;
        }
        if (this.peek().type === TokenType.SEMICOLON) this.advance();
      }
      this.expect(TokenType.RBRACKET);
    }
    
    this.expect(TokenType.COLON);
    
    const symbols: SymbolSpec[] = [];
    let layerIndex = 0;
    
    while (this.peek().type !== TokenType.EOF) {
      if (this.peek().type === TokenType.SEMICOLON) { this.advance(); continue; }
      
      const symbol = this.parseSymbol(layerIndex++);
      symbols.push(symbol);
      
      if (this.peek().type === TokenType.SEMICOLON) this.advance();
    }
    
    return {
      grid,
      symbols,
      raw: '',
      version: '1.0',
      gridWidth: width,
      gridHeight: height,
    };
  }
}

function bridgeSymbolShadowFields(sym: SymbolSpec): void {
  if (sym.c && !sym.color) sym.color = sym.c;
  if (sym.b && !sym.background) sym.background = sym.b;
  if (sym.bc && !sym.layerBorderColor) sym.layerBorderColor = sym.bc;
  if (sym.bb !== undefined && sym.layerBorderWidth === undefined) {
    const n = parseFloat(sym.bb as string);
    if (!isNaN(n)) sym.layerBorderWidth = n;
  }
  if (sym.f && !sym.flip) sym.flip = sym.f;
  if (sym.r !== undefined && sym.rotate === undefined) sym.rotate = sym.r;
}

function bridgeGridShadowFields(spec: UniCompSpec): void {
  if (spec.grid.gc) {
    const parts = spec.grid.gc.split('/');
    if (!spec.background) spec.background = parts[0];
    if (parts[1] !== undefined && spec.backgroundOpacity === undefined) spec.backgroundOpacity = parseFloat(parts[1]);
    if (parts[2] !== undefined && !spec.borderRadius) spec.borderRadius = parts[2];
  }
  if (spec.grid.gb) {
    const parts = spec.grid.gb.split('/');
    if (!spec.strokeColor) spec.strokeColor = parts[0];
    if (parts[1] !== undefined && spec.strokeWidth === undefined) spec.strokeWidth = parseFloat(parts[1]);
    if (parts[2] !== undefined && spec.strokeOpacity === undefined) spec.strokeOpacity = parseFloat(parts[2]);
  }
}

export function parseUniComp(input: string): ParseResult {
  try {
    const tokenizer = new Tokenizer(input);
    const tokens = tokenizer.tokenize();
    const parser = new Parser(tokens, input);
    const spec = parser.parse();
    spec.raw = input;
    spec.symbols.forEach(bridgeSymbolShadowFields);
    bridgeGridShadowFields(spec);
    return { success: true, spec };
  } catch (e) {
    return {
      success: false,
      error: { message: e instanceof Error ? e.message : 'Unknown error' }
    };
  }
}

export function parseMultiLine(input: string): MultiLineParseResult {
  const lines = input.split('\n');
  const blocks: MultiLineBlock[] = [];
  let validCount = 0;
  let errorCount = 0;
  const errorLines: ErrorLine[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;
    
    const result = parseUniComp(line);
    const blockName = line.match(/\[id="([^"]+)"\]/)?.[1] || line.match(/\[id='([^']+)'\]/)?.[1];
    blocks.push({ lineNumber: i + 1, raw: line, result, name: blockName });
    
    if (result.success) validCount++;
    else {
      errorCount++;
      errorLines.push({
        lineNumber: i + 1,
        message: result.error.message,
        raw: line
      });
    }
  }
  
  return { blocks, validCount, errorCount, errorLines };
}

export function stringifySpec(spec: UniCompSpec, mode: 'editor' | 'export' = 'editor'): string {
  const parts: string[] = [];
  
  if (spec.grid.g) {
    parts.push(`(${spec.grid.g.x}×${spec.grid.g.y})`);
  }
  
  const gridParams: string[] = [];
  if (mode === 'editor' && spec.grid.pg) gridParams.push(`pg=${formatBounds(spec.grid.pg)}`);
  if (mode === 'editor' && spec.grid.po) gridParams.push(`po=${formatBounds(spec.grid.po)}`);
  const gcStr = (() => {
    if (spec.background) {
      let s = spec.background;
      if (spec.backgroundOpacity !== undefined && spec.backgroundOpacity !== 1) s += `/${spec.backgroundOpacity}`;
      if (spec.borderRadius) s += `/${spec.borderRadius}`;
      return s;
    }
    return spec.grid.gc;
  })();
  if (gcStr) gridParams.push(`gc=${gcStr}`);
  const gbStr = (() => {
    if (spec.strokeColor && (spec.strokeWidth ?? 0) > 0) {
      let s = spec.strokeColor;
      if (spec.strokeWidth !== undefined) s += `/${spec.strokeWidth}`;
      if (spec.strokeOpacity !== undefined && spec.strokeOpacity !== 1) s += `/${spec.strokeOpacity}`;
      return s;
    }
    return spec.grid.gb;
  })();
  if (gbStr) gridParams.push(`gb=${gbStr}`);
  if (spec.grid.id) gridParams.push(`id=${spec.grid.id}`);
  if (spec.grid.class) gridParams.push(`class=${spec.grid.class}`);
  if (spec.grid.n) gridParams.push(`n=${spec.grid.n}`);
  
  if (gridParams.length > 0) parts.push(`[${gridParams.join(';')}]`);
  parts.push(':');
  
  for (const sym of spec.symbols) {
    const symParts: string[] = [];
    if (sym.v) symParts.push(sym.v);
    
    if (sym.keyframes && sym.keyframes.length > 0) {
      for (const kf of sym.keyframes) {
        const kfParams: string[] = [`k=${kf.k}`, `t=${kf.t}`, `p=${playStateToString(kf.p)}`];
        if (kf.st) kfParams.push(`st=${kf.st.angle},${kf.st.force}`);
        if (kf.sp) kfParams.push(`sp=${kf.sp.angle},${kf.sp.force}`);
        if (kf.r !== undefined) kfParams.push(`r=${kf.r}`);
        if (kf.lc) {
          if (kf.lc.c) kfParams.push(`c=${kf.lc.c}`);
          if (kf.lc.bc) kfParams.push(`bc=${kf.lc.bc}`);
        }
        symParts.push(`[${kfParams.join(';')}]`);
      }
    }
    
    const params: string[] = [];
    if (sym.id) params.push(`id=${sym.id}`);
    if (sym.class) params.push(`class=${sym.class}`);
    if (sym.n) params.push(`n=${sym.n}`);
    if (sym.d) params.push(`d=${formatBounds(sym.d)}`);
    if (mode === 'editor' && sym.pg) params.push(`pg=${formatBounds(sym.pg)}`);
    if (mode === 'editor' && sym.po) params.push(`po=${formatBounds(sym.po)}`);
    if (sym.l !== undefined) params.push(`l=${sym.l}`);
    if (sym.z !== undefined) params.push(`z=${sym.z}`);
    const flipVal = sym.flip ?? sym.f;
    if (flipVal) params.push(`f=${flipVal}`);
    const rotateVal = sym.rotate !== undefined ? sym.rotate : sym.r;
    if (rotateVal !== undefined && !sym.keyframes) params.push(`r=${rotateVal}`);
    const colorVal = sym.color ?? sym.c;
    if (colorVal) params.push(`c=${colorVal}`);
    const bgVal = sym.background ?? sym.b;
    if (bgVal) params.push(`b=${bgVal}`);
    const bcVal = sym.layerBorderColor ?? sym.bc;
    if (bcVal) params.push(`bc=${bcVal}`);
    const bbVal = sym.layerBorderWidth !== undefined ? String(sym.layerBorderWidth) : sym.bb;
    if (bbVal) params.push(`bb=${bbVal}`);
    if (sym.m) params.push(`m=${sym.m.x},${sym.m.y},${sym.m.z},${sym.m.w}`);
    if (sym.sp) params.push(`sp=${sym.sp.angle},${sym.sp.force}`);
    if (sym.w) params.push(`w=${sym.w.angle},${sym.w.force}`);
    if (sym.st) params.push(`st=${sym.st.angle},${sym.st.force}`);
    if (sym.vp) params.push(`vp=${sym.vp.x},${sym.vp.y},${sym.vp.z}`);
    if (sym.zd) params.push(`zd=${sym.zd.x},${sym.zd.y},${sym.zd.z}`);
    if (sym.zi !== undefined) params.push(`zi=${sym.zi}`);
    
    if (params.length > 0) symParts.push(`[${params.join(';')}]`);
    
    symParts.push(`${sym.start}-${sym.end}`);
    parts.push(symParts.join(''));
  }
  
  return parts.join('');
}

export function exportToUniComp(spec: UniCompSpec): string {
  return stringifySpec(spec, 'editor');
}

export function exportToUniPNG(spec: UniCompSpec): string {
  const baked = bakeForExport(spec);
  return stringifyBakedSpec(baked);
}

export function exportToUniGIF(spec: UniCompSpec): string {
  if (!spec.symbols[0]?.keyframes) return exportToUniPNG(spec);
  return spec.symbols[0].keyframes
    .map((kf, i) => stringifySpec({ ...spec, symbols: [{ ...spec.symbols[0], keyframes: [kf] }] }, 'export'))
    .join('\n');
}

export function exportToUniMPG(spec: UniCompSpec): string {
  return stringifySpec(spec, 'editor');
}

export function exportToUniStr(spec: UniCompSpec): string {
  return `START${spec.symbols.map(s => { const b = s.d ?? { start: s.start, end: s.end }; return `DELTA v=${s.v};d=${formatBounds(b)}`; }).join(';')}STOP`;
}

export function exportToUni3DS(spec: UniCompSpec): string {
  const faces = ['front', 'right', 'left', 'top', 'bottom', 'back'];
  return faces.map((face, i) =>
    `zi=${i}[vp=0,0,${i * 10}]:${spec.symbols.map(s => `${s.v}${s.d?.start ?? s.start}-${s.d?.end ?? s.end}`).join(';')}`
  ).join('\n');
}

export function exportToUniLib(spec: UniCompSpec): string {
  return JSON.stringify({
    name: 'UniComp Library',
    version: '1.0',
    assets: [{ id: 'asset_1', type: 'unicomp', data: stringifySpec(spec, 'export') }]
  }, null, 2);
}

export function exportToUniAI(spec: UniCompSpec): string {
  return spec.symbols.map(s => `${s.v || '#obj'}[${s.d?.start ?? s.start}-${s.d?.end ?? s.end}]`).join(';');
}

export function exportToUniAsc(spec: UniCompSpec): string {
  return spec.symbols.map(s => `${s.v}${s.d?.start ?? s.start}-${s.d?.end ?? s.end}`).join(';');
}

export function exportToUniNode(spec: UniCompSpec): string {
  return spec.symbols.map(s => { const b = s.d ?? { start: s.start, end: s.end }; return `#${s.id || 'node'}[d=${formatBounds(b)}]`; }).join(';');
}

export function exportToUniSym(spec: UniCompSpec): string {
  return spec.symbols.map(s => `"${s.v}"[${s.d?.start ?? s.start}-${s.d?.end ?? s.end}]`).join(';');
}

function stringifyBakedSpec(spec: BakedSpec): string {
  const parts: string[] = [];
  if (spec.grid.g) parts.push(`(${spec.grid.g.x}×${spec.grid.g.y})`);
  if (spec.grid.gs) {
    const gsParams: string[] = [];
    if (spec.grid.gs.gc) gsParams.push(`gc=${spec.grid.gs.gc}`);
    if (spec.grid.gs.gb) gsParams.push(`gb=${spec.grid.gs.gb}`);
    if (gsParams.length > 0) parts.push(`[${gsParams.join(';')}]`);
  }
  parts.push(':');
  for (const sym of spec.symbols) {
    const symParts: string[] = [];
    if (sym.v) symParts.push(sym.v);
    const params: string[] = [];
    if (sym.id) params.push(`id=${sym.id}`);
    if (sym.d) params.push(`d=${formatBounds(sym.d)}`);
    if (sym.l !== undefined) params.push(`l=${sym.l}`);
    if (sym.z !== undefined) params.push(`z=${sym.z}`);
    if (params.length > 0) symParts.push(`[${params.join(';')}]`);
    symParts.push(`${sym.d.start}-${sym.d.end}`);
    parts.push(symParts.join(''));
  }
  return parts.join('');
}

export function detectFormat(input: string): UniFormat {
  if (input.includes('zi=') || input.includes('vp=') || input.includes('zd=')) return 'uni3ds';
  if (input.includes('START') || input.includes('STOP') || input.includes('DELTA')) return 'unistr';
  if (input.startsWith('{') || input.includes('#@') || input.includes('#!')) return 'unilib';
  if (input.startsWith('#') && !input.includes('[')) return 'uniai';
  if (input.split('\n').length > 1 && input.includes('k=')) return 'unigif';
  if (input.includes('k=') || input.includes('p=')) return 'unimpg';
  if (input.includes('(×') || input.includes('[')) return 'unicomp';
  return 'uniasc';
}

export type UniFormat =
  | 'unicomp' | 'unipng' | 'unigif' | 'unimpg' | 'unistr'
  | 'uni3ds' | 'unilib' | 'uniai' | 'uniasc' | 'uninode' | 'unisym';


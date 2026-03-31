/**
 * ============================================================================
 * UniSym Parser v1.0
 * ============================================================================
 * Минималистичный парсер для монохромных символьных композиций.
 * Основано на спецификации UniComp v1.0 (log.txt)
 * 
 * Назначение:
 * - Монохромные композиции (без цветов и стилей)
 * - Быстрая валидация геометрии для ИИ
 * - Экспорт/импорт бинарных матриц
 * - Терминальные превью
 * 
 * Импорт:
 *   import { parseUniSym, toMatrix, fromMatrix } from './unisym-parser';
 * 
 * Вес: ~4 KB (minified + gzip)
 * ============================================================================
 */

import { parseUniComp, type ParseResult, type UniCompSpec, type SymbolSpec } from './unicomp-parser';

// ============================================================================
// 1. TYPES (Минимальные типы для .unisym)
// ============================================================================

export interface UniSymSymbol {
  v: string;           // Контент (символ, #id, @name)
  start: number;       // Начало диапазона
  end: number;         // Конец диапазона
  l?: number;          // Слой (опционально)
  z?: number;          // Плоскость (опционально)
  id?: string;         // ID (опционально)
}

export interface UniSymSpec {
  gridWidth: number;
  gridHeight: number;
  symbols: UniSymSymbol[];
  raw?: string;
}

export interface MatrixOptions {
  threshold?: number;  // Порог альфа-канала (0-255)
  fillChar?: string;   // Символ для заполненных ячеек
  emptyChar?: string;  // Символ для пустых ячеек
}

// ============================================================================
// 2. PARSER (Парсинг .unisym формата)
// ============================================================================

/**
 * Парсит минималистичный монохромный формат.
 * Поддерживает:
 * - (W×H):v=start-end;v=start-end;
 * - #id=start-end;@name=start-end;
 * - Без цветов, стилей, трансформаций
 * 
 * @param input - Входная строка
 * @returns Спецификация или ошибка
 */
export function parseUniSym(input: string): { success: true; spec: UniSymSpec } | { success: false; error: string } {
  try {
    // Сначала парсим как полный UniComp
    const result: ParseResult = parseUniComp(input);
    
    if (!result.success) {
      return { success: false, error: result.error.message };
    }
    
    // Извлекаем только геометрию (v, start, end, l, z, id)
    const symbols: UniSymSymbol[] = result.spec.symbols.map(sym => ({
      v: sym.refId ? `#${sym.refId}` : sym.refName ? `@${sym.refName}` : sym.char,
      start: sym.start,
      end: sym.end,
      l: sym.id ? undefined : undefined, // l генерируется автоматически
      z: undefined, // z не используется в монохроме
      id: sym.id || undefined,
    }));
    
    return {
      success: true,
      spec: {
        gridWidth: result.spec.gridWidth,
        gridHeight: result.spec.gridHeight,
        symbols,
        raw: input,
      },
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Unknown parse error',
    };
  }
}

/**
 * Сериализует UniSymSpec обратно в строку.
 * 
 * @param spec - Спецификация
 * @returns Строка в формате .unisym
 */
export function stringifyUniSym(spec: UniSymSpec): string {
  const gridPart = spec.gridWidth === spec.gridHeight
    ? `(${spec.gridWidth})`
    : `(${spec.gridWidth}×${spec.gridHeight})`;
  
  const symbolsPart = spec.symbols.map(sym => {
    const idPart = sym.id ? `[id="${sym.id}"]` : '';
    return `${sym.v}${idPart}${sym.start}-${sym.end}`;
  }).join(';');
  
  return `${gridPart}:${symbolsPart}`;
}

// ============================================================================
// 3. MATRIX CONVERSION (Конвертация в бинарные матрицы)
// ============================================================================

/**
 * Конвертирует UniSymSpec в бинарную матрицу.
 * 
 * @param spec - Спецификация
 * @param options - Опции рендеринга
 * @returns Двумерный массив (0 = пусто, 1 = заполнено)
 */
export function toMatrix(spec: UniSymSpec, options: MatrixOptions = {}): number[][] {
  const { fillChar = '█', emptyChar = ' ' } = options;
  const { gridWidth, gridHeight, symbols } = spec;
  
  // Инициализируем пустую матрицу
  const matrix: number[][] = Array.from({ length: gridHeight }, () =>
    Array(gridWidth).fill(0)
  );
  
  // Заполняем ячейки символами
  for (const sym of symbols) {
    for (let i = sym.start; i <= sym.end; i++) {
      const x = i % gridWidth;
      const y = Math.floor(i / gridWidth);
      if (y >= 0 && y < gridHeight && x >= 0 && x < gridWidth) {
        matrix[y][x] = 1;
      }
    }
  }
  
  return matrix;
}

/**
 * Конвертирует бинарную матрицу обратно в UniSymSpec.
 * 
 * @param matrix - Двумерный массив (0/1)
 * @param symbol - Символ для заполненных ячеек (по умолчанию '#')
 * @returns UniSymSpec
 */
export function fromMatrix(matrix: number[][], symbol: string = '#'): UniSymSpec {
  const gridHeight = matrix.length;
  const gridWidth = matrix[0]?.length || 0;
  const symbols: UniSymSymbol[] = [];
  
  // Находим все заполненные ячейки
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      if (matrix[y][x] === 1) {
        const index = y * gridWidth + x;
        symbols.push({
          v: symbol,
          start: index,
          end: index,
        });
      }
    }
  }
  
  return {
    gridWidth,
    gridHeight,
    symbols,
  };
}

/**
 * Рендерит матрицу в ASCII-строку.
 * 
 * @param matrix - Двумерный массив
 * @param options - Опции рендеринга
 * @returns ASCII-строка
 */
export function matrixToAscii(matrix: number[][], options: MatrixOptions = {}): string {
  const { fillChar = '█', emptyChar = ' ' } = options;
  
  return matrix
    .map(row => row.map(cell => (cell ? fillChar : emptyChar)).join(''))
    .join('\n');
}

/**
 * Парсит ASCII-строку обратно в матрицу.
 * 
 * @param ascii - ASCII-строка
 * @param fillChars - Символы, считающиеся заполненными (по умолчанию '█#1')
 * @returns Двумерный массив
 */
export function asciiToMatrix(ascii: string, fillChars: string = '█#1'): number[][] {
  const lines = ascii.split('\n').filter(l => l.trim().length > 0);
  
  return lines.map(line =>
    line.split('').map(char => (fillChars.includes(char) ? 1 : 0))
  );
}

// ============================================================================
// 4. UTILITIES (Утилиты для работы с матрицами)
// ============================================================================

/**
 * Сравнивает две матрицы на идентичность.
 * 
 * @param a - Первая матрица
 * @param b - Вторая матрица
 * @returns Процент совпадения (0-1)
 */
export function compareMatrices(a: number[][], b: number[][]): number {
  if (a.length !== b.length || a[0]?.length !== b[0]?.length) {
    return 0;
  }
  
  let matches = 0;
  let total = 0;
  
  for (let y = 0; y < a.length; y++) {
    for (let x = 0; x < a[y].length; x++) {
      if (a[y][x] === b[y][x]) matches++;
      total++;
    }
  }
  
  return total > 0 ? matches / total : 0;
}

/**
 * Вычисляет IoU (Intersection over Union) для двух матриц.
 * 
 * @param a - Первая матрица
 * @param b - Вторая матрица
 * @returns IoU (0-1)
 */
export function calculateIoU(a: number[][], b: number[][]): number {
  if (a.length !== b.length || a[0]?.length !== b[0]?.length) {
    return 0;
  }
  
  let intersection = 0;
  let union = 0;
  
  for (let y = 0; y < a.length; y++) {
    for (let x = 0; x < a[y].length; x++) {
      const aVal = a[y][x];
      const bVal = b[y][x];
      
      if (aVal === 1 || bVal === 1) union++;
      if (aVal === 1 && bVal === 1) intersection++;
    }
  }
  
  return union > 0 ? intersection / union : 0;
}

/**
 * Масштабирует матрицу (up/down sampling).
 * 
 * @param matrix - Исходная матрица
 * @param factor - Коэффициент масштабирования (>1 увеличение, <1 уменьшение)
 * @returns Новая матрица
 */
export function scaleMatrix(matrix: number[][], factor: number): number[][] {
  const oldHeight = matrix.length;
  const oldWidth = matrix[0]?.length || 0;
  const newHeight = Math.round(oldHeight * factor);
  const newWidth = Math.round(oldWidth * factor);
  
  const result: number[][] = Array.from({ length: newHeight }, () =>
    Array(newWidth).fill(0)
  );
  
  for (let y = 0; y < newHeight; y++) {
    for (let x = 0; x < newWidth; x++) {
      const oldY = Math.floor(y / factor);
      const oldX = Math.floor(x / factor);
      result[y][x] = matrix[oldY]?.[oldX] ?? 0;
    }
  }
  
  return result;
}

/**
 * Поворачивает матрицу на 90° по часовой стрелке.
 * 
 * @param matrix - Исходная матрица
 * @returns Новая матрица
 */
export function rotateMatrix90(matrix: number[][]): number[][] {
  const height = matrix.length;
  const width = matrix[0]?.length || 0;
  
  const result: number[][] = Array.from({ length: width }, () =>
    Array(height).fill(0)
  );
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      result[x][height - 1 - y] = matrix[y][x];
    }
  }
  
  return result;
}

/**
 * Отражает матрицу по горизонтали.
 * 
 * @param matrix - Исходная матрица
 * @returns Новая матрица
 */
export function flipMatrixH(matrix: number[][]): number[][] {
  return matrix.map(row => [...row].reverse());
}

/**
 * Отражает матрицу по вертикали.
 * 
 * @param matrix - Исходная матрица
 * @returns Новая матрица
 */
export function flipMatrixV(matrix: number[][]): number[][] {
  return [...matrix].reverse();
}

// ============================================================================
// 5. AI VALIDATION (Валидация для ИИ)
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  geometryMatch: number;
  symbolMatch: number;
  errors: string[];
}

/**
 * Валидирует сгенерированную ИИ композицию против эталона.
 * 
 * @param generated - Сгенерированная спецификация
 * @param expected - Ожидаемая спецификация
 * @returns Результат валидации
 */
export function validateComposition(
  generated: UniSymSpec,
  expected: UniSymSpec
): ValidationResult {
  const errors: string[] = [];
  
  // Проверка размеров сетки
  if (generated.gridWidth !== expected.gridWidth || generated.gridHeight !== expected.gridHeight) {
    errors.push(`Grid size mismatch: ${generated.gridWidth}×${generated.gridHeight} vs ${expected.gridWidth}×${expected.gridHeight}`);
  }
  
  // Проверка геометрии (матрицы)
  const genMatrix = toMatrix(generated);
  const expMatrix = toMatrix(expected);
  const geometryMatch = compareMatrices(genMatrix, expMatrix);
  
  // Проверка символов
  let symbolMatches = 0;
  let totalSymbols = expected.symbols.length;
  
  for (const expSym of expected.symbols) {
    const found = generated.symbols.find(genSym =>
      genSym.start === expSym.start && genSym.end === expSym.end
    );
    if (found && found.v === expSym.v) {
      symbolMatches++;
    }
  }
  
  const symbolMatch = totalSymbols > 0 ? symbolMatches / totalSymbols : 0;
  
  // Итоговая валидация
  const valid = geometryMatch > 0.9 && symbolMatch > 0.9;
  
  if (!valid) {
    if (geometryMatch < 0.9) errors.push(`Geometry match too low: ${(geometryMatch * 100).toFixed(1)}%`);
    if (symbolMatch < 0.9) errors.push(`Symbol match too low: ${(symbolMatch * 100).toFixed(1)}%`);
  }
  
  return {
    valid,
    geometryMatch,
    symbolMatch,
    errors,
  };
}

// ============================================================================
// 6. EXPORT (Публичный API)
// ============================================================================

export {
  parseUniSym,
  stringifyUniSym,
  toMatrix,
  fromMatrix,
  matrixToAscii,
  asciiToMatrix,
  compareMatrices,
  calculateIoU,
  scaleMatrix,
  rotateMatrix90,
  flipMatrixH,
  flipMatrixV,
  validateComposition,
};

export type {
  UniSymSymbol,
  UniSymSpec,
  MatrixOptions,
  ValidationResult,
};
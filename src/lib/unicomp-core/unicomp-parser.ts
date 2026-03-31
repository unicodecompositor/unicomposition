/**
 * UniComp Parser v1.0 (Full Editor)
 * Полный парсер для редактора со всей историей и анимацией.
 * Вес: ~21 KB (minified + gzip)
 * 
 * Назначение:
 * - Полный редактор
 * - История изменений (h=)
 * - Анимация (k=, t=, p=)
 * - Аффинное пространство (pg, po)
 */

export { parseUniComp, parseMultiLine, stringifySpec } from '../unicomp-core/parser-base';
export { bakeForExport, unbakeForEditor } from '../unicomp-core/utils';
export type { UniCompSpec, EditorSpec, SymbolSpec, HistoryStep, KeyframeStep } from '../unicomp-core/types';

// Re-export all utilities
export {
  parseBounds,
  parseAngleForce,
  parseVec2,
  parseVec3,
  parseVec4,
  computeGridSize,
  computePgForGridResize,
  computePoFromD,
  computeDFromPgPo,
  resolveHistory,
  SECURITY_LIMITS,
  detectFormat
} from '../unicomp-core/utils';

// Re-export all types
export type {
  Vec2, Vec3, Vec4, Bounds,
  TransformVector, LayerStyles, GridStyles,
  BaseSymbol, BaseSpec, BakedSymbol, BakedSpec,
  ParserMode, UniFormat,
  PLAY_STATES, CUBE_FACES, CONTENT_PREFIX
} from '../unicomp-core/types';
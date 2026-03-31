/**
 * ============================================================================
 * UniComp Grid Geometry v2.0 (Anchor-Based Model)
 * ============================================================================
 * 
 * Core anchor-based geometry model for UniComp.
 * 
 * Key formula:
 *   d(start, end) = pg(start, end) + po(start, end)
 * 
 * Where:
 *   - g = Grid Space: total canvas size (sum of all layers)
 *   - pg = Primary Grid anchor: invisible layer that moves during expansion
 *   - po = Primary Offset: layer's offset relative to pg
 *   - d = Final coordinates: rendered position (pg + po)
 * 
 * History Model:
 *   - Move: records po_delta in history
 *   - Scale: records d_delta in history
 *   - Undo: applies reverse deltas
 *   - Grid expansion: pg moves (opposite sign) to keep relative positions stable
 * 
 * ============================================================================
 */

import type { Bounds, Vec2 } from '@/lib/unicomp-parser';

/**
 * Represents a layer's position in the grid.
 */
export interface LayerGeometry {
  x: number;  // grid column (0-based)
  y: number;  // grid row (0-based)
  w: number;  // width in cells
  h: number;  // height in cells
}

/**
 * Represents the grid state with anchor information.
 */
export interface GridState {
  width: number;
  height: number;
  pg: Bounds;  // Primary grid anchor
}

/**
 * Converts linear indices to 2D grid coordinates.
 */
export function indexToCoords(index: number, gridWidth: number): { x: number; y: number } {
  return {
    x: index % gridWidth,
    y: Math.floor(index / gridWidth),
  };
}

/**
 * Converts 2D grid coordinates to linear index.
 */
export function coordsToIndex(x: number, y: number, gridWidth: number): number {
  return y * gridWidth + x;
}

/**
 * Extracts geometry from start/end bounds.
 */
export function boundsToGeometry(start: number, end: number, gridWidth: number): LayerGeometry {
  const startCoords = indexToCoords(start, gridWidth);
  const endCoords = indexToCoords(end, gridWidth);
  
  return {
    x: startCoords.x,
    y: startCoords.y,
    w: endCoords.x - startCoords.x + 1,
    h: endCoords.y - startCoords.y + 1,
  };
}

/**
 * Converts geometry back to start/end bounds.
 */
export function geometryToBounds(geom: LayerGeometry, gridWidth: number): Bounds {
  const start = coordsToIndex(geom.x, geom.y, gridWidth);
  const end = coordsToIndex(geom.x + geom.w - 1, geom.y + geom.h - 1, gridWidth);
  
  return { start, end };
}

/**
 * Calculates the minimal grid size needed to contain all layers.
 * 
 * Formula: g(W×H) = sum_all_layers[d.start, d.end]
 */
export function computeMinimalGridSize(
  layers: Array<{ d?: Bounds; start?: number; end?: number }>
): { width: number; height: number } {
  let maxX = 0;
  let maxY = 0;
  
  for (const layer of layers) {
    const start = layer.d?.start ?? layer.start ?? 0;
    const end = layer.d?.end ?? layer.end ?? 0;
    
    const endCoords = indexToCoords(end, Math.ceil(Math.sqrt(end + 1)));
    maxX = Math.max(maxX, endCoords.x + 1);
    maxY = Math.max(maxY, endCoords.y + 1);
  }
  
  // Ensure at least 2x2 grid
  return {
    width: Math.max(2, maxX),
    height: Math.max(2, maxY),
  };
}

/**
 * Calculates grid expansion when layers move.
 * 
 * Returns: { expandLeft, expandTop, expandRight, expandBottom }
 */
export function calculateGridExpansion(
  oldGeometries: LayerGeometry[],
  newGeometries: LayerGeometry[],
  oldGridWidth: number,
  oldGridHeight: number
): {
  expandLeft: number;
  expandTop: number;
  expandRight: number;
  expandBottom: number;
} {
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  
  for (const geom of newGeometries) {
    minX = Math.min(minX, geom.x);
    minY = Math.min(minY, geom.y);
    maxX = Math.max(maxX, geom.x + geom.w - 1);
    maxY = Math.max(maxY, geom.y + geom.h - 1);
  }
  
  return {
    expandLeft: Math.max(0, -minX),
    expandTop: Math.max(0, -minY),
    expandRight: Math.max(0, maxX - (oldGridWidth - 1)),
    expandBottom: Math.max(0, maxY - (oldGridHeight - 1)),
  };
}

/**
 * Updates the primary grid anchor when grid expands.
 * 
 * Formula: pg(new) = pg(old) + diff_expansion(opposite_sign)
 * 
 * This keeps all layers' absolute positions stable.
 */
export function updateAnchorForExpansion(
  oldPg: Bounds,
  oldGridWidth: number,
  oldGridHeight: number,
  newGridWidth: number,
  newGridHeight: number,
  expandLeft: number,
  expandTop: number
): Bounds {
  // When grid expands left/top, the anchor moves right/down (opposite sign)
  const pgDeltaStart = expandLeft + expandTop * newGridWidth;
  const pgDeltaEnd = expandLeft + expandTop * newGridWidth;
  
  return {
    start: oldPg.start + pgDeltaStart,
    end: oldPg.end + pgDeltaEnd,
  };
}

/**
 * Computes final coordinates from anchor and offset.
 * 
 * Formula: d = pg + po
 */
export function computeD(pg: Bounds, po: Bounds): Bounds {
  return {
    start: pg.start + po.start,
    end: pg.end + po.end,
  };
}

/**
 * Computes offset from final coordinates and anchor.
 * 
 * Formula: po = d - pg
 */
export function computePo(d: Bounds, pg: Bounds): Bounds {
  return {
    start: d.start - pg.start,
    end: d.end - pg.end,
  };
}

/**
 * Applies a delta to primary offset (for undo).
 * 
 * Formula: po_new = po_old + delta
 */
export function applyPoDelta(po: Bounds, delta: Bounds): Bounds {
  return {
    start: po.start + delta.start,
    end: po.end + delta.end,
  };
}

/**
 * Reverses a delta (for undo).
 */
export function reverseDelta(delta: Bounds): Bounds {
  return {
    start: -delta.start,
    end: -delta.end,
  };
}

/**
 * Validates that a layer fits within the grid.
 */
export function isLayerInBounds(d: Bounds, gridWidth: number, gridHeight: number): boolean {
  const gridSize = gridWidth * gridHeight;
  return d.start >= 0 && d.end >= d.start && d.end < gridSize;
}

/**
 * Clamps a layer's position to stay within grid bounds.
 */
export function clampLayerToBounds(d: Bounds, gridWidth: number, gridHeight: number): Bounds {
  const gridSize = gridWidth * gridHeight;
  return {
    start: Math.max(0, Math.min(d.start, gridSize - 1)),
    end: Math.max(d.start, Math.min(d.end, gridSize - 1)),
  };
}

/**
 * Converts grid coordinates to linear index range.
 */
export function geometryToLinearRange(geom: LayerGeometry, gridWidth: number): Bounds {
  const start = geom.y * gridWidth + geom.x;
  const end = (geom.y + geom.h - 1) * gridWidth + (geom.x + geom.w - 1);
  return { start, end };
}

/**
 * Converts linear index range to grid coordinates.
 */
export function linearRangeToGeometry(start: number, end: number, gridWidth: number): LayerGeometry {
  const startCoords = indexToCoords(start, gridWidth);
  const endCoords = indexToCoords(end, gridWidth);
  
  return {
    x: startCoords.x,
    y: startCoords.y,
    w: endCoords.x - startCoords.x + 1,
    h: endCoords.y - startCoords.y + 1,
  };
}

/**
 * Calculates the bounding box of multiple layers.
 */
export function calculateBoundingBox(geometries: LayerGeometry[]): LayerGeometry | null {
  if (geometries.length === 0) return null;
  
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  
  for (const geom of geometries) {
    minX = Math.min(minX, geom.x);
    minY = Math.min(minY, geom.y);
    maxX = Math.max(maxX, geom.x + geom.w - 1);
    maxY = Math.max(maxY, geom.y + geom.h - 1);
  }
  
  return {
    x: minX,
    y: minY,
    w: maxX - minX + 1,
    h: maxY - minY + 1,
  };
}

/**
 * Translates a layer by a given offset.
 */
export function translateGeometry(geom: LayerGeometry, dx: number, dy: number): LayerGeometry {
  return {
    x: geom.x + dx,
    y: geom.y + dy,
    w: geom.w,
    h: geom.h,
  };
}

/**
 * Scales a layer around its center.
 */
export function scaleGeometry(geom: LayerGeometry, scaleX: number, scaleY: number): LayerGeometry {
  return {
    x: geom.x,
    y: geom.y,
    w: Math.max(1, Math.round(geom.w * scaleX)),
    h: Math.max(1, Math.round(geom.h * scaleY)),
  };
}

export {
  type Bounds,
  type Vec2,
  type LayerGeometry,
  type GridState,
};

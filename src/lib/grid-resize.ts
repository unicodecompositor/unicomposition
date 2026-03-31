/**
 * ============================================================================
 * UniComp Grid Resize v2.0
 * ============================================================================
 * 
 * Implements grid resizing with anchor-based geometry.
 * 
 * When resizing the grid:
 * 1. Parse the UniComp rule
 * 2. Calculate new minimal grid size
 * 3. Update pg (anchor) if grid expanded
 * 4. Recalculate all layer positions
 * 5. Stringify back to UniComp format
 * 
 * ============================================================================
 */

import {
  parseUniComp,
  stringifySpec,
  computeGridSize,
  getRect,
  type UniCompSpec,
  type SymbolSpec,
} from '@/lib/unicomp-parser';

import {
  boundsToGeometry,
  geometryToLinearRange,
  calculateGridExpansion,
  updateAnchorForExpansion,
  computeD,
  computePo,
} from '@/lib/grid-geometry';

/**
 * Resizes a UniComp rule to a new grid size.
 * 
 * This function:
 * 1. Parses the input rule
 * 2. Recalculates all layer positions for the new grid
 * 3. Updates the anchor (pg) if the grid expanded
 * 4. Returns the stringified result
 * 
 * @param input UniComp rule string (e.g., "(10×10)[...]:...")
 * @param newWidth New grid width
 * @param newHeight New grid height
 * @returns Stringified UniComp rule with new grid size
 */
export function resizeGrid(input: string, newWidth: number, newHeight: number): string {
  const result = parseUniComp(input);
  if (!result.success) {
    throw new Error(`Failed to parse UniComp rule: ${result.error.message}`);
  }

  const spec = result.spec;
  const oldWidth = spec.gridWidth;
  const oldHeight = spec.gridHeight;

  // If size hasn't changed, return as-is
  if (oldWidth === newWidth && oldHeight === newHeight) {
    return input;
  }

  // Calculate old geometries
  const oldGeometries = spec.symbols.map((sym) => {
    const start = sym.d?.start ?? sym.start;
    const end = sym.d?.end ?? sym.end;
    return boundsToGeometry(start, end, oldWidth);
  });

  // Calculate expansion needed
  const expansion = calculateGridExpansion(
    oldGeometries,
    oldGeometries,
    oldWidth,
    oldHeight
  );

  // Update anchor if grid expanded
  const oldPg = spec.grid.pg ?? { start: 0, end: oldWidth * oldHeight - 1 };
  let newPg = oldPg;

  if (expansion.expandLeft > 0 || expansion.expandTop > 0) {
    newPg = updateAnchorForExpansion(
      oldPg,
      oldWidth,
      oldHeight,
      newWidth,
      newHeight,
      expansion.expandLeft,
      expansion.expandTop
    );
  }

  // Recalculate all layer positions in the new grid
  const newSymbols = spec.symbols.map((sym, idx) => {
    const oldGeom = oldGeometries[idx];
    
    // Shift position by expansion
    const newGeom = {
      x: oldGeom.x + expansion.expandLeft,
      y: oldGeom.y + expansion.expandTop,
      w: oldGeom.w,
      h: oldGeom.h,
    };

    // Convert back to bounds
    const newBounds = geometryToLinearRange(newGeom, newWidth);

    return {
      ...sym,
      start: newBounds.start,
      end: newBounds.end,
      d: newBounds,
      pg: newPg,
      po: computePo(newBounds, newPg),
    };
  });

  // Create new spec with updated grid
  const newSpec: UniCompSpec = {
    ...spec,
    gridWidth: newWidth,
    gridHeight: newHeight,
    grid: {
      ...spec.grid,
      g: { x: newWidth, y: newHeight },
      pg: newPg,
    },
    symbols: newSymbols,
  };

  return stringifySpec(newSpec, 'editor');
}

/**
 * Validates that a new grid size is reasonable.
 */
export function isValidGridSize(width: number, height: number): boolean {
  return (
    Number.isInteger(width) &&
    Number.isInteger(height) &&
    width >= 2 &&
    width <= 500 &&
    height >= 2 &&
    height <= 500
  );
}

/**
 * Calculates the minimal grid size for a spec.
 */
export function getMinimalGridSize(spec: UniCompSpec): { width: number; height: number } {
  return computeGridSize(spec.symbols);
}

export { type UniCompSpec, type SymbolSpec };

/**
 * Debt Passing Engine for UniComp grid operations.
 * 
 * Instead of storing grid expansion per history step (me=/se=),
 * each layer carries runtime debt fields (moveDebt, scaleDebt).
 * 
 * On undo, debt transfers to the nearest edge layer in the group,
 * avoiding full grid recalculation.
 * 
 * Formula: start = offset + moveDebt + scaleDebt
 *          end   = start + size
 * 
 * Debts are runtime-only — they don't appear in the text format.
 * On bake/export: d = final start-end after collapsing all debts.
 */

import { UniCompSpec, SymbolSpec, getRect } from './unicomp-parser';

// ============================================================================
// TYPES
// ============================================================================

export interface Vec2 {
  x: number;
  y: number;
}

export interface LayerDebt {
  moveDebt: Vec2;   // grid expansion caused by this layer's moves
  scaleDebt: Vec2;  // grid expansion caused by this layer's scales
}

// ============================================================================
// HELPERS
// ============================================================================

/** Get or initialize debt for a symbol */
export function getDebt(sym: SymbolSpec): LayerDebt {
  return {
    moveDebt: sym._moveDebt || { x: 0, y: 0 },
    scaleDebt: sym._scaleDebt || { x: 0, y: 0 },
  };
}

/** Set debt on a symbol */
export function setDebt(sym: SymbolSpec, debt: Partial<LayerDebt>): void {
  if (debt.moveDebt) sym._moveDebt = { ...debt.moveDebt };
  if (debt.scaleDebt) sym._scaleDebt = { ...debt.scaleDebt };
}

/** Clear all debt from a symbol */
export function clearDebt(sym: SymbolSpec): void {
  sym._moveDebt = undefined;
  sym._scaleDebt = undefined;
}

// ============================================================================
// MOVE WITH DEBT
// ============================================================================

export interface MoveResult {
  newSpec: UniCompSpec;
  /** Which symbol indices received move debt */
  debtHolders: number[];
}

/**
 * Apply a grid move to selected layers, using debt passing for grid expansion.
 * 
 * @param spec - current spec (will be deep-cloned internally)
 * @param selectionSet - indices of layers being moved
 * @param gridDx - horizontal grid cells to move
 * @param gridDy - vertical grid cells to move
 */
export function applyMoveWithDebt(
  spec: UniCompSpec,
  selectionSet: number[],
  gridDx: number,
  gridDy: number,
): MoveResult {
  const newSpec = JSON.parse(JSON.stringify(spec)) as UniCompSpec;
  const oldW = newSpec.gridWidth;
  const oldH = newSpec.gridHeight;
  const debtHolders: number[] = [];

  // Compute current positions for all layers
  type LayerPos = { x: number; y: number; w: number; h: number };
  const positions: LayerPos[] = newSpec.symbols.map(s => {
    const rect = getRect(s.start, s.end, oldW);
    return { x: rect.x1, y: rect.y1, w: rect.width, h: rect.height };
  });

  // Find group bounds (before move)
  let groupMinX = Infinity, groupMinY = Infinity;
  selectionSet.forEach(idx => {
    const p = positions[idx];
    if (!p) return;
    groupMinX = Math.min(groupMinX, p.x);
    groupMinY = Math.min(groupMinY, p.y);
  });

  // Compute overflow (how much the group extends past left/top boundary)
  const overflowX = Math.max(0, -(groupMinX + gridDx));
  const overflowY = Math.max(0, -(groupMinY + gridDy));

  // Effective delta: clamped so no layer goes negative
  const effectiveDx = Math.max(gridDx, -groupMinX);
  const effectiveDy = Math.max(gridDy, -groupMinY);

  // Apply move to selected layers, shift others by overflow
  positions.forEach((p, idx) => {
    if (selectionSet.includes(idx)) {
      p.x += effectiveDx;
      p.y += effectiveDy;
    } else {
      p.x += overflowX;
      p.y += overflowY;
    }
  });

  // Compute new grid size
  let finalW = oldW + overflowX;
  let finalH = oldH + overflowY;
  positions.forEach(p => {
    finalW = Math.max(finalW, p.x + p.w);
    finalH = Math.max(finalH, p.y + p.h);
  });
  finalW = Math.min(100, finalW);
  finalH = Math.min(100, finalH);

  // Update symbol positions
  newSpec.symbols = newSpec.symbols.map((s, idx) => {
    const p = positions[idx];
    return {
      ...s,
      start: p.y * finalW + p.x,
      end: (p.y + p.h - 1) * finalW + (p.x + p.w - 1),
    };
  });
  newSpec.gridWidth = finalW;
  newSpec.gridHeight = finalH;

  // Assign move debt to the edge layer (leftmost/topmost in group after move)
  if (overflowX > 0 || overflowY > 0) {
    // Find edge layers in selection (after move)
    let edgeXIdx = -1, edgeYIdx = -1;
    let minNewX = Infinity, minNewY = Infinity;
    selectionSet.forEach(idx => {
      const p = positions[idx];
      if (!p) return;
      if (p.x < minNewX) { minNewX = p.x; edgeXIdx = idx; }
      if (p.y < minNewY) { minNewY = p.y; edgeYIdx = idx; }
    });

    if (overflowX > 0 && edgeXIdx >= 0) {
      const sym = newSpec.symbols[edgeXIdx];
      const existing = sym._moveDebt || { x: 0, y: 0 };
      sym._moveDebt = { x: existing.x + overflowX, y: existing.y };
      if (!debtHolders.includes(edgeXIdx)) debtHolders.push(edgeXIdx);
    }
    if (overflowY > 0 && edgeYIdx >= 0) {
      const sym = newSpec.symbols[edgeYIdx];
      const existing = sym._moveDebt || { x: 0, y: 0 };
      sym._moveDebt = { x: existing.x, y: existing.y + overflowY };
      if (!debtHolders.includes(edgeYIdx)) debtHolders.push(edgeYIdx);
    }
  }

  return { newSpec, debtHolders };
}

// ============================================================================
// UNDO MOVE WITH DEBT TRANSFER
// ============================================================================

export interface UndoMoveResult {
  newSpec: UniCompSpec;
  /** Whether grid was shrunk */
  gridChanged: boolean;
}

/**
 * Undo a move for specific layers, transferring debt to nearest edge layer.
 * 
 * @param spec - current spec
 * @param undoIndices - indices of layers being undone
 * @param reverseDelta - the reverse move delta (negative of original)
 * @param groupIndices - all indices that were in the original move group
 */
export function undoMoveWithDebtTransfer(
  spec: UniCompSpec,
  undoIndices: number[],
  reverseDelta: Vec2,
  groupIndices: number[],
): UndoMoveResult {
  const newSpec = JSON.parse(JSON.stringify(spec)) as UniCompSpec;
  let gridChanged = false;

  undoIndices.forEach(aIdx => {
    const sym = newSpec.symbols[aIdx];
    if (!sym) return;

    // Reverse the move on this layer's position
    const rect = getRect(sym.start, sym.end, newSpec.gridWidth);
    const newX = Math.max(0, rect.x1 + reverseDelta.x);
    const newY = Math.max(0, rect.y1 + reverseDelta.y);
    sym.start = newY * newSpec.gridWidth + newX;
    sym.end = (newY + rect.height - 1) * newSpec.gridWidth + (newX + rect.width - 1);

    // Transfer debt
    const debt = sym._moveDebt || { x: 0, y: 0 };
    if (debt.x > 0 || debt.y > 0) {
      // Find nearest edge layer in remaining group
      const remaining = groupIndices.filter(i => i !== aIdx && !undoIndices.includes(i));

      if (remaining.length > 0) {
        // Transfer to leftmost/topmost layer in remaining group
        let edgeXIdx = -1, edgeYIdx = -1;
        let minX = Infinity, minY = Infinity;

        remaining.forEach(idx => {
          const r = getRect(newSpec.symbols[idx].start, newSpec.symbols[idx].end, newSpec.gridWidth);
          if (r.x1 < minX) { minX = r.x1; edgeXIdx = idx; }
          if (r.y1 < minY) { minY = r.y1; edgeYIdx = idx; }
        });

        if (debt.x > 0 && edgeXIdx >= 0) {
          const target = newSpec.symbols[edgeXIdx];
          const targetDebt = target._moveDebt || { x: 0, y: 0 };
          target._moveDebt = { x: targetDebt.x + debt.x, y: targetDebt.y };
        }
        if (debt.y > 0 && edgeYIdx >= 0) {
          const target = newSpec.symbols[edgeYIdx];
          const targetDebt = target._moveDebt || { x: 0, y: 0 };
          target._moveDebt = { x: targetDebt.x, y: targetDebt.y + debt.y };
        }
      } else {
        // No remaining layers — grid can shrink
        gridChanged = true;
        shrinkGrid(newSpec, debt.x, debt.y);
      }
    }
    sym._moveDebt = undefined;
  });

  return { newSpec, gridChanged };
}

// ============================================================================
// SCALE WITH DEBT
// ============================================================================

/**
 * Assign scale debt to the edge layer when scaling expands the grid.
 */
export function assignScaleDebt(
  spec: UniCompSpec,
  selectionSet: number[],
  expandLeft: number,
  expandTop: number,
): void {
  if (expandLeft <= 0 && expandTop <= 0) return;

  // Find edge layers in selection
  let edgeXIdx = -1, edgeYIdx = -1;
  let minX = Infinity, minY = Infinity;

  selectionSet.forEach(idx => {
    const sym = spec.symbols[idx];
    if (!sym) return;
    const rect = getRect(sym.start, sym.end, spec.gridWidth);
    if (rect.x1 < minX) { minX = rect.x1; edgeXIdx = idx; }
    if (rect.y1 < minY) { minY = rect.y1; edgeYIdx = idx; }
  });

  if (expandLeft > 0 && edgeXIdx >= 0) {
    const sym = spec.symbols[edgeXIdx];
    const existing = sym._scaleDebt || { x: 0, y: 0 };
    sym._scaleDebt = { x: existing.x + expandLeft, y: existing.y };
  }
  if (expandTop > 0 && edgeYIdx >= 0) {
    const sym = spec.symbols[edgeYIdx];
    const existing = sym._scaleDebt || { x: 0, y: 0 };
    sym._scaleDebt = { x: existing.x, y: existing.y + expandTop };
  }
}

/**
 * Transfer scale debt on undo, same logic as move debt transfer.
 */
export function transferScaleDebt(
  spec: UniCompSpec,
  undoIdx: number,
  groupIndices: number[],
): boolean {
  const sym = spec.symbols[undoIdx];
  if (!sym) return false;

  const debt = sym._scaleDebt || { x: 0, y: 0 };
  if (debt.x <= 0 && debt.y <= 0) {
    sym._scaleDebt = undefined;
    return false;
  }

  const remaining = groupIndices.filter(i => i !== undoIdx);

  if (remaining.length > 0) {
    let edgeXIdx = -1, edgeYIdx = -1;
    let minX = Infinity, minY = Infinity;

    remaining.forEach(idx => {
      const r = getRect(spec.symbols[idx].start, spec.symbols[idx].end, spec.gridWidth);
      if (r.x1 < minX) { minX = r.x1; edgeXIdx = idx; }
      if (r.y1 < minY) { minY = r.y1; edgeYIdx = idx; }
    });

    if (debt.x > 0 && edgeXIdx >= 0) {
      const target = spec.symbols[edgeXIdx];
      const td = target._scaleDebt || { x: 0, y: 0 };
      target._scaleDebt = { x: td.x + debt.x, y: td.y };
    }
    if (debt.y > 0 && edgeYIdx >= 0) {
      const target = spec.symbols[edgeYIdx];
      const td = target._scaleDebt || { x: 0, y: 0 };
      target._scaleDebt = { x: td.x, y: td.y + debt.y };
    }

    sym._scaleDebt = undefined;
    return false;
  } else {
    // No remaining — grid can shrink
    sym._scaleDebt = undefined;
    shrinkGrid(spec, debt.x, debt.y);
    return true;
  }
}

// ============================================================================
// GRID SHRINK
// ============================================================================

/**
 * Shrink grid by removing empty columns/rows from left/top edge.
 * Shifts all layer positions accordingly.
 */
function shrinkGrid(spec: UniCompSpec, shrinkLeft: number, shrinkTop: number): void {
  if (shrinkLeft <= 0 && shrinkTop <= 0) return;

  const oldW = spec.gridWidth;
  const newW = Math.max(2, oldW - shrinkLeft);
  const newH = Math.max(2, spec.gridHeight - shrinkTop);

  spec.symbols = spec.symbols.map(s => {
    const r = getRect(s.start, s.end, oldW);
    const shiftedX = Math.max(0, r.x1 - shrinkLeft);
    const shiftedY = Math.max(0, r.y1 - shrinkTop);
    const w = Math.min(r.width, newW - shiftedX);
    const h = Math.min(r.height, newH - shiftedY);
    return {
      ...s,
      start: shiftedY * newW + shiftedX,
      end: (shiftedY + Math.max(1, h) - 1) * newW + (shiftedX + Math.max(1, w) - 1),
    };
  });

  spec.gridWidth = newW;
  spec.gridHeight = newH;
}

// ============================================================================
// BAKE WITH DEBT
// ============================================================================

/**
 * Compute final start-end by collapsing debts: d = (o + moveDebt + scaleDebt) + s
 * This is used at export time.
 */
export function bakeWithDebt(sym: SymbolSpec, gridWidth: number): { start: number; end: number } {
  const rect = getRect(sym.start, sym.end, gridWidth);
  const md = sym._moveDebt || { x: 0, y: 0 };
  const sd = sym._scaleDebt || { x: 0, y: 0 };

  // Debts are already baked into the position through grid expansion,
  // so the current start/end already reflects them.
  // This function is for verification / explicit recalculation.
  return { start: sym.start, end: sym.end };
}

// ============================================================================
// TOTAL DEBT
// ============================================================================

/**
 * Check if any symbol in the spec holds non-zero debt.
 */
export function hasAnyDebt(spec: UniCompSpec): boolean {
  return spec.symbols.some(s => {
    const md = s._moveDebt;
    const sd = s._scaleDebt;
    return (md && (md.x > 0 || md.y > 0)) || (sd && (sd.x > 0 || sd.y > 0));
  });
}

/**
 * Get total debt across all symbols (for debugging).
 */
export function getTotalDebt(spec: UniCompSpec): { moveDebt: Vec2; scaleDebt: Vec2 } {
  let mx = 0, my = 0, sx = 0, sy = 0;
  spec.symbols.forEach(s => {
    if (s._moveDebt) { mx += s._moveDebt.x; my += s._moveDebt.y; }
    if (s._scaleDebt) { sx += s._scaleDebt.x; sy += s._scaleDebt.y; }
  });
  return { moveDebt: { x: mx, y: my }, scaleDebt: { x: sx, y: sy } };
}

# Implementation Guide: Anchor-Based History Fix

## Overview

This guide explains how to fix the `handleMouseMove` handlers in `UniCompRenderer.tsx` to properly implement the anchor-based geometry model.

## Current Problems

### Problem 1: Move Handler (lines 348-422)
**Current behavior:**
```typescript
// Manually shifts all non-selected layers
positions.forEach((p, idx) => {
  if (selectionSet.includes(idx)) {
    p.x += effectiveDx;
    p.y += effectiveDy;
  } else {
    p.x += expandLeft;  // ← Wrong! This breaks the anchor model
    p.y += expandTop;
  }
});
```

**Why it's wrong:**
- The anchor (`pg`) is never updated
- Non-selected layers move, but their `po` (offset from anchor) changes
- History undo can't restore the original state

**What should happen:**
1. Calculate grid expansion (expandLeft, expandTop)
2. Update `pg` by opposite amount: `pg.start -= expandLeft + expandTop * newWidth`
3. Record `po_delta` in history for selected layers only
4. All other layers stay in place (their `po` doesn't change)

### Problem 2: Scale Handler (lines 424-469)
**Current behavior:**
```typescript
// Tries to use finalW before it's defined
const newRect = getRect(sym.start, sym.end, finalW);  // ← finalW is undefined!
```

**Why it's wrong:**
- `finalW` is used before being calculated
- Scale logic is incomplete
- Grid expansion isn't handled

**What should happen:**
1. Calculate new size for selected layers
2. Calculate grid expansion needed
3. Update `pg` if grid expanded
4. Record `d` (final coordinates) in history

## Solution: Anchor-Based Move Handler

```typescript
if (isEditing === 'move') {
  const oldW = newSpec.gridWidth;
  const oldH = newSpec.gridHeight;

  // Step 1: Get current positions
  type LayerPos = { x: number; y: number; w: number; h: number };
  const positions: LayerPos[] = newSpec.symbols.map((s) => {
    const rect = getRect(s.start, s.end, oldW);
    return { x: rect.x1, y: rect.y1, w: rect.width, h: rect.height };
  });

  // Step 2: Calculate movement for selected layers
  let groupMinX = Infinity, groupMinY = Infinity;
  selectionSet.forEach(idx => {
    const p = positions[idx];
    if (!p) return;
    if (p.x < groupMinX) groupMinX = p.x;
    if (p.y < groupMinY) groupMinY = p.y;
  });

  // Step 3: Calculate effective movement (clamped to grid bounds)
  const effectiveDx = Math.max(gridDx, -groupMinX);
  const effectiveDy = Math.max(gridDy, -groupMinY);
  
  // Step 4: Calculate grid expansion (opposite of movement)
  const expandLeft = Math.max(0, -(groupMinX + gridDx));
  const expandTop = Math.max(0, -(groupMinY + gridDy));

  // Step 5: Move ONLY selected layers
  selectionSet.forEach(idx => {
    positions[idx].x += effectiveDx;
    positions[idx].y += effectiveDy;
  });

  // Step 6: Calculate new grid size
  let finalW = oldW + expandLeft;
  let finalH = oldH + expandTop;
  positions.forEach(p => {
    finalW = Math.max(finalW, p.x + p.w);
    finalH = Math.max(finalH, p.y + p.h);
  });
  finalW = Math.min(100, finalW);
  finalH = Math.min(100, finalH);

  // Step 7: Update all layers' start/end for new grid
  newSpec.symbols = newSpec.symbols.map((s, idx) => {
    const p = positions[idx];
    return { 
      ...s, 
      start: p.y * finalW + p.x, 
      end: (p.y + p.h - 1) * finalW + (p.x + p.w - 1) 
    };
  });
  newSpec.gridWidth = finalW;
  newSpec.gridHeight = finalH;

  // Step 8: Update anchor and record history
  const oldPg = newSpec.grid.pg ?? { start: 0, end: oldW * oldH - 1 };
  
  // Anchor moves opposite to grid expansion
  const pgDelta = expandLeft + expandTop * finalW;
  const newPg = {
    start: oldPg.start + pgDelta,
    end: oldPg.end + pgDelta,
  };
  newSpec.grid.pg = newPg;

  // Step 9: Record po_delta in history for selected layers
  selectionSet.forEach(idx => {
    const sym = newSpec.symbols[idx];
    const origSym = initialSpec.symbols[idx];
    if (!sym || !origSym) return;

    // Calculate the change in po
    const origPo = origSym.po ?? { 
      start: origSym.start - (oldPg.start), 
      end: origSym.end - (oldPg.end) 
    };
    
    const newPo = {
      start: sym.start - newPg.start,
      end: sym.end - newPg.end,
    };

    const poDelta = {
      start: newPo.start - origPo.start,
      end: newPo.end - origPo.end,
    };

    // Clone history and append delta
    const origHistory = origSym?.history ? JSON.parse(JSON.stringify(origSym.history)) : [];
    sym.history = origHistory;

    const nextIndex = sym.history.length > 0 ? Math.max(...sym.history.map(s => s.index)) + 1 : 0;
    const step: HistoryStep = { 
      index: nextIndex,
      po: poDelta,  // Record the delta, not absolute value
    };

    sym.po = newPo;  // Update current po
    sym.history.push(step);
  });
}
```

## Solution: Anchor-Based Scale Handler

```typescript
else if (isEditing === 'scale') {
  const oldW = newSpec.gridWidth;
  const oldH = newSpec.gridHeight;

  type ScalePos = {
    x: number;
    y: number;
    w: number;
    h: number;
  };

  const positions: ScalePos[] = newSpec.symbols.map((s) => {
    const rect = getRect(s.start, s.end, oldW);
    return {
      x: rect.x1,
      y: rect.y1,
      w: rect.width,
      h: rect.height,
    };
  });

  // Get selection bounds
  let groupMinX = Infinity, groupMinY = Infinity;
  let groupMaxX = -Infinity, groupMaxY = -Infinity;
  selectionSet.forEach(idx => {
    const p = positions[idx];
    if (!p) return;
    groupMinX = Math.min(groupMinX, p.x);
    groupMinY = Math.min(groupMinY, p.y);
    groupMaxX = Math.max(groupMaxX, p.x + p.w - 1);
    groupMaxY = Math.max(groupMaxY, p.y + p.h - 1);
  });

  // Calculate scale factors
  const origW = groupMaxX - groupMinX + 1;
  const origH = groupMaxY - groupMinY + 1;
  const scaleX = origW > 0 ? (origW + Math.round(gridDx / initCellSize)) / origW : 1;
  const scaleY = origH > 0 ? (origH + Math.round(gridDy / initCellSize)) / origH : 1;

  // Apply scale to selected layers
  selectionSet.forEach(idx => {
    const p = positions[idx];
    if (!p) return;
    
    // Scale relative to group center
    const relX = p.x - groupMinX;
    const relY = p.y - groupMinY;
    
    p.x = groupMinX + Math.round(relX * scaleX);
    p.y = groupMinY + Math.round(relY * scaleY);
    p.w = Math.max(1, Math.round(p.w * scaleX));
    p.h = Math.max(1, Math.round(p.h * scaleY));
  });

  // Calculate new grid size
  let finalW = oldW;
  let finalH = oldH;
  positions.forEach(p => {
    finalW = Math.max(finalW, p.x + p.w);
    finalH = Math.max(finalH, p.y + p.h);
  });
  finalW = Math.min(100, finalW);
  finalH = Math.min(100, finalH);

  // Update all layers
  newSpec.symbols = newSpec.symbols.map((s, idx) => {
    const p = positions[idx];
    return { 
      ...s, 
      start: p.y * finalW + p.x, 
      end: (p.y + p.h - 1) * finalW + (p.x + p.w - 1) 
    };
  });
  newSpec.gridWidth = finalW;
  newSpec.gridHeight = finalH;

  // Update anchor
  const oldPg = newSpec.grid.pg ?? { start: 0, end: oldW * oldH - 1 };
  const newPg = oldPg;  // Anchor doesn't move for scale (only for move)
  newSpec.grid.pg = newPg;

  // Record d (final coordinates) in history for selected layers
  selectionSet.forEach(idx => {
    const sym = newSpec.symbols[idx];
    const origSym = initialSpec.symbols[idx];
    if (!sym || !origSym) return;

    const origHistory = origSym?.history ? JSON.parse(JSON.stringify(origSym.history)) : [];
    sym.history = origHistory;

    const nextIndex = sym.history.length > 0 ? Math.max(...sym.history.map(s => s.index)) + 1 : 0;
    const step: HistoryStep = { 
      index: nextIndex,
      d: { start: sym.start, end: sym.end },
    };

    sym.d = { start: sym.start, end: sym.end };
    sym.history.push(step);
    reResolveAllFromHistory(sym);
  });
}
```

## Key Changes

1. **Anchor Update:** When grid expands, `pg` moves by opposite amount
2. **History Recording:** Record `po_delta` for move, `d` for scale
3. **Non-Selected Layers:** Don't move them; let the anchor do the work
4. **Grid Calculation:** Properly calculate final grid size before updating layers

## Testing

### Test Case 1: Move Left
```
Initial: 10×10 grid, layer at (5,5)
Move left by 5 cells
Expected: Grid becomes 15×10, layer at (0,5), pg moves right by 5
```

### Test Case 2: Undo Move
```
After move, press undo
Expected: Layer returns to (5,5), grid returns to 10×10
```

### Test Case 3: Scale Up
```
Initial: 10×10 grid, layer 2×2
Scale to 4×4
Expected: Grid expands, layer becomes 4×4
```

## Migration Checklist

- [ ] Update move handler (lines 348-422)
- [ ] Update scale handler (lines 424-469)
- [ ] Remove legacy `sym.scale`, `sym.offset`, `sym.rotate` references
- [ ] Update history resolution to compute `d = pg + po`
- [ ] Test move + undo
- [ ] Test scale + undo
- [ ] Test multiple layers
- [ ] Test grid expansion
- [ ] Commit changes


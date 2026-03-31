# UniComp Audit Findings & Fixes

## Executive Summary

The UniComp project has **two conflicting implementations** of the grid/layer geometry model:

1. **Clean (unused):** `/src/lib/unicomp-core/` — implements the new anchor-based `pg/po/d` model correctly
2. **Active (broken):** `/src/lib/unicomp-parser.ts` + `/src/components/UniCompRenderer.tsx` — mixes legacy and new fields, lacks proper anchor semantics

The active code path is missing the **anchor-based undo logic** described in the specification. When grid expands during move/scale, the anchor (`pg`) should move with it, allowing simple delta-based undo without affecting other layers.

---

## Critical Issues Found

### 1. **Stale Parameters (Taboo Fields)**
- `scale`, `offset`, `bounds`, `flip`, `rotate` are still in `SymbolSpec` interface (lines 139-142 in unicomp-parser.ts)
- These should be **removed** — replaced by `pg`, `po`, `d`, and `tr` (transform vector)
- Legacy code in `UniCompRenderer.tsx` still references `sym.scale`, `sym.offset`, `sym.rotate`

### 2. **Grid Expansion Bug**
**Current behavior (wrong):**
- When moving layers left/up, the grid expands
- All non-selected layers are manually shifted right/down
- The anchor (`pg`) is never updated
- **Result:** History undo breaks because `pg` doesn't match the new grid state

**Expected behavior (correct):**
- When grid expands, `pg` should move by the same delta (with opposite sign)
- Non-selected layers' `po` should shift to maintain their absolute positions
- History undo simply applies reverse deltas to `po`

**Code location:** `UniCompRenderer.tsx` lines 348-422 (move handler)

### 3. **Missing resizeGrid Function**
- `GridResizePanel.tsx` and `SpecificationPanel.tsx` import `resizeGrid` from `unicomp-parser.ts`
- **This function does not exist** in the current codebase
- Grid resize UI is broken

### 4. **Incomplete History Resolution**
- `resolveHistory()` in `unicomp-parser.ts` (lines 407-441) returns raw history values
- Does not compute `d = pg + po` (the final coordinates)
- Undo logic doesn't restore the anchor state

### 5. **Animation Engine Mixes Old/New**
- `/src/lib/animation-engine.ts` still uses legacy fields like `rotate`, `scale`, `offset`
- Should use only `tr`, `pg`, `po`, `d`

---

## Specification Requirements (from project_instructions)

### The Anchor Model

```
d(start, end) = pg(start, end) + po(start, end)
```

Where:
- **`g`** = Grid Space: total size of the canvas, calculated from all layers' bounds
- **`pg`** = Primary Grid (anchor): invisible layer that moves with grid expansion
- **`po`** = Primary Offset: layer's offset relative to `pg`
- **`d`** = Final coordinates: the rendered position (pg + po)

### Move/Scale History

When a layer is moved or scaled:

1. **Old state:** `pg₀`, `po₀` → `d₀ = pg₀ + po₀`
2. **New state:** `pg₁`, `po₁` → `d₁ = pg₁ + po₁`
3. **History records:** `po_delta = po₁ - po₀` (relative offset change)
4. **Undo:** `po₁ -= po_delta` → returns to `po₀`

### Grid Expansion

When grid expands (e.g., moving layers left/up):

```
g(W×H) = sum_all_layers[d.start, d.end]
pg(start, end) = pg₀(start, end) + diff_expansion(opposite_sign)
```

- The anchor moves **opposite** to the expansion direction
- This keeps all layers' absolute positions stable
- Non-edited layers' `po` remains unchanged

---

## Files to Fix (Priority Order)

### Priority 1: Core Geometry Logic
1. **`/src/lib/unicomp-parser.ts`**
   - Remove stale fields from `SymbolSpec` interface (lines 139-142)
   - Implement `resizeGrid(input: string, newWidth: number, newHeight: number): string`
   - Fix `resolveHistory()` to compute `d = pg + po`
   - Fix `computeGridSize()` to return the true minimal grid

2. **`/src/components/UniCompRenderer.tsx`**
   - Fix `handleMouseMove()` move handler (lines 348-422)
     - Properly update `pg` during grid expansion
     - Record `po` deltas in history
   - Fix `handleMouseMove()` scale handler (lines 424-469)
     - Update `pg` when grid expands
     - Record `d` changes in history
   - Remove legacy `sym.scale`, `sym.offset`, `sym.rotate` references
   - Use `sym.po` and `sym.d` exclusively

### Priority 2: Animation & Export
3. **`/src/lib/animation-engine.ts`**
   - Replace legacy fields with `tr`, `pg`, `po`, `d`
   - Fix keyframe interpolation to use anchor model

4. **`/src/lib/unicomp-parser.ts` (continued)**
   - Update all export functions to use new model
   - Fix `bakeForExport()` and `unbakeForEditor()`

### Priority 3: Cleanup
5. **Remove dead code:**
   - `/src/lib/UniCompCore.ts` (legacy compatibility layer)
   - Stale fields in `SymbolSpec`
   - Legacy parameter parsing branches

---

## Implementation Plan

### Step 1: Update Types
- Clean up `SymbolSpec` interface
- Remove `scale`, `offset`, `bounds`, `flip`, `rotate`
- Ensure `pg`, `po`, `d` are always present

### Step 2: Implement resizeGrid
```typescript
export function resizeGrid(input: string, newWidth: number, newHeight: number): string {
  // Parse the UniComp rule
  // Calculate grid expansion deltas
  // Update pg with opposite sign
  // Update all layers' start/end based on new grid
  // Return stringified result
}
```

### Step 3: Fix Move Handler
```typescript
// When grid expands by (expandLeft, expandTop):
// 1. Calculate pg_delta = { start: expandLeft, end: expandLeft }
// 2. Update grid.pg -= pg_delta (opposite sign)
// 3. Record po_delta in history for selected layers
```

### Step 4: Fix Scale Handler
- Similar logic but updates `d` instead of `po`

### Step 5: Fix History Resolution
```typescript
export function resolveHistory(steps: HistoryStep[]): ResolvedState {
  // Accumulate all history steps
  // Compute final d = pg + po
  // Return complete state
}
```

---

## Testing Strategy

### Unit Tests
- `computeGridSize()` returns minimal grid
- `pg` moves correctly during expansion
- `po` deltas are recorded in history
- `d = pg + po` always holds

### Integration Tests
- Move a layer left → grid expands → undo → layer returns to original position
- Scale a layer → grid expands → undo → layer returns to original size
- Multiple layers → move one → others stay in place (via `pg` anchor)

### Regression Tests
- Export to all formats still works
- Animation playback uses correct coordinates
- Grid visualization shows correct cells

---

## Code References

### Current Broken Code
- **Move handler:** `UniCompRenderer.tsx:348-422`
- **Scale handler:** `UniCompRenderer.tsx:424-469`
- **History resolution:** `unicomp-parser.ts:407-441`
- **Grid calculation:** `unicomp-parser.ts:313-334`

### Correct Reference Implementation
- **Types:** `/src/lib/unicomp-core/types.ts`
- **Utils:** `/src/lib/unicomp-core/utils.ts`

---

## Estimated Effort

| Task | Lines | Complexity | Time |
|------|-------|-----------|------|
| Update types | 50 | Low | 30 min |
| Implement resizeGrid | 100 | Medium | 1 hour |
| Fix move handler | 200 | High | 2 hours |
| Fix scale handler | 150 | High | 1.5 hours |
| Fix history resolution | 100 | Medium | 1 hour |
| Fix animation engine | 200 | Medium | 1.5 hours |
| Testing & validation | 300 | Medium | 2 hours |
| **Total** | **1100** | **High** | **~9 hours** |


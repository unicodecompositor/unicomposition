import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { UniCompSpec, SymbolSpec, getRect, stringifySpec, resolveHistory, appendTransformToHistory, undoLastHistoryParam, DeltaColor } from '@/lib/unicomp-parser';

/** During drag: clone original history and append a temp step with the gesture's absolute value */
function appendTempHistoryStep(
  sym: SymbolSpec,
  origSym: SymbolSpec | undefined,
  paramType: 'st' | 'sp' | 'rotate' | 'scale' | 'offset' | 'd' | 'colorGroup',
  newValue: { angle: number; force: number } | number | { x: number; y: number } | DeltaColor,
) {
  const origHistory = origSym?.history ? JSON.parse(JSON.stringify(origSym.history)) : [];
  sym.history = origHistory;
  appendTransformToHistory(sym, paramType, newValue);
}
import { Move, RotateCw, Maximize2, Diamond, Hexagon, Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { renderSpecToOffscreen } from '@/lib/render-utils';
import { DEFAULT_GPU_EXPAND_FACTOR, SuperTransformer } from '@/lib/SuperTransformer';
import { computeTaper, computeShear, normalizeDegrees } from '@/lib/transform-tools';
import { ColorStrokePanel } from '@/components/ColorStrokePanel';

interface UniCompRendererProps {
  spec: UniCompSpec | null;
  showGrid?: boolean;
  showIndices?: boolean;
  highlightedCell?: number | null;
  onCellHover?: (index: number | null) => void;
  onCellClick?: (index: number) => void;
  onCellDoubleClick?: (index: number) => void;
  onUpdateCode?: (newCode: string, isFinal: boolean) => void;
  onTripleTapEmpty?: () => void;
  size?: number;
  selectionSet?: number[];
  lockedSet?: number[];
  hiddenSet?: number[];
  angleStep?: number;
}

const COLORS = [
  'hsl(185, 80%, 50%)', 'hsl(260, 70%, 60%)', 'hsl(150, 70%, 45%)',
  'hsl(40, 90%, 50%)', 'hsl(340, 75%, 55%)', 'hsl(200, 80%, 55%)',
];

const shortestAngleDeltaDeg = (currentRad: number, startRad: number): number => {
  const delta = Math.atan2(Math.sin(currentRad - startRad), Math.cos(currentRad - startRad));
  return (delta * 180) / Math.PI;
};

export const UniCompRenderer: React.FC<UniCompRendererProps> = ({
  spec,
  showGrid = true,
  showIndices = false,
  highlightedCell = null,
  onCellHover,
  onCellClick,
  onCellDoubleClick,
  onUpdateCode,
  onTripleTapEmpty,
  size = 400,
  selectionSet = [],
  lockedSet = [],
  hiddenSet = [],
  angleStep = 10,
}) => {

  // 1. Инициализация трансформера (GPU ядро)
  const transformer = useMemo(() => new SuperTransformer(), []);


  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredCell, setHoveredCell] = useState<number | null>(null);
  const lastClickTime = useRef<number>(0);
  
  // Editing state
  const [isEditing, setIsEditing] = useState<'move' | 'scale' | 'rotate' | 'skew' | 'taper' | null>(null);
  const [editStartPos, setEditStartPos] = useState<{ x: number, y: number } | null>(null);
  const [initialSpec, setInitialSpec] = useState<UniCompSpec | null>(null);
  const [isLongPressActive, setIsLongPressActive] = useState(false);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const lastUpdateRef = useRef<number>(0);
  const initialAngleRef = useRef<number | null>(null);
  const initialRadiusRef = useRef<number | null>(null);
  const rotationCenterRef = useRef<{ x: number, y: number } | null>(null);
  const initialCellSizeRef = useRef<number>(0);
  const tapTimesRef = useRef<number[]>([]);
  const taperDirectionRef = useRef<{ angle: number; force: number; cx: number; cy: number; clientX: number; clientY: number } | null>(null);
  const lastGestureAngleRef = useRef<number | null>(null);
  // No more snapshot stacks — move/scale undo uses h= history (o= and d=)
  const gridWidth = spec?.gridWidth || spec?.gridSize || 10;
  const gridHeight = spec?.gridHeight || spec?.gridSize || 10;

  const cellSize = Math.min(size / gridWidth, size / gridHeight);
  const canvasWidth = cellSize * gridWidth;
  const canvasHeight = cellSize * gridHeight;

  const selectionBounds = useMemo(() => {
    if (selectionSet.length === 0 || !spec) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    selectionSet.forEach(idx => {
      const symbol = spec.symbols[idx];
      if (!symbol) return;
      const rect = getRect(symbol.start, symbol.end, gridWidth);
      minX = Math.min(minX, rect.x1);
      minY = Math.min(minY, rect.y1);
      maxX = Math.max(maxX, rect.x2);
      maxY = Math.max(maxY, rect.y2);
    });
    if (minX === Infinity) return null;
    return {
      gridX: minX, gridY: minY, gridW: maxX - minX + 1, gridH: maxY - minY + 1,
      x: minX * cellSize, y: minY * cellSize, width: (maxX - minX + 1) * cellSize, height: (maxY - minY + 1) * cellSize
    };
  }, [selectionSet, spec, gridWidth, cellSize]);
  // Count h-blocks with a specific param for selected symbols (excluding h=0 base)
  const selectionParamCount = useCallback((paramType: 'st' | 'sp' | 'rotate' | 'scale' | 'offset' | 'd' | 'colorGroup'): number => {
    if (!spec) return 0;
    let maxCount = 0;
    selectionSet.forEach(idx => {
      const sym = spec.symbols[idx];
      if (!sym) return;
      if (sym.history && sym.history.length > 0) {
        const count = sym.history.filter((step, i) => {
          if (i === 0) return false;
          if (paramType === 'st') return !!step.st;
          if (paramType === 'sp') return !!step.sp;
          if (paramType === 'rotate') return !!step.rotate;
          if (paramType === 'scale') return !!step.scale;
          if (paramType === 'offset') return !!step.offset;
          if (paramType === 'd') return !!step.d;
          if (paramType === 'colorGroup') return !!step.colorGroup;
          return false;
        }).length;
        maxCount = Math.max(maxCount, count);
      }
    });
    return maxCount;
  }, [spec, selectionSet]);

  // Check if any selected symbol has a specific transform param (for showing undo arrows)
  const selectionHasParam = useCallback((paramType: 'st' | 'sp' | 'rotate' | 'scale' | 'offset' | 'd' | 'colorGroup'): boolean => {
    return selectionParamCount(paramType) > 0 || (() => {
      if (!spec) return false;
      return selectionSet.some(idx => {
        const sym = spec.symbols[idx];
        if (!sym) return false;
        if (!sym.history || sym.history.length === 0) {
          if (paramType === 'st') return !!sym.st;
          if (paramType === 'sp') return !!sym.sp;
          if (paramType === 'rotate') return sym.rotate !== undefined;
          if (paramType === 'scale') return !!sym.scale;
          if (paramType === 'offset') return !!sym.offset;
          if (paramType === 'd') return !!sym.bounds;
          if (paramType === 'colorGroup') return !!(sym.color || sym.background || sym.strokeColor || sym.strokeWidth);
        }
        if (sym.history && sym.history.length > 0) {
          const base = sym.history[0];
          if (paramType === 'st') return !!base.st;
          if (paramType === 'sp') return !!base.sp;
          if (paramType === 'rotate') return !!base.rotate;
          if (paramType === 'scale') return !!base.scale;
          if (paramType === 'offset') return !!base.offset;
          if (paramType === 'd') return !!base.d;
          if (paramType === 'colorGroup') return !!base.colorGroup;
        }
        return false;
      });
    })();
  }, [spec, selectionSet, selectionParamCount]);

  const handleUndoTransform = useCallback((paramType: 'st' | 'sp' | 'rotate' | 'scale' | 'offset' | 'd' | 'colorGroup', e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!spec || !onUpdateCode) return;

    const newSpec = JSON.parse(JSON.stringify(spec)) as UniCompSpec;
    let changed = false;

    if (paramType === 'offset') {
      // For move undo: get current offset, undo, compute reverse delta, apply to positions
      // Also restore grid size by removing expandLeft/expandTop
      selectionSet.forEach(idx => {
        const sym = newSpec.symbols[idx];
        if (!sym) return;
        
        // Find the last history step with offset to get expandLeft/expandTop
        let expandLeft = 0, expandTop = 0;
        if (sym.history) {
          for (let i = sym.history.length - 1; i >= 0; i--) {
            if (sym.history[i].offset) {
              expandLeft = (sym.history[i].offset as any).expandLeft || 0;
              expandTop = (sym.history[i].offset as any).expandTop || 0;
              break;
            }
          }
        }
        
        const prevOffset = sym.offset ? { ...sym.offset } : { x: 0, y: 0 };
        if (undoLastHistoryParam(sym, 'offset')) {
          changed = true;
          const newOffset = sym.offset || { x: 0, y: 0 };
          const reverseDx = newOffset.x - prevOffset.x;
          const reverseDy = newOffset.y - prevOffset.y;
          
          // Apply reverse move to start-end
          const rect = getRect(sym.start, sym.end, newSpec.gridWidth);
          const newX = rect.x1 + reverseDx;
          const newY = rect.y1 + reverseDy;
          sym.start = Math.max(0, newY) * newSpec.gridWidth + Math.max(0, newX);
          sym.end = (Math.max(0, newY) + rect.height - 1) * newSpec.gridWidth + (Math.max(0, newX) + rect.width - 1);
          
          // Shrink grid by expandLeft/expandTop and shift all layers back
          if (expandLeft > 0 || expandTop > 0) {
            const oldW = newSpec.gridWidth;
            const oldH = newSpec.gridHeight;
            const newW = Math.max(2, oldW - expandLeft);
            const newH = Math.max(2, oldH - expandTop);
            
            newSpec.symbols = newSpec.symbols.map(s => {
              const r = getRect(s.start, s.end, oldW);
              const shiftedX = Math.max(0, r.x1 - expandLeft);
              const shiftedY = Math.max(0, r.y1 - expandTop);
              return {
                ...s,
                start: shiftedY * newW + shiftedX,
                end: (shiftedY + r.height - 1) * newW + (shiftedX + r.width - 1)
              };
            });
            newSpec.gridWidth = newW;
            newSpec.gridHeight = newH;
          }
        }
      });
    } else if (paramType === 'd') {
      // For scale undo: get current bounds, undo, restore dimensions
      selectionSet.forEach(idx => {
        const sym = newSpec.symbols[idx];
        if (!sym) return;
        const rect = getRect(sym.start, sym.end, newSpec.gridWidth);
        if (undoLastHistoryParam(sym, 'd')) {
          changed = true;
          const newBounds = sym.bounds || { w: rect.width, h: rect.height };
          // Resize symbol to previous dimensions, keeping top-left corner
          const newEnd = (rect.y1 + newBounds.h - 1) * newSpec.gridWidth + (rect.x1 + newBounds.w - 1);
          sym.end = newEnd;
        }
      });
    } else {
      // History-based undo for st/sp/rotate/scale
      selectionSet.forEach(idx => {
        const sym = newSpec.symbols[idx];
        if (!sym) return;
        if (undoLastHistoryParam(sym, paramType)) changed = true;
      });
    }

    if (changed) onUpdateCode(stringifySpec(newSpec), true);
  }, [spec, onUpdateCode, selectionSet]);

  const handleEditStart = (type: 'move' | 'scale' | 'rotate' | 'skew' | 'taper', e: React.MouseEvent | React.TouchEvent) => {
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    // All handles activate immediately — no long-press delay
    const activate = () => {
      setIsLongPressActive(true);
      setIsEditing(type);
      setEditStartPos({ x: clientX, y: clientY });
      setInitialSpec(JSON.parse(JSON.stringify(spec)));
      initialCellSizeRef.current = cellSize;
      
      // Scale: Pre-record original bounds in h=0 if no history exists
      if (type === 'scale' && spec && onUpdateCode) {
        const newSpec = JSON.parse(JSON.stringify(spec)) as UniCompSpec;
        let hasChanges = false;
        selectionSet.forEach(idx => {
          const sym = newSpec.symbols[idx];
          if (!sym) return;
          // Only add h=0 if no history exists yet
          if (!sym.history || sym.history.length === 0) {
            const rect = getRect(sym.start, sym.end, newSpec.gridWidth);
            appendTransformToHistory(sym, 'd', { x: rect.width, y: rect.height });
            hasChanges = true;
          }
        });
        if (hasChanges) {
          onUpdateCode(stringifySpec(newSpec), false);
          setInitialSpec(newSpec); // Update initial spec to include the h=0 blocks
        }
      }
      if ((type === 'rotate' || type === 'skew' || type === 'taper') && selectionBounds && canvasRef.current) {
        const canvasRect = canvasRef.current.getBoundingClientRect();
        const cx = canvasRect.left + selectionBounds.x + selectionBounds.width / 2;
        const cy = canvasRect.top + selectionBounds.y + selectionBounds.height / 2;
        rotationCenterRef.current = { x: cx, y: cy };
        initialAngleRef.current = Math.atan2(clientY - cy, clientX - cx);
        initialRadiusRef.current = null; // force starts from 0 at press point

        lastGestureAngleRef.current = (Math.atan2(clientY - cy, clientX - cx) * 180) / Math.PI;
      } else {
        lastGestureAngleRef.current = null;
      }
      document.body.classList.add('dragging-active');
    };

    activate();
  };

  const handleMouseMove = useCallback((e: MouseEvent | TouchEvent) => {
    if ('touches' in e && e.cancelable) e.preventDefault();

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    if (!isEditing || !editStartPos || !initialSpec || !onUpdateCode) return;

    const dx = clientX - editStartPos.x;
    const dy = clientY - editStartPos.y;
    
    const initCellSize = initialCellSizeRef.current;
    const gridDx = Math.round(dx / initCellSize);
    const gridDy = Math.round(dy / initCellSize);

    const now = Date.now();
    if (now - lastUpdateRef.current < 50) return;
    lastUpdateRef.current = now;

    let newSpec = JSON.parse(JSON.stringify(initialSpec)) as UniCompSpec;

    if (isEditing === 'move') {
      const oldW = newSpec.gridWidth;
      const oldH = newSpec.gridHeight;

      type LayerPos = { x: number; y: number; w: number; h: number };
      const positions: LayerPos[] = newSpec.symbols.map((s) => {
        const rect = getRect(s.start, s.end, oldW);
        return { x: rect.x1, y: rect.y1, w: rect.width, h: rect.height };
      });

      let groupMinX = Infinity, groupMinY = Infinity;
      selectionSet.forEach(idx => {
        const p = positions[idx];
        if (!p) return;
        if (p.x < groupMinX) groupMinX = p.x;
        if (p.y < groupMinY) groupMinY = p.y;
      });

      const effectiveDx = Math.max(gridDx, -groupMinX);
      const effectiveDy = Math.max(gridDy, -groupMinY);
      const expandLeft = Math.max(0, -(groupMinX + gridDx));
      const expandTop = Math.max(0, -(groupMinY + gridDy));

      positions.forEach((p, idx) => {
        if (selectionSet.includes(idx)) {
          p.x += effectiveDx;
          p.y += effectiveDy;
        } else {
          p.x += expandLeft;
          p.y += expandTop;
        }
      });

      let finalW = oldW + expandLeft;
      let finalH = oldH + expandTop;
      positions.forEach(p => {
        finalW = Math.max(finalW, p.x + p.w);
        finalH = Math.max(finalH, p.y + p.h);
      });
      finalW = Math.min(100, finalW);
      finalH = Math.min(100, finalH);

      newSpec.symbols = newSpec.symbols.map((s, idx) => {
        const p = positions[idx];
        return { ...s, start: p.y * finalW + p.x, end: (p.y + p.h - 1) * finalW + (p.x + p.w - 1) };
      });
      newSpec.gridWidth = finalW;
      newSpec.gridHeight = finalH;

      // Record o= (offset) in history for undo — track cumulative grid delta AND grid expansion
      selectionSet.forEach(idx => {
        const sym = newSpec.symbols[idx];
        const origSym = initialSpec.symbols[idx];
        if (!sym || !origSym) return;
        // Compute total offset from original position
        const origRect = getRect(origSym.start, origSym.end, initialSpec.gridWidth);
        const newRect = getRect(sym.start, sym.end, finalW);
        const totalDx = newRect.x1 - origRect.x1;
        const totalDy = newRect.y1 - origRect.y1;
        
        // Store grid expansion info in offset history (for undo)
        const totalExpandLeft = finalW - initialSpec.gridWidth - (totalDx >= 0 ? totalDx : 0);
        const totalExpandTop = finalH - initialSpec.gridHeight - (totalDy >= 0 ? totalDy : 0);
        
        if (!sym.history) sym.history = [];
        const origHistory = origSym?.history ? JSON.parse(JSON.stringify(origSym.history)) : [];
        sym.history = origHistory;
        
        const nextIndex = sym.history.length > 0 ? Math.max(...sym.history.map(s => s.index)) + 1 : 0;
        const step: any = { index: nextIndex };
        
        if (nextIndex === 0) {
          step.offset = { op: '=', x: totalDx, y: totalDy, expandLeft: Math.max(0, totalExpandLeft), expandTop: Math.max(0, totalExpandTop) };
          sym.offset = { x: totalDx, y: totalDy };
        } else {
          const resolved = resolveHistory(sym.history);
          const prevOffset = resolved.offset || { x: 0, y: 0 };
          step.offset = { 
            op: '+=', 
            x: totalDx - prevOffset.x, 
            y: totalDy - prevOffset.y,
            expandLeft: Math.max(0, totalExpandLeft),
            expandTop: Math.max(0, totalExpandTop)
          };
          sym.offset = { x: totalDx, y: totalDy };
        }
        sym.history.push(step);
      });


    } else if (isEditing === 'scale') {
      const oldW = newSpec.gridWidth;
      const oldH = newSpec.gridHeight;

      type ScalePos = { x: number; y: number; w: number; h: number; flip?: 'h' | 'v' | 'hv' };
      const positions: ScalePos[] = newSpec.symbols.map((s) => {
        const rect = getRect(s.start, s.end, oldW);
        return { x: rect.x1, y: rect.y1, w: rect.width, h: rect.height, flip: s.flip };
      });

      let groupMinX = Infinity, groupMinY = Infinity;
      let groupMaxX = -Infinity, groupMaxY = -Infinity;
      selectionSet.forEach(idx => {
        const p = positions[idx];
        if (!p) return;
        groupMinX = Math.min(groupMinX, p.x);
        groupMinY = Math.min(groupMinY, p.y);
        groupMaxX = Math.max(groupMaxX, p.x + p.w);
        groupMaxY = Math.max(groupMaxY, p.y + p.h);
      });
      const groupW = groupMaxX - groupMinX;
      const groupH = groupMaxY - groupMinY;

      const processAxis = (axis: 'x' | 'y', wKey: 'w' | 'h', groupMin: number, groupSize: number, delta: number) => {
        let rawNewSize = groupSize + delta;
        let expandGrid = 0;
        let finalSize = rawNewSize;
        let finalPivot = groupMin;

        if (rawNewSize < 0) {
          const flippedEdge = groupMin + rawNewSize;
          if (flippedEdge < 0) {
            expandGrid = Math.abs(flippedEdge);
            finalSize = -groupMin;
          }
        }

        const scaleFactor = groupSize > 0 ? finalSize / groupSize : 1;

        selectionSet.forEach(idx => {
          const p = positions[idx];
          if (!p) return;
          const origPos = p[axis];
          const origSize = p[wKey];
          p[wKey] = origSize * scaleFactor;
          if (expandGrid > 0) {
            p[wKey] += (origSize > 0 ? expandGrid : -expandGrid);
          }
          p[axis] = finalPivot + (origPos - groupMin) * scaleFactor;
        });

        if (expandGrid > 0) {
          positions.forEach((p, idx) => {
            if (!selectionSet.includes(idx)) p[axis] += expandGrid;
          });
        }
        return expandGrid;
      };

      const expandRight = processAxis('x', 'w', groupMinX, groupW, gridDx);
      const expandDown = processAxis('y', 'h', groupMinY, groupH, gridDy);

      positions.forEach((p, idx) => {
        if (!selectionSet.includes(idx)) return;
        let flipH = p.flip === 'h' || p.flip === 'hv';
        let flipV = p.flip === 'v' || p.flip === 'hv';
        if (p.w < 0) { flipH = !flipH; p.x += p.w; p.w = Math.abs(p.w); }
        if (p.h < 0) { flipV = !flipV; p.y += p.h; p.h = Math.abs(p.h); }
        p.w = Math.max(1, Math.round(p.w));
        p.h = Math.max(1, Math.round(p.h));
        p.x = Math.max(0, Math.round(p.x));
        p.y = Math.max(0, Math.round(p.y));
        p.flip = flipH && flipV ? 'hv' : flipH ? 'h' : flipV ? 'v' : undefined;
      });

      let finalW = oldW + expandRight;
      let finalH = oldH + expandDown;
      positions.forEach(p => {
        finalW = Math.max(finalW, p.x + p.w);
        finalH = Math.max(finalH, p.y + p.h);
      });
      finalW = Math.min(100, finalW);
      finalH = Math.min(100, finalH);

      newSpec.symbols = newSpec.symbols.map((s, idx) => {
        const p = positions[idx];
        return { ...s, flip: p.flip, start: p.y * finalW + p.x, end: (p.y + p.h - 1) * finalW + (p.x + p.w - 1) };
      });
      newSpec.gridWidth = finalW;
      newSpec.gridHeight = finalH;

      // Record d= (bounds) in history for undo — track new dimensions
      selectionSet.forEach(idx => {
        const sym = newSpec.symbols[idx];
        const origSym = initialSpec.symbols[idx];
        if (!sym || !origSym) return;
        const newRect = getRect(sym.start, sym.end, finalW);
        appendTempHistoryStep(sym, origSym, 'd', { x: newRect.width, y: newRect.height });
      });

    } else if (isEditing === 'rotate') {
      if (rotationCenterRef.current && initialAngleRef.current !== null) {
        const { x: cx, y: cy } = rotationCenterRef.current;
        const currentAngle = Math.atan2(clientY - cy, clientX - cx);
        const deltaAngleDeg = shortestAngleDeltaDeg(currentAngle, initialAngleRef.current);
        const snappedDelta = Math.round(deltaAngleDeg / angleStep) * angleStep;

        selectionSet.forEach(idx => {
          const sym = newSpec.symbols[idx];
          if (!sym) return;
          const origSym = initialSpec.symbols[idx];
          const baseRotate = origSym?.rotate || 0;
          const newRotate = normalizeDegrees(baseRotate + snappedDelta);
          sym.rotate = newRotate;
          // Preserve history with temp step
          appendTempHistoryStep(sym, origSym, 'rotate', newRotate);
        });
      }
    } else if (isEditing === 'skew') {
      if (rotationCenterRef.current) {
        const moveFromStart = Math.hypot(clientX - editStartPos.x, clientY - editStartPos.y);
        if (moveFromStart < 2) return;

        const { x: cx, y: cy } = rotationCenterRef.current;
        const selRadius = selectionBounds ? Math.max(selectionBounds.width, selectionBounds.height) / 2 : 50;

        const result = computeShear({
          clientX, clientY, centerX: cx, centerY: cy,
          selRadius, previousScreenAngle: lastGestureAngleRef.current,
        });

        selectionSet.forEach(idx => {
          const sym = newSpec.symbols[idx];
          if (!sym) return;
          const origSym = initialSpec.symbols[idx];
          sym.st = undefined;
          if (result.force <= 0) { sym.sp = undefined; sym.history = origSym?.history ? JSON.parse(JSON.stringify(origSym.history)) : undefined; return; }
          sym.sp = { angle: result.angle, force: result.force };
          appendTempHistoryStep(sym, origSym, 'sp', { angle: result.angle, force: result.force });
        });

        lastGestureAngleRef.current = result.screenAngle;
      }
    } else if (isEditing === 'taper') {
      if (rotationCenterRef.current) {
        const moveFromStart = Math.hypot(clientX - editStartPos.x, clientY - editStartPos.y);
        if (moveFromStart < 2) return;

        const { x: cx, y: cy } = rotationCenterRef.current;
        const selRadius = selectionBounds ? Math.max(selectionBounds.width, selectionBounds.height) / 2 : 50;

        const result = computeTaper({
          clientX, clientY, centerX: cx, centerY: cy,
          selRadius, previousScreenAngle: lastGestureAngleRef.current,
        });

        selectionSet.forEach(idx => {
          const sym = newSpec.symbols[idx];
          if (!sym) return;
          const origSym = initialSpec.symbols[idx];
          sym.sp = undefined;
          if (result.force <= 0) { sym.st = undefined; sym.history = origSym?.history ? JSON.parse(JSON.stringify(origSym.history)) : undefined; return; }
          sym.st = { angle: result.angle, force: result.force };
          appendTempHistoryStep(sym, origSym, 'st', { angle: result.angle, force: result.force });
        });

        taperDirectionRef.current = result.force > 0
          ? { angle: Math.round(result.screenAngle), force: result.force, cx, cy, clientX, clientY }
          : null;

        lastGestureAngleRef.current = result.screenAngle;
      }
    }

    onUpdateCode(stringifySpec(newSpec), false);
  }, [isEditing, editStartPos, initialSpec, selectionSet, selectionBounds, cellSize, onUpdateCode, isLongPressActive, angleStep]);

   const handleMouseUp = useCallback(() => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    if (isEditing && spec && onUpdateCode) {
      // History-based undo: move/scale already have h= blocks from appendTempHistoryStep
      onUpdateCode(stringifySpec(spec), true);
    }
    setIsEditing(null);
    setEditStartPos(null);
    setInitialSpec(null);
    setIsLongPressActive(false);
    initialAngleRef.current = null;
    initialRadiusRef.current = null;
    rotationCenterRef.current = null;
    taperDirectionRef.current = null;
    lastGestureAngleRef.current = null;
    document.body.classList.remove('dragging-active');
  }, [isEditing, spec, onUpdateCode, initialSpec]);

  useEffect(() => {
    if (isEditing || longPressTimer.current) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleMouseMove, { passive: false });
      window.addEventListener('touchend', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleMouseMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [isEditing, handleMouseMove, handleMouseUp]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasWidth * dpr;
    canvas.height = canvasHeight * dpr;
    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${canvasHeight}px`;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = 'hsl(220, 18%, 10%)';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    if (showGrid) {
      ctx.strokeStyle = 'hsl(220, 15%, 25%)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= gridWidth; i++) {
        const pos = i * cellSize;
        ctx.beginPath(); ctx.moveTo(pos, 0); ctx.lineTo(pos, canvasHeight); ctx.stroke();
      }
      for (let i = 0; i <= gridHeight; i++) {
        const pos = i * cellSize;
        ctx.beginPath(); ctx.moveTo(0, pos); ctx.lineTo(canvasWidth, pos); ctx.stroke();
      }
    }

    if (showIndices) {
      ctx.font = `${Math.max(8, cellSize * 0.25)}px JetBrains Mono`;
      ctx.fillStyle = 'hsl(210, 15%, 40%)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let y = 0; y < gridHeight; y++) {
        for (let x = 0; x < gridWidth; x++) {
          const index = y * gridWidth + x;
          ctx.fillText(index.toString(), x * cellSize + cellSize / 2, y * cellSize + cellSize / 2);
        }
      }
    }

    if (spec?.symbols) {
      // --- Per-symbol GPU pipeline: render each symbol individually ---
      // For symbols with st/sp, use SuperTransformer (GPU) instead of CPU grid
      // This fixes: barrel distortion, lost colors, jagged edges, st+sp mutual exclusion

      spec.symbols.forEach((symbol, idx) => {
        if (hiddenSet.includes(idx)) return;

        const rect = getRect(symbol.start, symbol.end, gridWidth);
        const x1 = rect.x1 * cellSize;
        const y1 = rect.y1 * cellSize;
        const sw = (rect.x2 - rect.x1 + 1) * cellSize;
        const sh = (rect.y2 - rect.y1 + 1) * cellSize;

        // Draw background fill (b=) behind the glyph area
        if (symbol.background) {
          ctx.fillStyle = symbol.background;
          ctx.fillRect(x1, y1, sw, sh);
        }

        const hasSt = symbol.st && Math.abs(symbol.st.force) > 0;
        const hasSp = symbol.sp && Math.abs(symbol.sp.force) > 0;

        // Create isolated single-symbol spec (without st/sp — those go through GPU)
        const symW = rect.x2 - rect.x1 + 1;
        const symH = rect.y2 - rect.y1 + 1;
        const cleanSymbol = { ...symbol, st: undefined, sp: undefined, start: 0, end: (symH - 1) * symW + (symW - 1) };
        const symSpec: UniCompSpec = {
          ...spec,
          gridWidth: symW,
          gridHeight: symH,
          symbols: [cleanSymbol],
        };

        // Use layer color as the default glyph color in edit mode
        const layerColor = COLORS[idx % COLORS.length];
        const offscreen = renderSpecToOffscreen(symSpec, cellSize, layerColor);

        const hasStroke = symbol.strokeWidth && symbol.strokeWidth > 0;
        const strokePx = hasStroke ? Math.max(1, Math.round(symbol.strokeWidth! * cellSize)) : 0;
        const strokeRgb = hasStroke ? SuperTransformer.hslToRgb01(symbol.strokeColor || 'hsl(0, 0%, 100%)') : [1,1,1] as [number,number,number];
        const strokeOp = symbol.strokeOpacity ?? 1;

        // Helper: apply stroke post-process via GPU mode 3
        const applyStroke = (input: HTMLCanvasElement, drawX: number, drawY: number, drawW: number, drawH: number) => {
          if (!hasStroke) { ctx.drawImage(input, drawX, drawY, drawW, drawH); return; }
          const padPx = strokePx + 2;
          const padCanvas = document.createElement('canvas');
          padCanvas.width = input.width + padPx * 2;
          padCanvas.height = input.height + padPx * 2;
          const padCtx = padCanvas.getContext('2d');
          if (!padCtx) { ctx.drawImage(input, drawX, drawY, drawW, drawH); return; }
          padCtx.drawImage(input, padPx, padPx);
          const result = transformer.render(padCanvas, {
            mode: 3, strokeWidth: strokePx, strokeColor: strokeRgb, strokeOpacity: strokeOp,
          });
          const padFrac = padPx / input.width * drawW;
          const padFracY = padPx / input.height * drawH;
          ctx.drawImage(result, drawX - padFrac, drawY - padFracY, drawW + padFrac * 2, drawH + padFracY * 2);
        };

        if (hasSt || hasSp) {
          // Convert OffscreenCanvas → HTMLCanvasElement for WebGL texImage2D
          const srcCanvas = document.createElement('canvas');
          srcCanvas.width = offscreen.width;
          srcCanvas.height = offscreen.height;
          const srcCtx = srcCanvas.getContext('2d');
          if (!srcCtx) return;
          srcCtx.drawImage(offscreen, 0, 0);

          let gpuInput: HTMLCanvasElement = srcCanvas;
          const gpuExpand = DEFAULT_GPU_EXPAND_FACTOR;
          const ox = sw * (gpuExpand - 1) / 2;
          const oy = sh * (gpuExpand - 1) / 2;

          // Apply trapezoid (st) via GPU — mode 0 (no stroke — applied separately after)
          if (hasSt) {
            const stResult = transformer.render(gpuInput, {
              mode: 0, angle: symbol.st!.angle, force: symbol.st!.force, offset: 0, scale: 1.0,
              expandViewport: true, expandFactor: gpuExpand,
            });

            if (hasSp) {
              const copy = document.createElement('canvas');
              copy.width = stResult.width; copy.height = stResult.height;
              const copyCtx = copy.getContext('2d');
              if (copyCtx) copyCtx.drawImage(stResult, 0, 0);
              gpuInput = copy;
            } else {
              // Apply stroke as separate pass on deformed result
              if (hasStroke) {
                const deformedCopy = document.createElement('canvas');
                deformedCopy.width = stResult.width; deformedCopy.height = stResult.height;
                const dcCtx = deformedCopy.getContext('2d');
                if (dcCtx) dcCtx.drawImage(stResult, 0, 0);
                applyStroke(deformedCopy, x1 - ox, y1 - oy, sw * gpuExpand, sh * gpuExpand);
              } else {
                ctx.drawImage(stResult, x1 - ox, y1 - oy, sw * gpuExpand, sh * gpuExpand);
              }
              return;
            }
          }

          if (hasSp) {
            const spResult = transformer.render(gpuInput, {
              mode: 1, angle: symbol.sp!.angle, force: symbol.sp!.force, offset: 0, scale: 1.0,
              expandViewport: !hasSt, expandFactor: gpuExpand,
            });
            // Apply stroke as separate pass on deformed result
            if (hasStroke) {
              const deformedCopy = document.createElement('canvas');
              deformedCopy.width = spResult.width; deformedCopy.height = spResult.height;
              const dcCtx = deformedCopy.getContext('2d');
              if (dcCtx) dcCtx.drawImage(spResult, 0, 0);
              applyStroke(deformedCopy, x1 - ox, y1 - oy, sw * gpuExpand, sh * gpuExpand);
            } else {
              ctx.drawImage(spResult, x1 - ox, y1 - oy, sw * gpuExpand, sh * gpuExpand);
            }
          }
        } else if (hasStroke) {
          // No deformation but has stroke — run through GPU for stroke
          const srcCanvas = document.createElement('canvas');
          srcCanvas.width = offscreen.width; srcCanvas.height = offscreen.height;
          const srcCtx = srcCanvas.getContext('2d');
          if (!srcCtx) return;
          srcCtx.drawImage(offscreen, 0, 0);
          applyStroke(srcCanvas, x1, y1, sw, sh);
        } else {
          // No deformation, no stroke — draw directly
          ctx.drawImage(offscreen, x1, y1, sw, sh);
        }
      });


      // Draw selection/lock overlays on top
      spec.symbols.forEach((symbol, idx) => {
        if (hiddenSet.includes(idx)) return;
        const isSelected = selectionSet.includes(idx);
        const isLocked = lockedSet.includes(idx);
        const rect = getRect(symbol.start, symbol.end, gridWidth);
        let color = COLORS[idx % COLORS.length];
        if (isLocked) color = 'hsl(0, 0%, 50%)';
        const ox = rect.x1 * cellSize;
        const oy = rect.y1 * cellSize;
        const ow = (rect.x2 - rect.x1 + 1) * cellSize;
        const oh = (rect.y2 - rect.y1 + 1) * cellSize;

        ctx.fillStyle = isSelected ? 'rgba(255, 255, 255, 0.2)' : color.replace(')', ', 0.1)').replace('hsl', 'hsla');
        ctx.fillRect(ox, oy, ow, oh);
        ctx.strokeStyle = isSelected ? 'white' : color;
        ctx.lineWidth = isSelected ? 2 : 1;
        if (!isSelected) ctx.setLineDash([4, 4]);
        ctx.strokeRect(ox + 1, oy + 1, ow - 2, oh - 2);
        ctx.setLineDash([]);
      });
    }
  }, [spec, showGrid, showIndices, highlightedCell, hoveredCell, size, gridWidth, gridHeight, cellSize, canvasWidth, canvasHeight, selectionSet, lockedSet, hiddenSet, transformer]);

  return (
    <div className="relative" style={{ width: canvasWidth, height: canvasHeight }}>
      <canvas
        ref={canvasRef}
        className="rounded-lg cursor-crosshair"
        onMouseMove={(e) => {
          const rect = canvasRef.current?.getBoundingClientRect();
          if (!rect) return;
          const x = Math.floor((e.clientX - rect.left) / cellSize);
          const y = Math.floor((e.clientY - rect.top) / cellSize);
          const index = y * gridWidth + x;
          setHoveredCell(index);
          onCellHover?.(index);
        }}
        onMouseLeave={() => { setHoveredCell(null); onCellHover?.(null); }}
        onClick={(e) => {
          const now = Date.now();
          const canvasRect = canvasRef.current?.getBoundingClientRect();
          if (!canvasRect) return;
          const x = Math.floor((e.clientX - canvasRect.left) / cellSize);
          const y = Math.floor((e.clientY - canvasRect.top) / cellSize);
          const cellIndex = y * gridWidth + x;
          
          tapTimesRef.current.push(now);
          if (tapTimesRef.current.length > 3) tapTimesRef.current.shift();
          if (tapTimesRef.current.length >= 3 && tapTimesRef.current[tapTimesRef.current.length - 1] - tapTimesRef.current[tapTimesRef.current.length - 3] < 600) {
            const hasSymbol = spec?.symbols.some(s => {
              const r = getRect(s.start, s.end, gridWidth);
              return x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2;
            });
            if (!hasSymbol) {
              onTripleTapEmpty?.();
              tapTimesRef.current = [];
              return;
            }
          }
          
          if (now - lastClickTime.current < 300) onCellDoubleClick?.(cellIndex);
          else onCellClick?.(cellIndex);
          lastClickTime.current = now;
        }}
      />
      
      {selectionBounds && (
        <>
          {/* Color undo + palette grouped */}
          <div
            className="absolute z-30 flex items-center gap-1 pointer-events-auto"
            style={{
              left: selectionBounds.x + selectionBounds.width / 2,
              top: selectionBounds.y - 42,
              transform: 'translateX(-50%)',
            }}
          >
            {/* Color undo button - to the left of palette */}
            {selectionHasParam('colorGroup') && (
              <button
                type="button"
                className="selection-handle selection-undo-btn relative"
                onClick={(e) => handleUndoTransform('colorGroup', e)}
                title="Undo color changes"
              >
                <Undo2 className="w-3 h-3" />
                {selectionParamCount('colorGroup') > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 text-[8px] font-bold bg-primary text-primary-foreground rounded-full w-3.5 h-3.5 flex items-center justify-center">
                    {selectionParamCount('colorGroup')}
                  </span>
                )}
              </button>
            )}
            {/* Color & Stroke Panel */}
            <ColorStrokePanel
              color={spec?.symbols[selectionSet[0]]?.color}
              opacity={spec?.symbols[selectionSet[0]]?.opacity}
              background={spec?.symbols[selectionSet[0]]?.background}
              strokeWidth={spec?.symbols[selectionSet[0]]?.strokeWidth}
              strokeColor={spec?.symbols[selectionSet[0]]?.strokeColor}
              strokeOpacity={spec?.symbols[selectionSet[0]]?.strokeOpacity}
              onColorChange={(color, opacity, isFinal) => {
                if (!spec || !onUpdateCode) return;
                const newSpec = JSON.parse(JSON.stringify(spec));
                selectionSet.forEach(idx => {
                  if (newSpec.symbols[idx]) {
                    newSpec.symbols[idx].color = color;
                    newSpec.symbols[idx].opacity = opacity;
                    if (isFinal) {
                      appendTransformToHistory(newSpec.symbols[idx], 'colorGroup', {
                        op: '=',
                        color,
                        opacity,
                        background: newSpec.symbols[idx].background,
                        strokeColor: newSpec.symbols[idx].strokeColor,
                        strokeWidth: newSpec.symbols[idx].strokeWidth,
                        strokeOpacity: newSpec.symbols[idx].strokeOpacity,
                      } as DeltaColor);
                    }
                  }
                });
                onUpdateCode(stringifySpec(newSpec), isFinal);
              }}
              onBackgroundChange={(bg, isFinal) => {
                if (!spec || !onUpdateCode) return;
                const newSpec = JSON.parse(JSON.stringify(spec));
                selectionSet.forEach(idx => {
                  if (newSpec.symbols[idx]) {
                    newSpec.symbols[idx].background = bg;
                    if (isFinal) {
                      appendTransformToHistory(newSpec.symbols[idx], 'colorGroup', {
                        op: '=',
                        color: newSpec.symbols[idx].color,
                        opacity: newSpec.symbols[idx].opacity,
                        background: bg,
                        strokeColor: newSpec.symbols[idx].strokeColor,
                        strokeWidth: newSpec.symbols[idx].strokeWidth,
                        strokeOpacity: newSpec.symbols[idx].strokeOpacity,
                      } as DeltaColor);
                    }
                  }
                });
                onUpdateCode(stringifySpec(newSpec), isFinal);
              }}
              onStrokeChange={(width, color, opacity, isFinal) => {
                if (!spec || !onUpdateCode) return;
                const newSpec = JSON.parse(JSON.stringify(spec));
                selectionSet.forEach(idx => {
                  if (newSpec.symbols[idx]) {
                    newSpec.symbols[idx].strokeWidth = width;
                    newSpec.symbols[idx].strokeColor = color;
                    newSpec.symbols[idx].strokeOpacity = opacity;
                    if (isFinal) {
                      appendTransformToHistory(newSpec.symbols[idx], 'colorGroup', {
                        op: '=',
                        color: newSpec.symbols[idx].color,
                        opacity: newSpec.symbols[idx].opacity,
                        background: newSpec.symbols[idx].background,
                        strokeColor: color,
                        strokeWidth: width,
                        strokeOpacity: opacity,
                      } as DeltaColor);
                    }
                  }
                });
                onUpdateCode(stringifySpec(newSpec), isFinal);
              }}
              style={{}}
            />
          </div>
          <div 
            className={cn("selection-outline", isLongPressActive && "selection-active")}
            style={{
              left: selectionBounds.x - 1.5,
              top: selectionBounds.y - 1.5,
              width: selectionBounds.width + 3,
              height: selectionBounds.height + 3,
            }}
          >
          {/* Rotate handle */}
          <div 
            className="selection-handle selection-handle-tr"
            onMouseDown={(e) => handleEditStart('rotate', e)} 
            onTouchStart={(e) => handleEditStart('rotate', e)}
          >
            <RotateCw className="w-4 h-4" />
          </div>
          {/* Rotate undo */}
          {selectionHasParam('rotate') && (
            <button
              type="button"
              className="selection-handle selection-undo-btn"
              style={{ position: 'absolute', top: -14, right: -40, zIndex: 12 }}
              onClick={(e) => handleUndoTransform('rotate', e)}
              title="Undo rotate"
            >
              <Undo2 className="w-3 h-3" />
              {selectionParamCount('rotate') > 0 && (
                <span className="absolute -top-1.5 -right-1.5 text-[8px] font-bold bg-primary text-primary-foreground rounded-full w-3.5 h-3.5 flex items-center justify-center">
                  {selectionParamCount('rotate')}
                </span>
              )}
            </button>
          )}

          {/* Scale handle */}
          <div 
            className="selection-handle selection-handle-br"
            onMouseDown={(e) => handleEditStart('scale', e)} 
            onTouchStart={(e) => handleEditStart('scale', e)}
          >
            <Maximize2 className="w-4 h-4" />
          </div>
          {/* Scale undo (uses d= in history) */}
          {selectionHasParam('d') && (
            <button
              type="button"
              className="selection-handle selection-undo-btn"
              style={{ position: 'absolute', bottom: -14, right: -40, zIndex: 12 }}
              onClick={(e) => handleUndoTransform('d', e)}
              title="Undo scale"
            >
              <Undo2 className="w-3 h-3" />
              {selectionParamCount('d') > 0 && (
                <span className="absolute -top-1.5 -right-1.5 text-[8px] font-bold bg-primary text-primary-foreground rounded-full w-3.5 h-3.5 flex items-center justify-center">
                  {selectionParamCount('d')}
                </span>
              )}
            </button>
          )}

          {/* Skew (sp) handle */}
          <div 
            className="selection-handle selection-handle-tl" 
            title="Parallelogram (sp)"
            onMouseDown={(e) => handleEditStart('skew', e)} 
            onTouchStart={(e) => handleEditStart('skew', e)}
          >
            <Diamond className="w-4 h-4" />
          </div>
          {/* Skew undo */}
          {selectionHasParam('sp') && (
            <button
              type="button"
              className="selection-handle selection-undo-btn"
              style={{ position: 'absolute', top: -14, left: -40, zIndex: 12 }}
              onClick={(e) => handleUndoTransform('sp', e)}
              title="Undo parallelogram"
            >
              <Undo2 className="w-3 h-3" />
              {selectionParamCount('sp') > 0 && (
                <span className="absolute -top-1.5 -right-1.5 text-[8px] font-bold bg-primary text-primary-foreground rounded-full w-3.5 h-3.5 flex items-center justify-center">
                  {selectionParamCount('sp')}
                </span>
              )}
            </button>
          )}

          {/* Taper (st) handle */}
          <div 
            className="selection-handle selection-handle-bl" 
            title="Trapezoid (st)"
            onMouseDown={(e) => handleEditStart('taper', e)} 
            onTouchStart={(e) => handleEditStart('taper', e)}
          >
            <Hexagon className="w-4 h-4" />
          </div>
          {/* Taper undo */}
          {selectionHasParam('st') && (
            <button
              type="button"
              className="selection-handle selection-undo-btn"
              style={{ position: 'absolute', bottom: -14, left: -40, zIndex: 12 }}
              onClick={(e) => handleUndoTransform('st', e)}
              title="Undo trapezoid"
            >
              <Undo2 className="w-3 h-3" />
              {selectionParamCount('st') > 0 && (
                <span className="absolute -top-1.5 -right-1.5 text-[8px] font-bold bg-primary text-primary-foreground rounded-full w-3.5 h-3.5 flex items-center justify-center">
                  {selectionParamCount('st')}
                </span>
              )}
            </button>
          )}

          {/* Move handle */}
          <div 
            className="selection-handle selection-handle-center" 
            onMouseDown={(e) => handleEditStart('move', e)}
            onTouchStart={(e) => handleEditStart('move', e)}
          >
            <Move className="w-5 h-5" />
          </div>
          {/* Move (offset) undo */}
          {selectionHasParam('offset') && (
            <button
              type="button"
              className="selection-handle selection-undo-btn"
              style={{ position: 'absolute', top: '50%', right: -40, transform: 'translateY(-50%)', zIndex: 12 }}
              onClick={(e) => handleUndoTransform('offset', e)}
              title="Undo move (offset)"
            >
              <Undo2 className="w-3 h-3" />
              {selectionParamCount('offset') > 0 && (
                <span className="absolute -top-1.5 -right-1.5 text-[8px] font-bold bg-primary text-primary-foreground rounded-full w-3.5 h-3.5 flex items-center justify-center">
                  {selectionParamCount('offset')}
                </span>
              )}
            </button>
          )}
        </div>
        </>
      )}

      {/* Taper direction visual indicator */}
      {isEditing === 'taper' && taperDirectionRef.current && selectionBounds && canvasRef.current && (() => {
        const canvasRect = canvasRef.current!.getBoundingClientRect();
        const centerX = selectionBounds.x + selectionBounds.width / 2;
        const centerY = selectionBounds.y + selectionBounds.height / 2;
        const td = taperDirectionRef.current!;
        const rad = td.angle * Math.PI / 180;
        const lineLen = Math.min(td.force * 0.8, Math.max(selectionBounds.width, selectionBounds.height));
        const endX = centerX + Math.cos(rad) * lineLen;
        const endY = centerY + Math.sin(rad) * lineLen;
        // Perpendicular direction for trapezoid shape indicator
        const perpRad = rad + Math.PI / 2;
        const halfW = selectionBounds.width / 2;
        const halfH = selectionBounds.height / 2;
        const expansion = Math.min(1, td.force / 100);
        // Wide side (toward finger)
        const wideHalf = Math.max(halfW, halfH) * (1 + expansion * 0.5);
        // Narrow side (opposite)
        const narrowHalf = Math.max(halfW, halfH) * (1 - expansion * 0.3);
        return (
          <svg className="absolute inset-0 pointer-events-none z-20" width={canvasWidth} height={canvasHeight}>
            {/* Direction line from center to finger */}
            <line
              x1={centerX} y1={centerY} x2={endX} y2={endY}
              stroke="hsl(280, 70%, 55%)" strokeWidth="2" strokeDasharray="4 3" opacity="0.8"
            />
            {/* Center dot */}
            <circle cx={centerX} cy={centerY} r="4" fill="hsl(280, 70%, 55%)" opacity="0.9" />
            {/* Arrow tip */}
            <circle cx={endX} cy={endY} r="3" fill="hsl(50, 90%, 50%)" opacity="0.9" />
            {/* Force label */}
            <text x={endX + 10} y={endY - 10} fill="white" fontSize="11" fontFamily="monospace" opacity="0.8">
              st: {td.angle}° f={td.force}
            </text>
          </svg>
        );
      })()}

      {hoveredCell !== null && !isEditing && (
        <div className="absolute bottom-2 right-2 bg-card/90 backdrop-blur px-2 py-1 rounded text-xs font-mono text-primary pointer-events-none">
          [{hoveredCell}] → ({hoveredCell % gridWidth}, {Math.floor(hoveredCell / gridWidth)})
        </div>
      )}
    </div>
  );
};

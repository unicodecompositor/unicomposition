import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { UniCompSpec, SymbolSpec, getRect, stringifySpec, resolveHistory, appendTransformToHistory, undoLastHistoryParam, indexToXY, xyToIndex, normalizeSpec, transformGroupMove, transformGroupScale } from '@/lib/unicomp-parser';
import { Move, RotateCw, Maximize2, Diamond, Hexagon, Circle, Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { renderSpecToOffscreen, drawVertexDeformed } from '@/lib/render-utils';
import { computeShear, computeTaper, computeWarp, normalizeDegrees } from '@/lib/transform-tools';
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

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredCell, setHoveredCell] = useState<number | null>(null);
  const lastClickTime = useRef<number>(0);
  
  // Editing state
  const [isEditing, setIsEditing] = useState<'move' | 'scale' | 'rotate' | 'skew' | 'taper' | 'warp' | null>(null);
  const [editStartPos, setEditStartPos] = useState<{ x: number, y: number } | null>(null);
  const [initialSpec, setInitialSpec] = useState<UniCompSpec | null>(null);
  const [isLongPressActive, setIsLongPressActive] = useState(false);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const lastUpdateRef = useRef<number>(0);
  const initialAngleRef = useRef<number | null>(null);
  const rotationCenterRef = useRef<{ x: number, y: number } | null>(null);
  const initialCellSizeRef = useRef<number>(0);
  const tapTimesRef = useRef<number[]>([]);
  const taperDirectionRef = useRef<{ angle: number; force: number; cx: number; cy: number; clientX: number; clientY: number } | null>(null);
  const lastGestureAngleRef = useRef<number | null>(null);
  const initialBoundsRef = useRef<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  const gridWidth = spec?.gridWidth || 10;
  const gridHeight = spec?.gridHeight || 10;

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

  // Подсчёт количества записей в истории геометрии (po) для выбранных слоёв
  const geometryHistoryCount = useCallback((): number => {
    if (!spec) return 0;
    let maxCount = 0;
    selectionSet.forEach(idx => {
      const sym = spec.symbols[idx];
      if (!sym) return;
      if (sym.history && sym.history.length > 0) {
        const count = sym.history.filter(step => !!step.offset).length;
        maxCount = Math.max(maxCount, count);
      }
    });
    return maxCount;
  }, [spec, selectionSet]);

  const hasGeometryHistory = useCallback((): boolean => {
    return geometryHistoryCount() > 0 || (() => {
      if (!spec) return false;
      return selectionSet.some(idx => {
        const sym = spec.symbols[idx];
        return sym && (sym.po !== undefined);
      });
    })();
  }, [spec, selectionSet, geometryHistoryCount]);

  // Общий Undo для геометрии (move + scale)
  const handleUndoGeometry = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!spec || !onUpdateCode) return;
    const newSpec = JSON.parse(JSON.stringify(spec)) as UniCompSpec;
    let changed = false;

    selectionSet.forEach(idx => {
      const sym = newSpec.symbols[idx];
      if (sym && undoLastHistoryParam(sym, 'offset')) {
        changed = true;
      }
    });

    if (changed) {
      const normalized = normalizeSpec(newSpec);
      onUpdateCode(stringifySpec(normalized), true);
    }
  }, [spec, onUpdateCode, selectionSet]);

  // Отдельные Undo для трансформаций (rotate, sp, st, w, color)
  const selectionHasParam = useCallback((paramType: 'st' | 'sp' | 'w' | 'rotate' | 'colorGroup'): boolean => {
    if (!spec) return false;
    return selectionSet.some(idx => {
      const sym = spec.symbols[idx];
      if (!sym) return false;
      if (!sym.history || sym.history.length === 0) {
        if (paramType === 'st') return !!sym.st;
        if (paramType === 'sp') return !!sym.sp;
        if (paramType === 'w') return !!sym.w;
        if (paramType === 'rotate') return sym.rotate !== undefined;
        if (paramType === 'colorGroup') return !!(sym.color || sym.background || sym.strokeColor);
      }
      if (sym.history && sym.history.length > 0) {
        const base = sym.history[0];
        if (paramType === 'st') return !!base.st;
        if (paramType === 'sp') return !!base.sp;
        if (paramType === 'w') return !!base.w;
        if (paramType === 'rotate') return !!base.rotate;
        if (paramType === 'colorGroup') return !!base.colorGroup;
      }
      return false;
    });
  }, [spec, selectionSet]);

  const handleUndoTransform = useCallback((paramType: 'st' | 'sp' | 'w' | 'rotate' | 'colorGroup', e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!spec || !onUpdateCode) return;
    const newSpec = JSON.parse(JSON.stringify(spec)) as UniCompSpec;
    let changed = false;

    selectionSet.forEach(idx => {
      const sym = newSpec.symbols[idx];
      if (sym && undoLastHistoryParam(sym, paramType)) changed = true;
    });

    if (changed) onUpdateCode(stringifySpec(newSpec), true);
  }, [spec, onUpdateCode, selectionSet]);

  const handleEditStart = (type: 'move' | 'scale' | 'rotate' | 'skew' | 'taper' | 'warp', e: React.MouseEvent | React.TouchEvent) => {
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const activate = () => {
      setIsLongPressActive(true);
      setIsEditing(type);
      setEditStartPos({ x: clientX, y: clientY });
      setInitialSpec(JSON.parse(JSON.stringify(spec)));
      initialCellSizeRef.current = cellSize;

      if (type === 'scale' && selectionBounds) {
        initialBoundsRef.current = {
          x1: selectionBounds.gridX,
          y1: selectionBounds.gridY,
          x2: selectionBounds.gridX + selectionBounds.gridW - 1,
          y2: selectionBounds.gridY + selectionBounds.gridH - 1,
        };
      }
      if ((type === 'rotate' || type === 'skew' || type === 'taper' || type === 'warp') && selectionBounds && canvasRef.current) {
        const canvasRect = canvasRef.current.getBoundingClientRect();
        const cx = canvasRect.left + selectionBounds.x + selectionBounds.width / 2;
        const cy = canvasRect.top + selectionBounds.y + selectionBounds.height / 2;
        rotationCenterRef.current = { x: cx, y: cy };
        initialAngleRef.current = Math.atan2(clientY - cy, clientX - cx);
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
      if (gridDx === 0 && gridDy === 0) return;
      newSpec = transformGroupMove(newSpec, selectionSet, gridDx, gridDy);
    } else if (isEditing === 'scale') {
      if (!initialBoundsRef.current) return;
      const { x1, y1, x2, y2 } = initialBoundsRef.current;

      // Конечная точка следует за пальцем независимо по X и Y.
      // Начальная точка (x1, y1) остаётся якорем.
      // Допустимо отрицательное значение относительно якоря (flip).
      const newX2 = x2 + gridDx;
      const newY2 = y2 + gridDy;

      newSpec = transformGroupScale(newSpec, selectionSet, x1, y1, newX2, newY2);
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
          appendTransformToHistory(sym, 'rotate', newRotate);
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
          if (result.force <= 0) {
            sym.sp = undefined;
            sym.history = origSym?.history ? JSON.parse(JSON.stringify(origSym.history)) : undefined;
            if (sym.history) {
              const resolved = resolveHistory(sym.history);
              if (resolved.sp) sym.sp = resolved.sp;
            }
            return;
          }
          sym.sp = { angle: result.angle, force: result.force };
          appendTransformToHistory(sym, 'sp', { angle: result.angle, force: result.force });
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
          if (result.force <= 0) {
            sym.st = undefined;
            sym.history = origSym?.history ? JSON.parse(JSON.stringify(origSym.history)) : undefined;
            if (sym.history) {
              const resolved = resolveHistory(sym.history);
              if (resolved.st) sym.st = resolved.st;
            }
            return;
          }
          sym.st = { angle: result.angle, force: result.force };
          appendTransformToHistory(sym, 'st', { angle: result.angle, force: result.force });
        });

        taperDirectionRef.current = result.force > 0
          ? { angle: Math.round(result.screenAngle), force: result.force, cx: rotationCenterRef.current.x, cy: rotationCenterRef.current.y, clientX, clientY }
          : null;

        lastGestureAngleRef.current = result.screenAngle;
      }
    } else if (isEditing === 'warp') {
      if (rotationCenterRef.current) {
        const moveFromStart = Math.hypot(clientX - editStartPos.x, clientY - editStartPos.y);
        if (moveFromStart < 2) return;

        const { x: cx, y: cy } = rotationCenterRef.current;
        const selRadius = selectionBounds ? Math.max(selectionBounds.width, selectionBounds.height) / 2 : 50;

        const result = computeWarp({
          clientX, clientY, centerX: cx, centerY: cy,
          selRadius, previousScreenAngle: lastGestureAngleRef.current,
        });

        selectionSet.forEach(idx => {
          const sym = newSpec.symbols[idx];
          if (!sym) return;
          const origSym = initialSpec.symbols[idx];
          if (result.force === 0) {
            sym.w = undefined;
            sym.history = origSym?.history ? JSON.parse(JSON.stringify(origSym.history)) : undefined;
            if (sym.history) {
              const resolved = resolveHistory(sym.history);
              if (resolved.w) sym.w = resolved.w;
            }
            return;
          }
          sym.w = { angle: result.angle, force: result.force };
          appendTransformToHistory(sym, 'w', { angle: result.angle, force: result.force });
        });

        lastGestureAngleRef.current = result.screenAngle;
      }
    }

    onUpdateCode(stringifySpec(newSpec), false);
  }, [isEditing, editStartPos, initialSpec, selectionSet, selectionBounds, cellSize, onUpdateCode, isLongPressActive, angleStep]);

  const handleMouseUp = useCallback(() => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    if (isEditing && spec && onUpdateCode) {
      onUpdateCode(stringifySpec(spec), true);
    }
    setIsEditing(null);
    setEditStartPos(null);
    setInitialSpec(null);
    setIsLongPressActive(false);
    initialAngleRef.current = null;
    rotationCenterRef.current = null;
    taperDirectionRef.current = null;
    lastGestureAngleRef.current = null;
    initialBoundsRef.current = null;
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

  // Отрисовка (без изменений, только использует spec)
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

    // Grid-level background
    if (spec?.background) {
      ctx.save();
      ctx.globalAlpha = spec.backgroundOpacity ?? 1;
      ctx.fillStyle = spec.background;
      if (spec.borderRadius) {
        const brStr = spec.borderRadius;
        const shortSide = Math.min(canvasWidth, canvasHeight);
        let radiusPx = brStr.endsWith('%') ? shortSide * parseFloat(brStr) / 100 : parseFloat(brStr) * cellSize;
        radiusPx = Math.min(Math.max(0, radiusPx), shortSide / 2);
        ctx.beginPath();
        ctx.roundRect(0, 0, canvasWidth, canvasHeight, radiusPx);
        ctx.fill();
      } else {
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
      }
      ctx.restore();
    } else {
      ctx.fillStyle = 'hsl(220, 18%, 10%)';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }

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
      spec.symbols.forEach((symbol, idx) => {
        if (hiddenSet.includes(idx)) return;

        const rect = getRect(symbol.start, symbol.end, gridWidth);
        const x1 = rect.x1 * cellSize;
        const y1 = rect.y1 * cellSize;
        const sw = (rect.x2 - rect.x1 + 1) * cellSize;
        const sh = (rect.y2 - rect.y1 + 1) * cellSize;

        // Layer background
        if (symbol.background) {
          ctx.save();
          ctx.globalAlpha = symbol.backgroundOpacity ?? 1;
          ctx.fillStyle = symbol.background;
          if (symbol.borderRadius) {
            const brStr = symbol.borderRadius;
            const shortSide = Math.min(sw, sh);
            let radiusPx = brStr.endsWith('%') ? shortSide * parseFloat(brStr) / 100 : parseFloat(brStr);
            radiusPx = Math.min(Math.max(0, radiusPx), shortSide / 2);
            ctx.beginPath();
            ctx.roundRect(x1, y1, sw, sh, radiusPx);
            ctx.fill();
          } else {
            ctx.fillRect(x1, y1, sw, sh);
          }
          ctx.restore();
        }

        const hasSt = symbol.st && Math.abs(symbol.st.force) > 0;
        const hasSp = symbol.sp && Math.abs(symbol.sp.force) > 0;
        const hasW = symbol.w && Math.abs(symbol.w.force) > 0;

        const symW = rect.x2 - rect.x1 + 1;
        const symH = rect.y2 - rect.y1 + 1;
        const cleanSymbol = {
          ...symbol,
          st: undefined,
          sp: undefined,
          w: undefined,
          start: 0,
          end: (symH - 1) * symW + (symW - 1),
          background: undefined,
          backgroundOpacity: undefined,
          borderRadius: undefined,
          layerBorderWidth: undefined,
          layerBorderColor: undefined,
          layerBorderOpacity: undefined,
          strokeWidth: undefined,
          strokeColor: undefined,
          strokeOpacity: undefined,
        };
        const symSpec: UniCompSpec = {
          ...spec,
          gridWidth: symW,
          gridHeight: symH,
          symbols: [cleanSymbol],
          background: undefined,
          backgroundOpacity: undefined,
          borderRadius: undefined,
          strokeWidth: undefined,
          strokeColor: undefined,
          strokeOpacity: undefined,
          opacity: undefined,
        };

        const layerColor = COLORS[idx % COLORS.length];
        const offscreen = renderSpecToOffscreen(symSpec, cellSize, layerColor);

        const hasStroke = symbol.strokeWidth && symbol.strokeWidth > 0;
        const strokePx = hasStroke ? Math.max(1, Math.round(symbol.strokeWidth! * cellSize)) : 0;
        const strokeColor = symbol.strokeColor || 'hsl(0, 0%, 100%)';
        const strokeOp = symbol.strokeOpacity ?? 1;

        const applyStrokeCPU = (input: HTMLCanvasElement, drawX: number, drawY: number, drawW: number, drawH: number) => {
          if (!hasStroke) { ctx.drawImage(input, drawX, drawY, drawW, drawH); return; }
          const padPx = strokePx + 2;
          const padCanvas = document.createElement('canvas');
          padCanvas.width = input.width + padPx * 2;
          padCanvas.height = input.height + padPx * 2;
          const padCtx = padCanvas.getContext('2d')!;
          padCtx.drawImage(input, padPx, padPx);

          const resultCanvas = document.createElement('canvas');
          resultCanvas.width = padCanvas.width;
          resultCanvas.height = padCanvas.height;
          const rCtx = resultCanvas.getContext('2d')!;

          rCtx.globalAlpha = strokeOp;
          rCtx.globalCompositeOperation = 'source-over';
          const steps = 12;
          for (let i = 0; i < steps; i++) {
            const angle = (i / steps) * Math.PI * 2;
            rCtx.drawImage(padCanvas, Math.cos(angle) * strokePx, Math.sin(angle) * strokePx);
          }
          rCtx.globalCompositeOperation = 'source-in';
          rCtx.fillStyle = strokeColor;
          rCtx.fillRect(0, 0, resultCanvas.width, resultCanvas.height);
          rCtx.globalCompositeOperation = 'source-over';
          rCtx.globalAlpha = 1;
          rCtx.drawImage(padCanvas, 0, 0);

          const padFrac = padPx / input.width * drawW;
          const padFracY = padPx / input.height * drawH;
          ctx.drawImage(resultCanvas, drawX - padFrac, drawY - padFracY, drawW + padFrac * 2, drawH + padFracY * 2);
        };

        if (hasSt || hasSp || hasW) {
          const srcCanvas = document.createElement('canvas');
          srcCanvas.width = offscreen.width;
          srcCanvas.height = offscreen.height;
          const srcCtx = srcCanvas.getContext('2d');
          if (!srcCtx) return;
          srcCtx.drawImage(offscreen, 0, 0);

          const expand = 1.5;
          const expandedW = Math.ceil(sw * expand);
          const expandedH = Math.ceil(sh * expand);
          const deformCanvas = document.createElement('canvas');
          deformCanvas.width = expandedW;
          deformCanvas.height = expandedH;
          const dCtx = deformCanvas.getContext('2d');
          if (!dCtx) return;

          const offX = (expandedW - sw) / 2;
          const offY = (expandedH - sh) / 2;
          dCtx.drawImage(srcCanvas, 0, 0, srcCanvas.width, srcCanvas.height, offX, offY, sw, sh);

          const deformResult = document.createElement('canvas');
          deformResult.width = expandedW;
          deformResult.height = expandedH;
          const drCtx = deformResult.getContext('2d');
          if (!drCtx) return;

          if (hasSt) {
            drawVertexDeformed(drCtx, deformCanvas, 0, 0, expandedW, expandedH, symbol.st!, 'st');
            if (hasSp) {
              const intermediate = document.createElement('canvas');
              intermediate.width = expandedW;
              intermediate.height = expandedH;
              const iCtx = intermediate.getContext('2d');
              if (iCtx) {
                iCtx.drawImage(deformResult, 0, 0);
                drCtx.clearRect(0, 0, expandedW, expandedH);
                drawVertexDeformed(drCtx, intermediate, 0, 0, expandedW, expandedH, symbol.sp!, 'sp');
              }
            }
          } else if (hasSp) {
            drawVertexDeformed(drCtx, deformCanvas, 0, 0, expandedW, expandedH, symbol.sp!, 'sp');
          } else if (hasW) {
            drawVertexDeformed(drCtx, deformCanvas, 0, 0, expandedW, expandedH, symbol.w!, 'w');
          }

          if (hasW && (hasSt || hasSp)) {
            const intermediate2 = document.createElement('canvas');
            intermediate2.width = expandedW;
            intermediate2.height = expandedH;
            const i2Ctx = intermediate2.getContext('2d');
            if (i2Ctx) {
              i2Ctx.drawImage(deformResult, 0, 0);
              drCtx.clearRect(0, 0, expandedW, expandedH);
              drawVertexDeformed(drCtx, intermediate2, 0, 0, expandedW, expandedH, symbol.w!, 'w');
            }
          }

          if (hasStroke) {
            applyStrokeCPU(deformResult, x1 - (expandedW - sw) / 2, y1 - (expandedH - sh) / 2, expandedW, expandedH);
          } else {
            ctx.drawImage(deformResult, x1 - (expandedW - sw) / 2, y1 - (expandedH - sh) / 2, expandedW, expandedH);
          }
        } else if (hasStroke) {
          const srcCanvas = document.createElement('canvas');
          srcCanvas.width = offscreen.width; srcCanvas.height = offscreen.height;
          const srcCtx = srcCanvas.getContext('2d');
          if (!srcCtx) return;
          srcCtx.drawImage(offscreen, 0, 0);
          applyStrokeCPU(srcCanvas, x1, y1, sw, sh);
        } else {
          ctx.drawImage(offscreen, x1, y1, sw, sh);
        }
      });

      // Layer borders
      spec.symbols.forEach((symbol, idx) => {
        if (hiddenSet.includes(idx)) return;
        if (!symbol.layerBorderWidth || symbol.layerBorderWidth <= 0) return;
        const rect = getRect(symbol.start, symbol.end, gridWidth);
        const x1 = rect.x1 * cellSize;
        const y1 = rect.y1 * cellSize;
        const sw = (rect.x2 - rect.x1 + 1) * cellSize;
        const sh = (rect.y2 - rect.y1 + 1) * cellSize;

        ctx.save();
        const lbPx = Math.max(1, symbol.layerBorderWidth * cellSize);
        ctx.globalAlpha = symbol.layerBorderOpacity ?? 1;
        ctx.strokeStyle = symbol.layerBorderColor || 'hsl(0, 0%, 100%)';
        ctx.lineWidth = lbPx;
        const halfLb = lbPx / 2;

        if (symbol.borderRadius) {
          const brStr = symbol.borderRadius;
          const shortSide = Math.min(sw, sh);
          let radiusPx = brStr.endsWith('%') ? shortSide * parseFloat(brStr) / 100 : parseFloat(brStr);
          radiusPx = Math.min(Math.max(0, radiusPx), shortSide / 2);
          ctx.beginPath();
          ctx.roundRect(x1 + halfLb, y1 + halfLb, sw - lbPx, sh - lbPx, Math.max(0, radiusPx - halfLb));
          ctx.stroke();
        } else {
          ctx.strokeRect(x1 + halfLb, y1 + halfLb, sw - lbPx, sh - lbPx);
        }
        ctx.restore();
      });

      if (spec.strokeWidth && spec.strokeWidth > 0) {
        ctx.save();
        const borderPx = Math.max(1, spec.strokeWidth * cellSize);
        ctx.globalAlpha = spec.strokeOpacity ?? 1;
        ctx.strokeStyle = spec.strokeColor || 'hsl(0, 0%, 100%)';
        ctx.lineWidth = borderPx;
        const halfBorder = borderPx / 2;
        if (spec.borderRadius) {
          const brStr = spec.borderRadius;
          const shortSide = Math.min(canvasWidth, canvasHeight);
          let radiusPx = brStr.endsWith('%') ? shortSide * parseFloat(brStr) / 100 : parseFloat(brStr) * cellSize;
          radiusPx = Math.min(Math.max(0, radiusPx), shortSide / 2);
          ctx.beginPath();
          ctx.roundRect(halfBorder, halfBorder, canvasWidth - borderPx, canvasHeight - borderPx, Math.max(0, radiusPx - halfBorder));
          ctx.stroke();
        } else {
          ctx.strokeRect(halfBorder, halfBorder, canvasWidth - borderPx, canvasHeight - borderPx);
        }
        ctx.restore();
      }

      // Selection overlays
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
  }, [spec, showGrid, showIndices, highlightedCell, hoveredCell, size, gridWidth, gridHeight, cellSize, canvasWidth, canvasHeight, selectionSet, lockedSet, hiddenSet]);

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
          {/* Color undo + palette */}
          <div
            className="absolute z-30 flex items-center gap-3 pointer-events-auto"
            style={{
              left: selectionBounds.x - 60,
              top: selectionBounds.y - 42,
            }}
          >
            {selectionHasParam('colorGroup') && (
              <button
                type="button"
                className="selection-handle selection-undo-btn relative mr-2"
                onClick={(e) => handleUndoTransform('colorGroup', e)}
                title="Undo color changes"
              >
                <Undo2 className="w-3 h-3" />
              </button>
            )}
            <ColorStrokePanel
              color={spec?.symbols[selectionSet[0]]?.color}
              opacity={spec?.symbols[selectionSet[0]]?.opacity}
              strokeWidth={spec?.symbols[selectionSet[0]]?.strokeWidth}
              strokeColor={spec?.symbols[selectionSet[0]]?.strokeColor}
              strokeOpacity={spec?.symbols[selectionSet[0]]?.strokeOpacity}
              background={spec?.symbols[selectionSet[0]]?.background}
              backgroundOpacity={spec?.symbols[selectionSet[0]]?.backgroundOpacity ?? 1}
              borderRadius={spec?.symbols[selectionSet[0]]?.borderRadius ?? ''}
              layerBorderWidth={spec?.symbols[selectionSet[0]]?.layerBorderWidth}
              layerBorderColor={spec?.symbols[selectionSet[0]]?.layerBorderColor}
              layerBorderOpacity={spec?.symbols[selectionSet[0]]?.layerBorderOpacity}
              onSymbolChange={(data, isFinal) => {
                if (!spec || !onUpdateCode) return;
                const newSpec = JSON.parse(JSON.stringify(spec));
                selectionSet.forEach(idx => {
                  const sym = newSpec.symbols[idx];
                  if (!sym) return;
                  sym.color = data.color;
                  sym.opacity = data.opacity;
                  sym.strokeWidth = data.strokeWidth;
                  sym.strokeColor = data.strokeColor;
                  sym.strokeOpacity = data.strokeOpacity;
                  if (isFinal) {
                    appendTransformToHistory(sym, 'colorGroup', {
                      op: '=',
                      color: data.color,
                      opacity: data.opacity,
                      symbolBorderWidth: data.strokeWidth,
                      symbolBorderColor: data.strokeColor,
                      symbolBorderOpacity: data.strokeOpacity,
                      background: sym.background,
                      backgroundOpacity: sym.backgroundOpacity,
                      borderRadius: sym.borderRadius,
                      layerBorderWidth: sym.layerBorderWidth,
                      layerBorderColor: sym.layerBorderColor,
                      layerBorderOpacity: sym.layerBorderOpacity,
                    });
                  }
                });
                onUpdateCode(stringifySpec(newSpec), isFinal);
              }}
              onLayerChange={(data, isFinal) => {
                if (!spec || !onUpdateCode) return;
                const newSpec = JSON.parse(JSON.stringify(spec));
                selectionSet.forEach(idx => {
                  const sym = newSpec.symbols[idx];
                  if (!sym) return;
                  sym.background = data.background;
                  sym.backgroundOpacity = data.backgroundOpacity;
                  sym.borderRadius = data.borderRadius || undefined;
                  sym.layerBorderWidth = data.layerBorderWidth;
                  sym.layerBorderColor = data.layerBorderColor;
                  sym.layerBorderOpacity = data.layerBorderOpacity;
                  if (isFinal) {
                    appendTransformToHistory(sym, 'colorGroup', {
                      op: '=',
                      color: sym.color,
                      opacity: sym.opacity,
                      symbolBorderWidth: sym.strokeWidth,
                      symbolBorderColor: sym.strokeColor,
                      symbolBorderOpacity: sym.strokeOpacity,
                      background: data.background,
                      backgroundOpacity: data.backgroundOpacity,
                      borderRadius: data.borderRadius || undefined,
                      layerBorderWidth: data.layerBorderWidth,
                      layerBorderColor: data.layerBorderColor,
                      layerBorderOpacity: data.layerBorderOpacity,
                    });
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
            {selectionHasParam('rotate') && (
              <button
                type="button"
                className="selection-handle selection-undo-btn"
                style={{ position: 'absolute', top: -14, right: -40, zIndex: 12 }}
                onClick={(e) => handleUndoTransform('rotate', e)}
                title="Undo rotate"
              >
                <Undo2 className="w-3 h-3" />
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

            {/* Skew handle */}
            <div 
              className="selection-handle selection-handle-tl" 
              title="Parallelogram (sp)"
              onMouseDown={(e) => handleEditStart('skew', e)} 
              onTouchStart={(e) => handleEditStart('skew', e)}
            >
              <Diamond className="w-4 h-4" />
            </div>
            {selectionHasParam('sp') && (
              <button
                type="button"
                className="selection-handle selection-undo-btn"
                style={{ position: 'absolute', top: -14, left: -40, zIndex: 12 }}
                onClick={(e) => handleUndoTransform('sp', e)}
                title="Undo parallelogram"
              >
                <Undo2 className="w-3 h-3" />
              </button>
            )}

            {/* Taper handle */}
            <div 
              className="selection-handle selection-handle-bl" 
              title="Trapezoid (st)"
              onMouseDown={(e) => handleEditStart('taper', e)} 
              onTouchStart={(e) => handleEditStart('taper', e)}
            >
              <Hexagon className="w-4 h-4" />
            </div>
            {selectionHasParam('st') && (
              <button
                type="button"
                className="selection-handle selection-undo-btn"
                style={{ position: 'absolute', bottom: -14, left: -40, zIndex: 12 }}
                onClick={(e) => handleUndoTransform('st', e)}
                title="Undo trapezoid"
              >
                <Undo2 className="w-3 h-3" />
              </button>
            )}

            {/* Warp handle */}
            <div 
              className="selection-handle" 
              title="Warp (w) — pinch/bulge"
              style={{ position: 'absolute', bottom: -32, left: '50%', transform: 'translateX(-50%)', zIndex: 11 }}
              onMouseDown={(e) => handleEditStart('warp', e)} 
              onTouchStart={(e) => handleEditStart('warp', e)}
            >
              <Circle className="w-4 h-4" />
            </div>
            {selectionHasParam('w') && (
              <button
                type="button"
                className="selection-handle selection-undo-btn"
                style={{ position: 'absolute', bottom: -32, left: 'calc(50% + 24px)', zIndex: 12 }}
                onClick={(e) => handleUndoTransform('w', e)}
                title="Undo warp"
              >
                <Undo2 className="w-3 h-3" />
              </button>
            )}

            {/* Move handle (center) */}
            <div 
              className="selection-handle selection-handle-center" 
              onMouseDown={(e) => handleEditStart('move', e)}
              onTouchStart={(e) => handleEditStart('move', e)}
            >
              <Move className="w-5 h-5" />
            </div>

            {/* Общая кнопка Undo для геометрии (move+scale) */}
            {hasGeometryHistory() && (
              <button
                type="button"
                className="selection-handle selection-undo-btn"
                style={{ position: 'absolute', top: '50%', right: -40, transform: 'translateY(-50%)', zIndex: 12 }}
                onClick={handleUndoGeometry}
                title="Undo position/size change"
              >
                <Undo2 className="w-3 h-3" />
                {geometryHistoryCount() > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 text-[8px] font-bold bg-primary text-primary-foreground rounded-full w-3.5 h-3.5 flex items-center justify-center">
                    {geometryHistoryCount()}
                  </span>
                )}
              </button>
            )}
          </div>
        </>
      )}

      {isEditing === 'taper' && taperDirectionRef.current && selectionBounds && canvasRef.current && (() => {
        const canvasRect = canvasRef.current!.getBoundingClientRect();
        const centerX = selectionBounds.x + selectionBounds.width / 2;
        const centerY = selectionBounds.y + selectionBounds.height / 2;
        const td = taperDirectionRef.current!;
        const rad = td.angle * Math.PI / 180;
        const lineLen = Math.min(td.force * 0.8, Math.max(selectionBounds.width, selectionBounds.height));
        const endX = centerX + Math.cos(rad) * lineLen;
        const endY = centerY + Math.sin(rad) * lineLen;
        return (
          <svg className="absolute inset-0 pointer-events-none z-20" width={canvasWidth} height={canvasHeight}>
            <line
              x1={centerX} y1={centerY} x2={endX} y2={endY}
              stroke="hsl(280, 70%, 55%)" strokeWidth="2" strokeDasharray="4 3" opacity="0.8"
            />
            <circle cx={centerX} cy={centerY} r="4" fill="hsl(280, 70%, 55%)" opacity="0.9" />
            <circle cx={endX} cy={endY} r="3" fill="hsl(50, 90%, 50%)" opacity="0.9" />
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
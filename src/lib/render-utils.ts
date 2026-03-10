import { UniCompSpec, SymbolSpec, getRect, getRegistry } from '@/lib/unicomp-parser';
import { DEFAULT_GPU_EXPAND_FACTOR, SuperTransformer } from '@/lib/SuperTransformer';

let _sharedGpu: SuperTransformer | null = null;
function getSharedGpu(): SuperTransformer {
  if (!_sharedGpu) _sharedGpu = new SuperTransformer();
  return _sharedGpu;
}

const COLOR_MAP: Record<string, string> = {
  red: 'hsl(0, 80%, 55%)', green: 'hsl(120, 70%, 45%)', blue: 'hsl(210, 80%, 55%)',
  yellow: 'hsl(50, 90%, 50%)', orange: 'hsl(30, 90%, 55%)', purple: 'hsl(280, 70%, 55%)',
  pink: 'hsl(340, 80%, 60%)', cyan: 'hsl(185, 80%, 50%)', white: 'hsl(0, 0%, 100%)',
  black: 'hsl(0, 0%, 10%)', gray: 'hsl(0, 0%, 50%)', grey: 'hsl(0, 0%, 50%)',
};

type RenderCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type CanvasSource = HTMLCanvasElement | OffscreenCanvas | HTMLImageElement;

interface Vertex {
  x: number;
  y: number;
}

interface Deformation {
  angle: number;
  force: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function createRasterCanvas(width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
  const safeW = Math.max(2, Math.ceil(width));
  const safeH = Math.max(2, Math.ceil(height));

  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(safeW, safeH);
  }

  const canvas = document.createElement('canvas');
  canvas.width = safeW;
  canvas.height = safeH;
  return canvas;
}

function getDirection(angle: number) {
  const rad = (angle * Math.PI) / 180;
  const dirX = Math.cos(rad);
  const dirY = Math.sin(rad);
  const perpX = -dirY;
  const perpY = dirX;
  return { dirX, dirY, perpX, perpY };
}

function getRadialProjectionRadius(
  width: number,
  height: number,
): number {
  return Math.max(1, Math.hypot(width / 2, height / 2));
}

function applyVertexDeformation(
  corners: Vertex[],
  centerX: number,
  centerY: number,
  deformation: Deformation,
  mode: 'st' | 'sp',
  maxProj: number,
): Vertex[] {
  const { dirX, dirY, perpX, perpY } = getDirection(deformation.angle);
  const k = deformation.force * 0.01;

  return corners.map((v) => {
    const rx = v.x - centerX;
    const ry = v.y - centerY;

    const dAlong = rx * dirX + ry * dirY;
    const dSide = rx * perpX + ry * perpY;

    if (mode === 'st') {
      // True taper with radial normalization (angle-independent).
      const alongNorm = dAlong / Math.max(maxProj, 0.001);
      const widthScale = clamp(1 + alongNorm * k, 0.15, 8);
      return {
        x: centerX + dirX * dAlong + perpX * (dSide * widthScale),
        y: centerY + dirY * dAlong + perpY * (dSide * widthScale),
      };
    }

    // Pure shear: shift along swipe axis proportionally to perpendicular distance.
    const outAlong = dAlong + dSide * k;
    return {
      x: centerX + dirX * outAlong + perpX * dSide,
      y: centerY + dirY * outAlong + perpY * dSide,
    };
  });
}

function drawVertexDeformed(
  ctx: RenderCtx,
  source: CanvasSource,
  x: number,
  y: number,
  w: number,
  h: number,
  deformation: Deformation,
  mode: 'st' | 'sp',
) {
  const sourceW = source.width;
  const sourceH = source.height;
  if (!sourceW || !sourceH || w <= 0 || h <= 0) return;

  if (Math.abs(deformation.force) < 0.1) {
    ctx.drawImage(source, x, y, w, h);
    return;
  }

  const cx = x + w / 2;
  const cy = y + h / 2;

  const maxProj = getRadialProjectionRadius(w, h);

  // Adaptive grid: enough quality without causing heavy repaint cost.
  const stepsX = clamp(Math.round(w / 6), 12, 64);
  const stepsY = clamp(Math.round(h / 6), 12, 64);

  ctx.save();
  for (let row = 0; row < stepsY; row++) {
    for (let col = 0; col < stepsX; col++) {
      const t0y = row / stepsY;
      const t1y = (row + 1) / stepsY;
      const t0x = col / stepsX;
      const t1x = (col + 1) / stepsX;

      const cellCorners: Vertex[] = [
        { x: x + t0x * w, y: y + t0y * h },
        { x: x + t1x * w, y: y + t0y * h },
        { x: x + t1x * w, y: y + t1y * h },
        { x: x + t0x * w, y: y + t1y * h },
      ];

      const [dTL, dTR, dBR, dBL] = applyVertexDeformation(
        cellCorners,
        cx,
        cy,
        deformation,
        mode,
        maxProj,
      );

      const destLeft = Math.min(dTL.x, dTR.x, dBR.x, dBL.x);
      const destRight = Math.max(dTL.x, dTR.x, dBR.x, dBL.x);
      const destTop = Math.min(dTL.y, dTR.y, dBR.y, dBL.y);
      const destBottom = Math.max(dTL.y, dTR.y, dBR.y, dBL.y);

      const destW = destRight - destLeft;
      const destH = destBottom - destTop;
      if (destW <= 0 || destH <= 0) continue;

      const sx = t0x * sourceW;
      const sy = t0y * sourceH;
      const sw = (t1x - t0x) * sourceW;
      const sh = (t1y - t0y) * sourceH;

      ctx.drawImage(source, sx, sy, sw, sh, destLeft, destTop, destW + 0.35, destH + 0.35);
    }
  }
  ctx.restore();
}

export function resolveColor(color: string | undefined, fallback: string): string {
  if (!color) return fallback;
  if (COLOR_MAP[color.toLowerCase()]) return COLOR_MAP[color.toLowerCase()];
  return color;
}

export function drawTrapezoidal(
  ctx: RenderCtx,
  source: CanvasSource,
  x: number,
  y: number,
  w: number,
  h: number,
  st: Deformation,
) {
  drawVertexDeformed(ctx, source, x, y, w, h, st, 'st');
}

export function drawParallelogram(
  ctx: RenderCtx,
  source: CanvasSource,
  x: number,
  y: number,
  w: number,
  h: number,
  sp: Deformation,
) {
  drawVertexDeformed(ctx, source, x, y, w, h, sp, 'sp');
}

/**
 * Apply affine-only transforms to context (flip + rotate).
 * Non-affine st/sp are rendered via vertex deformation draw calls.
 */
export function applySymbolTransforms(
  ctx: RenderCtx,
  sym: SymbolSpec,
) {
  if (sym.flip) {
    const fx = sym.flip === 'h' || sym.flip === 'hv' ? -1 : 1;
    const fy = sym.flip === 'v' || sym.flip === 'hv' ? -1 : 1;
    ctx.scale(fx, fy);
  }
  if (sym.rotate) ctx.rotate((sym.rotate * Math.PI) / 180);
}

export function drawSymbolSource(
  ctx: RenderCtx,
  sym: SymbolSpec,
  source: CanvasSource,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  ctx.save();
  ctx.globalAlpha = sym.opacity ?? 1;
  ctx.translate(x + width / 2, y + height / 2);
  applySymbolTransforms(ctx, sym);

  if (sym.st) {
    drawTrapezoidal(ctx, source, -width / 2, -height / 2, width, height, sym.st);
  } else if (sym.sp) {
    drawParallelogram(ctx, source, -width / 2, -height / 2, width, height, sym.sp);
  } else {
    ctx.drawImage(source, -width / 2, -height / 2, width, height);
  }

  ctx.restore();
  ctx.globalAlpha = 1;
}

export function drawSymbolGlyph(
  ctx: RenderCtx,
  sym: SymbolSpec,
  x: number,
  y: number,
  width: number,
  height: number,
  defaultColor: string,
) {
  const scaleX = sym.scale?.x ?? 1;
  const scaleY = sym.scale?.y ?? 1;
  const fontSize = Math.min(width * scaleX, height * scaleY) * 0.85;
  const fontFamily = sym.fontFamily || 'Inter, system-ui';
  const fillColor = resolveColor(sym.color, defaultColor);

  if (!sym.st && !sym.sp) {
    ctx.save();
    ctx.translate(x + width / 2, y + height / 2);
    ctx.globalAlpha = sym.opacity ?? 1;
    applySymbolTransforms(ctx, sym);
    ctx.font = `${fontSize}px ${fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = fillColor;
    ctx.fillText(sym.char, 0, 0);
    ctx.restore();
    ctx.globalAlpha = 1;
    return;
  }

  const glyphCanvas = createRasterCanvas(width, height);
  const glyphCtx = glyphCanvas.getContext('2d');
  if (!glyphCtx) return;

  glyphCtx.clearRect(0, 0, glyphCanvas.width, glyphCanvas.height);
  glyphCtx.font = `${fontSize}px ${fontFamily}`;
  glyphCtx.textAlign = 'center';
  glyphCtx.textBaseline = 'middle';
  glyphCtx.fillStyle = fillColor;
  glyphCtx.fillText(sym.char, glyphCanvas.width / 2, glyphCanvas.height / 2);

  drawSymbolSource(ctx, sym, glyphCanvas, x, y, width, height);
}

/**
 * Renders a UniCompSpec to an OffscreenCanvas at its native grid proportions.
 */
export function renderSpecToOffscreen(
  spec: UniCompSpec,
  pixelsPerCell: number = 64,
  defaultColor: string = 'hsl(210, 20%, 92%)',
  depth: number = 0,
): OffscreenCanvas {
  if (depth > 20) {
    return new OffscreenCanvas(1, 1);
  }

  const w = spec.gridWidth * pixelsPerCell;
  const h = spec.gridHeight * pixelsPerCell;
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const registry = getRegistry();

  spec.symbols.forEach((sym) => {
    const rect = getRect(sym.start, sym.end, spec.gridWidth);
    const x1 = rect.x1 * pixelsPerCell;
    const y1 = rect.y1 * pixelsPerCell;
    const sw = (rect.x2 - rect.x1 + 1) * pixelsPerCell;
    const sh = (rect.y2 - rect.y1 + 1) * pixelsPerCell;

    const hasSt = sym.st && Math.abs(sym.st.force) > 0;
    const hasSp = sym.sp && Math.abs(sym.sp.force) > 0;

    // Render base glyph/nested without st/sp (those go through GPU)
    const cleanSym = (hasSt || hasSp) ? { ...sym, st: undefined, sp: undefined } : sym;

    const entry = registry.resolve(cleanSym);
    let baseCanvas: OffscreenCanvas;
    if (entry) {
      baseCanvas = renderSpecToOffscreen(entry.spec, pixelsPerCell, defaultColor, depth + 1);
    } else if (hasSt || hasSp) {
      // Render glyph to isolated offscreen for GPU processing
      const symW = rect.x2 - rect.x1 + 1;
      const symH = rect.y2 - rect.y1 + 1;
      const isoSym = { ...cleanSym, start: 0, end: (symH - 1) * symW + (symW - 1) };
      const isoSpec: UniCompSpec = { ...spec, gridWidth: symW, gridHeight: symH, symbols: [isoSym] };
      baseCanvas = renderSpecToOffscreen(isoSpec, pixelsPerCell, defaultColor, depth + 1);
    } else {
      // No deformation, no nesting — draw directly
      drawSymbolGlyph(ctx, sym, x1, y1, sw, sh, defaultColor);
      return;
    }

    if (hasSt || hasSp) {
      // Use GPU pipeline for anti-aliased st/sp
      try {
        const gpu = getSharedGpu();
        const htmlCanvas = document.createElement('canvas');
        htmlCanvas.width = baseCanvas.width;
        htmlCanvas.height = baseCanvas.height;
        const hCtx = htmlCanvas.getContext('2d');
        if (!hCtx) { drawSymbolSource(ctx, sym, baseCanvas, x1, y1, sw, sh); return; }
        hCtx.drawImage(baseCanvas, 0, 0);

        let gpuInput: HTMLCanvasElement = htmlCanvas;

        // Use dpr=1 for offscreen rendering to match editor's effective compression ratio.
        // The editor canvas has ctx.scale(dpr,dpr), so drawImage compresses by margin(2x) only.
        // OffscreenCanvas has no dpr scaling, so we must prevent GPU from inflating by dpr.
        const offscreenDpr = 1;

        const gpuExpand = DEFAULT_GPU_EXPAND_FACTOR;
        const ox = sw * (gpuExpand - 1) / 2;
        const oy = sh * (gpuExpand - 1) / 2;

        if (hasSt) {
          const stResult = gpu.render(gpuInput, {
            mode: 0, angle: sym.st!.angle, force: sym.st!.force, offset: 0, scale: 1,
            expandViewport: true,
            expandFactor: gpuExpand,
          }, null, null, offscreenDpr);
          if (hasSp) {
            const copy = document.createElement('canvas');
            copy.width = stResult.width; copy.height = stResult.height;
            const cCtx = copy.getContext('2d');
            if (cCtx) cCtx.drawImage(stResult, 0, 0);
            gpuInput = copy;
          } else {
            ctx.drawImage(stResult, x1 - ox, y1 - oy, sw * gpuExpand, sh * gpuExpand);
            return;
          }
        }

        if (hasSp) {
          const spResult = gpu.render(gpuInput, {
            mode: 1, angle: sym.sp!.angle, force: sym.sp!.force, offset: 0, scale: 1,
            expandViewport: !hasSt,
            expandFactor: gpuExpand,
          }, null, null, offscreenDpr);
          ctx.drawImage(spResult, x1 - ox, y1 - oy, sw * gpuExpand, sh * gpuExpand);
        }
      } catch {
        // Fallback to CPU if GPU fails
        drawSymbolSource(ctx, sym, baseCanvas, x1, y1, sw, sh);
      }
    } else {
      drawSymbolSource(ctx, cleanSym, baseCanvas, x1, y1, sw, sh);
    }
  });

  ctx.globalAlpha = 1;
  return canvas;
}

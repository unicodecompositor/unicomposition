import { UniCompSpec, SymbolSpec, getRect } from '@/lib/unicomp-parser';
import { DEFAULT_GPU_EXPAND_FACTOR, SuperTransformer } from '@/lib/SuperTransformer';

function getRegistry() {
  return { resolve: (_sym: unknown) => null };
}

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

// ─── GPU Warp Renderer: pixel-perfect edges via smoothstep+fwidth ───

class GpuWarpRenderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private texture: WebGLTexture;
  private buffer: WebGLBuffer;

  constructor() {
    this.canvas = document.createElement('canvas');
    const ctx = this.canvas.getContext('webgl', {
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
    });
    if (!ctx) throw new Error('WebGL warp context failed');
    this.gl = ctx;
    this.gl.getExtension('OES_standard_derivatives');
    this.program = this._initProgram();
    this.texture = this._initTexture();
    this.buffer = this._initBuffer();
  }

  private _initProgram(): WebGLProgram {
    const gl = this.gl;
    const vs = `
      attribute vec2 p;
      varying vec2 v;
      void main(){
        v = p * 0.5 + 0.5;
        gl_Position = vec4(p, 0.0, 1.0);
      }`;

    // This is the proven shader from SuperTransformer_2_ that gives
    // perfect anti-aliased edges even after warp deformation.
    // Key: smoothstep(0.5 - fwidth(tex.a), 0.5 + fwidth(tex.a), tex.a)
    // treats the alpha channel as an SDF-like field for crisp boundaries.
    const fs = `
      #extension GL_OES_standard_derivatives : enable
      precision highp float;
      varying vec2 v;
      uniform sampler2D t;
      uniform int mode;
      uniform float a, f;
      uniform vec4 win;

      vec2 getWarpedUV(vec2 pos, float aspect) {
        vec2 p = pos - 0.5;
        p.y = -p.y;
        float r = radians(a);
        vec2 dir = normalize(vec2(cos(r), sin(r)));
        vec2 perp = vec2(-dir.y, dir.x);
        float dAlong = dot(p, dir);
        float dSide = dot(p, perp);

        vec2 uv;
        if (mode == 0) { // TAPER (st)
          float widthScale = clamp(1.0 + (dAlong / 0.5) * (f * 0.01), 0.15, 8.0);
          vec2 warped = dir * dAlong + perp * (dSide / widthScale);
          uv = vec2(warped.x / aspect, warped.y) + 0.5;
        } else if (mode == 1) { // PARALLEL (sp)
          vec2 warped = dir * (dAlong - dSide * (f * 0.01)) + perp * dSide;
          uv = vec2(warped.x / aspect, warped.y) + 0.5;
        } else { // WARP (w) — pinch/bulge
          float dist = length(p);
          float maxDist = 0.5;
          float normalizedDist = dist / maxDist;
          float strength = f * 0.01;
          float warpedDist;
          if (strength >= 0.0) {
            // Bulge: push center outward (expand center, pull corners in)
            warpedDist = pow(normalizedDist, 1.0 / (1.0 + strength));
          } else {
            // Pinch: pull toward center (hourglass/funnel)
            warpedDist = pow(normalizedDist, 1.0 - strength);
          }
          vec2 warped = (dist > 0.001) ? p * (warpedDist / normalizedDist) : p;
          uv = vec2(warped.x / aspect, warped.y) + 0.5;
        }
        return uv;
      }

      void main() {
        float aspect = max(win.z / win.w, 0.0001);
        vec2 gPos = v * win.zw + win.xy;
        vec2 uv = getWarpedUV(gPos, aspect);
        vec4 tex = texture2D(t, uv);

        float bounds = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
        float mask = smoothstep(0.5 - fwidth(tex.a), 0.5 + fwidth(tex.a), tex.a);
        float shapeA = mask * bounds;

        gl_FragColor = vec4(tex.rgb, shapeA);
      }
    `;

    const prog = gl.createProgram()!;
    const addShader = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error('GpuWarpRenderer shader:', gl.getShaderInfoLog(s));
      }
      gl.attachShader(prog, s);
    };
    addShader(gl.VERTEX_SHADER, vs);
    addShader(gl.FRAGMENT_SHADER, fs);
    gl.linkProgram(prog);
    return prog;
  }

  private _initTexture(): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return tex;
  }

  private _initBuffer(): WebGLBuffer {
    const gl = this.gl;
    const b = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    return b;
  }

  render(
    source: HTMLCanvasElement,
    mode: 0 | 1 | 2,
    angle: number,
    force: number,
    expandFactor: number = 1.5,
  ): HTMLCanvasElement {
    const gl = this.gl;
    const outW = Math.max(1, Math.round(source.width * expandFactor));
    const outH = Math.max(1, Math.round(source.height * expandFactor));

    this.canvas.width = outW;
    this.canvas.height = outH;
    gl.viewport(0, 0, outW, outH);
    gl.useProgram(this.program);

    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

    const winArr = [
      (1.0 - expandFactor) / 2.0,
      (1.0 - expandFactor) / 2.0,
      expandFactor,
      expandFactor,
    ];

    gl.uniform1i(gl.getUniformLocation(this.program, 'mode'), mode);
    gl.uniform1f(gl.getUniformLocation(this.program, 'a'), angle);
    gl.uniform1f(gl.getUniformLocation(this.program, 'f'), force);
    gl.uniform4fv(gl.getUniformLocation(this.program, 'win'), new Float32Array(winArr));

    const pLoc = gl.getAttribLocation(this.program, 'p');
    gl.enableVertexAttribArray(pLoc);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.vertexAttribPointer(pLoc, 2, gl.FLOAT, false, 0, 0);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Copy to persistent canvas (WebGL canvas gets overwritten on next render)
    const result = document.createElement('canvas');
    result.width = outW;
    result.height = outH;
    const rCtx = result.getContext('2d');
    if (rCtx) rCtx.drawImage(this.canvas, 0, 0);
    return result;
  }
}

let _sharedWarp: GpuWarpRenderer | null = null;
function getSharedWarp(): GpuWarpRenderer {
  if (!_sharedWarp) _sharedWarp = new GpuWarpRenderer();
  return _sharedWarp;
}

// ─── GPU-accelerated deformation ───

export function drawVertexDeformed(
  ctx: RenderCtx,
  source: CanvasSource,
  x: number,
  y: number,
  w: number,
  h: number,
  deformation: Deformation,
  mode: 'st' | 'sp' | 'w',
) {
  const sourceW = source.width;
  const sourceH = source.height;
  if (!sourceW || !sourceH || w <= 0 || h <= 0) return;

  if (Math.abs(deformation.force) < 0.1) {
    ctx.drawImage(source, x, y, w, h);
    return;
  }

  try {
    const warp = getSharedWarp();

    // Ensure source is HTMLCanvasElement for WebGL texImage2D
    let htmlSource: HTMLCanvasElement;
    if (source instanceof HTMLCanvasElement) {
      htmlSource = source;
    } else {
      htmlSource = document.createElement('canvas');
      htmlSource.width = sourceW;
      htmlSource.height = sourceH;
      const hCtx = htmlSource.getContext('2d');
      if (!hCtx) { ctx.drawImage(source, x, y, w, h); return; }
      hCtx.drawImage(source as any, 0, 0);
    }

    const gpuMode: 0 | 1 | 2 = mode === 'st' ? 0 : mode === 'sp' ? 1 : 2;
    const expand = 1.5;
    const result = warp.render(htmlSource, gpuMode, deformation.angle, deformation.force, expand);

    // Draw expanded result centered at destination
    const expandedW = w * expand;
    const expandedH = h * expand;
    const drawX = x - (expandedW - w) / 2;
    const drawY = y - (expandedH - h) / 2;
    ctx.drawImage(result, drawX, drawY, expandedW, expandedH);
  } catch {
    // Fallback: draw without deformation
    ctx.drawImage(source, x, y, w, h);
  }
}


/** Draw stroke around content using CPU multi-directional offset.
 *  strokePx is computed externally based on the DISPLAYED pixel size of the symbol,
 *  so that stroke thickness is consistent between GRID VISUALIZATION and RESULT windows. */
function drawStrokeCPU(
  ctx: RenderCtx,
  source: CanvasSource,
  sym: SymbolSpec,
  strokePx: number,
) {
  const strokeColor = sym.strokeColor || 'hsl(0, 0%, 100%)';
  const strokeOp = sym.strokeOpacity ?? 1;
  const w = (source as any).width as number;
  const h = (source as any).height as number;
  if (!w || !h) return;

  // Copy source to isolated canvas to avoid self-read issues
  const contentCanvas = document.createElement('canvas');
  contentCanvas.width = w;
  contentCanvas.height = h;
  const cCtx = contentCanvas.getContext('2d');
  if (!cCtx) return;
  cCtx.drawImage(source as any, 0, 0);

  // Build stroke on a completely separate canvas to prevent compositing bleed
  const pad = strokePx + 2;
  const resultCanvas = document.createElement('canvas');
  resultCanvas.width = w + pad * 2;
  resultCanvas.height = h + pad * 2;
  const rCtx = resultCanvas.getContext('2d');
  if (!rCtx) return;

  // Draw stroke outline: multi-offset copies
  rCtx.globalAlpha = strokeOp;
  const steps = 16;
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    rCtx.drawImage(contentCanvas, pad + Math.cos(angle) * strokePx, pad + Math.sin(angle) * strokePx);
  }
  // Tint stroke with color
  rCtx.globalCompositeOperation = 'source-in';
  rCtx.fillStyle = strokeColor;
  rCtx.fillRect(0, 0, resultCanvas.width, resultCanvas.height);
  // Draw original content on top
  rCtx.globalCompositeOperation = 'source-over';
  rCtx.globalAlpha = 1;
  rCtx.drawImage(contentCanvas, pad, pad);

  // Blit result back to output context (offset to account for padding)
  ctx.drawImage(resultCanvas, -pad, -pad);
}

export function resolveColor(color: string | undefined, fallback: string): string {
  if (!color) return fallback;
  if (COLOR_MAP[color.toLowerCase()]) return COLOR_MAP[color.toLowerCase()];
  return color;
}

/**
 * Draw with isosceles trapezoid (st) distortion using GPU acceleration.
 * Fallback to CPU rendering if WebGL unavailable.
 */
export function drawTrapezoidal(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  source: HTMLCanvasElement | OffscreenCanvas | HTMLImageElement,
  x: number, y: number, w: number, h: number,
  st: { angle: number; force: number },
) {
  const sourceW = source.width;
  const sourceH = source.height;
  if (!sourceW || !sourceH || w <= 0 || h <= 0) return;

  const force = st.force;
  if (Math.abs(force) < 0.1) {
    ctx.drawImage(source, x, y, w, h);
    return;
  }

  // Try GPU acceleration
  try {
    const transformer = getTransformer();
    if (transformer) {
      const forceNorm = Math.max(-0.5, Math.min(0.5, force / 100));
      const result = transformer.render(source, {
        mode: 0,
        angle: st.angle,
        force: forceNorm,
      });
      if (result && ctx instanceof CanvasRenderingContext2D) {
        ctx.drawImage(result, x, y, w, h);
        return;
      }
    }
  } catch (e) {
    console.warn('GPU transformation failed, using CPU fallback:', e);
  }

  // CPU fallback: simple trapezoid using mesh deformation
  const rad = st.angle * Math.PI / 180;
  const dirX = Math.cos(rad);
  const dirY = Math.sin(rad);
  const perpX = -dirY;
  const perpY = dirX;

  const cx = x + w / 2;
  const cy = y + h / 2;

  const rows = 16;
  const cols = 16;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const u0 = c / cols;
      const v0 = r / rows;
      const u1 = (c + 1) / cols;
      const v1 = (r + 1) / rows;

      const transform = (u: number, v: number) => {
        const rx = (u - 0.5) * w;
        const ry = (v - 0.5) * h;
        const dAlong = rx * dirX + ry * dirY;
        const dSide = rx * perpX + ry * perpY;
        const scaleAtPoint = 1.0 + (dAlong * force * 0.005);
        return {
          x: cx + (dirX * dAlong) + (perpX * dSide * scaleAtPoint),
          y: cy + (dirY * dAlong) + (perpY * dSide * scaleAtPoint)
        };
      };

      const p0 = transform(u0, v0);
      const p1 = transform(u1, v0);
      const p2 = transform(u1, v1);
      const p3 = transform(u0, v1);

      const drawTriangle = (t0: any, t1: any, t2: any, s0: any, s1: any, s2: any) => {
        (ctx as any).save?.();
        (ctx as any).beginPath?.();
        (ctx as any).moveTo?.(t0.x, t0.y);
        (ctx as any).lineTo?.(t1.x, t1.y);
        (ctx as any).lineTo?.(t2.x, t2.y);
        (ctx as any).closePath?.();
        (ctx as any).clip?.();

        const denom = (s0.u - s2.u) * (s1.v - s2.v) - (s1.u - s2.u) * (s0.v - s2.v);
        if (Math.abs(denom) < 1e-6) { (ctx as any).restore?.(); return; }

        const m11 = ((t0.x - t2.x) * (s1.v - s2.v) - (t1.x - t2.x) * (s0.v - s2.v)) / denom;
        const m12 = ((t0.y - t2.y) * (s1.v - s2.v) - (t1.y - t2.y) * (s0.v - s2.v)) / denom;
        const m21 = ((t1.x - t2.x) * (s0.u - s2.u) - (t0.x - t2.x) * (s1.u - s2.u)) / denom;
        const m22 = ((t1.y - t2.y) * (s0.u - s2.u) - (t0.y - t2.y) * (s1.u - s2.u)) / denom;
        const dx = t2.x - m11 * s2.u * sourceW - m21 * s2.v * sourceH;
        const dy = t2.y - m12 * s2.u * sourceW - m22 * s2.v * sourceH;

        (ctx as any).setTransform?.(m11, m12, m21, m22, dx, dy);
        (ctx as any).drawImage?.(source, 0, 0);
        (ctx as any).restore?.();
      };

      drawTriangle(p0, p1, p2, {u:u0, v:v0}, {u:u1, v:v0}, {u:u1, v:v1});
      drawTriangle(p0, p2, p3, {u:u0, v:v0}, {u:u1, v:v1}, {u:u0, v:v1});
    }
  }
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
 * Non-affine st/sp are rendered via GPU warp shader.
 */
function getSymbolChar(sym: SymbolSpec): string {
  const v = sym.v ?? '';
  if (v.startsWith('"') && v.endsWith('"') && v.length >= 2) return v.slice(1, -1);
  return v;
}

function getSymbolColor(sym: SymbolSpec): string | undefined {
  return sym.color ?? sym.c;
}

export function applySymbolTransforms(
  ctx: RenderCtx,
  sym: SymbolSpec,
) {
  const flip = sym.flip ?? sym.f;
  if (flip) {
    const fx = flip === 'h' || flip === 'hv' ? -1 : 1;
    const fy = flip === 'v' || flip === 'hv' ? -1 : 1;
    ctx.scale(fx, fy);
  }
  const rotate = sym.rotate !== undefined ? sym.rotate : sym.r;
  if (rotate) ctx.rotate((rotate * Math.PI) / 180);
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
  const fontFamily = (sym as any).fontFamily || 'Inter, system-ui';
  const fillColor = resolveColor(getSymbolColor(sym), defaultColor);
  const displayChar = getSymbolChar(sym);

  if (!sym.st && !sym.sp) {
    ctx.save();
    ctx.translate(x + width / 2, y + height / 2);
    ctx.globalAlpha = sym.opacity ?? 1;
    applySymbolTransforms(ctx, sym);
    ctx.font = `${fontSize}px ${fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = fillColor;
    ctx.fillText(displayChar, 0, 0);
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
  glyphCtx.fillText(displayChar, glyphCanvas.width / 2, glyphCanvas.height / 2);

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
  idMap?: Map<string, OffscreenCanvas>,
): OffscreenCanvas {
  if (depth > 20) {
    return new OffscreenCanvas(1, 1);
  }

  const w = spec.gridWidth * pixelsPerCell;
  const h = spec.gridHeight * pixelsPerCell;
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // Build id map for #id reference resolution (only at depth 0, if not provided)
  const resolvedIdMap: Map<string, OffscreenCanvas> = idMap ?? new Map();
  if (!idMap && depth === 0) {
    spec.symbols.forEach((sym) => {
      if (!sym.id) return;
      const idRect = getRect(sym.start, sym.end, spec.gridWidth);
      const idW = idRect.x2 - idRect.x1 + 1;
      const idH = idRect.y2 - idRect.y1 + 1;
      const isoIdSym = {
        ...sym,
        start: 0,
        end: (idH - 1) * idW + (idW - 1),
        background: undefined,
        backgroundOpacity: undefined,
        borderRadius: undefined,
        layerBorderWidth: undefined,
        layerBorderColor: undefined,
        layerBorderOpacity: undefined,
      };
      const isoIdSpec: UniCompSpec = {
        ...spec,
        gridWidth: idW,
        gridHeight: idH,
        symbols: [isoIdSym as typeof sym],
        background: undefined,
        backgroundOpacity: undefined,
        borderRadius: undefined,
        strokeColor: undefined,
        strokeWidth: undefined,
        strokeOpacity: undefined,
        opacity: undefined,
      };
      resolvedIdMap.set(sym.id, renderSpecToOffscreen(isoIdSpec, pixelsPerCell, defaultColor, depth + 1, resolvedIdMap));
    });
  }

  // --- Grid-level background ---
  if (spec.background) {
    ctx.save();
    ctx.globalAlpha = spec.backgroundOpacity ?? spec.opacity ?? 1;
    ctx.fillStyle = spec.background;
    if (spec.borderRadius) {
      const brStr = spec.borderRadius;
      const shortSide = Math.min(w, h);
      let radiusPx = brStr.endsWith('%') ? shortSide * parseFloat(brStr) / 100 : parseFloat(brStr) * pixelsPerCell;
      radiusPx = Math.min(Math.max(0, radiusPx), shortSide / 2);
      ctx.beginPath();
      ctx.roundRect(0, 0, w, h, radiusPx);
      ctx.fill();
    } else {
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();
  }

  // --- Grid-level opacity ---
  if (spec.opacity !== undefined && spec.opacity < 1 && !spec.background) {
    ctx.globalAlpha = spec.opacity;
  }

  spec.symbols.forEach((sym) => {
    const rect = getRect(sym.start, sym.end, spec.gridWidth);
    const x1 = rect.x1 * pixelsPerCell;
    const y1 = rect.y1 * pixelsPerCell;
    const sw = (rect.x2 - rect.x1 + 1) * pixelsPerCell;
    const sh = (rect.y2 - rect.y1 + 1) * pixelsPerCell;

    // --- Layer background fill (bc=) ---
    if (sym.background) {
      ctx.save();
      ctx.globalAlpha = sym.backgroundOpacity ?? 1;
      ctx.fillStyle = sym.background;
      if (sym.borderRadius) {
        const brStr = sym.borderRadius;
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

    // --- Symbol rendering (glyph + symbol border b=) ---
    // Symbol border (b=) is applied only to the glyph canvas, NOT to the layer bounds
    const hasSt = sym.st && Math.abs(sym.st.force) > 0;
    const hasSp = sym.sp && Math.abs(sym.sp.force) > 0;
    const hasW = sym.w && Math.abs(sym.w.force) > 0;
    // Symbol border (b=) — only for the glyph itself
    const hasSymbolStroke = sym.strokeWidth && sym.strokeWidth > 0;

    // Render base glyph/nested without st/sp (those go through GPU)
    // Strip ALL layer-level and border props — only symbol glyph rendering props survive
    const cleanSym = {
      ...sym,
      st: (hasSt ? sym.st : undefined),
      sp: (hasSp ? sym.sp : undefined),
      // Layer-level props — must NEVER propagate into glyph/isoSpec
      background: undefined,
      backgroundOpacity: undefined,
      borderRadius: undefined,
      layerBorderWidth: undefined,
      layerBorderColor: undefined,
      layerBorderOpacity: undefined,
    };

    // Resolve #id reference via idMap
    let baseCanvas: OffscreenCanvas | undefined;
    if (cleanSym.refId) {
      baseCanvas = resolvedIdMap.get(cleanSym.refId);
    }
    if (!baseCanvas) {
      if (hasSt || hasSp || hasW) {
        const symW = rect.x2 - rect.x1 + 1;
        const symH = rect.y2 - rect.y1 + 1;
        // isoSym: only glyph props (no st/sp here — GPU applies them after)
        const isoSym = {
          ...cleanSym,
          st: undefined, sp: undefined, w: undefined,
          start: 0, end: (symH - 1) * symW + (symW - 1),
        };
        const isoSpec: UniCompSpec = {
          gridSize: symW, gridWidth: symW, gridHeight: symH,
          symbols: [isoSym],
          background: undefined, backgroundOpacity: undefined,
          borderRadius: undefined,
          strokeColor: undefined, strokeWidth: undefined, strokeOpacity: undefined,
          opacity: undefined, raw: spec.raw,
        };
        baseCanvas = renderSpecToOffscreen(isoSpec, pixelsPerCell, defaultColor, depth + 1, resolvedIdMap);
      } else if (!hasSymbolStroke) {
        // No deformation, no symbol stroke — draw glyph directly (layer bg/border handled separately)
        drawSymbolGlyph(ctx, cleanSym, x1, y1, sw, sh, defaultColor);
        return;
      } else {
        // Has symbol stroke but no deformation — rasterize glyph only (no layer bg) for stroke pass
        const symW = rect.x2 - rect.x1 + 1;
        const symH = rect.y2 - rect.y1 + 1;
        const isoSym = {
          ...cleanSym,
          st: undefined, sp: undefined,
          strokeWidth: undefined, strokeColor: undefined, strokeOpacity: undefined,
          start: 0, end: (symH - 1) * symW + (symW - 1),
        };
        const isoSpec: UniCompSpec = {
          gridSize: symW, gridWidth: symW, gridHeight: symH,
          symbols: [isoSym],
          background: undefined, backgroundOpacity: undefined,
          borderRadius: undefined,
          strokeColor: undefined, strokeWidth: undefined, strokeOpacity: undefined,
          opacity: undefined, raw: spec.raw,
        };
        baseCanvas = renderSpecToOffscreen(isoSpec, pixelsPerCell, defaultColor, depth + 1, resolvedIdMap);
      }
    }
    if (!baseCanvas) return;

    // GPU pipeline for st/sp deformation + CPU symbol stroke (b=)
    if (hasSt || hasSp || hasW || hasSymbolStroke) {
      try {
        const htmlCanvas = document.createElement('canvas');
        htmlCanvas.width = baseCanvas.width;
        htmlCanvas.height = baseCanvas.height;
        const hCtx = htmlCanvas.getContext('2d');
        if (!hCtx) { drawSymbolSource(ctx, cleanSym, baseCanvas, x1, y1, sw, sh); return; }
        hCtx.drawImage(baseCanvas, 0, 0);

        if (hasSt || hasSp || hasW) {
          const warp = getSharedWarp();
          const expand = 1.5;
          let currentCanvas = htmlCanvas;

          if (hasSt) {
            currentCanvas = warp.render(currentCanvas, 0, sym.st!.angle, sym.st!.force, expand);
          }
          if (hasSp) {
            currentCanvas = warp.render(currentCanvas, 1, sym.sp!.angle, sym.sp!.force, (hasSt) ? 1.0 : expand);
          }
          if (hasW) {
            currentCanvas = warp.render(currentCanvas, 2, sym.w!.angle, sym.w!.force, (hasSt || hasSp) ? 1.0 : expand);
          }

          // Apply symbol stroke (b=) ONLY to the deformed glyph, not to layer bounds
          // strokePx based on pixelsPerCell (= cellSize in Grid) for consistent thickness
          if (hasSymbolStroke) {
            const strokePx = Math.max(1, Math.round(sym.strokeWidth! * pixelsPerCell));
            const strokeResult = document.createElement('canvas');
            strokeResult.width = currentCanvas.width;
            strokeResult.height = currentCanvas.height;
            const srCtx = strokeResult.getContext('2d');
            if (srCtx) {
              srCtx.drawImage(currentCanvas, 0, 0);
              drawStrokeCPU(srCtx, strokeResult, sym, strokePx);
              currentCanvas = strokeResult;
            }
          }

          const totalExpand = hasSt ? expand : 1.0;
          const expandedW = sw * totalExpand;
          const expandedH = sh * totalExpand;

          ctx.save();
          ctx.globalAlpha = sym.opacity ?? 1;
          ctx.translate(x1 + sw / 2, y1 + sh / 2);
          applySymbolTransforms(ctx, sym);
          ctx.drawImage(currentCanvas, -expandedW / 2, -expandedH / 2, expandedW, expandedH);
          ctx.restore();
          ctx.globalAlpha = 1;
        } else if (hasSymbolStroke) {
          // Symbol stroke only, no deformation
          const strokePx = Math.max(1, Math.round(sym.strokeWidth! * pixelsPerCell));
          const pad = strokePx + 2;
          const strokeCanvas = document.createElement('canvas');
          strokeCanvas.width = htmlCanvas.width + pad * 2;
          strokeCanvas.height = htmlCanvas.height + pad * 2;
          const sCtx = strokeCanvas.getContext('2d');
          if (sCtx) {
            sCtx.drawImage(htmlCanvas, pad, pad);
            drawStrokeCPU(sCtx, strokeCanvas, sym, strokePx);
            const padFracX = pad / htmlCanvas.width * sw;
            const padFracY = pad / htmlCanvas.height * sh;
            ctx.drawImage(strokeCanvas, x1 - padFracX, y1 - padFracY, sw + padFracX * 2, sh + padFracY * 2);
          } else {
            ctx.drawImage(htmlCanvas, x1, y1, sw, sh);
          }
        }
      } catch {
        drawSymbolSource(ctx, cleanSym, baseCanvas, x1, y1, sw, sh);
      }
    } else {
      drawSymbolSource(ctx, cleanSym, baseCanvas, x1, y1, sw, sh);
    }
  });

  // --- Layer borders (bb=) — drawn AFTER all symbol content, per spec architecture ---
  spec.symbols.forEach((sym) => {
    if (!sym.layerBorderWidth || sym.layerBorderWidth <= 0) return;
    const rect = getRect(sym.start, sym.end, spec.gridWidth);
    const x1 = rect.x1 * pixelsPerCell;
    const y1 = rect.y1 * pixelsPerCell;
    const sw = (rect.x2 - rect.x1 + 1) * pixelsPerCell;
    const sh = (rect.y2 - rect.y1 + 1) * pixelsPerCell;

    ctx.save();
    const lbPx = Math.max(1, sym.layerBorderWidth * pixelsPerCell);
    ctx.globalAlpha = sym.layerBorderOpacity ?? 1;
    ctx.strokeStyle = sym.layerBorderColor || 'hsl(0, 0%, 100%)';
    ctx.lineWidth = lbPx;
    const halfLb = lbPx / 2;
    if (sym.borderRadius) {
      const brStr = sym.borderRadius;
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

  // --- Grid-level border ---
  if (spec.strokeWidth && spec.strokeWidth > 0) {
    ctx.save();
    const borderPx = Math.max(1, spec.strokeWidth * pixelsPerCell);
    ctx.globalAlpha = spec.strokeOpacity ?? 1;
    ctx.strokeStyle = spec.strokeColor || 'hsl(0, 0%, 100%)';
    ctx.lineWidth = borderPx;
    const halfBorder = borderPx / 2;
    if (spec.borderRadius) {
      const brStr = spec.borderRadius;
      const shortSide = Math.min(w, h);
      let radiusPx = brStr.endsWith('%') ? shortSide * parseFloat(brStr) / 100 : parseFloat(brStr) * pixelsPerCell;
      radiusPx = Math.min(Math.max(0, radiusPx), shortSide / 2);
      ctx.beginPath();
      ctx.roundRect(halfBorder, halfBorder, w - borderPx, h - borderPx, Math.max(0, radiusPx - halfBorder));
      ctx.stroke();
    } else {
      ctx.strokeRect(halfBorder, halfBorder, w - borderPx, h - borderPx);
    }
    ctx.restore();
  }

  ctx.globalAlpha = 1;
  return canvas;
}

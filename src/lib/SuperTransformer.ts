/**
 * SuperTransformer.ts (Production Ready)
 * GPU-процессор с поддержкой Warp, динамического LOD обводки и авто-парсинга цветов.
 *
 * Добавлена возможность рисовать кружки (blobs) вдоль сглаженного контура фигуры
 * с использованием алгоритмов упрощения (Douglas-Peucker) и сглаживания (Chaikin).
 * Поддерживаются множественные контуры (дырки).
 *
 * Для экономии памяти при работе с большими данными можно включить режим
 * useFloat32Array (по умолчанию false).
 */

export const DEFAULT_GPU_EXPAND_FACTOR = 3;

export interface TransformerParams {
    mode?: number;
    angle?: number;
    force?: number;
    offset?: number;
    scale?: number;
    expandViewport?: boolean;
    expandFactor?: number;
    strokeWidth?: number;
    strokeColor?: [number, number, number, number] | string;
    strokeOpacity?: number;
    backgroundColor?: [number, number, number, number] | string;
    b?: [number, number, number, number] | string; // Алиас для фона из парсера

    // Параметры для рисования клякс (граница)
    blobRadius?: number;      // радиус кляксы в пикселях
    blobColor?: [number, number, number, number] | string;
    blobOpacity?: number;

    // Параметры для векторного упрощения и сглаживания
    simplifyEpsilon?: number;        // точность упрощения Дугласа-Пекера (пиксели)
    smoothIterations?: number;       // количество итераций сглаживания Чаикина (0 = без сглаживания)
    blobStep?: number;               // шаг между кружками вдоль кривой (если нужна равномерная линия)
    useFloat32Array?: boolean;       // использовать Float32Array для хранения точек (экономия памяти)
}

export interface PatchRect { x: number; y: number; w: number; h: number; }

// Внутренний тип для точек (может быть заменён на Float32Array)
type Point = { x: number; y: number };

export class SuperTransformer {
    private canvas: HTMLCanvasElement;
    private gl: WebGLRenderingContext;
    private program: WebGLProgram;
    private texture: WebGLTexture;
    private buffer: WebGLBuffer;

    // Для инстансинга кружков
    private blobProgram: WebGLProgram | null = null;

    constructor() {
        this.canvas = document.createElement('canvas');
        const context = this.canvas.getContext('webgl', {
            alpha: true,
            antialias: true,
            premultipliedAlpha: false
        });
        if (!context) throw new Error("WebGL context failed.");
        this.gl = context;
        this.gl.getExtension('OES_standard_derivatives');
        this.program = this._initShader();
        this.texture = this._initTexture();
        this.buffer = this._initBuffer();
    }

    // ---------- Оригинальные методы (без изменений) ----------

    private _initShader(): WebGLProgram {
        const gl = this.gl;
        const vs = `
            attribute vec2 p; 
            varying vec2 v; 
            void main(){ 
                v = p * 0.5 + 0.5; 
                gl_Position = vec4(p, 0.0, 1.0); 
            }`;

        const fs = `
            #extension GL_OES_standard_derivatives : enable
            precision highp float;
            varying vec2 v;
            uniform sampler2D t;
            uniform int mode; 
            uniform float a, f, o, s; 
            uniform vec4 win;
            uniform float strokeW;
            uniform vec4 strokeRGBA; 
            uniform float strokeOp;
            uniform vec4 bgColor;

            vec2 getWarpedUV(vec2 pos, float aspect) {
                vec2 p = pos - 0.5;
                p.y = -p.y;
                float r = radians(a);
                vec2 dir = normalize(vec2(cos(r), sin(r)));
                vec2 perp = vec2(-dir.y, dir.x);
                float dAlong = dot(p, dir);
                float dSide = dot(p, perp);
                
                vec2 uv;
                if (mode == 0) { // TAPER
                    float widthScale = clamp(1.0 + (dAlong / 0.5) * (f * 0.01), 0.15, 8.0);
                    vec2 warped = dir * dAlong + perp * (dSide / widthScale);
                    uv = vec2(warped.x / aspect, warped.y) + 0.5;
                } 
                else if (mode == 1) { // PARALLEL
                    vec2 warped = dir * (dAlong - dSide * (f * 0.01)) + perp * dSide;
                    uv = vec2(warped.x / aspect, warped.y) + 0.5;
                } 
                else if (mode == 2) { // ROTATE / SCALE
                    mat2 rotMat = mat2(cos(r), sin(r), -sin(r), cos(r));
                    vec2 warped = (rotMat * p) / max(s, 0.0001);
                    uv = vec2(warped.x / aspect, warped.y) + 0.5;
                } 
                else if (mode == 4) { // WARP (Bulge/Pinch)
                    vec2 pA = vec2(p.x * aspect, p.y);
                    float d = length(pA);
                    float radius = 0.707; 
                    float strength = f * 0.02; 
                    if (d < radius) {
                        float distNorm = d / radius;
                        float factor = (f >= 0.0) ? pow(distNorm, strength + 1.0) : pow(distNorm, 1.0 / (1.0 - strength));
                        pA = normalize(pA) * factor * radius;
                    }
                    uv = vec2(pA.x / aspect, pA.y) + 0.5;
                }
                else { uv = vec2(pos.x, 1.0 - pos.y); }
                return uv;
            }

            void main() {
                float aspect = max(win.z / win.w, 0.0001);
                vec2 gPos = v * win.zw + win.xy;
                vec2 uv = getWarpedUV(gPos, aspect);
                vec4 tex = texture2D(t, uv);
                
                float bounds = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
                float mask = smoothstep(0.5 - fwidth(tex.a), 0.5 + fwidth(tex.a), tex.a);

                // --- Динамическая обводка (LOD) ---
                float dilated = tex.a;
                if (strokeW > 0.001) {
                    vec2 unit = fwidth(uv) * strokeW;
                    int steps = 16;
                    if (strokeW > 0.333) steps = 64;
                    else if (strokeW > 0.166) steps = 32;

                    for(int i = 0; i < 64; i++) {
                        if (i >= steps) break;
                        float angle = 6.283185 * float(i) / float(steps);
                        vec2 offset = vec2(cos(angle), sin(angle)) * unit;
                        dilated = max(dilated, texture2D(t, uv + offset).a);
                    }
                }

                float dMask = smoothstep(0.5 - fwidth(dilated), 0.5 + fwidth(dilated), dilated);
                float strokeZone = dMask * (1.0 - mask) * bounds;

                float shapeA = mask * bounds;
                float strokeA = strokeZone * strokeRGBA.a * strokeOp;
                
                float finalA = shapeA + strokeA * (1.0 - shapeA);
                vec3 finalRGB = mix(strokeRGBA.rgb, tex.rgb, shapeA / max(finalA, 0.0001));

                // Финальное смешивание с фоном
                vec4 obj = vec4(finalRGB, finalA);
                gl_FragColor = vec4(mix(bgColor.rgb, obj.rgb, obj.a), max(bgColor.a, obj.a));
            }
        `;
        const prog = gl.createProgram()!;
        const add = (type: number, src: string) => {
            const sh = gl.createShader(type)!;
            gl.shaderSource(sh, src);
            gl.compileShader(sh);
            if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(sh));
            gl.attachShader(prog, sh);
        };
        add(gl.VERTEX_SHADER, vs);
        add(gl.FRAGMENT_SHADER, fs);
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

    public render(
        img: HTMLImageElement | HTMLCanvasElement,
        params: any,
        patch: PatchRect | null = null,
        fullSize: { w: number, h: number } | null = null,
        overrideDpr?: number
    ): HTMLCanvasElement {
        const gl = this.gl;
        const dpr = overrideDpr ?? (window.devicePixelRatio || 1);
        const expand = params.expandViewport ? (params.expandFactor ?? DEFAULT_GPU_EXPAND_FACTOR) : 1;
        this.canvas.width = Math.max(1, Math.round((patch ? patch.w : img.width) * expand * dpr));
        this.canvas.height = Math.max(1, Math.round((patch ? patch.h : img.height) * expand * dpr));

        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.useProgram(this.program);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);

        let winArr = (patch && fullSize)
            ? [patch.x / fullSize.w, patch.y / fullSize.h, patch.w / fullSize.w, patch.h / fullSize.h]
            : [(1.0 - expand) / 2.0, (1.0 - expand) / 2.0, expand, expand];

        gl.uniform1i(gl.getUniformLocation(this.program, "mode"), params.mode ?? 0);
        gl.uniform1f(gl.getUniformLocation(this.program, "a"), params.angle ?? 0);
        gl.uniform1f(gl.getUniformLocation(this.program, "f"), params.force ?? 0);
        gl.uniform1f(gl.getUniformLocation(this.program, "o"), params.offset ?? 0);
        gl.uniform1f(gl.getUniformLocation(this.program, "s"), params.scale ?? 1);
        gl.uniform4fv(gl.getUniformLocation(this.program, "win"), new Float32Array(winArr));

        gl.uniform1f(gl.getUniformLocation(this.program, "strokeW"), params.strokeWidth ?? 0);
        gl.uniform1f(gl.getUniformLocation(this.program, "strokeOp"), params.strokeOpacity ?? 1);

        // Авто-парсинг цвета обводки (c)
        let sCol = params.strokeColor || params.c;
        if (typeof sCol === 'string') sCol = SuperTransformer.hslToRgb01(sCol);
        gl.uniform4fv(gl.getUniformLocation(this.program, "strokeRGBA"), new Float32Array(sCol ?? [1, 1, 1, 1]));

        // Авто-парсинг цвета фона (b)
        let bCol = params.backgroundColor || params.b;
        if (typeof bCol === 'string') bCol = SuperTransformer.hslToRgb01(bCol);
        gl.uniform4fv(gl.getUniformLocation(this.program, "bgColor"), new Float32Array(bCol ?? [0, 0, 0, 0]));

        const pLoc = gl.getAttribLocation(this.program, "p");
        gl.enableVertexAttribArray(pLoc);
        gl.vertexAttribPointer(pLoc, 2, gl.FLOAT, false, 0, 0);

        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        return this.canvas;
    }

    static hslToRgb01(hsl: string): [number, number, number, number] {
        const m = hsl.match(/hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%?\s*,\s*([\d.]+)%?\s*(?:,\s*([\d.]+)\s*)?\)/);
        if (!m) return [1, 1, 1, 1];
        const h = parseFloat(m[1]) / 360, s = parseFloat(m[2]) / 100, l = parseFloat(m[3]) / 100;
        const a = m[4] ? parseFloat(m[4]) : 1.0;
        if (s === 0) return [l, l, l, a];
        const hue2rgb = (p: number, q: number, t: number) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3), a];
    }

    // ---------- Новые методы для рисования клякс ----------

    private static _parseColor(color: [number, number, number, number] | string | undefined, fallback: [number, number, number, number]): [number, number, number, number] {
        if (!color) return fallback;
        if (typeof color === 'string') return SuperTransformer.hslToRgb01(color);
        return color;
    }

    private _initBlobShader(): WebGLProgram {
        const gl = this.gl;
        const vs = `
            attribute vec2 aCenter;
            varying vec2 vUv;
            uniform float uRadius;
            uniform vec2 uResolution;

            void main() {
                int id = gl_VertexID % 4;
                float x = float(id == 1 || id == 2 ? 1 : -1);
                float y = float(id == 2 || id == 3 ? 1 : -1);
                vec2 corner = vec2(x, y);
                vec2 pos = aCenter + corner * uRadius * 2.0 / uResolution;
                gl_Position = vec4(pos, 0.0, 1.0);
                vUv = corner * 0.5 + 0.5;
            }
        `;

        const fs = `
            precision highp float;
            varying vec2 vUv;
            uniform vec4 uColor;

            void main() {
                float d = length(vUv - 0.5) * 2.0;
                if (d > 1.0) discard;
                gl_FragColor = uColor;
            }
        `;

        const prog = gl.createProgram()!;
        const add = (type: number, src: string) => {
            const sh = gl.createShader(type)!;
            gl.shaderSource(sh, src);
            gl.compileShader(sh);
            if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(sh));
            gl.attachShader(prog, sh);
        };
        add(gl.VERTEX_SHADER, vs);
        add(gl.FRAGMENT_SHADER, fs);
        gl.linkProgram(prog);
        return prog;
    }

    // ---------- Методы для работы с множественными контурами ----------

    private _getBinaryMask(ctx: CanvasRenderingContext2D, width: number, height: number, threshold = 128): boolean[][] {
        const imgData = ctx.getImageData(0, 0, width, height);
        const data = imgData.data;
        const mask: boolean[][] = Array.from({ length: height }, () => Array(width).fill(false));
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const alpha = data[(y * width + x) * 4 + 3];
                mask[y][x] = alpha > threshold;
            }
        }
        return mask;
    }

    // Поиск всех контуров (внешних и внутренних) с использованием visited-массива
    private _findAllContours(mask: boolean[][]): Point[][] {
        const height = mask.length;
        const width = mask[0].length;
        const visited: boolean[][] = Array.from({ length: height }, () => Array(width).fill(false));
        const contours: Point[][] = [];

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (mask[y][x] && !visited[y][x]) {
                    const start = { x, y };
                    const contour = this._traceBoundary(mask, start, visited);
                    if (contour.length > 0) {
                        contours.push(contour);
                    }
                }
            }
        }
        return contours;
    }

    // Трассировка одного контура (8-связность) с отметкой посещённых пикселей
    private _traceBoundary(mask: boolean[][], start: Point, visited: boolean[][]): Point[] {
        const height = mask.length;
        const width = mask[0].length;
        const directions = [
            { dx: 1, dy: 0 },  // 0: вправо
            { dx: 1, dy: -1 }, // 1: вправо-вверх
            { dx: 0, dy: -1 }, // 2: вверх
            { dx: -1, dy: -1 },// 3: влево-вверх
            { dx: -1, dy: 0 }, // 4: влево
            { dx: -1, dy: 1 }, // 5: влево-вниз
            { dx: 0, dy: 1 },  // 6: вниз
            { dx: 1, dy: 1 }   // 7: вправо-вниз
        ];

        const contour: Point[] = [];
        let current = { ...start };
        let prevDir = 0;

        do {
            contour.push({ ...current });
            visited[current.y][current.x] = true; // помечаем как посещённую

            let found = false;
            for (let i = 0; i < 8; i++) {
                const nextDir = (prevDir + 5 + i) % 8; // +5 для Moore
                const nx = current.x + directions[nextDir].dx;
                const ny = current.y + directions[nextDir].dy;
                if (nx >= 0 && nx < width && ny >= 0 && ny < height && mask[ny][nx]) {
                    current = { x: nx, y: ny };
                    prevDir = nextDir;
                    found = true;
                    break;
                }
            }
            if (!found) break;
        } while (current.x !== start.x || current.y !== start.y);

        return contour;
    }

    // ---------- Алгоритмы упрощения и сглаживания ----------

    private _distancePointSegment(p: Point, a: Point, b: Point): number {
        const ab = { x: b.x - a.x, y: b.y - a.y };
        const ap = { x: p.x - a.x, y: p.y - a.y };
        const abLenSq = ab.x * ab.x + ab.y * ab.y;
        if (abLenSq === 0) return Math.hypot(ap.x, ap.y);
        const t = (ap.x * ab.x + ap.y * ab.y) / abLenSq;
        const tClamped = Math.max(0, Math.min(1, t));
        const proj = { x: a.x + ab.x * tClamped, y: a.y + ab.y * tClamped };
        return Math.hypot(p.x - proj.x, p.y - proj.y);
    }

    private _douglasPeucker(points: Point[], epsilon: number): Point[] {
        if (points.length <= 2) return points.slice();
        let maxDist = 0;
        let index = 0;
        const start = points[0];
        const end = points[points.length - 1];
        for (let i = 1; i < points.length - 1; i++) {
            const dist = this._distancePointSegment(points[i], start, end);
            if (dist > maxDist) {
                maxDist = dist;
                index = i;
            }
        }
        if (maxDist > epsilon) {
            const left = this._douglasPeucker(points.slice(0, index + 1), epsilon);
            const right = this._douglasPeucker(points.slice(index), epsilon);
            return left.slice(0, -1).concat(right);
        } else {
            return [start, end];
        }
    }

    // Версия Chaikin с объектами Point (для обратной совместимости)
    private _chaikin(points: Point[], closed = true): Point[] {
        if (points.length < 3) return points;
        const newPoints: Point[] = [];
        for (let i = 0; i < points.length - 1; i++) {
            const p0 = points[i];
            const p1 = points[i + 1];
            newPoints.push(
                { x: 0.75 * p0.x + 0.25 * p1.x, y: 0.75 * p0.y + 0.25 * p1.y },
                { x: 0.25 * p0.x + 0.75 * p1.x, y: 0.25 * p0.y + 0.75 * p1.y }
            );
        }
        if (closed) {
            const pLast = points[points.length - 1];
            const pFirst = points[0];
            newPoints.push(
                { x: 0.75 * pLast.x + 0.25 * pFirst.x, y: 0.75 * pLast.y + 0.25 * pFirst.y },
                { x: 0.25 * pLast.x + 0.75 * pFirst.x, y: 0.25 * pLast.y + 0.75 * pFirst.y }
            );
        }
        return newPoints;
    }

    // Оптимизированная версия Chaikin с Float32Array
    private _chaikinFloat32(points: Float32Array<ArrayBuffer>, closed = true): Float32Array<ArrayBuffer> {
        const n = points.length / 2;
        if (n < 3) return points;
        const result: number[] = [];
        for (let i = 0; i < n - 1; i++) {
            const x0 = points[i * 2];
            const y0 = points[i * 2 + 1];
            const x1 = points[(i + 1) * 2];
            const y1 = points[(i + 1) * 2 + 1];
            result.push(0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1);
            result.push(0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1);
        }
        if (closed) {
            const x0 = points[(n - 1) * 2];
            const y0 = points[(n - 1) * 2 + 1];
            const x1 = points[0];
            const y1 = points[1];
            result.push(0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1);
            result.push(0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1);
        }
        return new Float32Array(result);
    }

    // Равномерная интерполяция вдоль кривой (работает с массивом Point)
    private _interpolateCurve(points: Point[], step: number, closed = true): Point[] {
        if (points.length < 2) return points;

        const lengths: number[] = [0];
        for (let i = 1; i < points.length; i++) {
            const dx = points[i].x - points[i - 1].x;
            const dy = points[i].y - points[i - 1].y;
            lengths.push(lengths[i - 1] + Math.hypot(dx, dy));
        }
        let totalLength = lengths[lengths.length - 1];
        if (closed) {
            const dx = points[0].x - points[points.length - 1].x;
            const dy = points[0].y - points[points.length - 1].y;
            totalLength += Math.hypot(dx, dy);
        }

        const result: Point[] = [];
        for (let d = 0; d < totalLength; d += step) {
            let seg = 0;
            while (seg < points.length - 1 && lengths[seg + 1] < d) seg++;
            const t = (d - lengths[seg]) / (lengths[seg + 1] - lengths[seg]);
            const p1 = points[seg];
            const p2 = points[seg + 1];
            result.push({ x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) });
        }
        return result;
    }

    // Рисование кружков на canvas (принимает массив Point)
    private _drawBlobsOnCanvas(baseCanvas: HTMLCanvasElement, points: Point[], params: any): HTMLCanvasElement {
        const width = baseCanvas.width;
        const height = baseCanvas.height;

        const blobCanvas = document.createElement('canvas');
        blobCanvas.width = width;
        blobCanvas.height = height;
        const blobGl = blobCanvas.getContext('webgl', { alpha: true, antialias: true });
        if (!blobGl) return baseCanvas;

        const ext = blobGl.getExtension('ANGLE_instanced_arrays');
        if (!ext) return baseCanvas;

        if (!this.blobProgram) {
            this.blobProgram = this._initBlobShader();
        }

        blobGl.viewport(0, 0, width, height);
        blobGl.useProgram(this.blobProgram!);

        // Преобразуем точки в нормализованные координаты
        const centers = new Float32Array(points.length * 2);
        for (let i = 0; i < points.length; i++) {
            centers[i * 2] = (points[i].x / (width - 1)) * 2 - 1;
            centers[i * 2 + 1] = (points[i].y / (height - 1)) * 2 - 1;
        }

        const centerBuffer = blobGl.createBuffer();
        blobGl.bindBuffer(blobGl.ARRAY_BUFFER, centerBuffer);
        blobGl.bufferData(blobGl.ARRAY_BUFFER, centers, blobGl.STATIC_DRAW);

        const centerLoc = blobGl.getAttribLocation(this.blobProgram!, "aCenter");
        blobGl.enableVertexAttribArray(centerLoc);
        blobGl.vertexAttribPointer(centerLoc, 2, blobGl.FLOAT, false, 0, 0);
        ext.vertexAttribDivisorANGLE(centerLoc, 1);

        const radius = params.blobRadius ?? 5;
        const color = SuperTransformer._parseColor(params.blobColor ?? [1, 1, 1, 1], [1, 1, 1, 1]);
        const opacity = params.blobOpacity ?? 1;

        blobGl.uniform1f(blobGl.getUniformLocation(this.blobProgram!, "uRadius"), radius);
        blobGl.uniform2f(blobGl.getUniformLocation(this.blobProgram!, "uResolution"), width, height);
        blobGl.uniform4f(blobGl.getUniformLocation(this.blobProgram!, "uColor"), color[0], color[1], color[2], color[3] * opacity);

        blobGl.clearColor(0, 0, 0, 0);
        blobGl.clear(blobGl.COLOR_BUFFER_BIT);
        ext.drawArraysInstancedANGLE(blobGl.TRIANGLE_STRIP, 0, 4, points.length);

        const resultCanvas = document.createElement('canvas');
        resultCanvas.width = width;
        resultCanvas.height = height;
        const resultCtx = resultCanvas.getContext('2d')!;
        resultCtx.drawImage(baseCanvas, 0, 0);
        resultCtx.drawImage(blobCanvas, 0, 0);

        return resultCanvas;
    }

    // ---------- Публичные методы для рендеринга с блобами ----------

    public renderWithBlobs(
        img: HTMLImageElement | HTMLCanvasElement,
        params: any,
        patch: PatchRect | null = null,
        fullSize: { w: number, h: number } | null = null,
        overrideDpr?: number
    ): HTMLCanvasElement {
        const tempCanvas = this.render(img, params, patch, fullSize, overrideDpr);
        const ctx = tempCanvas.getContext('2d');
        if (!ctx) return tempCanvas;

        const { width, height } = tempCanvas;
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        const threshold = 128;

        const points: Point[] = [];
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const idx = (y * width + x) * 4 + 3;
                if (data[idx] < threshold) continue;

                const neighbors = [
                    (y - 1) * width + x,
                    (y + 1) * width + x,
                    y * width + (x - 1),
                    y * width + (x + 1)
                ];
                let isEdge = false;
                for (const nIdx of neighbors) {
                    if (data[nIdx * 4 + 3] < threshold) {
                        isEdge = true;
                        break;
                    }
                }
                if (isEdge) {
                    points.push({ x, y });
                }
            }
        }

        if (points.length === 0) return tempCanvas;
        return this._drawBlobsOnCanvas(tempCanvas, points, params);
    }
    
    public extractContours(
        img: HTMLImageElement | HTMLCanvasElement,
        params: any,
        patch: PatchRect | null = null,
        fullSize: { w: number, h: number } | null = null,
        overrideDpr?: number
    ): Point[][] {
        const tempCanvas = this.render(img, params, patch, fullSize, overrideDpr);
        const ctx = tempCanvas.getContext('2d');
        if (!ctx) return [];
        const { width, height } = tempCanvas;
        const mask = this._getBinaryMask(ctx, width, height);
        return this._findAllContours(mask);
    }
    
    // Исправленный блок рендеринга с блобами
    public renderWithBlobsSmoothed(
        img: HTMLImageElement | HTMLCanvasElement,
        params: any,
        patch: PatchRect | null = null,
        fullSize: { w: number, h: number } | null = null,
        overrideDpr?: number
    ): HTMLCanvasElement {
        const tempCanvas = this.render(img, params, patch, fullSize, overrideDpr);
        const ctx = tempCanvas.getContext('2d');
        if (!ctx) return tempCanvas;

        const { width, height } = tempCanvas;
        const mask = this._getBinaryMask(ctx, width, height); // Сначала маска
        const contours = this._findAllContours(mask);       // Потом контуры

        let allPoints: Point[] = [];
        const useFloat32 = params.useFloat32Array ?? false;

        for (let contour of contours) {
            // 1. Упрощение (Douglas-Peucker)
            let processed: Point[] = this._douglasPeucker(contour, params.simplifyEpsilon ?? 2);

            // 2. Сглаживание (Chaikin)
            if (params.smoothIterations && params.smoothIterations > 0) {
                if (useFloat32) {
                    let floatPoints = new Float32Array(processed.length * 2);
                    for (let i = 0; i < processed.length; i++) {
                        floatPoints[i * 2] = processed[i].x;
                        floatPoints[i * 2 + 1] = processed[i].y;
                    }
                    for (let i = 0; i < params.smoothIterations; i++) {
                        floatPoints = this._chaikinFloat32(floatPoints, true);
                    }
                    processed = [];
                    for (let i = 0; i < floatPoints.length / 2; i++) {
                        processed.push({ x: floatPoints[i * 2], y: floatPoints[i * 2 + 1] });
                    }
                } else {
                    for (let i = 0; i < params.smoothIterations; i++) {
                        processed = this._chaikin(processed, true);
                    }
                }
            }

            // 3. Равномерный шаг (Интерполяция)
            if (params.blobStep && params.blobStep > 0) {
                processed = this._interpolateCurve(processed, params.blobStep, true);
            }

            allPoints = allPoints.concat(processed);
        }

        if (allPoints.length === 0) return tempCanvas;
        return this._drawBlobsOnCanvas(tempCanvas, allPoints, params);
    }
}
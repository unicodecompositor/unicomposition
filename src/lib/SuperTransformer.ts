/** * SuperTransformer.ts (Production Ready)
 * GPU-процессор с поддержкой Warp, динамического LOD обводки и авто-парсинга цветов.
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
}

export interface PatchRect { x: number; y: number; w: number; h: number; }

export class SuperTransformer {
    private canvas: HTMLCanvasElement;
    private gl: WebGLRenderingContext;
    private program: WebGLProgram;
    private texture: WebGLTexture;
    private buffer: WebGLBuffer;

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
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
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
            ? [patch.x/fullSize.w, patch.y/fullSize.h, patch.w/fullSize.w, patch.h/fullSize.h]
            : [(1.0 - expand)/2.0, (1.0 - expand)/2.0, expand, expand];

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
        gl.uniform4fv(gl.getUniformLocation(this.program, "strokeRGBA"), new Float32Array(sCol ?? [1,1,1,1]));

        // Авто-парсинг цвета фона (b)
        let bCol = params.backgroundColor || params.b;
        if (typeof bCol === 'string') bCol = SuperTransformer.hslToRgb01(bCol);
        gl.uniform4fv(gl.getUniformLocation(this.program, "bgColor"), new Float32Array(bCol ?? [0,0,0,0]));

        const pLoc = gl.getAttribLocation(this.program, "p");
        gl.enableVertexAttribArray(pLoc);
        gl.vertexAttribPointer(pLoc, 2, gl.FLOAT, false, 0, 0);

        gl.clearColor(0,0,0,0);
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
            if (t < 0) t += 1; if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        return [hue2rgb(p, q, h + 1/3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1/3), a];
    }
}
/**
 * SuperTransformer: GPU-accelerated transformation using WebGL
 * Supports trapezoid (taper), parallelogram, and rotation transformations
 */

export class SuperTransformer {
    private canvas: HTMLCanvasElement;
    private gl: WebGLRenderingContext;
    private program: WebGLProgram;
    private texture: WebGLTexture;

    constructor() {
        this.canvas = document.createElement('canvas');
        const glContext = this.canvas.getContext('webgl', { alpha: true, antialias: true });
        if (!glContext) {
            throw new Error('WebGL not supported');
        }
        this.gl = glContext;
        this.program = this._initShader();
        this.texture = this._initTexture();
        this._initBuffer();
    }

    private _initShader(): WebGLProgram {
        const gl = this.gl;
        const vs = `
            attribute vec2 p;
            varying vec2 v;
            void main() {
                v = p * 0.5 + 0.5;
                gl_Position = vec4(p, 0.0, 1.0);
            }
        `;

        const fs = `
            precision highp float;
            varying vec2 v;
            uniform sampler2D t;
            uniform vec2 res;
            uniform int mode;
            uniform float a, f, o, s;
            uniform vec4 win;

            vec2 transform(vec2 pos) {
                float r = radians(a);
                vec2 d = vec2(cos(r), sin(r)), pP = vec2(-d.y, d.x);
                
                vec2 globalPos = pos * win.zw + win.xy;
                vec2 p = (globalPos - 0.5) / max(s, 0.001);

                if (mode == 0) {
                    p -= pP * o;
                    float al = dot(p, d), sd = dot(p, pP);
                    float k = 1.0 - (al * f * 2.0);
                    if (k <= 0.001) return vec2(-1.0);
                    return (d * al) + (pP * (sd / k + o)) + 0.5;
                }
                else if (mode == 1) {
                    return (globalPos - 0.5) - d * dot(globalPos - 0.5, d) * f + 0.5;
                }
                else {
                    return mat2(d.x, d.y, -d.y, d.x) * p + 0.5;
                }
            }

            void main() {
                vec2 step = 0.5 / res;
                vec4 acc = vec4(0.0);
                float vld = 0.0;
                vec2 off[4];
                off[0] = vec2(-step.x, -step.y);
                off[1] = vec2(step.x, -step.y);
                off[2] = vec2(-step.x, step.y);
                off[3] = vec2(step.x, step.y);

                for (int i = 0; i < 4; i++) {
                    vec2 uv = transform(v + off[i]);
                    if (uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) {
                        acc += texture2D(t, uv);
                        vld += 1.0;
                    }
                }
                if (vld == 0.0) discard;

                float fade = 1.0;
                if (mode == 0) {
                    vec2 gV = v * win.zw + win.xy;
                    fade = smoothstep(0.0, 0.08, 1.0 - (dot(gV - 0.5, vec2(cos(radians(a)), sin(radians(a)))) * f * 2.0));
                }
                gl_FragColor = vec4((acc / 4.0).rgb, (acc / 4.0).a * fade * (vld / 4.0));
            }
        `;

        const prog = gl.createProgram();
        if (!prog) throw new Error('Failed to create WebGL program');

        const compileShader = (source: string, type: number) => {
            const shader = gl.createShader(type);
            if (!shader) throw new Error('Failed to create shader');
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                throw new Error(`Shader compilation error: ${gl.getShaderInfoLog(shader)}`);
            }
            return shader;
        };

        const vertexShader = compileShader(vs, gl.VERTEX_SHADER);
        const fragmentShader = compileShader(fs, gl.FRAGMENT_SHADER);

        gl.attachShader(prog, vertexShader);
        gl.attachShader(prog, fragmentShader);
        gl.linkProgram(prog);

        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            throw new Error(`Program linking error: ${gl.getProgramInfoLog(prog)}`);
        }

        return prog;
    }

    private _initTexture(): WebGLTexture {
        const gl = this.gl;
        const t = gl.createTexture();
        if (!t) throw new Error('Failed to create texture');
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        return t;
    }

    private _initBuffer(): void {
        const gl = this.gl;
        const b = gl.createBuffer();
        if (!b) throw new Error('Failed to create buffer');
        gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.bufferData(
            gl.ARRAY_BUFFER,
            new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
            gl.STATIC_DRAW
        );

        const posLoc = gl.getAttribLocation(this.program, 'p');
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    }

    /**
     * Render transformed image to canvas
     * @param img Source image
     * @param params Transformation parameters { mode, angle, force, offset, scale }
     * @param patch Optional region { x, y, w, h } for selective rendering
     * @param fullSize Optional full canvas size for patch normalization
     */
    render(
        img: HTMLImageElement | HTMLCanvasElement | OffscreenCanvas,
        params: {
            mode?: number;
            angle?: number;
            force?: number;
            offset?: number;
            scale?: number;
        },
        patch?: { x: number; y: number; w: number; h: number },
        fullSize?: { w: number; h: number }
    ): HTMLCanvasElement {
        const { mode = 0, angle = 0, force = 0, offset = 0, scale = 1 } = params;
        const gl = this.gl;

        // Set canvas size to patch or full image
        this.canvas.width = patch ? patch.w : img.width;
        this.canvas.height = patch ? patch.h : img.height;
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);

        gl.useProgram(this.program);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);

        // Handle different image types
        if (img instanceof OffscreenCanvas) {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        } else {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        }

        // Calculate normalized window [0..1]
        const win = patch && fullSize
            ? [
                patch.x / fullSize.w,
                patch.y / fullSize.h,
                patch.w / fullSize.w,
                patch.h / fullSize.h
            ]
            : [0, 0, 1, 1];

        // Set uniforms
        gl.uniform1i(gl.getUniformLocation(this.program, 'mode'), mode);
        gl.uniform1f(gl.getUniformLocation(this.program, 'a'), angle);
        gl.uniform1f(gl.getUniformLocation(this.program, 'f'), force);
        gl.uniform1f(gl.getUniformLocation(this.program, 'o'), offset);
        gl.uniform1f(gl.getUniformLocation(this.program, 's'), scale);
        gl.uniform4fv(gl.getUniformLocation(this.program, 'win'), new Float32Array(win));
        gl.uniform2f(gl.getUniformLocation(this.program, 'res'), img.width, img.height);

        // Render
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        return this.canvas;
    }
}

// Singleton instance
let transformerInstance: SuperTransformer | null = null;

export function getTransformer(): SuperTransformer {
    if (!transformerInstance) {
        try {
            transformerInstance = new SuperTransformer();
        } catch (e) {
            console.warn('WebGL not available, falling back to CPU rendering:', e);
            return null as any;
        }
    }
    return transformerInstance;
}

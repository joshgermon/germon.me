/**
 * GlassScript — liquid-glass handwriting over a photo wallpaper, in WebGL2.
 * A copy of widgets-system/glass-clock.ts whose input is a silhouette field
 * (the pen stroke so far, updated a dirty rect at a time) instead of set
 * text. From the original:
 *  - the height field is blurred in Float32 (not 8-bit canvas alpha), so the
 *    refraction has no terracing / stair-stepped contours;
 *  - a smooth "pillow" profile (sin easing) instead of a hard clamp, so there's
 *    no crease line inside each stroke;
 *  - only the text's bounding box is processed and uploaded (RGBA16F, linear);
 *  - no procedural gradient — the wallpaper photo is the only backdrop;
 *  - renders on demand; the caller owns the frame loop.
 */

const VERT = `#version 300 es
in vec2 a; void main(){ gl_Position = vec4(a,0.,1.); }`;

const FRAG = `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 uRes; uniform float uDpr; uniform vec2 uLight; uniform vec2 uShift; uniform vec4 uBox;
uniform sampler2D uMask; uniform sampler2D uPhoto;
uniform float uRefraction, uDispersion, uSpec, uShadow, uAlpha, uFrost, uSlope, uTime, uSoft;

vec3 wall(vec2 p, float lod){ return textureLod(uPhoto, clamp(p / uRes, 0.001, 0.999), lod).rgb; }
vec4 M(vec2 p){
  vec2 uv = (p - uShift - uBox.xy) / uBox.zw;
  if (uv.x < 0. || uv.y < 0. || uv.x > 1. || uv.y > 1.) return vec4(0.);
  return texture(uMask, uv);
}
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main(){
  vec2 p = vec2(gl_FragCoord.x, uRes.y * uDpr - gl_FragCoord.y) / uDpr;
  vec4 m = M(p);
  float shape = m.g * uAlpha;
  vec3 base = wall(p, 0.);
  // Soft contact shadow cast down-right, like a raised glass slab — blurred
  // here from the height field (9 taps), so the CPU only blurs once.
  float sh = 0.;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) sh += M(p - vec2(2., 9.) + vec2(float(i), float(j)) * uSoft).r;
  sh /= 9.;
  base *= 1. - uShadow * 0.2 * sh * (1. - shape) * uAlpha;
  if (shape < 0.001) { o = vec4(base, 1.); return; }

  float e = 0.75;
  float hL = M(p - vec2(e, 0.)).r;
  float hR = M(p + vec2(e, 0.)).r;
  float hU = M(p - vec2(0., e)).r;
  float hD = M(p + vec2(0., e)).r;
  vec2 g = vec2(hR - hL, hD - hU) / (2. * e) * uSlope;
  vec3 n = normalize(vec3(-g, 1.));
  float h = m.r;

  vec3 I = vec3(0., 0., -1.);
  vec3 tr = refract(I, n, 1. / (1.5 - uDispersion));
  vec3 tg = refract(I, n, 1. / 1.5);
  vec3 tb = refract(I, n, 1. / (1.5 + uDispersion));
  float k = uRefraction * (0.55 + h * 0.6);
  vec3 col;
  col.r = wall(p + tr.xy / max(-tr.z, 0.25) * k, 0.6).r;
  col.g = wall(p + tg.xy / max(-tg.z, 0.25) * k, 0.6).g;
  col.b = wall(p + tb.xy / max(-tb.z, 0.25) * k, 0.6).b;
  col = col * 1.03 + 0.012;
  col = mix(col, vec3(1.), uFrost * (0.6 + 0.4 * h));

  vec3 L = normalize(vec3(uLight - p, 600.));
  vec3 V = vec3(0., 0., 1.);
  vec3 H = normalize(L + V);
  float edge = smoothstep(0.03, 0.4, length(g));
  float spec = pow(max(dot(n, H), 0.), 180.) * 1.2 * (0.25 + 0.75 * edge) + pow(max(dot(n, H), 0.), 18.) * 0.05;
  float fres = pow(1. - n.z, 2.4);
  vec3 R = reflect(-V, n);
  vec3 env = mix(vec3(1.0, 0.99, 0.97), vec3(0.45, 0.42, 0.40), smoothstep(-0.4, 0.8, R.y));
  col = mix(col, env, clamp(fres * 0.75, 0., 0.65));
  col += spec * uSpec;
  // Darker lip on the side away from the light — gives the slab a thickness.
  vec2 ld = normalize(uLight - p);
  col *= 1. - 0.12 * edge * max(0., -dot(normalize(g + 1e-5), ld));
  col += (hash(p + uTime) - 0.5) * 0.012;
  o = vec4(mix(base, col, shape), 1.);
}`;

export type ClockParams = { refraction: number; dispersion: number; specular: number; shadow: number; frost: number; slope: number };

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
  return s;
}

/** Zero-padded separable box blur, in place-ish (src → tmp → dst). */
function boxBlur(src: Float32Array, dst: Float32Array, w: number, h: number, r: number) {
  const tmp = new Float32Array(w * h);
  const inv = 1 / (2 * r + 1);
  const pre = new Float32Array(Math.max(w, h) + 1);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    pre[0] = 0;
    for (let x = 0; x < w; x++) pre[x + 1] = pre[x] + src[o + x];
    for (let x = 0; x < w; x++) tmp[o + x] = (pre[Math.min(w, x + r + 1)] - pre[Math.max(0, x - r)]) * inv;
  }
  for (let x = 0; x < w; x++) {
    pre[0] = 0;
    for (let y = 0; y < h; y++) pre[y + 1] = pre[y] + tmp[y * w + x];
    for (let y = 0; y < h; y++) dst[y * w + x] = (pre[Math.min(h, y + r + 1)] - pre[Math.max(0, y - r)]) * inv;
  }
}
const boxR = (sigma: number) => Math.max(1, Math.round(Math.sqrt((12 * sigma * sigma) / 3 + 1) / 2));
function gauss(src: Float32Array, w: number, h: number, sigma: number) {
  // Three box passes ≈ gaussian.
  const r = boxR(sigma);
  const a = new Float32Array(w * h);
  const b = new Float32Array(w * h);
  boxBlur(src, a, w, h, r);
  boxBlur(a, b, w, h, r);
  boxBlur(b, a, w, h, r);
  return a;
}

export class GlassScript {
  readonly canvas: HTMLCanvasElement;
  params: ClockParams = { refraction: 40, dispersion: 0.02, specular: 0.9, shadow: 0.6, frost: 0.06, slope: 1.6 };
  light = { x: 0, y: 0 };
  shift = { x: 0, y: 0 };
  alpha = 1;
  #gl: WebGL2RenderingContext;
  #prog: WebGLProgram;
  #u: Record<string, WebGLUniformLocation | null> = {};
  #mask: WebGLTexture;
  #photo: WebGLTexture;
  #box = { x: 0, y: 0, w: 1, h: 1 };
  #w = 0;
  #h = 0;
  #dpr = 1;
  #t0 = performance.now();
  #field: { W: number; H: number; k: number; depth: number } | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL2 unavailable');
    this.#gl = gl;
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link');
    this.#prog = prog;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    for (const n of ['uRes', 'uDpr', 'uLight', 'uShift', 'uBox', 'uMask', 'uPhoto', 'uRefraction', 'uDispersion', 'uSpec', 'uShadow', 'uAlpha', 'uFrost', 'uSlope', 'uTime', 'uSoft']) {
      this.#u[n] = gl.getUniformLocation(prog, n);
    }
    const mk = () => {
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    this.#mask = mk();
    this.#photo = mk();
    this.resize();
  }

  get dpr() {
    return this.#dpr;
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.#dpr = Math.min(devicePixelRatio || 1, 2);
    this.#w = r.width;
    this.#h = r.height;
    this.canvas.width = Math.max(1, Math.round(r.width * this.#dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * this.#dpr));
  }

  /** Cover-fit the photo exactly like `object-fit: cover` on the viewport. */
  setPhoto(img: HTMLImageElement) {
    const W = Math.min(2400, this.canvas.width);
    const H = Math.round(W * (this.#h / this.#w || 1));
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d')!;
    const s = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    const w = img.naturalWidth * s;
    const h = img.naturalHeight * s;
    ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
    const gl = this.#gl;
    gl.bindTexture(gl.TEXTURE_2D, this.#photo);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  }

  /**
   * Start an empty field: a W×H texel height map covering the CSS-px
   * rectangle `box`. `depth` (CSS px) sets the bevel width.
   */
  clear(W: number, H: number, box: { x: number; y: number; w: number; h: number }, depth: number) {
    this.#field = { W, H, k: W / box.w, depth };
    const gl = this.#gl;
    gl.bindTexture(gl.TEXTURE_2D, this.#mask);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, W, H, 0, gl.RGBA, gl.FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    this.#box = { ...box };
    this.params.slope = depth * 1.15;
  }

  /**
   * Rebuild the field inside `rect` (texels) from the silhouette drawn in
   * `ctx` (alpha = coverage, same size as the field). Only the dirty rect plus
   * the blur's reach is read, blurred and uploaded — so a growing pen stroke
   * costs a few thousand texels a frame, not the whole word.
   */
  paint(ctx: CanvasRenderingContext2D, rect: { x: number; y: number; w: number; h: number }) {
    const f = this.#field;
    if (!f) return;
    const { W, H, k, depth } = f;
    const sH = depth * k * 0.55;
    const m = 3 * boxR(sH) + 1; // three box passes reach 3r
    // New ink changes the blur up to m texels away (write region), which in turn
    // reads up to m texels further (read region).
    const x0 = Math.max(0, Math.floor(rect.x) - m), y0 = Math.max(0, Math.floor(rect.y) - m);
    const x1 = Math.min(W, Math.ceil(rect.x + rect.w) + m), y1 = Math.min(H, Math.ceil(rect.y + rect.h) + m);
    if (x1 <= x0 || y1 <= y0) return;
    const ex0 = Math.max(0, x0 - m), ey0 = Math.max(0, y0 - m);
    const ew = Math.min(W, x1 + m) - ex0, eh = Math.min(H, y1 + m) - ey0;
    const px = ctx.getImageData(ex0, ey0, ew, eh).data;
    const sil = new Float32Array(ew * eh);
    for (let i = 0; i < sil.length; i++) sil[i] = px[i * 4 + 3] / 255;
    const height = gauss(sil, ew, eh, sH);
    const rw = x1 - x0, rh = y1 - y0;
    const out = new Float32Array(rw * rh * 4);
    for (let y = 0; y < rh; y++) {
      for (let x = 0; x < rw; x++) {
        const si = (y + y0 - ey0) * ew + (x + x0 - ex0);
        const o = (y * rw + x) * 4;
        // Pillow profile: rounds to a flat top without a crease.
        const b = Math.min(1, height[si] * 1.25);
        out[o] = Math.sin((b * Math.PI) / 2) * sil[si];
        out[o + 1] = sil[si];
        out[o + 3] = 1;
      }
    }
    const gl = this.#gl;
    gl.bindTexture(gl.TEXTURE_2D, this.#mask);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x0, y0, rw, rh, gl.RGBA, gl.FLOAT, out);
  }

  render() {
    const gl = this.#gl;
    const u = this.#u;
    const p = this.params;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.#prog);
    gl.uniform2f(u.uRes, this.#w, this.#h);
    gl.uniform1f(u.uDpr, this.#dpr);
    gl.uniform2f(u.uLight, this.light.x, this.light.y);
    gl.uniform2f(u.uShift, this.shift.x, this.shift.y);
    gl.uniform4f(u.uBox, this.#box.x, this.#box.y, this.#box.w, this.#box.h);
    gl.uniform1f(u.uAlpha, this.alpha);
    gl.uniform1f(u.uTime, ((performance.now() - this.#t0) / 1000) % 100);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.#mask);
    gl.uniform1i(u.uMask, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.#photo);
    gl.uniform1i(u.uPhoto, 1);
    gl.uniform1f(u.uRefraction, p.refraction);
    gl.uniform1f(u.uDispersion, p.dispersion);
    gl.uniform1f(u.uSpec, p.specular);
    gl.uniform1f(u.uShadow, p.shadow);
    gl.uniform1f(u.uFrost, p.frost);
    gl.uniform1f(u.uSlope, p.slope);
    gl.uniform1f(u.uSoft, (this.#field?.depth ?? 8) * 0.9);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}

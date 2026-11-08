/**
 * LiquidGL — physically-flavoured liquid glass in WebGL2.
 *
 * DOM glass can only refract what's directly under it, and only Chromium/WebKit
 * agree on how. When we own the background (a hero, a wallpaper) we can do the
 * real thing in a shader, cross-browser:
 *
 *  - Shapes are rounded-rect SDFs merged with a smooth-min, so neighbouring
 *    blobs fuse like liquid when they get close.
 *  - A squircle height field gives a 3D normal; the view ray is refracted with
 *    GLSL `refract` using a *different IOR per colour channel* → dispersion /
 *    rainbow fringing at the bezel.
 *  - Frost = sampling a mipmapped background at a higher LOD.
 *  - Fresnel reflection of a soft environment + Blinn-Phong specular from a
 *    light that follows the pointer.
 *  - Thin-film iridescence on the rim for the oil-slick shimmer.
 *
 * The background is either a procedural mesh gradient (animated, no texture)
 * or any canvas/image (call `setBackground` then `invalidate()` when it changes).
 */

export type Shape = {
  x: number; // centre, css px
  y: number;
  w: number;
  h: number;
  r: number; // corner radius
  /** Smooth-union reach in px; higher = gooier merges. */
  k?: number;
};

export type LiquidParams = {
  refraction: number; // px of bend at the steepest bezel
  dispersion: number; // 0..0.2 IOR spread between R and B
  frost: number; // mip level for the body
  bezel: number; // px width of curved edge
  iridescence: number; // 0..1
  specular: number; // 0..2
  tint: [number, number, number, number];
  shadow: number; // 0..1
  /** 0 = procedural only, 1 = texture only. */
  textureMix: number;
  /** 4 RGB colours for the procedural gradient. */
  palette: [number, number, number][];
  /** 0..1 grain on the background. */
  grain: number;
};

const MAX_SHAPES = 12;

const VERT = `#version 300 es
in vec2 a; void main(){ gl_Position = vec4(a,0.,1.); }`;

const FRAG = `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 uRes;      // css px
uniform float uDpr;
uniform float uTime;
uniform vec2 uLight;    // css px
uniform sampler2D uTex;
uniform float uTexMix;
uniform vec2 uTexSize;  // css px the texture covers (== uRes normally)
uniform int uCount;
uniform vec4 uS[${MAX_SHAPES}];  // cx, cy, hw, hh
uniform vec2 uR[${MAX_SHAPES}];  // radius, k
uniform float uRefraction, uDispersion, uFrost, uBezel, uIrid, uSpec, uShadow, uGrain;
uniform vec4 uTint;
uniform vec3 uPal[4];

float sdBox(vec2 p, vec2 c, vec2 hs, float r){
  vec2 q = abs(p - c) - hs + r;
  return length(max(q, 0.)) + min(max(q.x, q.y), 0.) - r;
}
float smin(float a, float b, float k){
  if (k <= 0.) return min(a, b);
  float h = clamp(0.5 + 0.5*(b - a)/k, 0., 1.);
  return mix(b, a, h) - k*h*(1. - h);
}
float scene(vec2 p){
  float d = 1e5;
  for (int i = 0; i < ${MAX_SHAPES}; i++){
    if (i >= uCount) break;
    float s = sdBox(p, uS[i].xy, uS[i].zw, uR[i].x);
    d = smin(d, s, uR[i].y);
  }
  return d;
}

// Procedural mesh gradient: four drifting colour fields.
vec3 meshBg(vec2 uv){
  float t = uTime * 0.05;
  vec2 c0 = vec2(0.2 + 0.15*sin(t*1.1), 0.25 + 0.1*cos(t*0.9));
  vec2 c1 = vec2(0.8 + 0.1*cos(t*0.7), 0.2 + 0.15*sin(t*1.3));
  vec2 c2 = vec2(0.3 + 0.2*cos(t*0.8), 0.85 + 0.1*sin(t*1.2));
  vec2 c3 = vec2(0.85 + 0.1*sin(t*1.0), 0.8 + 0.1*cos(t*0.6));
  float a = uRes.x / uRes.y;
  vec2 p = vec2(uv.x * a, uv.y);
  float w0 = exp(-6.*dot(p - c0*vec2(a,1.), p - c0*vec2(a,1.)));
  float w1 = exp(-5.*dot(p - c1*vec2(a,1.), p - c1*vec2(a,1.)));
  float w2 = exp(-5.*dot(p - c2*vec2(a,1.), p - c2*vec2(a,1.)));
  float w3 = exp(-6.*dot(p - c3*vec2(a,1.), p - c3*vec2(a,1.)));
  float s = w0 + w1 + w2 + w3 + 0.0001;
  return (uPal[0]*w0 + uPal[1]*w1 + uPal[2]*w2 + uPal[3]*w3) / s;
}
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

vec3 bg(vec2 p, float lod){
  vec2 uv = p / uRes;
  vec3 c = meshBg(uv);
  if (uTexMix > 0.){
    vec2 tuv = clamp(p / uTexSize, vec2(0.001), vec2(0.999));
    vec4 tx = textureLod(uTex, tuv, lod);
    c = mix(c, tx.rgb, tx.a * uTexMix);
  }
  return c;
}

// Squircle bezel: x in [0,1] from edge to flat top.
float prof(float x){ return pow(1. - pow(1. - clamp(x,0.,1.), 4.), 0.25); }

void main(){
  vec2 p = vec2(gl_FragCoord.x, uRes.y*uDpr - gl_FragCoord.y) / uDpr;
  float sd = scene(p);
  vec3 base = bg(p, 0.);

  // Soft drop shadow, offset down and away from the light.
  vec2 ld = normalize(p - uLight + 1e-4);
  float sh = scene(p - vec2(0., 10.) - ld * 4.);
  base *= 1. - uShadow * 0.35 * exp(-max(sh, 0.) / 22.) * step(0., sd);

  if (sd > 1.5){
    float g = (hash(p + uTime) - 0.5) * uGrain * 0.06;
    o = vec4(base + g, 1.);
    return;
  }

  // Height field + normal.
  float depth = -sd;
  float x = depth / uBezel;
  float e = 0.75;
  vec2 grad = vec2(scene(p + vec2(e,0.)) - scene(p - vec2(e,0.)),
                   scene(p + vec2(0.,e)) - scene(p - vec2(0.,e))) / (2.*e);
  float dx = 0.002;
  float slope = (prof(x + dx) - prof(x - dx)) / (2.*dx); // d height / d x
  slope = min(slope, 12.);
  // height decreases toward the edge, so the surface gradient points inward (-grad).
  vec2 hgrad = -grad * slope;
  vec3 n = normalize(vec3(-hgrad, 1.));

  // Per-channel refraction (dispersion).
  vec3 I = vec3(0., 0., -1.);
  float thick = uRefraction;
  vec3 tr = refract(I, n, 1. / (1.50 - uDispersion));
  vec3 tg = refract(I, n, 1. / 1.50);
  vec3 tb = refract(I, n, 1. / (1.50 + uDispersion));
  float edgeW = 1. - prof(x); // stronger near the rim
  float lod = mix(uFrost, uFrost * 0.6, edgeW);
  vec2 offR = tr.xy / max(-tr.z, 0.2) * thick;
  vec2 offG = tg.xy / max(-tg.z, 0.2) * thick;
  vec2 offB = tb.xy / max(-tb.z, 0.2) * thick;
  vec3 col;
  col.r = bg(p + offR, lod).r;
  col.g = bg(p + offG, lod).g;
  col.b = bg(p + offB, lod).b;

  // Body: slight saturation + brightness lift, then tint.
  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(luma), col, 1.25) * 1.04;
  col = mix(col, uTint.rgb, uTint.a);

  // Lighting.
  vec3 L = normalize(vec3(uLight - p, 260.));
  vec3 V = vec3(0., 0., 1.);
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(n, H), 0.), 120.) * 1.2 + pow(max(dot(n, H), 0.), 16.) * 0.08;
  float fres = pow(1. - max(dot(n, V), 0.), 3.);
  // Environment: bright sky above, darker ground below.
  vec3 R = reflect(-V, n);
  vec3 env = mix(vec3(0.85, 0.9, 1.0), vec3(0.25, 0.25, 0.3), smoothstep(-0.4, 0.6, R.y));
  col = mix(col, env, fres * 0.55);
  col += spec * uSpec;

  // Thin-film iridescence along the rim.
  float rim = smoothstep(1., 0., x) * fres;
  float ang = atan(grad.y, grad.x + 1e-4);
  float film = depth * 0.09 + ang * 0.35 + dot(L.xy, grad) * 0.6 + uTime * 0.03;
  vec3 irid = 0.5 + 0.5 * cos(6.2831 * (film + vec3(0., 0.33, 0.67)));
  col += irid * rim * uIrid * 0.55;

  // Crisp inner rim line facing the light, darker lip opposite (iOS 27 edge).
  float rimLine = smoothstep(1.6, 0., depth);
  float facing = dot(normalize(grad + 1e-5), normalize(uLight - p));
  col += rimLine * max(facing, 0.) * 0.6;
  col *= 1. - rimLine * max(-facing, 0.) * 0.18;

  float a = smoothstep(0.75, -0.75, sd);
  o = vec4(mix(base, col, a), 1.);
}`;

const defaults: LiquidParams = {
  refraction: 46,
  dispersion: 0.06,
  frost: 1.5,
  bezel: 30,
  iridescence: 0.6,
  specular: 1,
  tint: [1, 1, 1, 0.06],
  shadow: 0.6,
  textureMix: 0,
  palette: [
    [0.06, 0.06, 0.07],
    [0.12, 0.12, 0.13],
    [0.04, 0.04, 0.05],
    [0.09, 0.09, 0.1],
  ],
  grain: 0.5,
};

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
  return s;
}

export class LiquidGL {
  readonly canvas: HTMLCanvasElement;
  shapes: Shape[] = [];
  light = { x: 0, y: 0 };
  params: LiquidParams;
  /** If false, only renders when `invalidate()` is called (static scenes). */
  animate = true;

  #gl: WebGL2RenderingContext;
  #prog: WebGLProgram;
  #u: Record<string, WebGLUniformLocation | null> = {};
  #tex: WebGLTexture;
  #bgSource: TexImageSource | null = null;
  #raf = 0;
  #running = false;
  #visible = true;
  #dirty = true;
  #t0 = performance.now();
  #dpr = 1;
  #w = 0;
  #h = 0;
  #ro: ResizeObserver;
  #io: IntersectionObserver;
  onFrame?: (t: number) => void;

  static supported() {
    try {
      return !!document.createElement('canvas').getContext('webgl2');
    } catch {
      return false;
    }
  }

  constructor(canvas: HTMLCanvasElement, params: Partial<LiquidParams> = {}) {
    this.canvas = canvas;
    this.params = { ...defaults, ...params };
    const gl = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: false, alpha: false });
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
    for (const n of [
      'uRes', 'uDpr', 'uTime', 'uLight', 'uTex', 'uTexMix', 'uTexSize', 'uCount', 'uS', 'uR',
      'uRefraction', 'uDispersion', 'uFrost', 'uBezel', 'uIrid', 'uSpec', 'uShadow', 'uGrain', 'uTint', 'uPal',
    ]) {
      this.#u[n] = gl.getUniformLocation(prog, n);
    }
    this.#tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.#tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));

    this.#ro = new ResizeObserver(() => this.#resize());
    this.#ro.observe(canvas);
    this.#io = new IntersectionObserver(([e]) => {
      this.#visible = e.isIntersecting;
      if (this.#visible) this.#kick();
    });
    this.#io.observe(canvas);
    this.#resize();
  }

  get width() {
    return this.#w;
  }
  get height() {
    return this.#h;
  }

  setBackground(src: TexImageSource | null) {
    this.#bgSource = src;
    this.uploadBackground();
  }

  /** Re-upload the background source (call after redrawing a canvas source). */
  uploadBackground() {
    const gl = this.#gl;
    if (!this.#bgSource) return;
    gl.bindTexture(gl.TEXTURE_2D, this.#tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.#bgSource);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.invalidate();
  }

  invalidate() {
    this.#dirty = true;
    this.#kick();
  }

  start() {
    this.#running = true;
    this.#kick();
  }

  stop() {
    this.#running = false;
    cancelAnimationFrame(this.#raf);
    this.#raf = 0;
  }

  destroy() {
    this.stop();
    this.#ro.disconnect();
    this.#io.disconnect();
  }

  #kick() {
    if (!this.#running || this.#raf || !this.#visible) return;
    this.#raf = requestAnimationFrame((t) => this.#frame(t));
  }

  #resize() {
    const r = this.canvas.getBoundingClientRect();
    this.#dpr = Math.min(devicePixelRatio || 1, 2);
    this.#w = r.width;
    this.#h = r.height;
    this.canvas.width = Math.max(1, Math.round(r.width * this.#dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * this.#dpr));
    this.invalidate();
  }

  #frame(now: number) {
    this.#raf = 0;
    const t = (now - this.#t0) / 1000;
    this.onFrame?.(t);
    if (this.animate || this.#dirty) this.render(t);
    this.#dirty = false;
    if (this.#running && this.#visible && (this.animate || this.onFrame)) this.#kick();
  }

  render(t = (performance.now() - this.#t0) / 1000) {
    const gl = this.#gl;
    const u = this.#u;
    const p = this.params;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.#prog);
    gl.uniform2f(u.uRes, this.#w, this.#h);
    gl.uniform1f(u.uDpr, this.#dpr);
    gl.uniform1f(u.uTime, t);
    gl.uniform2f(u.uLight, this.light.x, this.light.y);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.#tex);
    gl.uniform1i(u.uTex, 0);
    gl.uniform1f(u.uTexMix, this.#bgSource ? p.textureMix : 0);
    gl.uniform2f(u.uTexSize, this.#w, this.#h);
    const n = Math.min(this.shapes.length, MAX_SHAPES);
    const s = new Float32Array(MAX_SHAPES * 4);
    const r = new Float32Array(MAX_SHAPES * 2);
    for (let i = 0; i < n; i++) {
      const sh = this.shapes[i];
      s.set([sh.x, sh.y, sh.w / 2, sh.h / 2], i * 4);
      r.set([Math.min(sh.r, sh.w / 2, sh.h / 2), sh.k ?? 0], i * 2);
    }
    gl.uniform1i(u.uCount, n);
    gl.uniform4fv(u.uS, s);
    gl.uniform2fv(u.uR, r);
    gl.uniform1f(u.uRefraction, p.refraction);
    gl.uniform1f(u.uDispersion, p.dispersion);
    gl.uniform1f(u.uFrost, p.frost);
    gl.uniform1f(u.uBezel, p.bezel);
    gl.uniform1f(u.uIrid, p.iridescence);
    gl.uniform1f(u.uSpec, p.specular);
    gl.uniform1f(u.uShadow, p.shadow);
    gl.uniform1f(u.uGrain, p.grain);
    gl.uniform4fv(u.uTint, p.tint);
    gl.uniform3fv(u.uPal, p.palette.flat());
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}

/**
 * GlassTypeGL — liquid-glass *lettering* (the iOS 26/27 lock-screen clock).
 *
 * Text is drawn into a 2D canvas twice: once sharp (the glass silhouette) and
 * once blurred (a smooth height field — thick in the middle of each stroke,
 * thinning to the edges). The shader takes the gradient of that height field
 * as a surface normal, refracts the wallpaper through it per colour channel
 * (dispersion) and adds Fresnel, specular and a thin-film rim.
 */

export type TypeParams = {
  refraction: number;
  dispersion: number;
  specular: number;
  iridescence: number;
  shadow: number;
  palette: [number, number, number][];
  /** 0..1, how much of the photo texture shows vs the procedural gradient. */
  photoMix: number;
  /** Background blur (mip level) behind the whole scene, e.g. when unlocked. */
  bgBlur: number;
  /** Global brightness of the wallpaper. */
  dim: number;
  /** Brightness of the wallpaper *outside* the lettering (0 = black, the type becomes a window onto the photo). */
  outside: number;
  /** Blur (mip level) of the wallpaper outside the lettering. */
  outsideBlur: number;
};

const VERT = `#version 300 es
in vec2 a; void main(){ gl_Position = vec4(a,0.,1.); }`;

const FRAG = `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 uRes; uniform float uDpr; uniform float uTime; uniform vec2 uLight;
uniform sampler2D uMask; uniform sampler2D uPhoto;
uniform float uRefraction, uDispersion, uSpec, uIrid, uShadow, uPhotoMix, uBgBlur, uDim, uOutside, uOutsideBlur;
uniform vec3 uPal[4];
uniform vec2 uParallax;
uniform vec2 uShift;
uniform float uTypeAlpha;

vec3 meshBg(vec2 uv){
  float t = uTime * 0.04;
  float a = uRes.x / uRes.y;
  vec2 p = vec2(uv.x * a, uv.y);
  vec2 c0 = vec2(0.15 + 0.12*sin(t*1.1), 0.2 + 0.1*cos(t*0.9));
  vec2 c1 = vec2(0.85 + 0.08*cos(t*0.7), 0.15 + 0.12*sin(t*1.3));
  vec2 c2 = vec2(0.25 + 0.18*cos(t*0.8), 0.9 + 0.08*sin(t*1.2));
  vec2 c3 = vec2(0.9 + 0.08*sin(t*1.0), 0.85 + 0.08*cos(t*0.6));
  float w0 = exp(-4.5*dot(p - c0*vec2(a,1.), p - c0*vec2(a,1.)));
  float w1 = exp(-4.0*dot(p - c1*vec2(a,1.), p - c1*vec2(a,1.)));
  float w2 = exp(-4.0*dot(p - c2*vec2(a,1.), p - c2*vec2(a,1.)));
  float w3 = exp(-4.5*dot(p - c3*vec2(a,1.), p - c3*vec2(a,1.)));
  float s = w0 + w1 + w2 + w3 + 0.0001;
  return (uPal[0]*w0 + uPal[1]*w1 + uPal[2]*w2 + uPal[3]*w3) / s;
}
vec3 wall(vec2 p, float lod){
  vec2 uv = (p + uParallax) / uRes;
  vec3 c = meshBg(uv);
  if (uPhotoMix > 0.) {
    // cover-fit is done on upload; just sample.
    c = mix(c, textureLod(uPhoto, clamp(uv, 0.001, 0.999), lod + uBgBlur).rgb, uPhotoMix);
  }
  return c * uDim;
}
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main(){
  vec2 p = vec2(gl_FragCoord.x, uRes.y*uDpr - gl_FragCoord.y) / uDpr;
  vec2 uv = (p - uShift) / uRes;
  vec4 m = texture(uMask, uv);
  float shape = m.g * uTypeAlpha * step(0., uv.y) * step(uv.y, 1.);
  vec3 base = wall(p, uOutsideBlur) * uOutside;
  // Soft contact shadow from the lettering.
  float sh = textureLod(uMask, uv - vec2(0., 8.) / uRes, 3.).g;
  base *= 1. - uShadow * 0.25 * sh * (1. - shape);
  base += (hash(p + uTime) - 0.5) * 0.02;
  if (shape < 0.002) { o = vec4(base, 1.); return; }

  vec2 tx = 1.5 / uRes;
  float hL = texture(uMask, uv - vec2(tx.x, 0.)).r;
  float hR = texture(uMask, uv + vec2(tx.x, 0.)).r;
  float hU = texture(uMask, uv - vec2(0., tx.y)).r;
  float hD = texture(uMask, uv + vec2(0., tx.y)).r;
  vec2 g = vec2(hR - hL, hD - hU) * 18.;
  vec3 n = normalize(vec3(-g, 1.));
  float h = m.r;

  vec3 I = vec3(0., 0., -1.);
  vec3 tr = refract(I, n, 1. / (1.5 - uDispersion));
  vec3 tg = refract(I, n, 1. / 1.5);
  vec3 tb = refract(I, n, 1. / (1.5 + uDispersion));
  float k = uRefraction * (0.6 + h);
  vec3 col;
  col.r = wall(p + tr.xy / max(-tr.z, 0.2) * k, 0.4).r;
  col.g = wall(p + tg.xy / max(-tg.z, 0.2) * k, 0.4).g;
  col.b = wall(p + tb.xy / max(-tb.z, 0.2) * k, 0.4).b;
  col = col * 1.06 + 0.02;

  vec3 L = normalize(vec3(uLight - p, 700.));
  vec3 V = vec3(0., 0., 1.);
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(n, H), 0.), 260.) * 1.3 * (0.3 + 0.7 * smoothstep(0.02, 0.3, length(g))) + pow(max(dot(n, H), 0.), 24.) * 0.06;
  float fres = pow(1. - n.z, 2.2);
  vec3 R = reflect(-V, n);
  vec3 env = mix(vec3(1.0), vec3(0.4, 0.42, 0.5), smoothstep(-0.5, 0.7, R.y));
  col = mix(col, env, clamp(fres * 0.7, 0., 0.6));
  col += spec * uSpec;
  float film = h * 2.0 + atan(g.y, g.x + 1e-4) * 0.3 * min(length(g) * 4., 1.) + uTime * 0.02;
  vec3 irid = 0.5 + 0.5 * cos(6.2831 * (film + vec3(0., 0.33, 0.67)));
  col += irid * fres * uIrid * 0.5;
  o = vec4(mix(base, col, shape), 1.);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
  return s;
}

export type TypeLayer = {
  text: string;
  /** css px, centre of the text block */
  x: number;
  y: number;
  font: string; // canvas font shorthand, size in css px
  letterSpacing?: number; // px
  /** height-field blur in css px; larger = rounder, thicker glass */
  depth?: number;
};

export class GlassTypeGL {
  readonly canvas: HTMLCanvasElement;
  params: TypeParams = {
    refraction: 70,
    dispersion: 0.08,
    specular: 1,
    iridescence: 0.5,
    shadow: 0.8,
    palette: [
      [0.08, 0.08, 0.09],
      [0.14, 0.14, 0.15],
      [0.05, 0.05, 0.06],
      [0.11, 0.11, 0.12],
    ],
    photoMix: 0,
    bgBlur: 0,
    dim: 1,
    outside: 1,
    outsideBlur: 0,
  };
  light = { x: 0, y: 0 };
  parallax = { x: 0, y: 0 };
  /** Offset of the lettering in css px (lets it ride a scrolling layer without redrawing). */
  shift = { x: 0, y: 0 };
  typeAlpha = 1;
  #gl: WebGL2RenderingContext;
  #prog: WebGLProgram;
  #u: Record<string, WebGLUniformLocation | null> = {};
  #mask: WebGLTexture;
  #photo: WebGLTexture;
  #maskCanvas = document.createElement('canvas');
  #layers: TypeLayer[] = [];
  #w = 0;
  #h = 0;
  #dpr = 1;
  #raf = 0;
  #t0 = performance.now();
  #visible = true;
  #ro: ResizeObserver;
  #io: IntersectionObserver;
  onFrame?: (t: number) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
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
    for (const n of ['uRes', 'uDpr', 'uTime', 'uLight', 'uMask', 'uPhoto', 'uRefraction', 'uDispersion', 'uSpec', 'uIrid', 'uShadow', 'uPhotoMix', 'uBgBlur', 'uDim', 'uPal', 'uParallax', 'uShift', 'uTypeAlpha', 'uOutside', 'uOutsideBlur']) {
      this.#u[n] = gl.getUniformLocation(prog, n);
    }
    const mk = () => {
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    this.#mask = mk();
    this.#photo = mk();
    this.#ro = new ResizeObserver(() => this.#resize());
    this.#ro.observe(canvas);
    this.#io = new IntersectionObserver(([e]) => {
      this.#visible = e.isIntersecting;
      if (this.#visible) this.start();
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

  setLayers(layers: TypeLayer[]) {
    this.#layers = layers;
    this.#drawMask();
  }

  setPhoto(img: HTMLImageElement) {
    // Cover-fit into a viewport-shaped canvas so the shader can sample uv directly.
    const c = document.createElement('canvas');
    const W = 1600;
    const H = Math.round(W * (this.#h / this.#w || 1));
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

  #drawMask() {
    const dpr = this.#dpr;
    const W = Math.max(1, Math.round(this.#w * dpr));
    const H = Math.max(1, Math.round(this.#h * dpr));
    if (!this.#layers.length) return;
    const sharp = this.#maskCanvas;
    sharp.width = W;
    sharp.height = H;
    const sc = sharp.getContext('2d', { willReadFrequently: true })!;
    sc.scale(dpr, dpr);
    sc.fillStyle = '#fff';
    sc.textAlign = 'center';
    sc.textBaseline = 'middle';
    for (const l of this.#layers) {
      sc.font = l.font;
      (sc as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${l.letterSpacing ?? 0}px`;
      sc.fillText(l.text, l.x, l.y);
    }
    // Height field = blurred silhouette, kept inside the silhouette.
    const hf = document.createElement('canvas');
    hf.width = W;
    hf.height = H;
    const hc = hf.getContext('2d', { willReadFrequently: true })!;
    const depth = (this.#layers[0]?.depth ?? 14) * dpr;
    hc.filter = `blur(${depth}px)`;
    hc.drawImage(sharp, 0, 0);
    hc.filter = 'none';
    // Pack: R = height, G = silhouette.
    const out = document.createElement('canvas');
    out.width = W;
    out.height = H;
    const oc = out.getContext('2d')!;
    const a = sc.getImageData(0, 0, W, H).data;
    const b = hc.getImageData(0, 0, W, H).data;
    const img = oc.createImageData(W, H);
    for (let i = 0; i < a.length; i += 4) {
      img.data[i] = Math.min(255, b[i + 3] * 1.6);
      img.data[i + 1] = a[i + 3];
      img.data[i + 2] = 0;
      img.data[i + 3] = 255;
    }
    oc.putImageData(img, 0, 0);
    const gl = this.#gl;
    gl.bindTexture(gl.TEXTURE_2D, this.#mask);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, out);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }

  #resize() {
    const r = this.canvas.getBoundingClientRect();
    this.#dpr = Math.min(devicePixelRatio || 1, 2);
    this.#w = r.width;
    this.#h = r.height;
    this.canvas.width = Math.max(1, Math.round(r.width * this.#dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * this.#dpr));
    this.canvas.dispatchEvent(new CustomEvent('glresize'));
    this.#drawMask();
  }

  start() {
    if (this.#raf || !this.#visible) return;
    const tick = (now: number) => {
      this.#raf = 0;
      const t = (now - this.#t0) / 1000;
      this.onFrame?.(t);
      this.render(t);
      if (this.#visible) this.#raf = requestAnimationFrame(tick);
    };
    this.#raf = requestAnimationFrame(tick);
  }

  stop() {
    cancelAnimationFrame(this.#raf);
    this.#raf = 0;
  }

  render(t: number) {
    const gl = this.#gl;
    const u = this.#u;
    const p = this.params;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.#prog);
    gl.uniform2f(u.uRes, this.#w, this.#h);
    gl.uniform1f(u.uDpr, this.#dpr);
    gl.uniform1f(u.uTime, t);
    gl.uniform2f(u.uLight, this.light.x, this.light.y);
    gl.uniform2f(u.uParallax, this.parallax.x, this.parallax.y);
    gl.uniform2f(u.uShift, this.shift.x, this.shift.y);
    gl.uniform1f(u.uTypeAlpha, this.typeAlpha);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.#mask);
    gl.uniform1i(u.uMask, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.#photo);
    gl.uniform1i(u.uPhoto, 1);
    gl.uniform1f(u.uRefraction, p.refraction);
    gl.uniform1f(u.uDispersion, p.dispersion);
    gl.uniform1f(u.uSpec, p.specular);
    gl.uniform1f(u.uIrid, p.iridescence);
    gl.uniform1f(u.uShadow, p.shadow);
    gl.uniform1f(u.uPhotoMix, p.photoMix);
    gl.uniform1f(u.uBgBlur, p.bgBlur);
    gl.uniform1f(u.uDim, p.dim);
    gl.uniform1f(u.uOutside, p.outside);
    gl.uniform1f(u.uOutsideBlur, p.outsideBlur);
    gl.uniform3fv(u.uPal, p.palette.flat());
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}

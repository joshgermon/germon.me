/**
 * A tiny LED dot-matrix display (Nothing-style), drawn on a canvas.
 * 5×7 hand-set glyphs, variable width, stepped one column at a time like a
 * real LED marquee rather than smooth-scrolled.
 */
const G: Record<string, string> = {
  A: '01110 10001 10001 11111 10001 10001 10001',
  B: '11110 10001 10001 11110 10001 10001 11110',
  C: '01110 10001 10000 10000 10000 10001 01110',
  D: '11100 10010 10001 10001 10001 10010 11100',
  E: '11111 10000 10000 11110 10000 10000 11111',
  F: '11111 10000 10000 11110 10000 10000 10000',
  G: '01110 10001 10000 10111 10001 10001 01111',
  H: '10001 10001 10001 11111 10001 10001 10001',
  I: '111 010 010 010 010 010 111',
  J: '00111 00010 00010 00010 00010 10010 01100',
  K: '10001 10010 10100 11000 10100 10010 10001',
  L: '10000 10000 10000 10000 10000 10000 11111',
  M: '10001 11011 10101 10101 10001 10001 10001',
  N: '10001 10001 11001 10101 10011 10001 10001',
  O: '01110 10001 10001 10001 10001 10001 01110',
  P: '11110 10001 10001 11110 10000 10000 10000',
  Q: '01110 10001 10001 10001 10101 10010 01101',
  R: '11110 10001 10001 11110 10100 10010 10001',
  S: '01111 10000 10000 01110 00001 00001 11110',
  T: '11111 00100 00100 00100 00100 00100 00100',
  U: '10001 10001 10001 10001 10001 10001 01110',
  V: '10001 10001 10001 10001 10001 01010 00100',
  W: '10001 10001 10001 10101 10101 10101 01010',
  X: '10001 10001 01010 00100 01010 10001 10001',
  Y: '10001 10001 10001 01010 00100 00100 00100',
  Z: '11111 00001 00010 00100 01000 10000 11111',
  '0': '01110 10001 10011 10101 11001 10001 01110',
  '1': '010 110 010 010 010 010 111',
  '2': '01110 10001 00001 00010 00100 01000 11111',
  '3': '11111 00010 00100 00010 00001 10001 01110',
  '4': '00010 00110 01010 10010 11111 00010 00010',
  '5': '11111 10000 11110 00001 00001 10001 01110',
  '6': '00110 01000 10000 11110 10001 10001 01110',
  '7': '11111 00001 00010 00100 01000 01000 01000',
  '8': '01110 10001 10001 01110 10001 10001 01110',
  '9': '01110 10001 10001 01111 00001 00010 01100',
  ' ': '000 000 000 000 000 000 000',
  '.': '0 0 0 0 0 0 1',
  ',': '00 00 00 00 00 01 10',
  ':': '0 1 1 0 1 1 0',
  ';': '00 01 01 00 01 01 10',
  '-': '000 000 000 111 000 000 000',
  '—': '00000 00000 00000 11111 00000 00000 00000',
  '·': '0 0 0 1 0 0 0',
  '/': '00001 00001 00010 00100 01000 10000 10000',
  '(': '001 010 100 100 100 010 001',
  ')': '100 010 001 001 001 010 100',
  '!': '1 1 1 1 1 0 1',
  '?': '01110 10001 00001 00010 00100 00000 00100',
  "'": '1 1 0 0 0 0 0',
  '@': '01110 10001 10111 10101 10111 10000 01111',
  '&': '01100 10010 10100 01000 10101 10010 01101',
  '+': '00000 00100 00100 11111 00100 00100 00000',
  '▸': '000 100 110 111 110 100 000',
  '°': '010 101 010 000 000 000 000',
};

const glyphs = new Map<string, number[][]>();
for (const [ch, rows] of Object.entries(G)) {
  glyphs.set(ch, rows.split(' ').map((r) => [...r].map(Number)));
}

const normalise = (s: string) =>
  s
    .toUpperCase()
    .replace(/[’‘]/g, "'")
    .replace(/[–]/g, '-')
    .replace(/[“”"]/g, "'")
    .replace(/×/g, 'X');

/** Render text into column bitmaps (each column = 7 bits, top→bottom). */
export function textColumns(text: string): number[][] {
  const cols: number[][] = [];
  for (const ch of normalise(text)) {
    const g = glyphs.get(ch) ?? glyphs.get('?')!;
    const w = g[0].length;
    for (let x = 0; x < w; x++) cols.push(g.map((row) => row[x]));
    cols.push([0, 0, 0, 0, 0, 0, 0]);
  }
  return cols;
}

type Opts = { rows?: number; pitch?: number; lit?: string; unlit?: string };

export class DotMatrix {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  rows: number;
  cols = 0;
  pitch: number;
  buf: Float32Array = new Float32Array(0);
  #sprites: HTMLCanvasElement[] = [];
  #dpr = 1;
  lit: string;
  unlit: string;

  constructor(canvas: HTMLCanvasElement, { rows = 11, pitch = 12, lit = '#fff', unlit = 'rgba(255,255,255,0.075)' }: Opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.rows = rows;
    this.pitch = pitch;
    this.lit = lit;
    this.unlit = unlit;
  }

  /** Fit to the canvas' CSS size. Returns true if the column count changed. */
  resize(pitch = this.pitch) {
    const r = this.canvas.getBoundingClientRect();
    this.#dpr = Math.min(2, devicePixelRatio || 1);
    this.pitch = pitch;
    const cols = Math.max(8, Math.floor(r.width / pitch));
    this.canvas.width = Math.round(r.width * this.#dpr);
    this.canvas.height = Math.round(r.height * this.#dpr);
    const changed = cols !== this.cols;
    this.cols = cols;
    if (changed) this.buf = new Float32Array(cols * this.rows);
    this.#makeSprites();
    return changed;
  }

  #makeSprites() {
    // Pre-render a few brightness levels so a frame is just drawImage calls.
    const p = this.pitch * this.#dpr;
    const levels = 6;
    this.#sprites = Array.from({ length: levels }, (_, i) => {
      const k = i / (levels - 1);
      const c = document.createElement('canvas');
      c.width = c.height = Math.ceil(p * 2);
      const x = c.getContext('2d')!;
      const cx = c.width / 2;
      const r = p * 0.36;
      // unlit body
      x.fillStyle = this.unlit;
      x.beginPath();
      x.arc(cx, cx, r, 0, Math.PI * 2);
      x.fill();
      if (k > 0) {
        // bloom
        const g = x.createRadialGradient(cx, cx, r * 0.4, cx, cx, p * 0.95);
        g.addColorStop(0, `rgba(255,255,255,${0.22 * k})`);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = g;
        x.fillRect(0, 0, c.width, c.height);
        x.globalAlpha = k;
        x.fillStyle = this.lit;
        x.beginPath();
        x.arc(cx, cx, r, 0, Math.PI * 2);
        x.fill();
      }
      return c;
    });
  }

  clear() {
    this.buf.fill(0);
  }

  set(x: number, y: number, v: number) {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return;
    this.buf[y * this.cols + x] = v;
  }

  /** Blit column bitmaps at (x, y). */
  blit(cols: number[][], x0: number, y0: number, v = 1) {
    for (let i = 0; i < cols.length; i++) {
      const x = x0 + i;
      if (x < 0 || x >= this.cols) continue;
      const col = cols[i];
      for (let y = 0; y < col.length; y++) if (col[y]) this.set(x, y0 + y, v);
    }
  }

  draw() {
    const { ctx, cols, rows } = this;
    const p = this.pitch * this.#dpr;
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);
    const ox = (W - cols * p) / 2;
    const oy = (H - rows * p) / 2;
    const n = this.#sprites.length - 1;
    const s = this.#sprites[0].width;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const v = this.buf[y * cols + x];
        const spr = this.#sprites[Math.round(Math.min(1, Math.max(0, v)) * n)];
        ctx.drawImage(spr, ox + x * p + p / 2 - s / 2, oy + y * p + p / 2 - s / 2);
      }
    }
  }
}

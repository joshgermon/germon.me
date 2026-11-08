/**
 * Hand-authored monoline script — one continuous pen line per word.
 *
 * Each word is a list of "runs": smooth centripetal Catmull-Rom splines through
 * the points the pen passes, joined end-to-start with a cusp (a pen reversal,
 * like the h's arch leaving its stem). Authored upright with y pointing up
 * (baseline 0, x-height 100, ascender ~255), then slanted and flipped into SVG
 * space as exact cubic Béziers — so it's a single centre line, never an outline.
 */
type Pt = [number, number];
export type Word = { runs: Pt[][]; slant: number };

export const WORDS: Record<'hello' | 'josh', Word> = {
  hello: {
    slant: 16,
    runs: [
      // h — lead-in, ascender loop, downstroke to the baseline
      [
        [-22, 4], [2, 18], [34, 54], [68, 114], [96, 180], [110, 228], [110, 258], [96, 270], [78, 260], [66, 224], [60, 160], [57, 80], [55, 0],
      ],
      // h arch → e → l → l → o
      [
        [55, 0], [58, 40], [68, 72], [86, 94], [108, 102], [128, 94], [138, 70], [137, 36], [141, 10], [156, 0], [178, 8], [200, 26],
        // e
        [228, 50], [248, 76], [248, 100], [230, 110], [208, 100], [196, 72], [198, 36], [212, 10], [234, 0], [262, 6], [288, 28],
        // l
        [316, 72], [342, 140], [358, 206], [360, 250], [346, 270], [328, 264], [317, 232], [311, 160], [310, 80], [312, 30], [324, 4], [342, 0], [362, 12], [380, 32],
        // l
        [408, 72], [434, 140], [450, 206], [452, 250], [438, 270], [420, 264], [409, 232], [403, 160], [402, 80], [404, 30], [416, 4], [434, 0],
        // o — connector up its left side, clockwise, tail off the top
        [452, 14], [462, 44], [468, 76], [480, 100], [500, 110], [522, 100], [533, 72], [529, 34], [512, 6], [488, 0], [466, 12], [461, 42], [467, 76], [482, 98], [502, 102], [528, 102], [554, 110],
      ],
    ],
  },
  josh: {
    slant: 16,
    runs: [
      // J — arched cap, long stem, descender loop sweeping back up into the o
      [
        [16, 206], [44, 240], [84, 262], [124, 266], [150, 252], [154, 226], [150, 170], [143, 100], [134, 20], [122, -60], [106, -122], [84, -156], [62, -160], [52, -142], [60, -100], [84, -50], [112, -8], [142, 26],
        // o
        [162, 58], [176, 88], [194, 104], [216, 104], [230, 84], [230, 46], [218, 14], [198, 0], [180, 8], [172, 36], [174, 70], [186, 96], [204, 104],
        // bridge → s: a peak, the belly, a round end at the bottom-left
        [228, 99], [252, 98], [282, 118], [298, 90], [304, 58], [298, 26], [280, 6], [258, 2], [244, 10],
      ],
      // the pen doubles back along the s's foot and sweeps up into the h
      [
        [244, 10], [262, 3], [288, 2], [316, 12], [342, 32],
        [364, 54], [398, 114], [426, 180], [440, 228], [440, 258], [426, 270], [408, 260], [396, 224], [390, 160], [387, 80], [385, 0],
      ],
      [
        [385, 0], [388, 40], [398, 72], [416, 94], [438, 102], [458, 94], [468, 70], [467, 36], [471, 10], [486, 0], [508, 8], [530, 26],
      ],
    ],
  },
};

/** Centripetal Catmull-Rom (α = 0.5) through `p`, as cubic Bézier segments. */
function spline(p: Pt[]): [Pt, Pt, Pt][] {
  const n = p.length;
  const at = (i: number): Pt => {
    if (i < 0) return [2 * p[0][0] - p[1][0], 2 * p[0][1] - p[1][1]];
    if (i >= n) return [2 * p[n - 1][0] - p[n - 2][0], 2 * p[n - 1][1] - p[n - 2][1]];
    return p[i];
  };
  const d = (a: Pt, b: Pt) => Math.max(1e-4, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])));
  const out: [Pt, Pt, Pt][] = [];
  for (let i = 0; i < n - 1; i++) {
    const P0 = at(i - 1), P1 = at(i), P2 = at(i + 1), P3 = at(i + 2);
    const d1 = d(P0, P1), d2 = d(P1, P2), d3 = d(P2, P3);
    const b1 = [0, 1].map((k) => (d1 * d1 * P2[k] - d2 * d2 * P0[k] + (2 * d1 * d1 + 3 * d1 * d2 + d2 * d2) * P1[k]) / (3 * d1 * (d1 + d2))) as Pt;
    const b2 = [0, 1].map((k) => (d3 * d3 * P1[k] - d2 * d2 * P3[k] + (2 * d3 * d3 + 3 * d3 * d2 + d2 * d2) * P2[k]) / (3 * d3 * (d3 + d2))) as Pt;
    out.push([b1, b2, P2]);
  }
  return out;
}

export type Built = { d: string; x: number; y: number; w: number; h: number };

/** SVG path data (y down, origin at the bounding box's top-left of the centre line). */
export function build(word: Word, scale = 1): Built {
  const k = Math.tan((word.slant * Math.PI) / 180);
  const tf = ([x, y]: Pt): Pt => [(x + y * k) * scale, -y * scale];
  const segs: { m: Pt; c: [Pt, Pt, Pt][] }[] = word.runs.map((run) => ({ m: tf(run[0]), c: spline(run).map((s) => s.map(tf) as [Pt, Pt, Pt]) }));
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of segs)
    for (const p of [s.m, ...s.c.flat()]) {
      x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]);
      x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]);
    }
  const f = (p: Pt) => `${(p[0] - x0).toFixed(2)},${(p[1] - y0).toFixed(2)}`;
  // Runs are joined pen-down: each starts where the last ended, so 'L' keeps it one subpath.
  const d = segs.map((s, i) => `${i ? 'L' : 'M'}${f(s.m)} ${s.c.map((c) => `C${c.map(f).join(' ')}`).join(' ')}`).join(' ');
  return { d, x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Debug: the authored points, transformed like the path. */
export function points(word: Word) {
  const k = Math.tan((word.slant * Math.PI) / 180);
  return word.runs.flat().map(([x, y]) => [x + y * k, -y] as Pt);
}

export type Line = {
  /** x,y pairs along the centre line, ~`step` px apart, in the same space as build().d */
  pts: Float32Array;
  /** cumulative arc length at each point */
  cum: Float32Array;
  len: number;
  /** true bounds of the centre line */
  x0: number; y0: number; x1: number; y1: number;
  /** baseline (authored y = 0) in this space */
  base: number;
};

/** The pen line flattened to a dense polyline — cheap arc-length queries without the DOM. */
export function flatten(word: Word, scale = 1, step = 1.5): Line {
  const k = Math.tan((word.slant * Math.PI) / 180);
  const tf = ([x, y]: Pt): Pt => [(x + y * k) * scale, -y * scale];
  const b = build(word, scale);
  const out: number[] = [];
  const push = (p: Pt) => out.push(p[0] - b.x, p[1] - b.y);
  push(tf(word.runs[0][0]));
  for (const run of word.runs) {
    let p0 = tf(run[0]);
    for (const seg of spline(run)) {
      const [c1, c2, p3] = seg.map(tf) as [Pt, Pt, Pt];
      const poly = Math.hypot(c1[0] - p0[0], c1[1] - p0[1]) + Math.hypot(c2[0] - c1[0], c2[1] - c1[1]) + Math.hypot(p3[0] - c2[0], p3[1] - c2[1]);
      const n = Math.max(2, Math.ceil(poly / step));
      for (let i = 1; i <= n; i++) {
        const t = i / n, u = 1 - t;
        const a = u * u * u, bb = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
        push([a * p0[0] + bb * c1[0] + c * c2[0] + d * p3[0], a * p0[1] + bb * c1[1] + c * c2[1] + d * p3[1]]);
      }
      p0 = p3;
    }
  }
  const pts = new Float32Array(out);
  const n = pts.length / 2;
  const cum = new Float32Array(n);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = pts[i * 2], y = pts[i * 2 + 1];
    if (i) cum[i] = cum[i - 1] + Math.hypot(x - pts[i * 2 - 2], y - pts[i * 2 - 1]);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return { pts, cum, len: cum[n - 1], x0, y0, x1, y1, base: -b.y };
}

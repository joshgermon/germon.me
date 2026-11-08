/**
 * Seven-segment LCD readout rendered as inline SVG. Unlit segments stay as a
 * faint ghost, the way a real reflective LCD does.
 */
const SVG = 'http://www.w3.org/2000/svg';
const MAP: Record<string, string> = {
  '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg', '5': 'acdfg', '6': 'acdefg', '7': 'abc',
  '8': 'abcdefg', '9': 'abcdfg', A: 'abcefg', B: 'cdefg', C: 'adef', D: 'bcdeg', E: 'adefg', F: 'aefg',
  G: 'acdef', H: 'bcefg', I: 'ef', J: 'bcde', L: 'def', N: 'ceg', O: 'abcdef', P: 'abefg', R: 'eg',
  S: 'acdfg', T: 'defg', U: 'bcdef', Y: 'bcdfg', '-': 'g', _: 'd', ' ': '',
};
const lower: Record<string, string> = { b: 'cdefg', c: 'deg', d: 'bcdeg', h: 'cefg', n: 'ceg', o: 'cdeg', r: 'eg', t: 'defg', u: 'cde' };

const t = 1.7;
const g = 0.35;
const H = (x1: number, x2: number, y: number) =>
  `${x1},${y} ${x1 + t / 2},${y - t / 2} ${x2 - t / 2},${y - t / 2} ${x2},${y} ${x2 - t / 2},${y + t / 2} ${x1 + t / 2},${y + t / 2}`;
const V = (x: number, y1: number, y2: number) =>
  `${x},${y1} ${x + t / 2},${y1 + t / 2} ${x + t / 2},${y2 - t / 2} ${x},${y2} ${x - t / 2},${y2 - t / 2} ${x - t / 2},${y1 + t / 2}`;
const SEGS: Record<string, string> = {
  a: H(1 + g, 9 - g, 1),
  b: V(9, 1 + g, 9 - g),
  c: V(9, 9 + g, 17 - g),
  d: H(1 + g, 9 - g, 17),
  e: V(1, 9 + g, 17 - g),
  f: V(1, 1 + g, 9 - g),
  g: H(1 + g, 9 - g, 9),
};

export class Seg7 {
  svg: SVGSVGElement;
  cells: { seg: Record<string, SVGPolygonElement>; dp: SVGCircleElement }[] = [];
  n: number;

  constructor(host: HTMLElement, digits: number) {
    this.n = digits;
    const w = 13;
    this.svg = document.createElementNS(SVG, 'svg');
    this.svg.setAttribute('viewBox', `-1 -1 ${digits * w + 1} 20`);
    this.svg.setAttribute('class', 'seg7');
    this.svg.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < digits; i++) {
      const gEl = document.createElementNS(SVG, 'g');
      gEl.setAttribute('transform', `translate(${i * w + 1.4} 0) skewX(-6)`);
      const seg: Record<string, SVGPolygonElement> = {};
      for (const [k, pts] of Object.entries(SEGS)) {
        const p = document.createElementNS(SVG, 'polygon');
        p.setAttribute('points', pts);
        gEl.append(p);
        seg[k] = p;
      }
      const dp = document.createElementNS(SVG, 'circle');
      dp.setAttribute('cx', '11');
      dp.setAttribute('cy', '17');
      dp.setAttribute('r', '0.95');
      gEl.append(dp);
      this.svg.append(gEl);
      this.cells.push({ seg, dp });
    }
    host.append(this.svg);
  }

  /** Right-aligned text. Dots attach to the previous character. */
  set(text: string, align: 'right' | 'left' = 'right') {
    const chars: { c: string; dp: boolean }[] = [];
    for (const c of text) {
      if (c === '.' && chars.length) chars[chars.length - 1].dp = true;
      else chars.push({ c, dp: false });
    }
    const vis = chars.slice(-this.n);
    const pad = align === 'right' ? this.n - vis.length : 0;
    this.cells.forEach((cell, i) => {
      const ch = vis[i - pad];
      const on = ch ? (lower[ch.c] ?? MAP[ch.c.toUpperCase()] ?? '') : '';
      for (const [k, el] of Object.entries(cell.seg)) el.classList.toggle('on', on.includes(k));
      cell.dp.classList.toggle('on', !!ch?.dp);
    });
  }
}

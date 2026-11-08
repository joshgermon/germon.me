/**
 * <liquid-glass> — a DOM element that refracts whatever is behind it.
 *
 * Layers (all behind the element's own children):
 *   .lg-refract  backdrop-filter blur/saturate, then `filter: url(#lg-n)` which
 *                bends the blurred backdrop through a squircle bezel and splits
 *                R/G/B with slightly different strengths (dispersion fringe).
 *                Putting the SVG filter on a layer *with* a backdrop-filter —
 *                rather than inside backdrop-filter: url() — is the trick that
 *                lets WebKit render it too (see KrisSimon/Glassine).
 *   .lg-tint     flat tint, so text stays legible.
 *   .lg-shine    CSS specular rim + prismatic fringe that track the light.
 *
 * Attributes (all optional):
 *   radius      px, or "pill" (default 28)
 *   bezel       px width of the curved edge (default 22)
 *   refraction  max px the edge bends the backdrop (default 36)
 *   dispersion  0..1 fraction between R/G/B strengths (default 0.12)
 *   blur        frost in px (default 2)
 *   profile     squircle | circle | lip
 *   variant     clear | regular | tinted | dark  (sets tint + saturation)
 *   static      don't track the pointer light
 */
import { displacementMap, specularMap, type BezelProfile } from './maps';
import { registerLight, unregisterLight } from './light';

const SVG_NS = 'http://www.w3.org/2000/svg';
let defs: SVGSVGElement | null = null;
let counter = 0;

function getDefs() {
  if (defs && defs.isConnected) return defs;
  defs = document.createElementNS(SVG_NS, 'svg');
  defs.setAttribute('aria-hidden', 'true');
  defs.setAttribute('width', '0');
  defs.setAttribute('height', '0');
  defs.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
  // Must precede any layer that references it (WebKit resolves url() at insertion).
  document.body.prepend(defs);
  return defs;
}

/**
 * Chromium: SVG filters work inside backdrop-filter, but feImage needs explicit
 * x/y/width/height. WebKit/Gecko: put `filter: url()` on a layer that has a
 * plain backdrop-filter, and leave feImage unsized (WebKit resolves its
 * coordinates against the document origin otherwise).
 */
const engine = (() => {
  if (typeof navigator === 'undefined') return 'blink';
  const ua = navigator.userAgent;
  if (/Firefox\//.test(ua)) return 'gecko';
  if (/AppleWebKit/.test(ua) && !/Chrome|Chromium|Edg|OPR/.test(ua)) return 'webkit';
  return 'blink';
})();

const reduceTransparency = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-transparency: reduce)').matches;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
}

export class LiquidGlass extends HTMLElement {
  static observedAttributes = ['radius', 'bezel', 'refraction', 'dispersion', 'profile', 'blur'];

  #refract!: HTMLDivElement;
  #shine!: HTMLDivElement;
  #filter: SVGFilterElement | null = null;
  #maps: SVGFEDisplacementMapElement[] = [];
  #ro?: ResizeObserver;
  #raf = 0;
  #size = { w: 0, h: 0 };
  #built = false;

  connectedCallback() {
    if (!this.#built) {
      this.#built = true;
      const tint = document.createElement('div');
      tint.className = 'lg-tint';
      this.#refract = document.createElement('div');
      this.#refract.className = 'lg-refract';
      this.#shine = document.createElement('div');
      this.#shine.className = 'lg-shine';
      this.#shine.innerHTML = '<i class="lg-rim"></i><i class="lg-prism"></i>';
      this.prepend(this.#refract, tint, this.#shine);
    }
    this.#syncRadius();
    this.#ro = new ResizeObserver(([entry]) => {
      const box = entry.borderBoxSize?.[0];
      const w = Math.round(box ? box.inlineSize : entry.contentRect.width);
      const h = Math.round(box ? box.blockSize : entry.contentRect.height);
      if (w === this.#size.w && h === this.#size.h) return;
      this.#size = { w, h };
      this.#schedule();
    });
    this.#ro.observe(this);
    if (!this.hasAttribute('static')) registerLight(this);
  }

  disconnectedCallback() {
    this.#ro?.disconnect();
    clearTimeout(this.#raf);
    unregisterLight(this);
    this.#filter?.remove();
    this.#filter = null;
  }

  attributeChangedCallback() {
    if (!this.#built) return;
    this.#syncRadius();
    this.#schedule();
  }

  /** Animate refraction strength without rebuilding maps (e.g. on press). */
  set refractionScale(k: number) {
    const base = this.#num('refraction', 48);
    const disp = this.#num('dispersion', 0.12);
    this.#maps.forEach((m, i) => m.setAttribute('scale', String(base * k * (1 + disp * i))));
  }

  #num(name: string, fallback: number) {
    const v = this.getAttribute(name);
    const n = v == null ? NaN : parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
  }

  #radiusPx() {
    const r = this.getAttribute('radius');
    if (r === 'pill') return Math.min(this.#size.w, this.#size.h) / 2;
    return this.#num('radius', 28);
  }

  #syncRadius() {
    const r = this.getAttribute('radius');
    this.style.setProperty('--lg-radius', r === 'pill' ? '999px' : `${this.#num('radius', 28)}px`);
    this.style.setProperty('--lg-blur', `${this.#num('blur', 2)}px`);
  }

  #schedule() {
    // setTimeout (not rAF) so maps still build in background tabs; coalesces resize bursts.
    clearTimeout(this.#raf);
    this.#raf = window.setTimeout(() => this.#build(), 16);
  }

  #build() {
    const { w, h } = this.#size;
    if (!w || !h || reduceTransparency()) return;
    const radius = this.#radiusPx();
    const bezel = Math.min(this.#num('bezel', 26), Math.min(w, h) / 2 - 1);
    const profile = (this.getAttribute('profile') as BezelProfile) || 'squircle';
    const refraction = this.#num('refraction', 48);
    const dispersion = this.#num('dispersion', 0.12);

    const disp = displacementMap({ width: w, height: h, radius, bezel, profile });
    const spec = specularMap({ width: w, height: h, radius, bezel: Math.min(bezel, 14), strength: 0.9 });

    const id = `lg-${++counter}`;
    const f = el('filter', {
      id,
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      filterUnits: 'objectBoundingBox',
      primitiveUnits: 'userSpaceOnUse',
      'color-interpolation-filters': 'sRGB',
    }) as SVGFilterElement;

    const sized: Record<string, number> = engine === 'blink' ? { x: 0, y: 0, width: w, height: h } : {};
    f.append(el('feImage', { href: disp, result: 'map', preserveAspectRatio: 'none', ...sized }));

    this.#maps = [];
    const channels = [
      ['1 0 0 0 0', '0 0 0 0 0', '0 0 0 0 0'],
      ['0 0 0 0 0', '0 1 0 0 0', '0 0 0 0 0'],
      ['0 0 0 0 0', '0 0 0 0 0', '0 0 1 0 0'],
    ];
    channels.forEach((rows, i) => {
      const m = el('feDisplacementMap', {
        in: 'SourceGraphic',
        in2: 'map',
        scale: refraction * (1 + dispersion * i),
        xChannelSelector: 'R',
        yChannelSelector: 'G',
        result: `d${i}`,
      }) as SVGFEDisplacementMapElement;
      this.#maps.push(m);
      f.append(m, el('feColorMatrix', { in: `d${i}`, type: 'matrix', values: `${rows.join(' ')} 0 0 0 1 0`, result: `c${i}` }));
    });
    f.append(
      el('feComposite', { in: 'c0', in2: 'c1', operator: 'arithmetic', k2: 1, k3: 1, result: 'rg' }),
      el('feComposite', { in: 'rg', in2: 'c2', operator: 'arithmetic', k2: 1, k3: 1, result: 'rgb' }),
      el('feImage', { href: spec, result: 'spec', preserveAspectRatio: 'none', ...sized }),
      el('feBlend', { in: 'spec', in2: 'rgb', mode: 'screen' }),
    );

    getDefs().append(f);
    // WebKit ignores repaints of an already-filtered layer, so swap the layer too.
    const fresh = this.#refract.cloneNode() as HTMLDivElement;
    if (engine === 'blink') {
      fresh.style.backdropFilter = `blur(var(--lg-blur)) url(#${id}) saturate(var(--lg-sat)) brightness(var(--lg-bright))`;
    } else {
      fresh.style.filter = `url(#${id})`;
    }
    this.#refract.replaceWith(fresh);
    this.#refract = fresh;
    this.#filter?.remove();
    this.#filter = f;
    this.dataset.lgReady = '';
  }
}

export function defineLiquidGlass() {
  if (typeof customElements !== 'undefined' && !customElements.get('liquid-glass')) {
    customElements.define('liquid-glass', LiquidGlass);
  }
}

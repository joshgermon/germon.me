/**
 * Widgets · Hardware — behaviour.
 * Every control is a real control: knobs with detents, slide switches,
 * radio-group keys, a tuning strip, a terminal, a printer, a calculator.
 */
import { Spring, springLoop, prefersReducedMotion } from '@/lib/glass';
import { DotMatrix, textColumns } from './dotmatrix';
import { Seg7 } from './seg7';
import { Knob } from './knob';
import { mountTerminal } from './terminal';

export type HwData = {
  profile: {
    name: string;
    title: string;
    location: string;
    tagline: string;
    email: string;
    socials: readonly { label: string; href: string; handle: string }[];
    now: Record<string, string>;
  };
  career: { years: string; title: string; company: string }[];
  projects: { name: string; lang: string; blurb: string; href: string }[];
  notes: { date: string; title: string; body: string }[];
  modes: { key: string; label: string; text: string }[];
  meters: { key: string; value: string; label: string; fs: number; read: string }[];
  stations: { freq: number; caption: string }[];
  band: { lo: number; hi: number };
};

const reduced = prefersReducedMotion();
const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector<T>(s);
const $$ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => [...r.querySelectorAll<T>(s)];
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const store = {
  get(k: string) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* private mode */
    }
  },
};

export function boot() {
  const data = JSON.parse($('#hw-data')?.textContent ?? '{}') as HwData;
  entrance();
  pressStates();
  header();
  switches();
  clock();
  matrix(data);
  career();
  vu(data);
  const term = terminalAndDeck(data);
  radio(data);
  printer(data);
  calculator();
  void term;
}

/* Sound ------------------------------------------------------------- */
// Tiny synthesised clicks — off by default, toggled on the switch panel.
let ac: AudioContext | null = null;
let soundOn = false;
function click(kind: 'detent' | 'key' | 'switch' | 'tick' | 'feed' = 'key') {
  if (!soundOn) return;
  ac ??= new AudioContext();
  const t = ac.currentTime;
  const len = kind === 'feed' ? 0.02 : kind === 'key' ? 0.012 : 0.006;
  const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * len), ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
  const src = ac.createBufferSource();
  src.buffer = buf;
  const f = ac.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = kind === 'detent' ? 3800 : kind === 'tick' ? 5200 : kind === 'feed' ? 2400 : 1900;
  f.Q.value = 0.9;
  const g = ac.createGain();
  g.gain.value = kind === 'tick' ? 0.12 : kind === 'detent' ? 0.35 : 0.5;
  src.connect(f).connect(g).connect(ac.destination);
  src.start(t);
  if (kind === 'key' || kind === 'switch') {
    const o = ac.createOscillator();
    const og = ac.createGain();
    o.frequency.setValueAtTime(kind === 'switch' ? 220 : 150, t);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.04);
    og.gain.setValueAtTime(0.25, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    o.connect(og).connect(ac.destination);
    o.start(t);
    o.stop(t + 0.06);
  }
}

/* Entrance + press states --------------------------------------------- */
function entrance() {
  const devs = $$('.dev');
  if (reduced) {
    devs.forEach((d) => d.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver(
    (es) => {
      for (const e of es) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    },
    { threshold: 0.12 },
  );
  devs.forEach((d) => io.observe(d));
}

function pressStates() {
  const sel = '.pkey, .tkey, .dkey, .ck, .chipkey';
  document.addEventListener('keydown', (e) => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    const k = (e.target as HTMLElement).closest?.(sel);
    if (k) k.classList.add('is-down');
  });
  document.addEventListener('keyup', () => $$('.is-down').forEach((k) => k.classList.remove('is-down')));
  document.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest?.(sel)) click('key');
  });
}

/* Header --------------------------------------------------------------- */
function header() {
  const el = $('[data-today]');
  if (!el) return;
  const tick = () => {
    const d = new Date();
    const day = d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Australia/Sydney' });
    const time = d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', timeZone: 'Australia/Sydney' });
    el.textContent = `${day} · ${time} in Sydney`;
  };
  tick();
  setInterval(tick, 30_000);
}

/* Switches ------------------------------------------------------------- */
function switches() {
  const html = document.documentElement;
  const statusHost = $('[data-status-seg]');
  const status = statusHost ? new Seg7(statusHost, 4) : null;
  const statusL = $('[data-status-l]');
  const apply = (name: string, on: boolean) => {
    const sw = $(`[data-sw="${name}"]`);
    sw?.setAttribute('aria-checked', String(on));
    $(`[data-led="${name}"]`)?.toggleAttribute('data-on', on);
    if (name === 'chat') {
      html.toggleAttribute('data-chat', on);
      $('[data-chat-led]')?.toggleAttribute('data-on', on);
      status?.set(on ? 'OPEn' : 'bUSY');
      if (statusL) statusL.textContent = on ? 'Replies within a day' : 'Heads-down · slower replies';
    }
    if (name === 'dusk') {
      html.toggleAttribute('data-dusk', on);
      $('meta[name="theme-color"]')?.setAttribute('content', on ? '#1d1b19' : '#cbb9a1');
    }
    if (name === 'sound') soundOn = on;
  };
  const initial: Record<string, boolean> = {
    chat: store.get('hw:chat') !== '0',
    // Follow the system appearance until the visitor flips the switch themselves.
    dusk: store.get('hw:dusk') != null ? store.get('hw:dusk') === '1' : matchMedia('(prefers-color-scheme: dark)').matches,
    sound: false,
  };
  for (const [k, v] of Object.entries(initial)) apply(k, v);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (store.get('hw:dusk') == null) apply('dusk', e.matches);
  });
  $$('[data-sw]').forEach((sw) =>
    sw.addEventListener('click', () => {
      const name = sw.dataset.sw!;
      const on = sw.getAttribute('aria-checked') !== 'true';
      apply(name, on);
      if (name !== 'sound') store.set(`hw:${name}`, on ? '1' : '0');
      click('switch');
    }),
  );
}

/* Clock ---------------------------------------------------------------- */
function sydney(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
    timeZoneName: 'short',
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '0';
  return { h: Number(get('hour')) % 24, m: Number(get('minute')), s: Number(get('second')), tz: get('timeZoneName') };
}

function clock() {
  const hh = $('[data-hand="h"]');
  const mh = $('[data-hand="m"]');
  const sh = $('[data-hand="s"]');
  const diffEl = $('[data-syd-diff]');
  const tzEl = $('[data-syd-tz]');
  const now = new Date();
  const syd = sydney(now);
  if (tzEl) tzEl.textContent = /AEDT|GMT\+11/.test(syd.tz) ? 'AEDT' : 'AEST';
  let diff = Math.round(((syd.h * 60 + syd.m - (now.getHours() * 60 + now.getMinutes())) / 60) * 2) / 2;
  if (diff > 12) diff -= 24;
  if (diff < -12) diff += 24;
  if (diffEl) diffEl.textContent = diff === 0 ? 'same time as you' : `${diff > 0 ? '+' : '−'}${Math.abs(diff)}h from you`;

  // Quartz tick: the second hand jumps each second and settles with a tiny overshoot.
  const sec = new Spring(syd.s * 6, { response: 0.16, damping: 0.42 });
  const loop = springLoop([sec], () => sh?.style.setProperty('rotate', `${sec.value}deg`));
  let turns = 0;
  let last = syd.s;
  const world = $$('[data-tz]').map((el) => ({
    el,
    fmt: new Intl.DateTimeFormat('en-GB', { timeZone: el.dataset.tz, hour: '2-digit', minute: '2-digit', hour12: false }),
  }));
  const tick = () => {
    const { h, m, s } = sydney();
    if (s === 0 || world[0]?.el.textContent === '--:--') world.forEach((w) => (w.el.textContent = w.fmt.format(new Date())));
    if (s < last) turns++;
    last = s;
    hh?.style.setProperty('rotate', `${(h % 12) * 30 + m * 0.5}deg`);
    mh?.style.setProperty('rotate', `${m * 6 + s * 0.1}deg`);
    const target = (turns * 60 + s) * 6;
    if (reduced || document.hidden) {
      sec.set(target);
      sh?.style.setProperty('rotate', `${target}deg`);
    } else {
      sec.to(target);
      loop.kick();
    }
  };
  tick();
  setInterval(tick, 1000);
}

/* Dot-matrix "Now" ---------------------------------------------------- */
function matrix(data: HwData) {
  const canvas = $<HTMLCanvasElement>('.mx-canvas');
  const sr = $('[data-mx-sr]');
  const keys = $$('[data-mode]');
  if (!canvas) return;
  const dm = new DotMatrix(canvas, { rows: 11 });
  const GAP = 14;
  let mode = 0;
  let cols = textColumns('');
  let offset = 0;
  let prev: { cols: number[][]; offset: number } | null = null;
  let wipe = 1;
  let visible = false;

  const fit = () => {
    const h = canvas.getBoundingClientRect().height;
    dm.resize(Math.max(5, Math.floor(h / 11)));
  };
  const setMode = (i: number, animate = true) => {
    if (animate && !reduced) {
      prev = { cols, offset };
      wipe = 0;
    }
    mode = i;
    const m = data.modes[i];
    cols = textColumns(`${m.label} ▸ ${m.text}`);
    offset = 0;
    keys.forEach((k, j) => k.setAttribute('aria-checked', String(j === i)));
    if (sr) sr.textContent = `${m.label}: ${m.text}`;
  };

  const paint = (c: number[][], off: number, from: number, to: number) => {
    const scroll = c.length > dm.cols;
    const period = c.length + GAP;
    for (let x = from; x < to; x++) {
      let src: number;
      if (scroll) src = (((x + off) % period) + period) % period;
      else src = x - Math.floor((dm.cols - c.length) / 2);
      const col = c[src];
      if (!col) continue;
      for (let y = 0; y < 7; y++) if (col[y]) dm.set(x, y + 2, 1);
    }
  };

  const frame = () => {
    dm.clear();
    const edge = Math.floor(wipe * dm.cols);
    if (prev && wipe < 1) {
      paint(prev.cols, prev.offset, edge, dm.cols);
      paint(cols, offset, 0, edge);
      for (let y = 0; y < dm.rows; y++) dm.set(edge, y, 0.6);
      wipe = Math.min(1, wipe + 0.08);
      if (wipe >= 1) prev = null;
    } else {
      paint(cols, offset, 0, dm.cols);
      if (cols.length > dm.cols) offset++;
    }
    // Page dots, bottom-left — which "Now" card this is.
    data.modes.forEach((_, i) => dm.set(1 + i * 2, dm.rows - 1, i === mode ? 1 : 0.2));
    dm.draw();
  };

  fit();
  setMode(0, false);
  frame();
  new ResizeObserver(() => {
    fit();
    frame();
  }).observe(canvas);

  let timer = 0;
  const start = () => {
    if (timer || reduced) return;
    timer = window.setInterval(frame, 60);
  };
  const stop = () => {
    clearInterval(timer);
    timer = 0;
  };
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible) start();
    else stop();
  }).observe(canvas);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : visible && start()));

  keys.forEach((k, i) => {
    k.addEventListener('click', () => {
      if (i !== mode) setMode(i);
      if (reduced) frame();
    });
    k.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      const n = (mode + d + keys.length) % keys.length;
      setMode(n);
      keys[n].focus();
      if (reduced) frame();
    });
  });
  // Roving tabindex for the radio group
  const syncTab = () => keys.forEach((k, j) => (k.tabIndex = j === mode ? 0 : -1));
  syncTab();
  keys.forEach((k) => k.addEventListener('click', syncTab));
  keys.forEach((k) => k.addEventListener('keydown', () => requestAnimationFrame(syncTab)));
}

/* Career knob ---------------------------------------------------------- */
function career() {
  const hit = $('[data-knob="career"]');
  if (!hit) return;
  const roles = $$('[data-role]');
  const labels = $$('.tk-l[data-stop]');
  const show = (i: number) => {
    roles.forEach((r, j) => {
      const on = j === i;
      if (on && r.hidden) {
        r.hidden = false;
        r.setAttribute('data-enter', '');
        r.addEventListener('animationend', () => r.removeAttribute('data-enter'), { once: true });
      } else if (!on) r.hidden = true;
    });
    labels.forEach((l, j) => l.toggleAttribute('data-on', j === i));
    const r = roles[i];
    hit.setAttribute('aria-valuetext', `${r.querySelector('.role-top span')?.textContent} · ${r.querySelector('.role-title')?.textContent}`);
  };
  let blip = 0;
  new Knob({
    hit,
    min: 0,
    max: roles.length - 1,
    step: 1,
    value: roles.length - 1,
    degPerUnit: 120,
    angle0: -120,
    ratchet: 1 / 8,
    magnet: 0.6,
    onInput: (_, a) => hit.style.setProperty('--a', `${a}deg`),
    onStop: (i) => {
      show(i);
      click('detent');
    },
    onTick: () => {
      click('tick');
      hit.setAttribute('data-tick', '');
      clearTimeout(blip);
      blip = window.setTimeout(() => hit.removeAttribute('data-tick'), 70);
    },
  });
  show(roles.length - 1);
}

/* VU meter -------------------------------------------------------------- */
function vu(data: HwData) {
  const needle = $('[data-needle]', $('.vu') ?? document);
  const segHost = $('[data-vu-seg]');
  const label = $('[data-vu-label]');
  const unit = $('[data-vu-unit]');
  const keys = $$('[data-meter]');
  if (!needle || !segHost) return;
  const seg = new Seg7(segHost, 4);
  const REST = -50;
  const ang = new Spring(REST, { response: 0.62, damping: 0.36 });
  const loop = springLoop([ang], () => needle.style.setProperty('rotate', `${ang.value}deg`));
  needle.style.setProperty('rotate', `${REST}deg`);
  let cur = 0;
  let auto = true;
  const set = (i: number) => {
    cur = i;
    const m = data.meters[i];
    const target = -46 + m.fs * 92;
    if (reduced) {
      ang.set(target);
      needle.style.setProperty('rotate', `${target}deg`);
    } else {
      ang.to(target);
      loop.kick();
    }
    seg.set(m.read);
    if (label) label.textContent = `${m.value} ${m.label}`;
    if (unit) unit.textContent = `Ch ${i + 1} · ${m.key}`;
    keys.forEach((k, j) => {
      k.setAttribute('aria-checked', String(j === i));
      k.tabIndex = j === i ? 0 : -1;
    });
  };
  seg.set('    ');
  keys.forEach((k, i) => {
    k.addEventListener('click', () => {
      auto = false;
      set(i);
    });
    k.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      auto = false;
      const n = (cur + d + keys.length) % keys.length;
      set(n);
      keys[n].focus();
    });
  });
  keys.forEach((k, j) => (k.tabIndex = j === 0 ? 0 : -1));
  // Needle swings up from rest when the meter first comes into view, then
  // auto-steps through the stats until someone presses a key.
  let iv = 0;
  new IntersectionObserver(
    ([e]) => {
      if (e.isIntersecting) {
        if (ang.value === REST && !ang.velocity) setTimeout(() => set(cur), 350);
        if (!iv && !reduced)
          iv = window.setInterval(() => {
            if (auto && !document.hidden) set((cur + 1) % keys.length);
          }, 4200);
      } else {
        clearInterval(iv);
        iv = 0;
      }
    },
    { threshold: 0.5 },
  ).observe(needle.closest('.vu')!);
}

/* Terminal + cartridge deck --------------------------------------------- */
function terminalAndDeck(data: HwData) {
  const root = $('.term');
  if (!root) return null;
  const crt = $('[data-crt]', root)!;
  if (!reduced) crt.dataset.off = '';
  const term = mountTerminal(root, data, reduced, () => click('tick'));
  new IntersectionObserver(
    ([e], io) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      setTimeout(() => term.boot(), 250);
    },
    { threshold: 0.4 },
  ).observe(crt);
  $$('[data-run]', root).forEach((b) => b.addEventListener('click', () => term.run(b.dataset.run!)));
  const keys = $$('[data-project]');
  keys.forEach((k) =>
    k.addEventListener('click', () => {
      keys.forEach((o) => o.querySelector('.led')?.toggleAttribute('data-on', o === k));
      term.boot();
      term.run(`open ${k.dataset.project}`);
      if (innerWidth < 760) crt.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
    }),
  );
  return term;
}

/* Photo receiver --------------------------------------------------------- */
function radio(data: HwData) {
  const hit = $('[data-knob="tune"]');
  const band = $('[data-band]');
  if (!hit || !band) return;
  const inner = $('.rd-band-in', band)!;
  const needle = $('[data-needle]', band)!;
  const imgs = $$<HTMLImageElement>('[data-station]');
  const marks = $$('[data-st]', band);
  const cap = $('[data-cap]');
  const tuned = $('[data-tuned]');
  const seg = new Seg7($('[data-freq-seg]')!, 4);
  const presets = $$('[data-preset]');
  const noise = $<HTMLCanvasElement>('.rd-noise')!;
  const nctx = noise.getContext('2d')!;
  noise.width = 200;
  noise.height = 134;
  const { lo, hi } = data.band;
  const st = data.stations;
  const spacing = st[1].freq - st[0].freq;
  let noiseOn = false;
  let nraf = 0;

  const drawNoise = () => {
    nraf = 0;
    const img = nctx.createImageData(noise.width, noise.height);
    const roll = (performance.now() / 14) % noise.height;
    for (let y = 0; y < noise.height; y++) {
      const band = Math.abs(y - roll) < 10 ? 1.4 : 1;
      for (let x = 0; x < noise.width; x++) {
        const v = Math.random() * 200 * band;
        const i = (y * noise.width + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
    }
    nctx.putImageData(img, 0, 0);
    if (noiseOn && !reduced) nraf = requestAnimationFrame(drawNoise);
  };

  let lastCap = -1;
  const onInput = (v: number, a: number) => {
    hit.style.setProperty('--a', `${a}deg`);
    const frac = (v - lo) / (hi - lo);
    const iw = inner.clientWidth;
    const x = frac * iw;
    needle.style.translate = `${x}px 0`;
    // When the scale is wider than the window (phones), slide the scale so the needle stays centred.
    const bw = band.clientWidth;
    const insetL = inner.offsetLeft;
    if (iw + insetL * 2 > bw) {
      const shift = clamp(bw / 2 - insetL - x, bw - iw - insetL * 2, 0);
      inner.style.transform = `translateX(${shift}px)`;
    } else inner.style.transform = '';

    const n = clamp(Math.round((v - st[0].freq) / spacing), 0, st.length - 1);
    const d = Math.abs(v - st[n].freq);
    const s = clamp(1 - d / (spacing * 0.42), 0, 1);
    const sig = s * s * (3 - 2 * s);
    imgs.forEach((im, i) => (im.style.opacity = i === n ? String(sig) : '0'));
    noise.style.opacity = String((1 - sig) * 0.85);
    const wantNoise = sig < 0.99;
    if (wantNoise && !noiseOn) {
      noiseOn = true;
      if (!nraf) drawNoise();
    } else if (!wantNoise) noiseOn = false;
    seg.set(v.toFixed(1));
    const lock = sig > 0.92;
    tuned?.toggleAttribute('data-on', lock);
    presets.forEach((b, i) => b.setAttribute('aria-pressed', String(lock && i === n)));
    marks.forEach((m, i) => m.toggleAttribute('data-on', lock && i === n));
    if (lock && n !== lastCap && cap) {
      lastCap = n;
      cap.textContent = st[n].caption;
      hit.setAttribute('aria-valuetext', `${st[n].freq} MHz — ${st[n].caption}`);
    }
  };

  const knob = new Knob({
    hit,
    min: st[0].freq,
    max: st[st.length - 1].freq,
    step: spacing,
    value: st[0].freq,
    degPerUnit: 40 / spacing,
    angle0: -st[0].freq * (40 / spacing) - 140,
    ratchet: spacing / 8,
    magnet: 0.35,
    spring: { response: 0.42, damping: 0.72 },
    onInput,
    onStop: () => click('detent'),
    onTick: () => click('tick'),
  });
  knob.bindDrag(band, {
    pxPerUnit: () => inner.clientWidth / (hi - lo),
    valueAt: (cx) => lo + ((cx - inner.getBoundingClientRect().left) / inner.clientWidth) * (hi - lo),
  });
  presets.forEach((b, i) => b.addEventListener('click', () => knob.goTo(i)));
  const angleAt = (v: number) => -140 + (v - st[0].freq) * (40 / spacing);
  new ResizeObserver(() => onInput(knob.s.value, angleAt(knob.s.value))).observe(band);

  // First tune-in when it scrolls into view: sweep from static onto station 1.
  if (!reduced) {
    knob.s.set(st[0].freq - spacing * 0.5);
    onInput(knob.s.value, angleAt(knob.s.value));
    new IntersectionObserver(
      ([e], io) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        setTimeout(() => knob.goTo(0), 400);
      },
      { threshold: 0.45 },
    ).observe(band);
  }
}

/* Thermal note printer ------------------------------------------------- */
function printer(data: HwData) {
  const host = $('[data-paper-host]');
  const segHost = $('[data-note-seg]');
  if (!host || !segHost || !data.notes.length) return;
  const seg = new Seg7(segHost, 5);
  const N = data.notes.length;
  let idx = -1;
  let current: HTMLElement | null = null;
  let printing = false;
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);

  const make = (i: number) => {
    const n = data.notes[i];
    const el = document.createElement('article');
    el.className = 'paper';
    el.setAttribute('aria-live', 'polite');
    el.innerHTML = `
      <p class="pp-head"><span>germon.me / log</span><span>#${String(N - i).padStart(2, '0')}</span></p>
      <hr />
      <p class="pp-date">${esc(n.date)}</p>
      <p class="pp-title">${esc(n.title)}</p>
      <p class="pp-body">${esc(n.body)}</p>
      <hr />
      <div class="pp-foot"><span>— J.G.<br/>Sydney</span><span class="pp-code" aria-hidden="true"></span></div>`;
    return el;
  };

  const index = $$('[data-note]');
  const print = (dir: number, to?: number) => {
    if (printing) return;
    const nextIdx = to ?? (idx + dir + N) % N;
    if (nextIdx === idx) return;
    printing = true;
    idx = nextIdx;
    seg.set(`${String(N - idx).padStart(2, '0')}-${String(N).padStart(2, '0')}`);
    index.forEach((b, i) => (i === idx ? b.setAttribute('aria-current', 'true') : b.removeAttribute('aria-current')));
    const old = current;
    const next = make(idx);
    host.append(next);
    current = next;
    if (reduced) {
      old?.remove();
      printing = false;
      return;
    }
    if (old) {
      // Tear-off: the old slip lifts and drops away.
      old.animate(
        [
          { transform: 'translate(0,0) rotate(0)', opacity: 1 },
          { transform: 'translate(-8px,-18px) rotate(-3deg)', opacity: 1, offset: 0.35 },
          { transform: 'translate(-40px,-140px) rotate(-10deg)', opacity: 0 },
        ],
        { duration: 520, easing: 'cubic-bezier(.4,0,.8,.4)', fill: 'forwards' },
      ).finished.then(() => old.remove());
    }
    // Feed: stepped like a thermal head, line by line.
    const lines = 26;
    let n = 0;
    const buzz = window.setInterval(() => {
      click('feed');
      if (++n >= lines) clearInterval(buzz);
    }, 1200 / lines);
    next
      .animate([{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }], {
        duration: 1200,
        easing: `steps(${lines}, end)`,
        delay: old ? 160 : 0,
        fill: 'backwards',
      })
      .finished.then(() => (printing = false));
  };

  $$('[data-print]').forEach((b) => b.addEventListener('click', () => print(Number(b.dataset.print))));
  index.forEach((b, i) => b.addEventListener('click', () => print(0, i)));
  seg.set('--');
  new IntersectionObserver(
    ([e], io) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      setTimeout(() => print(1), 300);
    },
    { threshold: 0.35 },
  ).observe(host);
}

/* Calculator ------------------------------------------------------------- */
function calculator() {
  const host = $('[data-calc-seg]');
  if (!host) return;
  const seg = new Seg7(host, 8);
  let cur = '0';
  let acc: number | null = null;
  let op: string | null = null;
  let fresh = true;
  let greet = 0;

  const fmt = (n: number) => {
    if (!Number.isFinite(n)) return 'Error';
    let s = String(+n.toPrecision(8));
    if (s.replace(/[-.]/g, '').length > 8 || /e/.test(s)) s = n.toExponential(2).replace('e+', 'E').replace('e', 'E');
    return s;
  };
  const show = (s = cur) => seg.set(s.replace('Error', 'Err'));
  const hello = () => {
    clearTimeout(greet);
    seg.set('HELLO');
    greet = window.setTimeout(() => show(), 1600);
  };
  const compute = (a: number, b: number, o: string) =>
    o === '+' ? a + b : o === '−' ? a - b : o === '×' ? a * b : o === '÷' ? (b === 0 ? NaN : a / b) : b;

  const press = (k: string) => {
    clearTimeout(greet);
    if (/^\d$/.test(k)) {
      if (fresh || cur === '0') cur = k;
      else if (cur.replace(/[-.]/g, '').length < 8) cur += k;
      fresh = false;
    } else if (k === '.') {
      if (fresh) cur = '0.';
      else if (!cur.includes('.')) cur += '.';
      fresh = false;
    } else if (k === 'C') {
      cur = '0';
      acc = null;
      op = null;
      fresh = true;
    } else if (k === '±') {
      cur = cur.startsWith('-') ? cur.slice(1) : cur === '0' ? cur : '-' + cur;
    } else if (k === '%') {
      cur = fmt(parseFloat(cur) / 100);
      fresh = true;
    } else if ('+−×÷'.includes(k)) {
      if (op && !fresh && acc !== null) cur = fmt(compute(acc, parseFloat(cur), op));
      acc = parseFloat(cur);
      op = k;
      fresh = true;
    } else if (k === '=') {
      if (op && acc !== null) {
        cur = fmt(compute(acc, parseFloat(cur), op));
        acc = null;
        op = null;
      } else if (cur === '0') return hello();
      fresh = true;
    } else if (k === 'hi') return hello();
    show();
  };

  $$('[data-k]').forEach((b) => b.addEventListener('click', () => press(b.dataset.k!)));
  hello();
  clearTimeout(greet);
}

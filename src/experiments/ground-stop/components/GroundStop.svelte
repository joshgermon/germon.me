<!--
  @component
  The whole app: the globe, the sentence, the moment on stage, the readouts, the airport card,
  the timeline and ⌘K. Server-rendered (the sentence and first moment are in the HTML), then it
  loads the observed day and drives the globe. Every intent (pill, dot, key, palette row,
  airport click) goes through `perform`.
-->
<script lang="ts">
  import { onMount } from 'svelte';

  import { LIFT, STOP, formatClock, formatDuration, phaseAt, type Minute } from '~/experiments/ground-stop/domain/clock';
  import { STALE_AFTER_MS, SWEEP_EVERY, epochOf, type LiveStatus } from '~/experiments/ground-stop/domain/live';
  import type { ObservedDay } from '~/experiments/ground-stop/domain/observed-codec';
  import { createGlobe, type Framing, type Globe, type View } from '~/experiments/ground-stop/engine/globe';
  import { readPalette } from '~/experiments/ground-stop/engine/palette';
  import { loadDay } from '~/experiments/ground-stop/lib/load-day';
  import { trailing } from '~/experiments/ground-stop/domain/observed';
  import { liveMoment, type Moment, type Segment } from '~/experiments/ground-stop/site/moments';

  import About from './About.svelte';
  import AirportCard from './AirportCard.svelte';
  import MomentCard from './MomentCard.svelte';
  import Palette from './Palette.svelte';
  import Readouts from './Readouts.svelte';
  import Sentence from './Sentence.svelte';
  import Timeline from './Timeline.svelte';

  interface Props {
    moments: readonly Moment[];
    segments: readonly Segment[];
    window: { readonly start: Minute; readonly end: Minute };
    dataUrl: string;
    /** The latest sweep's status (JSON). */
    liveUrl: string;
    /** The recorded live sky, in the baked file's format. */
    liveTracksUrl: string;
  }
  let { moments, segments, window: span, dataUrl, liveUrl, liveTracksUrl }: Props = $props();

  /** How often to ask for the live sky: as often as the recorder sweeps. */
  const LIVE_EVERY_MS = SWEEP_EVERY * 60_000;
  /** On first load the evening starts playing once the camera has arrived. */
  const AUTOPLAY_AFTER_MS = 1800;
  /** Take-offs are counted over 15 minutes, so the live stretch starts that far into the record. */
  const LIVE_LEAD = 15;

  /** Everything a person can ask for. */
  type Action =
    | { readonly _tag: 'Moment'; readonly id: string }
    | { readonly _tag: 'Step'; readonly by: -1 | 1 }
    | { readonly _tag: 'Airport'; readonly code: string | null }
    | { readonly _tag: 'Scrub'; readonly minute: Minute }
    | { readonly _tag: 'TogglePlay' }
    | { readonly _tag: 'Speed'; readonly minutesPerSecond: number }
    | { readonly _tag: 'GoLive' }
    | { readonly _tag: 'Palette'; readonly open: boolean }
    | { readonly _tag: 'About'; readonly open: boolean };

  type Lifecycle =
    | { readonly _tag: 'Loading' }
    | { readonly _tag: 'Ready'; readonly day: ObservedDay }
    | { readonly _tag: 'NoWebGL'; readonly day: ObservedDay }
    | { readonly _tag: 'Failed' };

  let lifecycle = $state<Lifecycle>({ _tag: 'Loading' });
  const first = $derived(moments[0]);
  let time: Minute = $state(STOP);
  let playing = $state(false);
  let speed = $state(8);
  let liveStatus = $state<LiveStatus | null>(null);
  /** The recorded live sky: the last 90 minutes of flights, replaced as sweeps arrive. */
  let liveDay = $state.raw<ObservedDay | null>(null);
  let following = $state(false);
  let airport: string | null = $state(null);
  let paletteOpen = $state(false);
  let aboutOpen = $state(false);
  let hoveringAirport = $state(false);
  let canvas: HTMLCanvasElement | undefined = $state();
  /** `?og`: the link-preview composition (no controls, no live polling), for `pnpm experiment:og`. */
  let og = $state(false);
  let labelLayer: HTMLDivElement | undefined = $state();

  let globe: Globe | null = null;
  let tween = 0;
  let reduced = false;
  /** Desktop, or a small screen held upright or sideways: decides framing and what's shown. */
  type Layout = 'desktop' | 'portrait' | 'landscape';
  let layout = $state<Layout>('desktop');
  const COMPACT = '(max-width: 680px), (max-height: 520px)';
  /** The `tight:` variant (styles/tokens.css): the readouts are condensed and the card collapses. */
  const TIGHT = '(max-height: 640px), (max-width: 1100px) and (max-height: 900px)';
  let tight = $state(false);
  let sentenceEl: HTMLElement | undefined = $state();
  let dockEl: HTMLElement | undefined = $state();
  let hudEl: HTMLElement | undefined = $state();
  let timelineEl: HTMLElement | undefined = $state();
  /** Desktop: where the cards leave room for the globe, and how far to pull back so the US fits. */
  let fit = $state.raw({ offset: { x: 0.04, y: -0.02 }, zoom: 1 });
  /** The contiguous US at the default view, as fractions of the viewport's height. */
  const US_SPAN = { width: 0.56, height: 0.34 };
  const FIT_GAP = 16;

  const day = $derived(lifecycle._tag === 'Ready' || lifecycle._tag === 'NoWebGL' ? lifecycle.day : null);
  /** The moment on stage: the latest one the clock has reached. */
  const activeIndex = $derived(Math.max(0, moments.findLastIndex((m) => m.time <= time + 0.5)));
  const active = $derived(moments[activeIndex]);

  /** The live stretch of the clock: the recorded minutes, which start after the baked evening. */
  const liveSpan = $derived.by((): { readonly start: Minute; readonly end: Minute } | null => {
    if (!liveDay) return null;
    const { start, end } = liveDay.window;
    const from = Math.max(span.end + 1, end - start > 2 * LIVE_LEAD ? start + LIVE_LEAD : start);
    return end > from ? { start: from, end } : null;
  });
  /** The latest minute there's anything to show: the baked data, or the live sky past it. */
  const end = $derived(liveSpan?.end ?? span.end);
  const isLive = $derived(liveSpan !== null && time > span.end);

  const setTime = (m: Minute): void => {
    let next = Math.max(span.start, Math.min(end, m));
    // Nothing is recorded between the baked evening and the live stretch: step over it.
    if (liveSpan && next > span.end && next < liveSpan.start) next = m > time ? liveSpan.start : span.end;
    time = next;
    globe?.setTime(time);
  };
  const frame = (v: View): View =>
    layout === 'portrait'
      ? { ...v, distance: v.distance * 1.6 }
      : layout === 'landscape'
        ? { ...v, distance: v.distance * 1.15 }
        : { ...v, distance: 1 + (v.distance - 1) * fit.zoom };
  /** Where the globe sits: centred in the space the controls leave free. */
  const framing = (l: Layout): Framing =>
    og
      ? { offset: { x: 0.2, y: 0 }, labels: 7 }
      : l === 'portrait'
        ? { offset: { x: 0, y: -0.05 }, labels: 4 }
        : l === 'landscape'
          ? { offset: { x: 0, y: -0.07 }, labels: 4 }
          : { offset: fit.offset, labels: fit.zoom > 1.25 ? 4 : 7 };
  const layoutNow = (): Layout => (!matchMedia(COMPACT).matches ? 'desktop' : innerWidth > innerHeight ? 'landscape' : 'portrait');

  const box = (el: HTMLElement | undefined): DOMRect | null => el?.getBoundingClientRect() ?? null;
  /** The view the camera should be resting on. */
  const restingView = (): View | null => {
    const a = day?.airports.find((x) => x.code === airport);
    return a ? { lat: a.lat - 4, lon: a.lon, distance: 2.1 } : ((liveCard ?? active)?.view ?? null);
  };
  /**
   * Desktop: find the biggest clear space between the cards (beside the moment card, or in the
   * band between the top and bottom cards), centre the globe there, and pull back until the US
   * fits. Small screens keep their fixed framing.
   */
  const refit = (): void => {
    if (og || layout !== 'desktop') return;
    const W = innerWidth;
    const H = innerHeight;
    const sentence = box(sentenceEl);
    const dock = box(dockEl);
    const hud = box(hudEl);
    const floor = (box(timelineEl)?.top ?? H) - FIT_GAP;
    const top = (sentence?.bottom ?? 0) + FIT_GAP;
    const spaces = [
      { x0: (dock?.right ?? 0) + FIT_GAP, x1: (hud?.left ?? W) - FIT_GAP, y0: top, y1: floor },
      { x0: FIT_GAP, x1: W - FIT_GAP, y0: Math.max(top, (hud?.bottom ?? 0) + FIT_GAP), y1: (dock?.top ?? floor) - FIT_GAP },
    ].map((r) => ({ ...r, scale: Math.min((r.x1 - r.x0) / (US_SPAN.width * H), (r.y1 - r.y0) / (US_SPAN.height * H)) }));
    const best = spaces.reduce((a, b) => (b.scale > a.scale ? b : a));
    const scale = Math.max(0.45, Math.min(1, best.scale));
    const next = {
      offset: { x: ((best.x0 + best.x1) / 2 - W / 2) / W, y: ((best.y0 + best.y1) / 2 - H / 2) / H },
      zoom: 1 / scale,
    };
    if (Math.abs(next.offset.x - fit.offset.x) < 0.01 && Math.abs(next.offset.y - fit.offset.y) < 0.01 && Math.abs(next.zoom - fit.zoom) < 0.03) return;
    fit = next;
    globe?.setFraming(framing(layout));
    const view = restingView();
    if (view) globe?.flyTo(frame(view));
  };

  /** Ease the clock to a minute, so the sky visibly changes on the way. */
  const animateTo = (target: Minute): void => {
    cancelAnimationFrame(tween);
    playing = false;
    // Never sweep the clock across the unrecorded gap between the evening and now.
    if (reduced || (liveSpan !== null && time <= span.end !== target <= span.end)) {
      setTime(target);
      return;
    }
    const from = time;
    const ms = Math.max(700, Math.min(2600, Math.abs(target - from) * 11));
    const startedAt = performance.now();
    const step = (now: number): void => {
      const t = Math.min(1, (now - startedAt) / ms);
      setTime(from + (target - from) * (1 - (1 - t) ** 3));
      if (t < 1) tween = requestAnimationFrame(step);
    };
    tween = requestAnimationFrame(step);
  };

  const play = (): void => {
    cancelAnimationFrame(tween);
    // Play the stretch the clock is in: the evening, or the live record.
    const stretch = isLive && liveSpan ? liveSpan : span;
    if (time >= stretch.end - 1) setTime(stretch.start);
    playing = true;
    let last = performance.now();
    const step = (now: number): void => {
      if (!playing) return;
      // Eight minutes of the evening per second: the whole thing in about a minute.
      setTime(Math.min(stretch.end, time + ((now - last) / 1000) * speed));
      last = now;
      if (time >= stretch.end) {
        playing = false;
        // The evening has played out: carry on to the sky as it is now.
        if (stretch === span && liveSpan) perform({ _tag: 'GoLive' });
        return;
      }
      tween = requestAnimationFrame(step);
    };
    tween = requestAnimationFrame(step);
  };

  const perform = (action: Action): void => {
    switch (action._tag) {
      case 'Moment': {
        const m = moments.find((x) => x.id === action.id);
        if (!m) return;
        animateTo(m.time);
        if (!airport) globe?.flyTo(frame(m.view));
        // The address names the moment, so it can be shared.
        history.replaceState(null, '', `?m=${m.id}`);
        return;
      }
      case 'Step': {
        // The live stretch is one more step after the last moment.
        if (isLive) {
          const final = moments.at(-1);
          if (action.by === -1 && final) perform({ _tag: 'Moment', id: final.id });
          return;
        }
        if (action.by === 1 && activeIndex === moments.length - 1 && liveSpan) {
          perform({ _tag: 'GoLive' });
          return;
        }
        const next = moments[Math.max(0, Math.min(moments.length - 1, activeIndex + action.by))];
        if (next) perform({ _tag: 'Moment', id: next.id });
        return;
      }
      case 'Airport': {
        airport = action.code;
        globe?.focus(action.code);
        const a = day?.airports.find((x) => x.code === action.code);
        if (a) globe?.flyTo(frame({ lat: a.lat - 4, lon: a.lon, distance: 2.1 }));
        else if (active) globe?.flyTo(frame(active.view));
        return;
      }
      case 'Scrub':
        cancelAnimationFrame(tween);
        playing = false;
        following = action.minute >= end - 0.5;
        setTime(action.minute);
        return;
      case 'Speed':
        speed = action.minutesPerSecond;
        return;
      case 'GoLive':
        following = true;
        animateTo(end);
        if (!airport && liveCard) globe?.flyTo(frame(liveCard.view));
        return;
      case 'TogglePlay':
        if (playing) {
          playing = false;
          cancelAnimationFrame(tween);
        } else play();
        return;
      case 'Palette':
        paletteOpen = action.open;
        return;
      case 'About':
        aboutOpen = action.open;
        return;
    }
  };

  const typing = (target: EventTarget | null): boolean =>
    target instanceof HTMLInputElement || (target instanceof HTMLElement && target.getAttribute('role') === 'slider');

  const keydown = (e: KeyboardEvent): void => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      perform({ _tag: 'Palette', open: !paletteOpen });
      return;
    }
    if (paletteOpen || aboutOpen || typing(e.target)) return;
    if (e.key === 'ArrowRight') perform({ _tag: 'Step', by: 1 });
    else if (e.key === 'ArrowLeft') perform({ _tag: 'Step', by: -1 });
    else if (e.key === 'Escape' && airport) perform({ _tag: 'Airport', code: null });
    else if (e.key === ' ' && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault();
      perform({ _tag: 'TogglePlay' });
    }
  };

  // A click (not a drag) on the globe picks the airport under it.
  let downAt: { x: number; y: number } | null = null;
  const local = (e: PointerEvent): { x: number; y: number } => {
    const r = canvas?.getBoundingClientRect();
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
  };
  const pointerdown = (e: PointerEvent): void => {
    downAt = local(e);
  };
  const pointerup = (e: PointerEvent): void => {
    const p = local(e);
    if (!downAt || Math.hypot(p.x - downAt.x, p.y - downAt.y) > 5) return;
    const code = globe?.airportAt(p.x, p.y) ?? null;
    if (code) perform({ _tag: 'Airport', code });
  };
  const pointermove = (e: PointerEvent): void => {
    if (e.pointerType !== 'mouse') return;
    const p = local(e);
    hoveringAirport = (globe?.airportAt(p.x, p.y) ?? null) !== null;
  };

  /** Fetch the live sky when the recorder has something newer; follow it if we're at the live edge. */
  const poll = async (): Promise<void> => {
    let next: LiveStatus;
    try {
      const res = await fetch(liveUrl);
      // 204: the recorder has nothing yet.
      if (!res.ok || res.status === 204) return;
      // SAFETY: our own route's JSON, written by server/recorder.ts as a `LiveStatus`.
      next = (await res.json()) as LiveStatus;
    } catch {
      return;
    }
    // A recorder that has stopped isn't live; an unchanged status has nothing new to draw.
    if (Date.now() - next.at > STALE_AFTER_MS || (liveStatus && next.at <= liveStatus.at)) return;
    const recorded = await loadDay(liveTracksUrl);
    if (recorded._tag === 'Err') return;
    const wasAtEdge = following || time >= end - 0.5;
    liveStatus = next;
    liveDay = recorded.value;
    globe?.setLive(recorded.value);
    if (wasAtEdge && !playing) setTime(recorded.value.window.end);
  };

  /** Poll only while someone can see the page. */
  const onVisible = (): void => {
    if (document.visibilityState === 'visible') void poll();
  };

  onMount(() => {
    reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    layout = layoutNow();
    tight = matchMedia(TIGHT).matches;
    let disposed = false;
    let autoplay: ReturnType<typeof setTimeout> | undefined;
    // `?m=<moment>` opens on that moment; `?og` draws the link-preview composition.
    const params = new URLSearchParams(location.search);
    og = params.has('og');
    const start = moments.find((m) => m.id === params.get('m')) ?? first;
    if (start) time = start.time;
    void loadDay(dataUrl).then((result) => {
      if (disposed) return;
      if (result._tag === 'Err' || !canvas || !labelLayer || !start) {
        if (result._tag === 'Err') console.error('ground-stop: could not load data', result.error);
        lifecycle = { _tag: 'Failed' };
        return;
      }
      const loaded = result.value;
      try {
        globe = createGlobe({
          canvas,
          labelLayer,
          day: loaded,
          palette: readPalette(document.documentElement),
          reducedMotion: reduced,
          interactive: matchMedia('(hover: hover) and (pointer: fine)').matches,
          framing: framing(layout),
          // Arrive from far out, then settle on the moment (straight there when still).
          initial: reduced || og ? frame(start.view) : { ...frame(start.view), lon: start.view.lon + 70, distance: 7 },
        });
        lifecycle = { _tag: 'Ready', day: loaded };
        setTime(time);
        // The readouts render now that the day is here; place the globe once they have.
        requestAnimationFrame(refit);
        if (og) {
          // Two frames: one to draw, one to place the labels. Then the capture script shoots.
          requestAnimationFrame(() => requestAnimationFrame(() => (document.documentElement.dataset['ogReady'] = '')));
          return;
        }
        globe.flyTo(frame(start.view));
        void poll();
        // Arriving with no moment asked for: let the camera settle, then play the evening.
        // Any touch of the controls takes over. Never under reduced motion.
        if (!reduced && !params.has('m')) {
          autoplay = setTimeout(() => {
            if (!disposed && !playing && time === start.time) play();
          }, AUTOPLAY_AFTER_MS);
        }
      } catch (error) {
        console.error(error);
        lifecycle = { _tag: 'NoWebGL', day: loaded };
      }
    });
    const timer = setInterval(onVisible, LIVE_EVERY_MS);
    document.addEventListener('visibilitychange', onVisible);
    // Rotating or resizing can change the layout: re-place the globe and re-frame the view.
    const onResize = (): void => {
      tight = matchMedia(TIGHT).matches;
      const next = layoutNow();
      if (next !== layout) {
        layout = next;
        globe?.setFraming(framing(next));
        const view = restingView();
        if (view) globe?.flyTo(frame(view));
      }
      // The cards have moved: once they've been laid out again, re-place the globe among them.
      requestAnimationFrame(refit);
    };
    addEventListener('resize', onResize);
    return () => {
      disposed = true;
      clearTimeout(autoplay);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      removeEventListener('resize', onResize);
      cancelAnimationFrame(tween);
      globe?.dispose();
      globe = null;
    };
  });

  // At the live edge the sky keeps moving between sweeps: flights are carried along their last
  // heading by the time since the latest reading, a second at a time.
  $effect(() => {
    const at = liveStatus?.at;
    if (!isLive || playing || time < end - 0.01 || at === undefined || reduced) {
      globe?.setLiveDrift(0);
      return;
    }
    const drift = (): void => globe?.setLiveDrift((Date.now() - at) / 60_000);
    drift();
    const ticking = setInterval(drift, 1000);
    return () => clearInterval(ticking);
  });

  // Going live (or back) changes what the cards hold, so the clear space changes with it.
  $effect(() => {
    void isLive;
    void tight;
    requestAnimationFrame(refit);
  });

  const liveDate = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', day: 'numeric', month: 'short' });
  const phase = $derived(phaseAt(time));
  const clock = $derived(formatClock(time));
  const status = $derived(
    isLive
      ? `Live · ${liveDate.format(epochOf(time))}`
      : phase === 'before'
        ? 'Normal operations'
        : phase === 'stopped'
          ? `Ground stop · ${formatDuration(time - STOP)}`
          : `Reopened · ${formatDuration(time - LIFT)} ago`,
  );
  /** Past the baked data, the live count at (or just before) the clock. */
  const fmt = (n: number): string => n.toLocaleString('en-US');
  /** One line for the collapsed moment card: airline flights in the air now, against last Friday. */
  const stat = $derived.by((): string => {
    if (!day) return '';
    const i = Math.max(0, Math.min(day.series.length - 1, Math.floor(time - day.window.start)));
    const now = time > day.window.end ? liveAirborne : (day.series.usAirborne[i] ?? 0);
    const week = day.series.usAirborneBaseline[i] ?? 0;
    return now === null ? 'Live' : time > day.window.end ? `${fmt(now)} in the air now` : `${fmt(now)} in the air · last Fri ${fmt(week)}`;
  });
  /** Airports the FAA lists with a ground stop or delays right now. */
  const delayed = $derived(liveStatus?.faa ? liveStatus.faa.statuses.filter((x) => x.kind !== 'Closure').length : null);
  /** Past the baked data: what the recorder measured at the clock, as the card on stage. */
  const liveCard = $derived.by((): Moment | null => {
    if (!isLive || !liveDay) return null;
    const { series, window } = liveDay;
    const i = Math.max(0, Math.min(series.length - 1, Math.floor(time - window.start)));
    const lastWeek = series.usAirborneBaseline[i] ?? 0;
    return liveMoment({
      time,
      airborne: series.usAirborne[i] ?? 0,
      departures: trailing(series.departures, i, 15),
      lastWeek: lastWeek > 0 ? lastWeek : null,
      delayed,
    });
  });
  const liveAirborne = $derived(liveCard && liveDay ? (liveDay.series.usAirborne[Math.max(0, Math.min(liveDay.series.length - 1, Math.floor(time - liveDay.window.start)))] ?? 0) : null);
</script>

<svelte:window onkeydown={keydown} />

<!-- The globe -->
<div class="fixed inset-0 z-0">
  <canvas
    bind:this={canvas}
    class={[
      'size-full transition-opacity duration-(--duration-reveal) ease-out-strong',
      lifecycle._tag === 'Ready' ? 'opacity-100' : 'opacity-0',
      hoveringAirport && 'cursor-pointer',
    ]}
    aria-label="A globe of real US air traffic on 13 November 2026"
    onpointerdown={pointerdown}
    onpointerup={pointerup}
    onpointermove={pointermove}
  ></canvas>
  <div bind:this={labelLayer} class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true"></div>
  {#if lifecycle._tag === 'Loading'}
    <p class="absolute inset-x-0 top-1/2 text-center font-mono text-caption text-fg-subtle">Loading the evening’s flights…</p>
  {:else if lifecycle._tag === 'Failed'}
    <p class="absolute inset-x-0 top-1/2 text-center text-body text-fg-subtle">Couldn’t load the flight data. Try reloading.</p>
  {:else if lifecycle._tag === 'NoWebGL'}
    <p class="absolute inset-x-0 top-1/2 text-center text-body text-fg-subtle">This browser can’t draw the globe (WebGL is off), but the numbers still work.</p>
  {/if}
</div>

<!-- Top bar -->
<header class="pointer-events-none fixed inset-x-gutter top-4 z-30 flex items-start gap-3 compact:inset-x-4 compact:top-3">
  <nav class="pointer-events-auto flex items-center gap-2 whitespace-nowrap pt-1.5 text-bar compact:pt-1 compact:text-caption">
    <a href="https://germon.me" class="pressable text-fg-muted hover:text-fg">germon.me</a>
    <span class="text-fg-faint">/</span>
    <span class="text-fg">Ground stop</span>
  </nav>
  {#if !og}<button
    type="button"
    class="pressable pointer-events-auto mx-auto flex h-9 items-center gap-2.5 rounded-bar border border-line bg-glass pl-3 pr-2 text-bar text-fg-subtle shadow-float backdrop-blur-(--blur-window) hover:bg-glass-hover hover:text-fg-muted compact:hidden"
    onclick={() => perform({ _tag: 'Palette', open: true })}
  >
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.75" fill="none" stroke="currentColor" stroke-width="1.5" /><path d="m10.5 10.5 3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
    Jump to a moment or airport
    <span class="flex gap-[3px]" aria-hidden="true"><kbd class="grid h-5 min-w-5 place-items-center rounded-xs bg-kbd px-1 text-micro text-fg-muted">⌘</kbd><kbd class="grid h-5 min-w-5 place-items-center rounded-xs bg-kbd px-1 text-micro text-fg-muted">K</kbd></span>
  </button>{/if}
  <div class="ml-auto flex flex-col items-end gap-1.5 short:flex-row-reverse short:items-center short:gap-2">
    <p class="whitespace-nowrap font-mono text-clock tracking-tight text-fg tabular compact:text-title">
      {clock.time}<span class="ml-1 text-body text-fg-subtle">{clock.meridiem} ET</span>
    </p>
    <p class="inline-flex items-center gap-2 whitespace-nowrap rounded-pill border border-line bg-glass px-2.5 py-1 text-caption text-fg-muted backdrop-blur-(--blur-window) compact:gap-1.5 compact:px-2 compact:py-0.5 compact:text-micro">
      <span
        class={[
          'size-1.5 rounded-pill',
          isLive ? 'animate-live bg-released' : phase === 'stopped' ? 'bg-held' : phase === 'reopened' ? 'bg-released' : 'bg-fg-subtle',
        ]}
      ></span>
      <span class="tabular">{status}</span>
      {#if isLive && liveStatus && time >= end - 0.5}
        <!-- Room for the count on wide screens only; the card carries the numbers on small ones. -->
        <span class="tabular compact:hidden">· {liveStatus.tracked.toLocaleString('en-US')} flights tracked</span>
      {/if}
    </p>
  </div>
</header>

<!-- A soft veil behind the sentence, so it reads over the dots. -->
<div class="veil pointer-events-none fixed inset-0 z-10" aria-hidden="true"></div>

<!-- The sentence -->
<div bind:this={sentenceEl} class="pointer-events-none fixed left-gutter top-24 z-20 max-w-(--container-sentence) compact:hidden">
  <Sentence {segments} active={active?.id ?? ''} onmoment={(id) => perform({ _tag: 'Moment', id })} />
</div>

{#if og}
  <!-- Link preview: what the data is, where it lives. -->
  <p class="fixed bottom-gutter left-gutter z-20 text-body text-fg-muted">
    Real ADS-B flight data, compared with the previous Friday · <span class="text-fg">germon.me/experiments</span>
  </p>
{:else}
<!-- The moment on stage, or the airport you picked -->
<div bind:this={dockEl} class="fixed bottom-(--spacing-dock) left-gutter z-20 w-(--container-moment) compact:bottom-(--spacing-dock-compact) phone:inset-x-3 phone:w-auto short:left-3 short:w-(--container-moment-short)">
  {#if airport && day}
    <AirportCard {day} code={airport} {time} onclose={() => perform({ _tag: 'Airport', code: null })} />
  {:else if active}
    <MomentCard
      moment={liveCard ?? active}
      index={liveCard ? moments.length : activeIndex}
      total={moments.length + (liveSpan ? 1 : 0)}
      collapsible={layout !== 'desktop' || tight}
      {stat}
      onstep={(by) => perform({ _tag: 'Step', by })}
    />
  {/if}
</div>

<!-- Readouts -->
{#if day}
  <aside
    bind:this={hudEl}
    class="fixed right-gutter top-28 z-20 w-(--container-hud) rounded-window border border-line bg-glass p-4 shadow-float backdrop-blur-(--blur-window) compact:hidden"
    aria-label="Readouts"
  >
    <Readouts {day} {time} live={isLive ? liveDay : null} faa={liveStatus?.faa ?? null} {delayed} onabout={() => perform({ _tag: 'About', open: true })} />
  </aside>
{/if}

<!-- Timeline -->
<div bind:this={timelineEl} class="fixed inset-x-gutter bottom-4 z-30 mx-auto max-w-(--container-timeline) compact:inset-x-3 compact:bottom-3">
  <Timeline
    {time}
    start={span.start}
    end={span.end}
    live={liveSpan}
    {playing}
    {speed}
    {isLive}
    onspeed={(minutesPerSecond) => perform({ _tag: 'Speed', minutesPerSecond })}
    ongolive={() => perform({ _tag: 'GoLive' })}
    {moments}
    active={active?.id ?? ''}
    onscrub={(minute) => perform({ _tag: 'Scrub', minute })}
    ontoggle={() => perform({ _tag: 'TogglePlay' })}
    onmoment={(id) => perform({ _tag: 'Moment', id })}
  />
</div>

{/if}

{#if paletteOpen && day}
  <Palette
    {moments}
    airports={day.airports}
    onmoment={(id) => perform({ _tag: 'Moment', id })}
    onairport={(code) => perform({ _tag: 'Airport', code })}
    onclose={() => perform({ _tag: 'Palette', open: false })}
  />
{/if}
{#if aboutOpen}
  <About onclose={() => perform({ _tag: 'About', open: false })} />
{/if}

<style>
  .veil {
    background: radial-gradient(70% 55% at 0% 0%, var(--color-veil), transparent 72%);
  }
  /* Small screens: just enough at the top and bottom for the bar and the dock to read. */
  @media (max-width: 680px), (max-height: 520px) {
    .veil {
      background: linear-gradient(180deg, var(--color-veil) 0%, transparent 16%, transparent 76%, var(--color-veil) 100%);
    }
  }
</style>

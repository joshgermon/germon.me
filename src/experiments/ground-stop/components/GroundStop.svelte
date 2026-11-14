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
  import { minuteOf, type LiveSnapshot } from '~/experiments/ground-stop/domain/live';
  import type { ObservedDay } from '~/experiments/ground-stop/domain/observed-codec';
  import { createGlobe, type Globe, type View } from '~/experiments/ground-stop/engine/globe';
  import { readPalette } from '~/experiments/ground-stop/engine/palette';
  import { loadDay } from '~/experiments/ground-stop/lib/load-day';
  import type { Moment, Segment } from '~/experiments/ground-stop/site/moments';

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
    liveUrl: string;
  }
  let { moments, segments, window: span, dataUrl, liveUrl }: Props = $props();

  /** How often to ask for the live sky (the route is edge-cached for as long). */
  const LIVE_EVERY_MS = 120_000;

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
  let live = $state<LiveSnapshot | null>(null);
  /** Live readings since the page opened, minute → airline flights over the US. */
  let liveSeries = $state<ReadonlyMap<number, number>>(new Map());
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
  let phone = false;

  const day = $derived(lifecycle._tag === 'Ready' || lifecycle._tag === 'NoWebGL' ? lifecycle.day : null);
  /** The moment on stage: the latest one the clock has reached. */
  const activeIndex = $derived(Math.max(0, moments.findLastIndex((m) => m.time <= time + 0.5)));
  const active = $derived(moments[activeIndex]);

  /** The latest minute there's anything to show: the baked data, or the live sky past it. */
  const end = $derived(live ? Math.max(span.end, minuteOf(live.at)) : span.end);
  const isLive = $derived(live !== null && time > span.end);

  const setTime = (m: Minute): void => {
    time = Math.max(span.start, Math.min(end, m));
    globe?.setTime(time);
  };
  const frame = (v: View): View => (phone ? { ...v, distance: v.distance * 1.8 } : v);

  /** Ease the clock to a minute, so the sky visibly changes on the way. */
  const animateTo = (target: Minute): void => {
    cancelAnimationFrame(tween);
    playing = false;
    if (reduced) {
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
    if (time >= end - 1) setTime(span.start);
    playing = true;
    let last = performance.now();
    const step = (now: number): void => {
      if (!playing) return;
      // Eight minutes of the evening per second: the whole thing in about a minute.
      setTime(time + ((now - last) / 1000) * speed);
      last = now;
      if (time >= end) {
        playing = false;
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

  /** Fetch the live sky; follow it if we're already at the live edge. */
  const poll = async (): Promise<void> => {
    let snapshot: LiveSnapshot;
    try {
      const res = await fetch(liveUrl);
      if (!res.ok) return;
      // SAFETY: our own route's JSON (server/live-sky.ts); the shape is fixed there.
      snapshot = (await res.json()) as LiveSnapshot;
    } catch {
      return;
    }
    if (live && snapshot.at <= live.at) return;
    const wasAtEdge = following || time >= end - 0.5;
    live = snapshot;
    liveSeries = new Map([...liveSeries, [Math.round(minuteOf(snapshot.at)), snapshot.usAirborne]]);
    globe?.setLive(snapshot);
    if (wasAtEdge && !playing) setTime(minuteOf(snapshot.at));
  };

  /** Poll only while someone can see the page. */
  const onVisible = (): void => {
    if (document.visibilityState === 'visible') void poll();
  };

  onMount(() => {
    reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    phone = matchMedia('(max-width: 680px)').matches;
    let disposed = false;
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
          // Share image: globe to the right, so the sentence sits on clear sky.
          offset: og ? { x: 0.2, y: 0 } : phone ? { x: 0, y: -0.06 } : { x: 0.04, y: -0.02 },
          // Arrive from far out, then settle on the moment (straight there when still).
          initial: reduced || og ? frame(start.view) : { ...frame(start.view), lon: start.view.lon + 70, distance: 7 },
        });
        lifecycle = { _tag: 'Ready', day: loaded };
        setTime(time);
        if (og) {
          // Two frames: one to draw, one to place the labels. Then the capture script shoots.
          requestAnimationFrame(() => requestAnimationFrame(() => (document.documentElement.dataset['ogReady'] = '')));
          return;
        }
        globe.flyTo(frame(start.view));
        void poll();
      } catch (error) {
        console.error(error);
        lifecycle = { _tag: 'NoWebGL', day: loaded };
      }
    });
    const timer = setInterval(onVisible, LIVE_EVERY_MS);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      disposed = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      cancelAnimationFrame(tween);
      globe?.dispose();
      globe = null;
    };
  });

  const phase = $derived(phaseAt(time));
  const clock = $derived(formatClock(time));
  const status = $derived(
    isLive
      ? `Live · ${live?.aircraft.length.toLocaleString('en-US') ?? 0} flights tracked`
      : phase === 'before'
        ? 'Normal operations'
        : phase === 'stopped'
          ? `Ground stop · ${formatDuration(time - STOP)}`
          : `Reopened · ${formatDuration(time - LIFT)} ago`,
  );
  /** Past the baked data, the live count at (or just before) the clock. */
  const liveAirborne = $derived.by((): number | null => {
    if (!isLive) return null;
    let best: number | null = null;
    for (const [m, v] of liveSeries) if (m <= time + 1) best = v;
    return best;
  });
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
<header class="pointer-events-none fixed inset-x-gutter top-4 z-30 flex items-start gap-3 phone:inset-x-4">
  <nav class="pointer-events-auto flex items-center gap-2 pt-1.5 text-bar">
    <a href="https://germon.me" class="pressable text-fg-muted hover:text-fg">germon.me</a>
    <span class="text-fg-faint">/</span>
    <span class="text-fg">Ground stop</span>
  </nav>
  {#if !og}<button
    type="button"
    class="pressable pointer-events-auto mx-auto flex h-9 items-center gap-2.5 rounded-bar border border-line bg-glass pl-3 pr-2 text-bar text-fg-subtle shadow-float backdrop-blur-(--blur-window) hover:bg-glass-hover hover:text-fg-muted phone:hidden"
    onclick={() => perform({ _tag: 'Palette', open: true })}
  >
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.75" fill="none" stroke="currentColor" stroke-width="1.5" /><path d="m10.5 10.5 3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
    Jump to a moment or airport
    <span class="flex gap-[3px]" aria-hidden="true"><kbd class="grid h-5 min-w-5 place-items-center rounded-xs bg-kbd px-1 text-micro text-fg-muted">⌘</kbd><kbd class="grid h-5 min-w-5 place-items-center rounded-xs bg-kbd px-1 text-micro text-fg-muted">K</kbd></span>
  </button>{/if}
  <div class="ml-auto text-right">
    <p class="font-mono text-clock tracking-tight text-fg tabular phone:text-title">
      {clock.time}<span class="ml-1 text-body text-fg-subtle">{clock.meridiem} ET</span>
    </p>
    <p class="mt-1.5 inline-flex items-center gap-2 rounded-pill border border-line bg-glass px-2.5 py-1 text-caption text-fg-muted backdrop-blur-(--blur-window)">
      <span
        class={[
          'size-1.5 rounded-pill',
          isLive ? 'animate-live bg-released' : phase === 'stopped' ? 'bg-held' : phase === 'reopened' ? 'bg-released' : 'bg-fg-subtle',
        ]}
      ></span>
      <span class="tabular">{status}</span>
    </p>
  </div>
</header>

<!-- A soft veil behind the sentence, so it reads over the dots. -->
<div class="veil pointer-events-none fixed inset-0 z-10" aria-hidden="true"></div>

<!-- The sentence -->
<div class="pointer-events-none fixed left-gutter top-24 z-20 max-w-(--container-sentence) phone:inset-x-4 phone:top-20 phone:max-w-none">
  <Sentence {segments} active={active?.id ?? ''} onmoment={(id) => perform({ _tag: 'Moment', id })} />
</div>

{#if og}
  <!-- Link preview: what the data is, where it lives. -->
  <p class="fixed bottom-gutter left-gutter z-20 text-body text-fg-muted">
    Real ADS-B flight data, compared with the previous Friday · <span class="text-fg">germon.me/experiments</span>
  </p>
{:else}
<!-- The moment on stage, or the airport you picked -->
<div class="fixed bottom-(--spacing-dock) left-gutter z-20 w-(--container-moment) phone:inset-x-3 phone:bottom-(--spacing-dock-phone) phone:w-auto">
  {#if airport && day}
    <AirportCard {day} code={airport} {time} onclose={() => perform({ _tag: 'Airport', code: null })} />
  {:else if active}
    <MomentCard moment={active} index={activeIndex} total={moments.length} onstep={(by) => perform({ _tag: 'Step', by })} />
  {/if}
</div>

<!-- Readouts -->
{#if day}
  <aside
    class="fixed right-gutter top-28 z-20 w-(--container-hud) rounded-window border border-line bg-glass p-4 shadow-float backdrop-blur-(--blur-window) phone:hidden"
    aria-label="Readouts"
  >
    <Readouts {day} {time} {liveAirborne} faa={live?.faa ?? null} onabout={() => perform({ _tag: 'About', open: true })} />
  </aside>
{/if}

<!-- Timeline -->
<div class="fixed inset-x-gutter bottom-4 z-30 mx-auto max-w-(--container-timeline) phone:inset-x-3 phone:bottom-3">
  <Timeline
    {time}
    start={span.start}
    {end}
    baked={span.end}
    {playing}
    {speed}
    live={live !== null}
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
  @media (max-width: 680px) {
    .veil {
      background: linear-gradient(180deg, var(--color-veil) 0%, transparent 34%, transparent 70%, var(--color-veil) 100%);
    }
  }
</style>

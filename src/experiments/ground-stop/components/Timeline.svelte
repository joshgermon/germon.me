<!--
  @component
  The scrubber: the evening as a track, the stop as a red band, each moment as a dot you can
  click, and a playhead you can drag (or move with the arrow keys while focused).
-->
<script lang="ts">
  import { LIFT, STOP, at, formatClockShort, type Minute } from '~/experiments/ground-stop/domain/clock';
  import type { Moment } from '~/experiments/ground-stop/site/moments';

  interface Props {
    time: Minute;
    start: Minute;
    end: Minute;
    /** Where the baked data stops; past it is the live sky. */
    baked: Minute;
    playing: boolean;
    /** Playback speed, minutes of the evening per second. */
    speed: number;
    /** Whether a live snapshot has arrived. */
    live: boolean;
    /** Whether the clock is past the baked data, on the live sky. */
    isLive: boolean;
    onspeed: (minutesPerSecond: number) => void;
    ongolive: () => void;
    moments: readonly Moment[];
    active: string;
    onscrub: (minute: Minute) => void;
    ontoggle: () => void;
    onmoment: (id: string) => void;
  }
  let { time, start, end, baked, playing, speed, live, isLive, moments, active, onscrub, ontoggle, onmoment, onspeed, ongolive }: Props = $props();

  const SPEEDS = [2, 8, 20] as const;

  const span = $derived(end - start);
  const x = (m: Minute): number => ((m - start) / span) * 100;
  const hours = $derived(Array.from({ length: Math.floor(span / 60) + 1 }, (_, i) => Math.ceil(start / 60) * 60 + i * 60).filter((m) => m <= end));
  let track: HTMLDivElement | undefined = $state();
  let dragging = $state(false);
  let hovered: Moment | null = $state(null);

  const minuteAt = (clientX: number): Minute => {
    const rect = track?.getBoundingClientRect();
    if (!rect) return time;
    return start + Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * span;
  };
  const down = (e: PointerEvent): void => {
    dragging = true;
    track?.setPointerCapture(e.pointerId);
    onscrub(minuteAt(e.clientX));
  };
  const move = (e: PointerEvent): void => {
    if (dragging) onscrub(minuteAt(e.clientX));
  };
  const up = (e: PointerEvent): void => {
    dragging = false;
    track?.releasePointerCapture(e.pointerId);
  };
  const key = (e: KeyboardEvent): void => {
    const step = e.shiftKey ? 30 : 5;
    const next = e.key === 'ArrowRight' ? time + step : e.key === 'ArrowLeft' ? time - step : e.key === 'Home' ? start : e.key === 'End' ? end : null;
    if (next === null) return;
    e.preventDefault();
    e.stopPropagation();
    onscrub(Math.max(start, Math.min(end, next)));
  };
  const hourLabel = (m: Minute): string => (m === at(24) ? 'Midnight' : formatClockShort(m).replace(':00', ''));
</script>

<div class="flex items-center gap-3 rounded-window border border-line bg-glass px-3 py-2.5 shadow-float backdrop-blur-(--blur-window)">
  <button
    type="button"
    class="pressable grid size-9 shrink-0 place-items-center rounded-pill border border-line-strong text-fg hover:bg-hover"
    aria-label={playing ? 'Pause' : 'Play the evening'}
    onclick={ontoggle}
  >
    {#if playing}
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect x="2" y="1.5" width="2.6" height="9" rx="0.8" fill="currentColor" /><rect x="7.4" y="1.5" width="2.6" height="9" rx="0.8" fill="currentColor" /></svg>
    {:else}
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.8v8.4c0 .5.5.8.9.5l6.6-4.2c.4-.2.4-.8 0-1L3.9 1.3C3.5 1 3 1.3 3 1.8Z" fill="currentColor" /></svg>
    {/if}
  </button>

  <div class="relative min-w-0 flex-1">
    <div
      bind:this={track}
      role="slider"
      tabindex="0"
      aria-label="Time of day, Eastern"
      aria-valuemin={start}
      aria-valuemax={end}
      aria-valuenow={Math.round(time)}
      aria-valuetext={`${formatClockShort(time)} Eastern`}
      class="relative h-9 cursor-ew-resize touch-none select-none rounded-sm outline-offset-4"
      onpointerdown={down}
      onpointermove={move}
      onpointerup={up}
      onpointercancel={up}
      onkeydown={key}
    >
      <div class="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line-strong"></div>
      <div class="absolute top-1/2 h-2 -translate-y-1/2 rounded-pill bg-held-soft ring-1 ring-held-line" style:left="{x(STOP)}%" style:width="{x(LIFT) - x(STOP)}%"></div>
      <div class="absolute left-0 top-1/2 h-px -translate-y-1/2 bg-fg-muted" style:width="{x(time)}%"></div>
      {#if end > baked}
        <!-- Past the baked data: the live stretch. -->
        <div class="absolute top-1/2 h-px -translate-y-1/2 border-t border-dashed border-released" style:left="{x(baked)}%" style:width="{x(end) - x(baked)}%"></div>
      {/if}
      {#each moments as m (m.id)}
        <button
          type="button"
          tabindex="-1"
          class="group absolute top-1/2 grid size-5 -translate-x-1/2 -translate-y-1/2 place-items-center"
          style:left="{x(m.time)}%"
          aria-label={`${formatClockShort(m.time)}: ${m.title}`}
          onpointerenter={() => (hovered = m)}
          onpointerleave={() => (hovered = null)}
          onpointerdown={(e) => {
            e.stopPropagation();
            onmoment(m.id);
          }}
        >
          <span
            class={[
              'block rounded-pill transition-transform duration-(--duration-fast) ease-out-strong group-hover:scale-125',
              m.id === active ? 'size-2.5 ring-2 ring-fg' : 'size-1.5',
              m.tone === 'held' ? 'bg-held' : m.tone === 'released' ? 'bg-released' : 'bg-fg-muted',
            ]}
          ></span>
        </button>
      {/each}
      <div class="pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style:left="{x(time)}%">
        <div class="h-5 w-0.5 rounded-pill bg-fg shadow-float"></div>
      </div>
    </div>

    <div class="pointer-events-none relative h-3.5 phone:hidden">
      {#each hours as m (m)}
        <span class="absolute -translate-x-1/2 whitespace-nowrap font-mono text-micro text-fg-subtle tabular" style:left="{x(m)}%">{hourLabel(m)}</span>
      {/each}
    </div>

    {#if hovered}
      <div
        class="pointer-events-none absolute bottom-full mb-2 w-max max-w-60 -translate-x-1/2 rounded-md border border-line-strong bg-window px-2.5 py-1.5 shadow-window backdrop-blur-(--blur-window)"
        style:left="clamp(100px, {x(hovered.time)}%, calc(100% - 100px))"
      >
        <p class="font-mono text-micro text-fg-subtle tabular">{formatClockShort(hovered.time)} ET</p>
        <p class="text-body text-fg">{hovered.title}</p>
      </div>
    {/if}
  </div>

  <div class="flex shrink-0 items-center gap-1 phone:hidden" role="group" aria-label="Playback speed">
    {#each SPEEDS as s (s)}
      <button
        type="button"
        class={['pressable h-7 rounded-chip px-2 font-mono text-micro tabular', speed === s ? 'bg-active text-fg' : 'text-fg-subtle hover:text-fg-muted']}
        aria-pressed={speed === s}
        onclick={() => onspeed(s)}>{s}m/s</button
      >
    {/each}
  </div>
  {#if live}
    <button
      type="button"
      class={[
        'pressable flex h-7 shrink-0 items-center gap-1.5 rounded-pill border px-2.5 text-caption',
        isLive ? 'border-released text-fg' : 'border-line-strong text-fg-muted hover:text-fg',
      ]}
      aria-pressed={isLive}
      onclick={ongolive}
    >
      <span class={['size-1.5 rounded-pill bg-released', isLive && 'animate-live']}></span>
      Live
    </button>
  {/if}
</div>

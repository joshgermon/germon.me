<!--
  @component
  One airport: how many departures it has lost against the Friday before, now and across the
  evening. Opened by clicking its column on the globe or from the palette.
-->
<script lang="ts">
  import { LIFT, STOP, formatClockShort, type Minute } from '~/experiments/ground-stop/domain/clock';
  import type { ObservedDay } from '~/experiments/ground-stop/domain/observed-codec';

  interface Props {
    day: ObservedDay;
    code: string;
    time: Minute;
    onclose: () => void;
  }
  let { day, code, time, onclose }: Props = $props();

  const W = 256;
  const H = 44;
  const k = $derived(day.airports.findIndex((a) => a.code === code));
  const row = $derived(day.series.shortfall.subarray(k * day.series.length, (k + 1) * day.series.length));
  const i = $derived(Math.max(0, Math.min(day.series.length - 1, Math.floor(time - day.window.start))));
  const max = $derived(Math.max(1, ...row));
  const x = (m: Minute): number => ((m - day.window.start) / (day.series.length - 1)) * W;
  const path = $derived.by(() => {
    let d = `M0,${H}`;
    for (let j = 0; j < row.length; j += 3) d += `L${((j / (row.length - 1)) * W).toFixed(1)},${(H - ((row[j] ?? 0) / max) * (H - 4)).toFixed(1)}`;
    return `${d}L${W},${H}Z`;
  });
  const peakAt = $derived(day.window.start + row.indexOf(max));
</script>

<section class="rounded-window border border-line bg-glass p-4 shadow-float backdrop-blur-(--blur-window)" aria-label={`${code} departures lost`}>
  <header class="flex items-center gap-2">
    <span class="font-mono text-body font-medium text-fg">{code}</span>
    <span class="text-caption text-fg-subtle">departures lost vs last Friday</span>
    <button type="button" class="pressable ml-auto grid size-6 place-items-center rounded-pill text-fg-subtle hover:bg-hover hover:text-fg" aria-label="Close" onclick={onclose}>
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="m2 2 6 6M8 2 2 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
    </button>
  </header>
  <p class="mt-2 font-mono text-readout tracking-tight text-held tabular">{(row[i] ?? 0).toLocaleString('en-US')}</p>
  <svg viewBox="0 0 {W} {H}" class="mt-3 block h-11 w-full overflow-visible" aria-hidden="true">
    <rect x={x(STOP)} y="0" width={x(LIFT) - x(STOP)} height={H} class="fill-held-soft" />
    <path d={path} class="fill-held-soft stroke-held" stroke-width="1.25" />
    <line x1={x(time)} x2={x(time)} y1="0" y2={H} class="stroke-fg-muted" />
  </svg>
  <p class="mt-2 text-micro text-fg-subtle">Most behind: {max.toLocaleString('en-US')} at {formatClockShort(peakAt)}. Counted from 3 p.m. ET.</p>
</section>

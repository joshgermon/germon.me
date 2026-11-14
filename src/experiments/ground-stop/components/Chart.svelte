<!--
  @component
  Airline flights over the US across the evening: this Friday (ink) against the Friday before
  (faint), the stop shaded, a playhead at the current minute.
-->
<script lang="ts">
  import { LIFT, STOP, type Minute } from '~/experiments/ground-stop/domain/clock';

  interface Props {
    now: Uint16Array;
    before: Uint16Array;
    start: Minute;
    time: Minute;
  }
  let { now, before, start, time }: Props = $props();

  const W = 256;
  const H = 60;
  const span = $derived(now.length - 1);
  const x = (m: Minute): number => Math.max(0, Math.min(W, ((m - start) / span) * W));
  const max = $derived(Math.max(1, ...now, ...before));
  const path = (values: Uint16Array, top: number): string => {
    let d = '';
    for (let i = 0; i < values.length; i += 3) {
      const px = (i / (values.length - 1)) * W;
      const py = H - 2 - ((values[i] ?? 0) / top) * (H - 6);
      d += `${i === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`;
    }
    return d;
  };
</script>

<svg viewBox="0 0 {W} {H}" class="block h-15 w-full overflow-visible" role="img" aria-label="Airline flights over the US, this Friday against the Friday before">
  <rect x={x(STOP)} y="0" width={x(LIFT) - x(STOP)} height={H} class="fill-held-soft" />
  <path d={path(before, max)} class="fill-none stroke-fg-faint" stroke-width="1.25" stroke-dasharray="2 3" stroke-linejoin="round" />
  <path d={path(now, max)} class="fill-none stroke-fg" stroke-width="1.5" stroke-linejoin="round" />
  <line x1={x(time)} x2={x(time)} y1="0" y2={H} class="stroke-fg-muted" stroke-width="1" />
</svg>

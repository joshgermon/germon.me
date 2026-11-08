<!--
  @component
  The Stocks-style commits chart: the year's running total as a line, the headline figure, and
  "+N 30d". Drag or hover across the plot to scrub — the figure follows the week under the
  pointer — and let go to snap back to the total. Server-rendered complete; hydration only
  adds the scrub.
-->
<script lang="ts">
  /** One point of the cumulative series (pre-formatted on the server). */
  type Point = { readonly total: number; readonly label: string };

  interface Props {
    /** Running totals, oldest week first. */
    points: ReadonlyArray<Point>;
    /** The whole year's total. */
    total: number;
    /** Contributions in the last 30 days. */
    last30: number;
  }
  const { points, total, last30 }: Props = $props();

  const fmt = (n: number): string => n.toLocaleString('en-AU');

  // Scale: leave 8% headroom so the line never touches the top.
  const high = $derived(Math.max(4, ...points.map((p) => p.total)) * 1.08);
  const x = (i: number): number => (i / Math.max(1, points.length - 1)) * 100;
  const y = (v: number): number => 40 - (v / high) * 38;
  const line = $derived(
    points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)},${y(p.total).toFixed(2)}`).join(' '),
  );

  let scrub = $state<number | undefined>(undefined);
  let width = $state(0);
  const shown = $derived(scrub === undefined ? undefined : points[scrub]);

  function move(e: PointerEvent): void {
    const el = e.currentTarget;
    if (!(el instanceof HTMLElement) || points.length === 0) return;
    const r = el.getBoundingClientRect();
    const u = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    scrub = Math.round(u * (points.length - 1));
  }
  const reset = (): void => {
    scrub = undefined;
  };
</script>

<div class="flex min-h-0 flex-1 items-end gap-4.5">
  <div class="grid w-32 flex-none phone:w-28">
    <b class="text-display font-semibold tracking-figure text-fg tabular" aria-live="off">
      {fmt(shown?.total ?? total)}
    </b>
    <small class="mt-0.5 text-label text-fg-subtle">{shown ? `by ${shown.label}` : 'this year'}</small>
    <span
      class="mt-1.75 justify-self-start rounded-xs bg-up/14 px-1.5 py-px text-caption font-semibold text-up tabular"
    >
      +{fmt(last30)} <small class="text-micro font-medium opacity-75">30d</small>
    </span>
  </div>
  <div
    class="relative min-w-0 flex-1 cursor-crosshair self-stretch touch-pan-y"
    role="img"
    aria-label={`Contributions over the last year, rising to ${fmt(total)}`}
    bind:clientWidth={width}
    onpointermove={move}
    onpointerdown={move}
    onpointerleave={reset}
    onpointercancel={reset}
  >
    <svg
      class="absolute inset-0 size-full overflow-visible"
      viewBox="0 -2 100 44"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={`${line} L100,42 L0,42 Z`} class="fill-up opacity-7" />
      <path
        d={line}
        class="fill-none stroke-up stroke-[1.6]"
        stroke-linejoin="round"
        vector-effect="non-scaling-stroke"
      />
    </svg>
    <i
      class="pointer-events-none absolute -top-1 bottom-0 left-0 w-px bg-fg-subtle transition-opacity duration-(--duration-fast) ease-out-strong"
      class:opacity-0={scrub === undefined}
      style:transform={`translateX(${scrub === undefined ? 0 : ((scrub / Math.max(1, points.length - 1)) * width).toFixed(1)}px)`}
      aria-hidden="true"
    ></i>
  </div>
</div>

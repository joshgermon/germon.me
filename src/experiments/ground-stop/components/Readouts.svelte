<!--
  @component
  The live numbers at the current minute, each against the same minute a week earlier, the
  evening's curve, and what was reported.
-->
<script lang="ts">
  import { formatClockShort, type Minute } from '~/experiments/ground-stop/domain/clock';
  import { REPORTED, SOURCES } from '~/experiments/ground-stop/domain/events';
  import { trailing } from '~/experiments/ground-stop/domain/observed';
  import type { LiveSnapshot } from '~/experiments/ground-stop/domain/live';
  import type { ObservedDay } from '~/experiments/ground-stop/domain/observed-codec';

  import Chart from './Chart.svelte';

  interface Props {
    day: ObservedDay;
    time: Minute;
    /** Past the baked data: the live count, which replaces the observed series. */
    liveAirborne: number | null;
    /** The FAA's airport status feed, from the latest live snapshot. */
    faa: LiveSnapshot['faa'];
    onabout: () => void;
  }
  let { day, time, liveAirborne, faa, onabout }: Props = $props();

  const KIND = { GroundStop: 'Ground stop', GroundDelay: 'Delay program', Delay: 'Delays', Closure: 'Closure' } as const;

  const i = $derived(Math.max(0, Math.min(day.series.length - 1, Math.floor(time - day.window.start))));
  const past = $derived(time > day.window.end);
  const air = $derived(past ? (liveAirborne ?? 0) : (day.series.usAirborne[i] ?? 0));
  const airWeek = $derived(day.series.usAirborneBaseline[i] ?? 0);
  const dep = $derived(trailing(day.series.departures, i, 15));
  const depWeek = $derived(trailing(day.series.departuresBaseline, i, 15));
  const behind = $derived.by(() => {
    let total = 0;
    for (let a = 0; a < day.airports.length; a++) total += day.series.shortfall[a * day.series.length + i] ?? 0;
    return total;
  });
  const fmt = (n: number): string => n.toLocaleString('en-US');
</script>

<div class="grid grid-cols-3 gap-3">
  <div>
    <p class="font-mono text-readout tracking-tight text-fg tabular phone:text-title">{fmt(air)}</p>
    <p class="mt-1.5 text-caption text-fg-muted">in the air</p>
    <p class="text-micro text-fg-subtle tabular">{past ? 'live' : `last Fri ${fmt(airWeek)}`}</p>
  </div>
  <div>
    <p class="font-mono text-readout tracking-tight text-fg tabular phone:text-title">{past ? '—' : fmt(dep)}</p>
    <p class="mt-1.5 text-caption text-fg-muted">take-offs / 15m</p>
    <p class="text-micro text-fg-subtle tabular">{past ? 'next refresh' : `last Fri ${fmt(depWeek)}`}</p>
  </div>
  <div>
    <p class="font-mono text-readout tracking-tight text-held tabular phone:text-title">{fmt(behind)}</p>
    <p class="mt-1.5 text-caption text-fg-muted">departures lost</p>
    <p class="text-micro text-fg-subtle">vs last Fri</p>
  </div>
</div>
<div class="mt-4 phone:hidden">
  <Chart now={day.series.usAirborne} before={day.series.usAirborneBaseline} start={day.window.start} {time} />
  <p class="mt-2 flex items-center gap-3 text-micro text-fg-subtle">
    <span class="inline-flex items-center gap-1.5"><span class="h-px w-3 bg-fg"></span>this Friday</span>
    <span class="inline-flex items-center gap-1.5"><span class="h-px w-3 border-t border-dashed border-fg-faint"></span>the Friday before</span>
  </p>
</div>
<ul class="mt-3 flex flex-col gap-1.5 border-t border-line pt-3 phone:hidden">
  {#each REPORTED as r (r.label)}
    <li class={['flex items-baseline gap-2 transition-opacity duration-(--duration-ui) ease-out-strong', time >= r.at ? 'opacity-100' : 'opacity-30']}>
      <span class="w-14 shrink-0 font-mono text-body text-fg tabular">{r.value}</span>
      <span class="min-w-0 text-caption text-fg-muted">
        {r.label}
        <a href={SOURCES[r.source].url} class="text-fg-subtle hover:text-fg" rel="noopener" target="_blank">{r.via ?? SOURCES[r.source].name} · {formatClockShort(r.at)}</a>
      </span>
    </li>
  {/each}
</ul>
{#if faa && faa.statuses.length > 0}
  <section class="mt-3 border-t border-line pt-3 phone:hidden" aria-label="FAA airport status right now">
    <p class="flex items-center gap-1.5 text-micro text-fg-subtle"><span class="size-1.5 animate-live rounded-pill bg-released"></span>FAA right now</p>
    <ul class="mt-1.5 flex flex-col gap-1">
      {#each faa.statuses.slice(0, 5) as s (s.airport + s.kind)}
        <li class="flex items-baseline gap-2 text-caption">
          <span class="w-9 shrink-0 font-mono text-fg">{s.airport}</span>
          <span class="min-w-0 truncate text-fg-muted" title={`${s.reason}${s.detail ? ` · ${s.detail}` : ''}`}>{KIND[s.kind]} · {s.reason}{s.detail ? ` · ${s.detail}` : ''}</span>
        </li>
      {/each}
    </ul>
  </section>
{/if}
<button type="button" class="mt-3 text-micro text-fg-subtle underline decoration-line-strong underline-offset-2 hover:text-fg phone:hidden" onclick={onabout}>
  Data: adsb.lol, FAA · About the data
</button>

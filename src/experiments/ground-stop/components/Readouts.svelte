<!--
  @component
  The live numbers at the current minute, each against the same minute a week earlier, the
  evening's curve, and what was reported.
-->
<script lang="ts">
  import { formatClockShort, type Minute } from '~/experiments/ground-stop/domain/clock';
  import { REPORTED, SOURCES } from '~/experiments/ground-stop/domain/events';
  import { trailing } from '~/experiments/ground-stop/domain/observed';
  import type { FaaFeed } from '~/experiments/ground-stop/domain/live';
  import type { ObservedDay } from '~/experiments/ground-stop/domain/observed-codec';

  import Chart from './Chart.svelte';

  interface Props {
    day: ObservedDay;
    time: Minute;
    /** Past the baked data: the recorded live sky, which replaces the observed series. */
    live: ObservedDay | null;
    /** The FAA's airport status feed, from the latest sweep. */
    faa: FaaFeed | null;
    /** Airports the FAA lists with a ground stop or delays right now (null: feed unread). */
    delayed: number | null;
    onabout: () => void;
  }
  let { day, time, live, faa, delayed, onabout }: Props = $props();

  const KIND = { GroundStop: 'Ground stop', GroundDelay: 'Delay program', Delay: 'Delays', Closure: 'Closure' } as const;

  const i = $derived(Math.max(0, Math.min(day.series.length - 1, Math.floor(time - day.window.start))));
  const past = $derived(live !== null);
  /** The series the clock is in, and the minute's index in it. */
  const series = $derived((live ?? day).series);
  const at = $derived(live ? Math.max(0, Math.min(live.series.length - 1, Math.floor(time - live.window.start))) : i);
  const air = $derived(series.usAirborne[at] ?? 0);
  const airWeek = $derived(series.usAirborneBaseline[at] ?? 0);
  const dep = $derived(trailing(series.departures, at, 15));
  const depWeek = $derived(trailing(series.departuresBaseline, at, 15));
  /** The live record only has a comparison once the recorder has run for a week. */
  const compared = $derived(!live || live.series.usAirborneBaseline.some((v) => v > 0));
  const earlier = $derived(past ? 'last week' : 'last Fri');
  const behind = $derived.by(() => {
    let total = 0;
    for (let a = 0; a < day.airports.length; a++) total += day.series.shortfall[a * day.series.length + i] ?? 0;
    return total;
  });
  const NONE = new Uint16Array(0);
  const fmt = (n: number): string => n.toLocaleString('en-US');
</script>

<div class="grid grid-cols-3 gap-3">
  <div>
    <p class="font-mono text-readout tracking-tight text-fg tabular phone:text-title">{fmt(air)}</p>
    <p class="mt-1.5 text-caption text-fg-muted">in the air</p>
    <p class="text-micro text-fg-subtle tabular">{compared ? `${earlier} ${fmt(airWeek)}` : 'live'}</p>
  </div>
  <div>
    <p class="font-mono text-readout tracking-tight text-fg tabular phone:text-title">{fmt(dep)}</p>
    <p class="mt-1.5 text-caption text-fg-muted">take-offs / 15m</p>
    <p class="text-micro text-fg-subtle tabular">{compared ? `${earlier} ${fmt(depWeek)}` : 'live'}</p>
  </div>
  {#if past}
    <div>
      <p class={['font-mono text-readout tracking-tight tabular phone:text-title', delayed ? 'text-held' : 'text-fg']}>{delayed === null ? '—' : fmt(delayed)}</p>
      <p class="mt-1.5 text-caption text-fg-muted">airports delayed</p>
      <p class="text-micro text-fg-subtle">FAA, right now</p>
    </div>
  {:else}
    <div>
      <p class="font-mono text-readout tracking-tight text-held tabular phone:text-title">{fmt(behind)}</p>
      <p class="mt-1.5 text-caption text-fg-muted">departures lost</p>
      <p class="text-micro text-fg-subtle">vs last Fri</p>
    </div>
  {/if}
</div>
<div class="mt-4 phone:hidden">
  <Chart now={series.usAirborne} before={compared ? series.usAirborneBaseline : NONE} start={(live ?? day).window.start} {time} />
  <p class="mt-2 flex items-center gap-3 text-micro text-fg-subtle">
    <span class="inline-flex items-center gap-1.5"><span class="h-px w-3 bg-fg"></span>{past ? 'the last 90 minutes' : 'this Friday'}</span>
    {#if compared}
      <span class="inline-flex items-center gap-1.5"><span class="h-px w-3 border-t border-dashed border-fg-faint"></span>{past ? 'a week earlier' : 'the Friday before'}</span>
    {/if}
  </p>
</div>
<!-- What was reported belongs to the evening; the FAA's list belongs to now. -->
{#if !past}
<ul class="mt-3 flex flex-col gap-1.5 border-t border-line pt-3 phone:hidden tight:hidden">
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
{:else if faa && faa.statuses.length > 0}
  <section class="mt-3 border-t border-line pt-3 phone:hidden tight:hidden" aria-label="FAA airport status right now">
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

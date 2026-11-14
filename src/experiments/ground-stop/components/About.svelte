<!--
  @component
  Where the numbers come from: the data, the method and its limits, and the sources.
-->
<script lang="ts">
  import { SOURCES } from '~/experiments/ground-stop/domain/events';

  interface Props {
    onclose: () => void;
  }
  let { onclose }: Props = $props();
  let panel: HTMLElement | undefined = $state();
  $effect(() => {
    panel?.focus();
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="fixed inset-0 z-50 bg-scrim" onclick={onclose}></div>
<div
  bind:this={panel}
  tabindex="-1"
  class="fixed right-gutter top-gutter bottom-gutter z-50 flex w-[min(440px,calc(100vw-32px))] flex-col overflow-y-auto rounded-window border border-line-strong bg-window p-5 shadow-window outline-none backdrop-blur-(--blur-window) phone:inset-x-0 phone:bottom-0 phone:top-auto phone:max-h-[82svh] phone:w-full phone:rounded-b-none phone:rounded-t-sheet"
  role="dialog"
  aria-modal="true"
  aria-label="About the data"
  onkeydown={(e) => e.key === 'Escape' && onclose()}
>
  <header class="flex items-center">
    <h2 class="font-serif text-moment-title text-fg">About the data</h2>
    <button type="button" class="pressable ml-auto grid size-7 place-items-center rounded-pill text-fg-subtle hover:bg-hover hover:text-fg" aria-label="Close" onclick={onclose}>
      <svg width="11" height="11" viewBox="0 0 10 10" aria-hidden="true"><path d="m2 2 6 6M8 2 2 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
    </button>
  </header>
  <div class="mt-4 flex flex-col gap-3 text-detail text-fg-muted [&_strong]:font-medium [&_strong]:text-fg">
    <p>
      Each dot is a real flight: an aircraft position from adsb.lol’s volunteer ADS-B receivers, sampled once a minute.
      Only airline callsigns are shown (passenger, cargo and charter flights).
    </p>
    <p>
      The comparison is the previous Friday, 6 November, at the same time, from the same source. “Departures lost” is the
      previous Friday’s departures minus this Friday’s, for each of the 40 busiest airports, counted from 3 p.m. ET.
    </p>
    <p>
      A departure is a climb through 2,500 ft within 25 km of an airport. Coverage is thin over oceans and remote areas, so
      the counts are lower than official totals. Both Fridays are measured the same way.
    </p>
    <p>
      The evening is built from adsb.lol’s half-hour history files. The live view is recorded: every 2 minutes the site asks
      adsb.lol where every airline flight is, follows each aircraft from one reading to the next, and keeps the
      last 90 minutes of tracks, alongside the FAA’s airport status list. Once it has a week of readings, the live numbers
      are compared with the same time a week earlier. Advisory times are from the FAA Command Center. Times are Eastern
      (EST, UTC−5).
    </p>
  </div>
  <h3 class="mt-5 text-caption font-medium text-fg">Sources</h3>
  <ul class="mt-2 flex flex-col gap-1.5 text-body text-fg-muted">
    {#each Object.values(SOURCES) as s (s.id)}
      <li><a href={s.url} class="underline decoration-line-strong underline-offset-2 hover:text-fg" rel="noopener" target="_blank">{s.name}</a></li>
    {/each}
    <li>Airports: OurAirports, public domain</li>
    <li>Land: Natural Earth 1:50m, public domain</li>
  </ul>
  <p class="mt-5 text-caption text-fg-subtle">
    Flight data © adsb.lol contributors, ODbL 1.0. The baked data file (/data/observed.bin.gz) is published under the same
    licence. By <a href="https://germon.me" class="text-fg-muted hover:text-fg">Josh Germon</a>.
  </p>
</div>

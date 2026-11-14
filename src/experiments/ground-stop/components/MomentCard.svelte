<!--
  @component
  The moment on stage: its time, title and a line or two, with buttons (and ← →) to step through
  the day. On small screens it collapses to one line (title, a live figure, prev/next) so the
  globe stays visible; tap the title to read the rest.
-->
<script lang="ts">
  import { formatClockShort } from '~/experiments/ground-stop/domain/clock';
  import type { Moment } from '~/experiments/ground-stop/site/moments';

  interface Props {
    moment: Moment;
    index: number;
    total: number;
    /** Collapse to one line until tapped (small screens). */
    collapsible: boolean;
    /** A one-line figure for the current minute, shown when collapsed. */
    stat: string;
    onstep: (by: -1 | 1) => void;
  }
  let { moment, index, total, collapsible, stat, onstep }: Props = $props();

  let expanded = $state(false);
  const open = $derived(!collapsible || expanded);
  const dot = $derived(moment.tone === 'held' ? 'bg-held' : moment.tone === 'released' ? 'bg-released' : 'bg-fg-subtle');
</script>

<article
  class="rounded-window border border-line bg-glass p-4 shadow-float backdrop-blur-(--blur-window) compact:px-3 compact:py-2.5"
  aria-live="polite"
>
  <div class="flex items-center gap-2">
    {#if collapsible}
      <button
        type="button"
        class="flex min-w-0 flex-1 items-center gap-2 text-left"
        aria-expanded={expanded}
        onclick={() => (expanded = !expanded)}
      >
        <span class={['size-1.5 shrink-0 rounded-pill', dot]}></span>
        <span class="shrink-0 font-mono text-caption text-fg-subtle tabular">{formatClockShort(moment.time)}</span>
        <span class="min-w-0 truncate font-serif text-body-lg text-fg">{moment.title}</span>
        <svg
          class={['shrink-0 text-fg-subtle transition-transform duration-(--duration-fast) ease-out-strong', expanded && 'rotate-180']}
          width="10"
          height="10"
          viewBox="0 0 10 10"
          aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg
        >
      </button>
    {:else}
      <span class={['size-1.5 rounded-pill', dot]}></span>
      <p class="font-mono text-caption tracking-date text-fg-subtle tabular">{formatClockShort(moment.time)} ET</p>
    {/if}
    <div class="ml-auto flex shrink-0 items-center gap-1">
      <span class="mr-1.5 font-mono text-micro text-fg-subtle tabular compact:hidden">{index + 1}/{total}</span>
      <button
        type="button"
        class="pressable grid size-7 place-items-center rounded-pill border border-line-strong text-fg-muted hover:bg-hover hover:text-fg disabled:opacity-30"
        aria-label="Previous moment"
        disabled={index === 0}
        onclick={() => onstep(-1)}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M6.5 1.5 3 5l3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
      </button>
      <button
        type="button"
        class="pressable grid size-7 place-items-center rounded-pill border border-line-strong text-fg-muted hover:bg-hover hover:text-fg disabled:opacity-30"
        aria-label="Next moment"
        disabled={index === total - 1}
        onclick={() => onstep(1)}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M3.5 1.5 7 5 3.5 8.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
      </button>
    </div>
  </div>
  {#if collapsible && !expanded}
    <p class="mt-1 truncate pl-3.5 text-caption text-fg-muted tabular">{stat}</p>
  {/if}
  {#if open}
    {#if !collapsible}<h2 class="mt-2.5 font-serif text-moment-title text-fg">{moment.title}</h2>{/if}
    <p class={['text-detail text-fg-muted [&_q]:text-fg [&_strong]:font-medium [&_strong]:text-fg', collapsible ? 'mt-2 animate-fade-in' : 'mt-1.5']}>
      {@html moment.body}
    </p>
  {/if}
</article>

<!--
  @component
  The moment on stage: its time, title and a line or two, with buttons (and ← →) to step
  through the day.
-->
<script lang="ts">
  import { formatClockShort } from '~/experiments/ground-stop/domain/clock';
  import type { Moment } from '~/experiments/ground-stop/site/moments';

  interface Props {
    moment: Moment;
    index: number;
    total: number;
    onstep: (by: -1 | 1) => void;
  }
  let { moment, index, total, onstep }: Props = $props();
</script>

<article class="rounded-window border border-line bg-glass p-4 shadow-float backdrop-blur-(--blur-window) phone:p-3.5" aria-live="polite">
  <div class="flex items-center gap-2">
    <span
      class={[
        'size-1.5 rounded-pill',
        moment.tone === 'held' ? 'bg-held' : moment.tone === 'released' ? 'bg-released' : 'bg-fg-subtle',
      ]}
    ></span>
    <p class="font-mono text-caption tracking-date text-fg-subtle tabular">{formatClockShort(moment.time)} ET</p>
    <div class="ml-auto flex items-center gap-1">
      <span class="mr-1.5 font-mono text-micro text-fg-subtle tabular">{index + 1}/{total}</span>
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
  <h2 class="mt-2.5 font-serif text-moment-title text-fg">{moment.title}</h2>
  <p class="mt-1.5 text-detail text-fg-muted [&_q]:text-fg [&_strong]:font-medium [&_strong]:text-fg">{@html moment.body}</p>
</article>

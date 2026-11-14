<!--
  @component
  ⌘K: jump to any moment or airport, the way the site's palette jumps to anything. Opens
  instantly (keyboard actions never animate); ↑ ↓ to move, ↵ to go, Esc to close.
-->
<script lang="ts">
  import { formatClockShort } from '~/experiments/ground-stop/domain/clock';
  import type { ObservedAirport } from '~/experiments/ground-stop/domain/observed-codec';
  import type { Moment } from '~/experiments/ground-stop/site/moments';

  interface Props {
    moments: readonly Moment[];
    airports: readonly ObservedAirport[];
    onmoment: (id: string) => void;
    onairport: (code: string) => void;
    onclose: () => void;
  }
  let { moments, airports, onmoment, onairport, onclose }: Props = $props();

  type Row = { readonly _tag: 'Moment'; readonly moment: Moment } | { readonly _tag: 'Airport'; readonly airport: ObservedAirport };

  let query = $state('');
  let selected = $state(0);
  let input: HTMLInputElement | undefined = $state();

  const rows = $derived.by((): Row[] => {
    const q = query.trim().toLowerCase();
    const ms = moments.filter((m) => !q || `${m.label} ${m.title} ${formatClockShort(m.time)}`.toLowerCase().includes(q));
    const as = airports.filter((a) => !q || a.code.toLowerCase().includes(q));
    return [...ms.map((moment): Row => ({ _tag: 'Moment', moment })), ...as.map((airport): Row => ({ _tag: 'Airport', airport }))];
  });

  $effect(() => {
    input?.focus();
  });

  const go = (row: Row | undefined): void => {
    if (!row) return;
    if (row._tag === 'Moment') onmoment(row.moment.id);
    else onairport(row.airport.code);
    onclose();
  };
  const key = (e: KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selected = Math.min(rows.length - 1, selected + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selected = Math.max(0, selected - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(rows[selected]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onclose();
    }
  };
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="fixed inset-0 z-50 bg-scrim" onclick={onclose}></div>
<div
  class="fixed left-1/2 top-[14vh] z-50 w-(--palette-width) max-w-[calc(100vw-32px)] -translate-x-1/2 overflow-hidden rounded-palette border border-line-strong bg-window shadow-window backdrop-blur-(--blur-window)"
  role="dialog"
  aria-modal="true"
  aria-label="Jump to"
>
  <input
    bind:this={input}
    bind:value={query}
    oninput={() => (selected = 0)}
    onkeydown={key}
    class="w-full border-b border-line bg-transparent px-4 py-3.5 text-body-lg text-fg outline-none placeholder:text-fg-subtle"
    placeholder="Jump to a moment or an airport…"
    aria-label="Search moments and airports"
  />
  <ul class="max-h-(--palette-height) overflow-y-auto p-1.5" role="listbox">
    {#each rows as row, k (row._tag === 'Moment' ? row.moment.id : row.airport.code)}
      {#if k === 0 || rows[k - 1]?._tag !== row._tag}
        <li class="px-2.5 pb-1 pt-2.5 text-label text-fg-subtle" role="presentation">{row._tag === 'Moment' ? 'Moments' : 'Airports'}</li>
      {/if}
      <li role="option" aria-selected={k === selected}>
        <button
          type="button"
          class={['flex w-full items-center gap-3 rounded-row px-2.5 py-2 text-left text-body', k === selected ? 'bg-active text-fg' : 'text-fg-muted']}
          onpointermove={() => (selected = k)}
          onclick={() => go(row)}
        >
          {#if row._tag === 'Moment'}
            <span class="w-16 shrink-0 font-mono text-caption text-fg-subtle tabular">{formatClockShort(row.moment.time)}</span>
            <span>{row.moment.title}</span>
          {:else}
            <span class="w-16 shrink-0 font-mono text-caption text-fg-subtle">{row.airport.code}</span>
            <span>Departures lost at {row.airport.code}</span>
          {/if}
        </button>
      </li>
    {/each}
  </ul>
</div>

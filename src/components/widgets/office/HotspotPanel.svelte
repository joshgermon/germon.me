<!--
  @component
  An office object's detail: its copy, "Information" rows, reading list and links. Styled like
  the palette's detail pane. `pane` is the desktop panel beside the room (with its own header
  and an esc/close button); `sheet` is the body of the phone sheet, whose header the sheet owns.

  Lines still to be written (a `Todo` in site/office.ts) show dashed in development and are
  left out in production.
-->
<script lang="ts">
  import Glyph from '~/components/palette/Glyph.svelte';
  import Icon from '~/components/ui/Icon.svelte';
  import Kbd from '~/components/ui/Kbd.svelte';
  import { perform, type Action } from '~/lib/actions';
  import { office, type Hotspot, type HotspotPanel, type Line } from '~/site/office';

  interface Props {
    hotspot: Hotspot;
    panel: HotspotPanel;
    variant: 'pane' | 'sheet';
    /** Close the panel (`keyboard` when it came from a key). */
    onclose: (via: 'keyboard' | 'pointer') => void;
    /** The close button, for focusing on keyboard open. */
    closeButton?: HTMLButtonElement | undefined;
  }
  let { hotspot, panel, variant, onclose, closeButton = $bindable() }: Props = $props();

  const dev = import.meta.env.DEV;
  const shown = (line: Line | undefined): line is Line =>
    line !== undefined && (typeof line === 'string' || dev);
  // Nothing written yet (production hides todos): fall back to the palette's one-liner.
  const body = $derived.by((): ReadonlyArray<Line> => {
    const lines = panel.body.filter(shown);
    return lines.length > 0 || !hotspot.command ? lines : [hotspot.command.description];
  });
  const reading = $derived((panel.reading ?? []).filter((r) => shown(r.title) && shown(r.author)));

  function run(action: Action): void {
    onclose('pointer');
    perform(action);
  }
</script>

{#snippet text(line: Line)}
  {#if typeof line === 'string'}
    {line}
  {:else}
    <span class="rounded-xs border border-dashed border-line-strong px-1 text-fg-subtle">TODO: {line.hint}</span>
  {/if}
{/snippet}

{#if variant === 'pane'}
  <div class="flex items-start justify-between gap-3">
    <Glyph glyph={{ _tag: 'Icon', name: hotspot.icon }} large />
    <button
      bind:this={closeButton}
      type="button"
      class="pressable -mt-0.5 -mr-1 grid place-items-center rounded-sm p-1 text-fg-muted transition-colors duration-(--duration-fast) hover:bg-hover hover:text-fg"
      aria-label={office.close}
      onclick={(e) => onclose(e.detail === 0 ? 'keyboard' : 'pointer')}
    >
      <Kbd size="lg">esc</Kbd>
    </button>
  </div>
  <h3 class="mt-3.5 mb-1.5 text-detail-title font-semibold tracking-tight text-fg">{panel.title}</h3>
{/if}

{#each body as line, i (i)}
  <p class={['max-w-measure text-detail text-pretty text-fg-muted', i > 0 && 'mt-2', variant === 'sheet' && 'text-sheet']}>
    {@render text(line)}
  </p>
{/each}

{#if reading.length > 0}
  <ul class="mt-4">
    {#each reading as book, i (i)}
      <li class="flex items-baseline gap-2 border-t border-line py-2.25 text-meta">
        <b class="min-w-0 font-medium text-fg">{@render text(book.title)}</b>
        <span class="min-w-0 truncate text-fg-subtle">{@render text(book.author)}</span>
      </li>
    {/each}
  </ul>
{/if}

{#if panel.facts.length > 0}
  <dl class="mt-5">
    <p class="mb-1 text-caption font-semibold text-fg-subtle">{office.information}</p>
    {#each panel.facts as fact (fact.label)}
      <div class="flex justify-between gap-4.5 border-t border-line py-2.25 text-meta">
        <dt class="flex-none text-fg-subtle">{fact.label}</dt>
        <dd class="min-w-0 text-right wrap-anywhere text-fg">{fact.value}</dd>
      </div>
    {/each}
  </dl>
{/if}

{#if panel.links.length > 0}
  <div class={['mt-5 flex flex-wrap gap-1.5', variant === 'sheet' && 'flex-col']}>
    {#each panel.links as link (link.label)}
      <button
        type="button"
        class={[
          'pressable inline-flex items-center justify-between gap-2 rounded-row bg-hover pr-2 pl-2.5 font-medium text-fg-muted inset-ring inset-ring-line transition-colors duration-(--duration-fast) hover:bg-active hover:text-fg',
          variant === 'sheet' ? 'h-11 text-sheet' : 'h-8 text-meta',
        ]}
        onclick={() => run(link.action)}
      >
        {link.label}
        <Icon name="arrow" size={12} stroke={2} />
      </button>
    {/each}
  </div>
{/if}

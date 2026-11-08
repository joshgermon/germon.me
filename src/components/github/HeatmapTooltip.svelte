<!--
  @component
  Wraps the (server-rendered) contribution heatmap and shows a tooltip for the day under a
  fine pointer — "4 contributions on 3 Nov". Cells carry their text in `data-tip`, so this
  island ships no data of its own. Touch screens skip it: the totals beside the grid say it.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    children?: Snippet;
  }
  const { children }: Props = $props();

  type Tip = {
    readonly text: string;
    readonly x: number;
    readonly y: number;
    readonly below: boolean;
    /** Horizontal anchor: centred on the cell, or pinned so it stays inside the card. */
    readonly align: 'start' | 'center' | 'end';
  };
  const EDGE = 72;
  const shiftX = { start: '-8px', center: '-50%', end: 'calc(-100% + 8px)' } as const;
  let tip = $state<Tip | undefined>(undefined);
  let root = $state<HTMLElement | undefined>(undefined);

  function over(e: PointerEvent): void {
    if (e.pointerType !== 'mouse' || !root) return;
    const cell = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-tip]') : null;
    const text = cell?.dataset['tip'];
    if (!cell || !text) {
      tip = undefined;
      return;
    }
    const box = root.getBoundingClientRect();
    const r = cell.getBoundingClientRect();
    // The top two rows flip the tooltip below the cell so the card never clips it.
    const below = Number(cell.dataset['row']) < 2;
    const x = r.left + r.width / 2 - box.left;
    const align = x < EDGE ? 'start' : x > box.width - EDGE ? 'end' : 'center';
    tip = { text, x, y: (below ? r.bottom : r.top) - box.top, below, align };
  }
</script>

<div
  class="relative min-w-0"
  bind:this={root}
  onpointerover={over}
  onpointerleave={() => (tip = undefined)}
  role="presentation"
>
  {@render children?.()}
  {#if tip}
    <span
      class="pointer-events-none absolute z-2 rounded-xs border border-line-strong bg-surface-raised px-2 py-1 text-caption whitespace-nowrap text-fg shadow-float"
      style:left={`${tip.x}px`}
      style:top={`${tip.y}px`}
      style:transform={`translate(${shiftX[tip.align]}, ${tip.below ? '6px' : 'calc(-100% - 6px)'})`}
      role="tooltip"
    >
      {tip.text}
    </span>
  {/if}
</div>

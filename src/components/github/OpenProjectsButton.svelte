<!--
  @component
  The Projects card's "View" accessory: opens the command palette on its Projects view.
  On fine pointers it stays quiet until the card is hovered or focused; on touch it's always shown.
-->
<script lang="ts">
  import { perform } from '~/lib/actions';
</script>

<button
  type="button"
  class="pressable inline-flex h-5 items-center rounded-xs px-1.5 text-label text-fg-subtle transition-[opacity,translate,transform,color] duration-(--duration-fast) ease-out-strong hover:text-fg pointer-fine:translate-x-0.75 pointer-fine:opacity-0 pointer-fine:group-hover/card:translate-x-0 pointer-fine:group-hover/card:opacity-100 pointer-fine:group-focus-within/card:translate-x-0 pointer-fine:group-focus-within/card:opacity-100"
  aria-label="View all projects"
  onclick={() => perform({ _tag: 'OpenPalette', view: { _tag: 'Projects' } })}
>
  View
</button>

<!--
  @component
  A keyboard key inside Svelte islands, e.g. `<Kbd>⌘</Kbd><Kbd>K</Kbd>`. Mirrors Kbd.astro
  (`md`); `sm` sits in list rows, `lg` is the palette's `esc`. `dim` for unselected rows.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    size?: 'sm' | 'md' | 'lg';
    dim?: boolean;
    class?: string;
    children: Snippet;
  }
  const { size = 'md', dim = false, class: cls = '', children }: Props = $props();
</script>

<kbd
  class={[
    'inline-grid place-items-center rounded-xs bg-kbd font-sans text-micro font-medium',
    size === 'sm' && 'h-4.5 min-w-4.5 px-1',
    size === 'md' && 'h-5 min-w-5 px-1.25',
    size === 'lg' && 'h-5.5 min-w-5 px-1.5',
    dim ? 'text-fg-subtle' : 'text-fg-muted',
    cls,
  ]}>{@render children()}</kbd
>

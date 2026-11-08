<!--
  @component
  Loads the palette's command registry (a static, versioned JSON file) when the island hydrates,
  then mounts the palette. Keeps the registry out of the page's HTML. Anything that set
  `$palette` before the registry arrived is honoured as soon as the palette mounts.
-->
<script lang="ts">
  import { onMount } from 'svelte';

  import { loadPaletteRegistry } from '~/adapters/palette-registry';
  import type { CommandRegistry } from '~/site/commands';
  import Palette from './Palette.svelte';

  interface Props {
    /** The versioned registry URL (`palettePath`). */
    src: string;
    /** Josh's Memoji for the footer (a small optimised image URL). */
    avatar: string;
  }
  const { src, avatar }: Props = $props();

  let registry = $state<CommandRegistry>();

  onMount(() => {
    void loadPaletteRegistry(src).then((result) => {
      if (result._tag === 'ok') registry = result.value;
      else console.warn(result.error.message);
    });
  });
</script>

{#if registry}
  <Palette {registry} {avatar} />
{/if}

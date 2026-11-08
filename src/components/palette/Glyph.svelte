<!--
  @component
  The square at the start of a palette row, or (`large`) at the top of its detail pane: a line
  icon on a tile, an employer's brand mark, or a language dot.
-->
<script lang="ts">
  import Icon from '~/components/ui/Icon.svelte';
  import type { Glyph } from '~/site/commands';

  interface Props {
    glyph: Glyph;
    large?: boolean;
  }
  const { glyph, large = false }: Props = $props();

  const tile = $derived(
    large
      ? 'size-10 rounded-md bg-surface-sunken text-fg ring-1 ring-line ring-inset'
      : 'size-5 rounded-tile bg-surface-sunken text-fg-muted ring-1 ring-line ring-inset',
  );
</script>

{#if glyph._tag === 'Icon'}
  <span
    class={[
      'grid flex-none place-items-center',
      glyph.ghost && !large ? 'size-5 text-fg-muted' : tile,
    ]}
  >
    <Icon name={glyph.name} size={large ? 20 : 13} />
  </span>
{:else if glyph._tag === 'Brand'}
  <span
    class="grid size-5 flex-none place-items-center overflow-hidden rounded-tile shadow-brand-tile"
    style:background={glyph.bg}
  >
    {#if glyph.avatar}
      <img class="size-5 rounded-[inherit]" src={glyph.src} alt="" width="20" height="20" />
    {:else}
      <img class="size-3.25 object-contain" src={glyph.src} alt="" width="13" height="13" />
    {/if}
  </span>
{:else}
  <span class={['grid flex-none place-items-center', large ? tile : 'size-5']}>
    <i
      class={['lang block rounded-full', large ? 'size-3.5' : 'mx-1.5 size-2']}
      style:--lang={glyph.color ?? 'var(--color-fg-subtle)'}
    ></i>
  </span>
{/if}

<style>
  .lang {
    background: var(--lang);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--lang) 16%, transparent);
  }
</style>

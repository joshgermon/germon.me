<!--
  @component
  The headline sentence in the site's voice: big Inter with serif-italic outline pills. Each pill
  jumps to a moment; the pill for the moment on stage stays lit.
-->
<script lang="ts">
  import type { Segment } from '~/experiments/ground-stop/site/moments';

  interface Props {
    segments: readonly Segment[];
    active: string;
    onmoment: (id: string) => void;
  }
  let { segments, active, onmoment }: Props = $props();
</script>

<h1 class="text-lede-globe font-lede text-(color:--color-lede) phone:text-lede-globe-phone">
  {#each segments as s, i (i)}
    {#if s._tag === 'Text'}{s.text}{:else}<button
        type="button"
        class="pill pointer-events-auto cursor-pointer align-baseline"
        data-on={active === s.moment ? '' : undefined}
        aria-pressed={active === s.moment}
        onclick={() => onmoment(s.moment)}>{s.label}</button
      >{/if}
  {/each}
</h1>

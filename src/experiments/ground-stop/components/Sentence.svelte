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

  /** A pill keeps the punctuation right after it on its line ("…8:39 p.m." + "."). */
  type Run = { readonly _tag: 'Text'; readonly text: string } | { readonly _tag: 'Pill'; readonly label: string; readonly moment: string; readonly after: string };
  const runs = $derived.by((): Run[] => {
    const out: Run[] = [];
    segments.forEach((seg, i) => {
      if (seg._tag === 'Pill') {
        const next = segments[i + 1];
        const after = next?._tag === 'Text' ? (/^[.,;:!?]+/.exec(next.text)?.[0] ?? '') : '';
        out.push({ ...seg, after });
      } else {
        const prev = segments[i - 1];
        const cut = prev?._tag === 'Pill' ? (/^[.,;:!?]+/.exec(seg.text)?.[0]?.length ?? 0) : 0;
        out.push({ _tag: 'Text', text: seg.text.slice(cut) });
      }
    });
    return out;
  });
</script>

<h1 class="text-lede-globe font-lede text-(color:--color-lede) phone:text-lede-globe-phone">
  {#each runs as s, i (i)}
    {#if s._tag === 'Text'}{s.text}{:else}<span class="whitespace-nowrap"
        ><button
          type="button"
          class="pill pointer-events-auto cursor-pointer align-baseline"
          data-on={active === s.moment ? '' : undefined}
          aria-pressed={active === s.moment}
          onclick={() => onmoment(s.moment)}>{s.label}</button
        >{s.after}</span
      >{/if}
  {/each}
</h1>

<!--
  @component
  A note in the serif reader, inside the palette. The body is fetched on demand from the
  prerendered `/notes/<id>.json` (cached per page view), so the home page stays lean; the note's
  own page is linked underneath for sharing.
-->
<script lang="ts">
  import { loadNoteBody, type NoteBodyUnavailable } from '~/adapters/note-body';
  import Icon from '~/components/ui/Icon.svelte';
  import type { Result } from '~/lib/result';
  import { notePath } from '~/site/notes-paths';

  import '~/styles/reader.css';

  interface Props {
    noteId: string;
    /** `Saturday 3 September 2022 · 206 words` */
    dateLine: string;
    /** Full-width reading size. */
    reading: boolean;
  }
  const { noteId, dateLine, reading }: Props = $props();

  let loaded = $state<{ readonly id: string; readonly body: Result<string, NoteBodyUnavailable> }>();

  $effect(() => {
    const id = noteId;
    let current = true;
    void loadNoteBody(id).then((body) => {
      if (current) loaded = { id, body };
    });
    return () => {
      current = false;
    };
  });

  const body = $derived(loaded?.id === noteId ? loaded.body : undefined);
</script>

<div class={[reading && 'mx-auto max-w-reader']}>
  <p class="reader-date">{dateLine}</p>
  {#if body?._tag === 'ok'}
    <article class="reader-prose" data-size={reading ? 'lg' : undefined}>
      <!-- Our own build output (Markdown rendered at build time), not user input. -->
      {@html body.value}
    </article>
  {:else if body?._tag === 'err'}
    <p class="mt-4 text-detail text-fg-muted">This note didn’t load. It’s also on its own page:</p>
  {:else}
    <div class="min-h-40" aria-busy="true"></div>
  {/if}
  {#if body}
    <a
      href={notePath(noteId)}
      class="pressable mt-6 inline-flex items-center gap-1 rounded-xs text-caption font-medium text-fg-subtle transition-colors duration-(--duration-fast) hover:text-fg"
    >
      Open as a page
      <Icon name="arrowUpRight" size={12} stroke={2.2} />
    </a>
  {/if}
</div>

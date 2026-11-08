<!--
  @component
  The palette's right-hand pane for the selected row: an icon, title, description and
  "Information" rows; a career pass; or a note in the serif reader (`reading` widens it to
  the full window).
-->
<script lang="ts">
  import Pass from '~/components/career/Pass.svelte';
  import { fortnight } from '~/domain/coffee';
  import { casesHandled } from '~/lib/defects';
  import type { Command, LiveValue, MetaRow } from '~/site/commands';
  import { profile } from '~/site/profile';
  import Glyph from './Glyph.svelte';
  import NoteReader from './NoteReader.svelte';

  interface Props {
    command: Command;
    reading: boolean;
  }
  const { command, reading }: Props = $props();

  /** Values that depend on today, worked out in the browser. */
  function liveValue(key: LiveValue): string {
    const now = new Date();
    switch (key) {
      case 'nextFreeMorning':
        return fortnight(now, profile.timeZone).firstOpen.short;
      default:
        return casesHandled(key);
    }
  }

  const valueOf = (v: MetaRow['value']): string => (typeof v === 'string' ? v : liveValue(v.key));
</script>

{#snippet meta(rows: ReadonlyArray<MetaRow>)}
  {#if rows.length > 0}
    <dl class="mt-5">
      <p class="mb-1 text-caption font-semibold text-fg-subtle">Information</p>
      {#each rows as row (row.label)}
        <div class="flex justify-between gap-4.5 border-t border-line py-2.25 text-meta">
          <dt class="flex-none text-fg-subtle">{row.label}</dt>
          <dd class="min-w-0 text-right wrap-anywhere text-fg">{valueOf(row.value)}</dd>
        </div>
      {/each}
    </dl>
  {/if}
{/snippet}

{#if command.detail._tag === 'Info'}
  {@const d = command.detail}
  <Glyph glyph={d.glyph} large />
  <h2
    class={[
      'mt-3.5 mb-1.5 text-detail-title font-semibold tracking-tight text-fg',
      d.mono && 'font-mono',
    ]}
  >
    {d.title}
  </h2>
  <p class="max-w-measure text-detail text-pretty text-fg-muted">{d.description}</p>
  {@render meta(d.meta)}
{:else if command.detail._tag === 'Pass'}
  {@const d = command.detail}
  <Pass role={d.role} variant="full" />
  <p class="mt-4 max-w-measure text-detail text-pretty text-fg-muted">{d.description}</p>
  {@render meta(d.meta)}
{:else if command.detail._tag === 'Note'}
  <NoteReader noteId={command.detail.noteId} dateLine={command.detail.dateLine} {reading} />
{/if}

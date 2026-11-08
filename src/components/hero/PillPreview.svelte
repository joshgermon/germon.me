<!--
  @component
  What a hero pill previews: a small card of the thing the pill leads to (Josh's contact, a
  career pass, the coffee calendar, the latest note…). Shown beside the cursor on desktop
  (`variant="peek"`) and inside the phone sheet (`variant="sheet"`, larger type, no click
  hint, pass summaries).

  Time-sensitive lines (Sydney time, next free morning, tonight's golden hour) are computed
  when it renders, in the browser.
-->
<script lang="ts">
  import Pass from '~/components/career/Pass.svelte';
  import { fortnight } from '~/domain/coffee';
  import { recencyShort } from '~/domain/github/repo';
  import { clockTime, daylight } from '~/domain/solar';
  import { casesHandled } from '~/lib/defects';
  import type { Role } from '~/site/career';
  import { profile } from '~/site/profile';
  import type { Preview } from '~/site/hero';
  import type { PreviewData } from './preview-data';

  interface Props {
    preview: Preview;
    data: PreviewData;
    variant: 'peek' | 'sheet';
  }
  const { preview, data, variant }: Props = $props();

  const sheet = $derived(variant === 'sheet');
  const now = new Date();
  const sydney = { latitude: -33.87, longitude: 151.21, timeZone: profile.timeZone };

  /** The kicker line: what this is · what a click does (the hint is desktop-only). */
  const kickers = $derived({
    Contact: ['Contact', 'Click to show'],
    Coffee: ['Grab a coffee', 'Click to pick a day'],
    LatestNote: [`Notes · ${data.notes.count}`, 'Click to read'],
    GoldenHour: ['Golden hour', 'Click to show'],
    Projects: ['Projects · live from GitHub', 'Click to browse'],
    Terminal: ['Terminal', 'Click to run help'],
    Now: ['Now', 'Click to show'],
  } as const satisfies Record<Exclude<Preview['_tag'], 'Pass'>, readonly [string, string]>);

  const goldenHour = (): string => {
    const day = daylight(now, sydney);
    return day._tag === 'Crossing' ? clockTime(day.goldenHour, sydney.timeZone) : '—';
  };

  const roleOf = (id: Role['id']): Role | undefined => data.roles.find((r) => r.id === id);
</script>

{#snippet kicker(what: string, hint: string)}
  <p
    class={[
      'mb-2.25 flex justify-between gap-2.5 font-medium text-fg-subtle',
      sheet ? 'text-caption' : 'text-label',
    ]}
  >
    <span>{what}</span>
    {#if !sheet}<span class="opacity-85">{hint}</span>{/if}
  </p>
{/snippet}

{#if preview._tag === 'Pass'}
  {@const role = roleOf(preview.role)}
  {#if role}
    <Pass {role} variant={sheet ? 'card' : 'peek'} class={sheet ? 'w-full' : ''} />
    {#if sheet}<p class="mx-0.5 mt-4 text-sheet text-fg-muted">{role.summary}</p>{/if}
  {/if}
{:else}
  {@const [what, hint] = kickers[preview._tag]}
  {@const title = ['tracking-snug', sheet ? 'text-peek-lg' : 'text-peek']}
  {@render kicker(what, hint)}
  {#if preview._tag === 'Contact'}
    <div class="flex items-center gap-2.75">
      <img class="size-10 rounded-full bg-avatar" src={data.contact.avatar} alt="" width="40" height="40" />
      <span>
        <b class="block text-peek font-semibold">{data.contact.name}</b>
        <small class="mt-0.5 block text-caption text-fg-subtle">{data.contact.email}</small>
      </span>
    </div>
  {:else if preview._tag === 'Coffee'}
    <p class={title}>
      Weekday mornings, near the harbour. Next free:
      <b class="font-semibold text-sun">{fortnight(now, profile.timeZone).firstOpen.short}</b>.
    </p>
    <p class="mt-1.5 text-caption text-fg-subtle">{clockTime(now, profile.timeZone)} in Sydney</p>
  {:else if preview._tag === 'LatestNote'}
    <p
      class={[
        'font-serif tracking-snug',
        sheet ? 'text-display' : 'text-peek-serif',
      ]}
    >
      {data.notes.latest.title}
    </p>
    <p class="mt-1.5 text-caption text-fg-subtle">
      {data.notes.latest.date} · {data.notes.latest.words} words
    </p>
  {:else if preview._tag === 'GoldenHour'}
    <p class={title}>Best light tonight at <b class="font-semibold text-sun">{goldenHour()}</b>.</p>
    <p class="mt-1.5 text-caption text-fg-subtle">{data.camera.body} · {data.camera.lens}</p>
  {:else if preview._tag === 'Projects'}
    <ul class="grid gap-1.75">
      {#each data.repos.slice(0, 4) as repo (repo.name)}
        <li class="flex items-center gap-0.5">
          <span
            class="mr-2 ml-0.5 size-2 flex-none rounded-full bg-(--c) shadow-[0_0_0_3px_color-mix(in_srgb,var(--c)_16%,transparent)]"
            style:--c={repo.color}
          ></span>
          <b class={['flex-1 font-mono font-medium tracking-snug', sheet ? 'text-peek' : 'text-meta']}>
            {repo.name}
          </b>
          <span class="tabular text-label text-fg-subtle">
            {recencyShort(new Date(repo.pushedAt), now)}
          </span>
        </li>
      {:else}
        <li class="text-caption text-fg-subtle">Repos, stars and the occasional half-finished idea.</li>
      {/each}
    </ul>
  {:else if preview._tag === 'Terminal'}
    <pre
      class={[
        'font-mono text-code whitespace-pre-wrap text-fg-muted',
        sheet && 'rounded-md bg-code-bg p-3 shadow-[inset_0_0_0_1px_var(--color-line)]',
      ]}><span class="text-up">josh@sydney</span> <span class="text-fg-subtle">~</span> % ls projects
<span class="text-fg-subtle">{data.repos.slice(0, 4).map((r) => r.name).join('  ')}</span></pre>
  {:else if preview._tag === 'Now'}
    <p class={title}>{data.now.building}.</p>
    <p class="mt-1.5 text-caption text-fg-subtle">Learning {data.now.learning}</p>
  {:else}
    {casesHandled(preview)}
  {/if}
{/if}

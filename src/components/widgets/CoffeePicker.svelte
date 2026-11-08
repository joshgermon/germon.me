<!--
  @component
  "Grab a coffee": two weeks of weekday mornings in Sydney. Pick a morning, then Book drafts
  the email. On phones, picking (or Book) confirms in the shared bottom sheet.

  Server-rendered with the build date so it reads correctly before hydration (and Book is a
  plain `mailto:` link without JavaScript); on mount it re-dates itself to today.
  `$coffeeRequest` (the palette's "Book a coffee") focuses the picked morning, or opens the
  sheet on a phone.
-->
<script lang="ts">
  import { onMount } from 'svelte';

  import Icon from '~/components/ui/Icon.svelte';
  import Sheet from '~/components/ui/Sheet.svelte';
  import { fortnight, mailto, pick, type CoffeeDay, type OpenDay } from '~/domain/coffee';
  import { perform } from '~/lib/actions';
  import { $coffeeRequest as coffeeRequest } from '~/lib/ui-state';

  interface Props {
    /** When the page was built (ISO instant): the server render's "today". */
    builtAt: string;
    email: string;
    timeZone: string;
  }
  const { builtAt, email, timeZone }: Props = $props();

  /** Today on the client; the build date until hydration. */
  let clientNow = $state<Date>();
  const now = $derived(clientNow ?? new Date(builtAt));
  let pickedIso = $state<string>();
  let sheetOpen = $state(false);
  let card = $state<HTMLElement>();

  const f = $derived(fortnight(now, timeZone));
  const picked: OpenDay = $derived((pickedIso && pick(f, pickedIso)) || f.firstOpen);

  const isPhone = (): boolean => matchMedia('(max-width: 680px)').matches;

  onMount(() => {
    clientNow = new Date();
  });

  // The palette asked to pick a morning. A request made before hydration is the one that
  // scrolled this card into view (and so hydrated it), so it is handled too.
  let handled = 0;
  $effect(() => {
    const request = $coffeeRequest;
    if (!request || request.seq === handled) return;
    handled = request.seq;
    if (isPhone()) sheetOpen = true;
    else card?.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus({ preventScroll: true });
  });

  function choose(day: CoffeeDay, where: 'card' | 'sheet'): void {
    const open = pick(f, day.iso);
    if (!open) return;
    pickedIso = open.iso;
    // On a phone, picking in the card confirms in the sheet.
    if (where === 'card' && isPhone()) sheetOpen = true;
  }

  function book(e: MouseEvent): void {
    e.preventDefault();
    if (isPhone()) sheetOpen = true;
    else perform({ _tag: 'BookCoffee', day: picked });
  }

  function bookFromSheet(): void {
    sheetOpen = false;
    perform({ _tag: 'BookCoffee', day: picked });
  }

  const label = (d: CoffeeDay): string =>
    `${d.long}${d.availability === 'open' ? ', morning free' : d.availability === 'today' ? ', today' : ''}`;
</script>

{#snippet calendar(where: 'card' | 'sheet')}
  <p class="flex items-baseline justify-between gap-2">
    <b class={['font-semibold whitespace-nowrap', where === 'sheet' ? 'text-sheet' : 'text-body']}>{f.month}</b>
    <span class={['truncate text-fg-subtle', where === 'sheet' ? 'text-meta' : 'text-label']}>Mornings · Sydney</span>
  </p>
  <div class="mt-2.5">
    <div class="grid grid-cols-5 gap-1" aria-hidden="true">
      {#each ['M', 'T', 'W', 'T', 'F'] as d, i (i)}
        <span class="pb-1.25 text-center font-mono text-micro leading-none text-fg-subtle">{d}</span>
      {/each}
    </div>
    <div
      class="grid grid-cols-5 gap-1"
      role="group"
      aria-label="Pick a weekday morning"
    >
      {#each f.days as day (day.iso)}
        <button
          type="button"
          class={[
            'day relative text-center font-medium tabular transition-[background-color,color,transform] duration-(--duration-press) ease-out-strong',
            where === 'sheet'
              ? 'h-10.5 rounded-md text-sheet leading-10.5'
              : 'h-7 rounded-sm text-meta leading-7 phone:h-9 phone:text-bar-phone phone:leading-9',
            day.availability === 'open' &&
              'after:absolute after:bottom-0.75 after:left-1/2 after:size-0.75 after:-translate-x-1/2 after:rounded-full after:bg-sun active:scale-94',
            day.availability === 'open' &&
              (day.iso === picked.iso ? 'bg-fg text-canvas' : 'bg-hover text-fg hover:bg-hover-strong'),
            day.availability === 'past' && 'cursor-default text-fg-faint',
            day.availability === 'today' && 'cursor-default text-fg-muted inset-ring inset-ring-line-strong',
          ]}
          disabled={day.availability !== 'open'}
          aria-pressed={day.iso === picked.iso}
          aria-label={label(day)}
          onclick={() => choose(day, where)}>{day.dayOfMonth}</button
        >
      {/each}
    </div>
  </div>
{/snippet}

<div class="flex min-h-0 flex-1 flex-col" bind:this={card}>
  {@render calendar('card')}
  <p class="mt-auto mb-2.5 text-label text-fg-subtle phone:mt-3">Pick a morning — it drafts the email.</p>
  <a
    class="relative flex h-8 items-center justify-between rounded-row bg-hover pr-1.25 pl-2.5 text-meta font-medium text-fg-muted inset-ring inset-ring-line transition-colors duration-(--duration-fast) ease-out-strong hover:bg-active hover:text-fg phone:h-10"
    href={mailto(email, picked)}
    onclick={book}
  >
    <span>Book <b class="font-semibold text-fg">{picked.short}</b></span>
    <kbd
      class="inline-grid h-5 min-w-5 place-items-center rounded-xs bg-kbd px-1.25 text-micro font-medium text-fg-muted phone:hidden"
      >↵</kbd
    >
  </a>
</div>

<Sheet bind:open={sheetOpen} title="Grab a coffee">
  {@render calendar('sheet')}
  <p class="mt-4 text-bar-phone leading-normal text-fg-muted">
    Coffee on the morning of <b class="font-semibold text-fg">{picked.long}</b>, near the harbour — or a
    call from anywhere.
  </p>
  {#snippet footer()}
    <button
      type="button"
      class="pressable flex h-11.5 w-full items-center justify-between rounded-lg bg-fg px-4 text-sheet font-semibold text-canvas"
      data-autofocus
      onclick={bookFromSheet}
    >
      <span>Email Josh · {picked.short}</span>
      <Icon name="arrow" size={14} stroke={2} />
    </button>
  {/snippet}
</Sheet>

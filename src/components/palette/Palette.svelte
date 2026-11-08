<!--
  @component
  The ⌘K command palette — the site's one navigation idea, with Raycast semantics:

  - opens from ⌘K, `/`, typing anywhere, or the top-bar pill (anything that sets `$palette`);
    from the keyboard it appears instantly, from a click it grows out of the pill
  - type to filter (ranked); ↑ ↓ or ⌃N ⌃P move; ↵ runs the primary action, ⌘↵ the secondary
  - Esc steps back: leave the reader → clear the query → back to the root → close;
    ⌫ on an empty query in a view goes back too
  - empty, it leads with Suggestions (⌥1–⌥5, which also work anywhere on the page); typing
    searches every command plus the notes, passes and projects inside the views, with
    "Run in Terminal" / "Email Josh about it" fallbacks
  - views (Notes, Engineering, Projects) push like extensions, with list + detail; notes open
    in the serif reader

  Desktop: a window under the top bar. Phone: the shared bottom sheet.
  `$palette` (lib/ui-state) is the source of truth; every row runs an `Action` via `perform`.
-->
<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { prefersReducedMotion } from 'svelte/motion';
  import { MediaQuery } from 'svelte/reactivity';

  import Icon from '~/components/ui/Icon.svelte';
  import Kbd from '~/components/ui/Kbd.svelte';
  import Sheet from '~/components/ui/Sheet.svelte';
  import { rank, score } from '~/domain/search';
  import { perform, type Action } from '~/lib/actions';
  import { lastInputWasPointer, lockScroll, rememberFocus, trapTab } from '~/lib/overlay';
  import { Spring, springLoop } from '~/lib/spring';
  import { $palette as paletteStore, type PaletteView } from '~/lib/ui-state';
  import type { Command, CommandRegistry, Section } from '~/site/commands';
  import { profile } from '~/site/profile';
  import Glyph from './Glyph.svelte';
  import PaletteDetail from './PaletteDetail.svelte';

  interface Props {
    registry: CommandRegistry;
    /** Josh's Memoji for the footer (a small optimised image URL). */
    avatar: string;
  }
  const { registry, avatar }: Props = $props();

  const phone = new MediaQuery('max-width: 680px');
  const listId = $props.id();

  /* State ---------------------------------------------------------------------------------- */
  let view = $state<PaletteView['_tag']>('Root');
  let query = $state('');
  let reading = $state(false);
  let selectedId = $state<string>();

  /** Desktop window lifecycle: `from`/`in` grow out of the pill, `out` fades away. */
  let mounted = $state(false);
  let anim = $state<'none' | 'from' | 'in' | 'out'>('none');
  let pos = $state({ top: 12, left: 0, width: 760, ox: 380 });

  let input = $state<HTMLInputElement>();
  let list = $state<HTMLElement>();
  let detail = $state<HTMLElement>();
  let win = $state<HTMLElement>();
  let highlight = $state<HTMLElement>();

  const open = $derived($paletteStore._tag === 'Open');
  const q = $derived(query.trim());

  /* Rows ----------------------------------------------------------------------------------- */
  const searchable = (c: Command) => ({ title: c.title, keywords: `${c.subtitle ?? ''} ${c.keywords}` });
  const filtered = (s: Section): Section => ({ heading: s.heading, commands: rank(s.commands, q, searchable) });
  const isFallback = (c: Command): boolean => c.id.startsWith('fb-');

  const fallback = $derived<Section>({
    heading: `Use “${q}” with…`,
    commands: [
      {
        id: 'fb-term',
        title: 'Run in Terminal',
        subtitle: q,
        glyph: { _tag: 'Icon', name: 'terminal' },
        keywords: '',
        primary: { label: 'Run in Terminal', action: { _tag: 'RunInTerminal', command: q } },
        trailing: { _tag: 'Text', text: 'Fallback' },
        detail: {
          _tag: 'Info',
          glyph: { _tag: 'Icon', name: 'terminal' },
          title: 'Run in Terminal',
          description: 'Hands your query to the terminal widget and types it out. Try help.',
          meta: [],
        },
      },
      {
        id: 'fb-mail',
        title: 'Email Josh about it',
        glyph: { _tag: 'Icon', name: 'mail' },
        keywords: '',
        primary: { label: 'Write Email', action: { _tag: 'SendEmail', subject: q } },
        trailing: { _tag: 'Text', text: 'Fallback' },
        detail: {
          _tag: 'Info',
          glyph: { _tag: 'Icon', name: 'mail' },
          title: 'Email Josh about it',
          description: 'Opens a new email with your query as the subject.',
          meta: [],
        },
      },
    ],
  });

  const sections = $derived.by((): ReadonlyArray<Section> => {
    if (view !== 'Root') return [filtered(registry.views[view].section)];
    if (!q) return [registry.suggestions, ...registry.groups];
    // Sections keep their rows ranked; the section holding the best match comes first.
    const best = (s: Section): number => {
      const [top] = s.commands;
      return top ? score(q, searchable(top)) : 0;
    };
    const matches = [
      ...registry.groups.map(filtered),
      ...Object.values(registry.views).map((v) => filtered(v.section)),
    ]
      .filter((s) => s.commands.length > 0)
      .map((s, i) => ({ s, i, best: best(s) }))
      .toSorted((a, b) => b.best - a.best || a.i - b.i)
      .map((r) => r.s);
    return [...matches, fallback];
  });
  const rows = $derived(sections.flatMap((s) => s.commands));
  const selected = $derived(rows.find((r) => r.id === selectedId));
  const spec = $derived(view === 'Root' ? undefined : registry.views[view]);
  const rowDomId = (c: Command): string => `${listId}-${c.id}`;

  const firstRow = (): Command | undefined => rows.find((r) => !isFallback(r)) ?? rows[0];

  /* Selection + highlight ------------------------------------------------------------------ */
  const hy = new Spring(0, { response: 0.26, damping: 0.86 });
  const hlLoop = springLoop([hy], () => {
    if (highlight) highlight.style.transform = `translate3d(0, ${hy.value.toFixed(2)}px, 0)`;
  });
  let snapNext = true;

  const rowEl = (id: string | undefined): HTMLElement | null =>
    id && list ? list.querySelector<HTMLElement>(`[data-row="${CSS.escape(id)}"]`) : null;

  // Follow the selection (and re-measure when rows or layout change).
  $effect(() => {
    const el = rowEl(selectedId);
    void rows;
    void reading;
    if (!highlight) return;
    if (!el) {
      highlight.style.opacity = '0';
      return;
    }
    highlight.style.opacity = '1';
    highlight.style.height = `${el.offsetHeight}px`;
    if (untrack(() => snapNext) || prefersReducedMotion.current) {
      snapNext = false;
      hlLoop.stop();
      hy.set(el.offsetTop);
      highlight.style.transform = `translate3d(0, ${el.offsetTop}px, 0)`;
      return;
    }
    hy.to(el.offsetTop);
    hlLoop.kick();
  });

  /** Keep the selected row in view (keyboard moves). */
  function reveal(id: string | undefined): void {
    const el = rowEl(id);
    if (!el || !list) return;
    const section = el.parentElement;
    const isFirst = section?.querySelector('[role="option"]') === el;
    const top = isFirst && section ? section.offsetTop : el.offsetTop;
    const bottom = el.offsetTop + el.offsetHeight;
    if (top < list.scrollTop + 4) list.scrollTop = Math.max(0, top - 4);
    else if (bottom > list.scrollTop + list.clientHeight - 4) {
      list.scrollTop = bottom - list.clientHeight + 6;
    }
  }

  function select(id: string | undefined, scroll: boolean): void {
    if (selectedId !== id && detail) detail.scrollTop = 0;
    selectedId = id;
    if (scroll) void tick().then(() => reveal(id));
  }

  function move(by: 1 | -1): void {
    if (rows.length === 0) return;
    const i = rows.findIndex((r) => r.id === selectedId);
    const next = rows[Math.max(0, Math.min(rows.length - 1, i + by))];
    select(next?.id, true);
  }

  /* Views ---------------------------------------------------------------------------------- */
  /** Query typed before the palette opened (typing anywhere), applied with the view. */
  let pendingQuery: string | undefined;

  function applyView(next: PaletteView): void {
    view = next._tag;
    query = pendingQuery ?? '';
    pendingQuery = undefined;
    const target =
      next._tag === 'Notes' && next.noteId
        ? `note-${next.noteId}`
        : next._tag === 'Career' && next.roleId
          ? `role-${next.roleId}`
          : undefined;
    const found = target !== undefined && rows.some((r) => r.id === target);
    snapNext = true;
    select(found ? target : firstRow()?.id, false);
    // A phone has no side pane: deep links open straight into the detail.
    reading = found && ((next._tag === 'Notes' && next.reading === true) || phone.current);
    void tick().then(() => {
      if (list) list.scrollTop = 0;
      if (found) reveal(target);
    });
  }

  const goTo = (next: PaletteView): void => perform({ _tag: 'OpenPalette', view: next });
  const goRoot = (): void => goTo({ _tag: 'Root' });

  function back(): void {
    if (reading) reading = false;
    else goRoot();
    if (!phone.current) input?.focus({ preventScroll: true });
  }

  /* Running -------------------------------------------------------------------------------- */
  const readingNote = $derived(reading && selected?.detail._tag === 'Note');
  const primaryLabel = $derived(readingNote ? 'Back to List' : (selected?.primary.label ?? 'Open'));

  function run(alt: boolean): void {
    if (!selected) return;
    if (readingNote && !alt) {
      reading = false;
      return;
    }
    const action: Action | undefined = alt ? selected.secondary?.action : selected.primary.action;
    if (action) perform(action);
  }

  function onRowClick(c: Command): void {
    select(c.id, false);
    // Phones show a view row's detail first; its footer then runs the action.
    if (phone.current && view !== 'Root') {
      reading = true;
      return;
    }
    run(false);
  }

  let px = -1;
  let py = -1;
  function onListPointerMove(e: PointerEvent): void {
    if (e.pointerType !== 'mouse' || (e.clientX === px && e.clientY === py)) return;
    px = e.clientX;
    py = e.clientY;
    const el = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-row]') : null;
    const id = el?.dataset['row'];
    if (id && id !== selectedId) select(id, false);
  }

  function onInput(): void {
    reading = false;
    snapNext = false;
    select(firstRow()?.id, false);
    if (list) list.scrollTop = 0;
  }

  /* Open / close --------------------------------------------------------------------------- */
  let wasOpen = false;
  let cancelled = false;
  let releaseScroll: (() => void) | undefined;
  let restoreFocus: (() => void) | undefined;
  let closeTimer = 0;

  /** The user backed out (Esc, scrim, Done): focus returns to where it was. */
  function cancel(): void {
    cancelled = true;
    paletteStore.set({ _tag: 'Closed' });
  }

  /** Desktop: line the window up under the top-bar pill it grows out of. */
  function place(): void {
    const anchor = document.querySelector('[data-command-pill]')?.getBoundingClientRect();
    const width = Math.min(
      Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--palette-width')) || 760,
      innerWidth - 32,
    );
    const left = (innerWidth - width) / 2;
    pos = {
      top: anchor ? Math.max(10, anchor.top - 6) : 10,
      left,
      width,
      ox: anchor ? anchor.left + anchor.width / 2 - left : width / 2,
    };
  }

  function onOpen(): void {
    cancelled = false;
    if (phone.current) return; // the Sheet locks, traps and restores
    window.clearTimeout(closeTimer);
    restoreFocus = rememberFocus();
    releaseScroll = lockScroll();
    place();
    const animate = lastInputWasPointer() && !prefersReducedMotion.current;
    anim = animate ? 'from' : 'none';
    mounted = true;
    void tick().then(() => {
      input?.focus({ preventScroll: true });
      if (animate) requestAnimationFrame(() => (anim = 'in'));
    });
  }

  function onClose(): void {
    if (!mounted) return;
    releaseScroll?.();
    releaseScroll = undefined;
    if (cancelled) restoreFocus?.();
    restoreFocus = undefined;
    if (lastInputWasPointer() && !prefersReducedMotion.current) {
      anim = 'out';
      const ms = Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--duration-palette-out'),
      );
      closeTimer = window.setTimeout(() => (mounted = false), ms || 120);
    } else {
      mounted = false;
    }
  }

  $effect(() => {
    const state = $paletteStore;
    untrack(() => {
      if (state._tag === 'Open') {
        if (!wasOpen) {
          wasOpen = true;
          applyView(state.view);
          onOpen();
        } else {
          applyView(state.view);
          if (!phone.current) input?.focus({ preventScroll: true });
        }
      } else if (wasOpen) {
        wasOpen = false;
        onClose();
      }
    });
  });

  /* Keys ----------------------------------------------------------------------------------- */
  const editable = (el: Element | null): boolean =>
    el instanceof HTMLElement &&
    (el.isContentEditable || el.matches('input, textarea, select'));

  /** Inside the palette. Guarded by `defaultPrevented` so nested listeners act once. */
  function onPaletteKey(e: KeyboardEvent): void {
    if (e.defaultPrevented) return;
    const k = e.key;
    if (k === 'ArrowDown' || (e.ctrlKey && k === 'n')) {
      e.preventDefault();
      move(1);
    } else if (k === 'ArrowUp' || (e.ctrlKey && k === 'p')) {
      e.preventDefault();
      move(-1);
    } else if (k === 'Enter' && !e.isComposing) {
      const active = document.activeElement;
      if (active !== input && active !== win && !phone.current) return;
      if (active instanceof HTMLButtonElement || active instanceof HTMLAnchorElement) return;
      e.preventDefault();
      run(e.metaKey || e.ctrlKey);
    } else if (k === 'Escape') {
      e.preventDefault();
      if (reading) reading = false;
      else if (query) {
        query = '';
        onInput();
      } else if (view !== 'Root') goRoot();
      else cancel();
    } else if (k === 'Backspace' && !query && view !== 'Root' && document.activeElement === input) {
      e.preventDefault();
      goRoot();
    } else if (k === 'Tab' && !phone.current && win) {
      trapTab(e, win);
    }
  }

  /** Anywhere on the page. */
  function onGlobalKey(e: KeyboardEvent): void {
    if (e.defaultPrevented) return;
    const mod = e.metaKey || e.ctrlKey;
    // Another overlay (a widget's sheet) owns the keyboard while it's up.
    const otherOverlay = !open && document.documentElement.hasAttribute('data-scroll-lock');
    if (otherOverlay) return;

    if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (open) cancel();
      else goRoot();
      return;
    }
    if (e.altKey && !mod && /^Digit[1-5]$/.test(e.code)) {
      if (editable(document.activeElement) && !open) return;
      const suggestion = registry.suggestions.commands[Number(e.code.slice(5)) - 1];
      if (suggestion) {
        e.preventDefault();
        perform(suggestion.primary.action);
      }
      return;
    }
    const printable = !mod && !e.altKey && e.key.length === 1;
    // Keys typed in the instant between opening and the field taking focus still count.
    if (open && printable && !editable(document.activeElement)) {
      e.preventDefault();
      query += e.key;
      onInput();
      input?.focus({ preventScroll: true });
      return;
    }
    if (open || editable(document.activeElement)) return;
    if (e.key === '/' && !mod && !e.altKey) {
      e.preventDefault();
      goRoot();
      return;
    }
    if (printable && /[a-z0-9]/i.test(e.key)) {
      e.preventDefault();
      pendingQuery = e.key;
      goRoot();
    }
  }

  $effect(() => {
    if (!mounted) return;
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  });

  // Crossing the phone breakpoint while open: close rather than leave a stale overlay.
  $effect(() => {
    void phone.current;
    untrack(() => {
      if (wasOpen) cancel();
    });
  });

  const footerTitle = $derived(spec?.title ?? `${profile.short} Germon`);
</script>

<svelte:window onkeydown={onGlobalKey} />

{#snippet head()}
  <div
    class={[
      'flex items-center gap-3 border-b border-line',
      'h-13.5 pr-3 phone:h-13 phone:pr-2.5 phone:pl-4',
      view !== 'Root' || reading ? 'pl-3' : 'pl-4.5',
    ]}
    onkeydown={onPaletteKey}
    role="presentation"
  >
    {#if view !== 'Root' || reading}
      <button
        type="button"
        class="pressable grid size-6.5 flex-none place-items-center rounded-sm bg-kbd text-fg transition-colors duration-(--duration-fast) hover:bg-active"
        aria-label="Back"
        onclick={back}
      >
        <Icon name="chevronLeft" size={14} stroke={2.4} />
      </button>
    {:else}
      <span class="grid flex-none text-fg-muted"><Icon name="command" size={16} stroke={2} /></span>
    {/if}
    <input
      bind:this={input}
      bind:value={query}
      oninput={onInput}
      data-autofocus={view === 'Root' ? '' : undefined}
      class="h-full min-w-0 flex-1 bg-transparent text-body-lg tracking-snug text-fg caret-accent outline-none placeholder:text-fg-subtle focus-visible:outline-none phone:text-input-phone"
      type="text"
      role="combobox"
      aria-expanded="true"
      aria-controls={listId}
      aria-autocomplete="list"
      aria-activedescendant={selected ? rowDomId(selected) : undefined}
      aria-label="Search commands"
      autocomplete="off"
      autocapitalize="off"
      spellcheck="false"
      enterkeyhint="go"
      placeholder={spec?.placeholder ?? 'What would you like to do?'}
    />
    {#if spec}
      <span
        class="h-6 flex-none rounded-sm border border-line-strong px-2.25 text-caption leading-5.5 font-medium text-fg-muted"
        >{spec.title}</span
      >
    {/if}
    <button type="button" class="grid flex-none" aria-label="Close" onclick={cancel}>
      <Kbd size="lg" class="phone:hidden">esc</Kbd>
      <span class="hidden py-1.5 pr-1 pl-2 text-sheet font-semibold text-fg phone:block">Done</span>
    </button>
  </div>
{/snippet}

{#snippet trailing(c: Command, isSelected: boolean)}
  <span class="ml-auto inline-flex flex-none items-center gap-2 text-caption text-fg-subtle tabular">
    {#if c.trailing._tag === 'Keys'}
      <span class="inline-flex gap-0.5 phone:hidden">
        {#each c.trailing.keys as key (key)}
          <Kbd size="sm" dim={!isSelected}>{key}</Kbd>
        {/each}
      </span>
    {:else}
      {#if c.trailing.count !== undefined}
        <span class="inline-grid h-4.5 min-w-5 place-items-center rounded-xs bg-kbd px-1.25 text-micro text-fg-muted">
          {c.trailing.count}
        </span>
      {/if}
      {#if c.trailing.stars}
        <span class="text-label">★ {c.trailing.stars}</span>
      {/if}
      <span title={c.trailing.hint}>{c.trailing.text}</span>
    {/if}
  </span>
{/snippet}

{#snippet body()}
  <div
    class={[
      'grid min-h-0 phone:flex-1 phone:grid-cols-1',
      reading ? 'grid-cols-[0_minmax(0,1fr)]' : 'grid-cols-[minmax(0,42%)_minmax(0,1fr)]',
      reading
        ? 'h-[min(var(--palette-height-reading),calc(100dvh-var(--top)-(--spacing(30))))]'
        : 'h-[min(var(--palette-height),calc(100dvh-var(--top)-(--spacing(35))))]',
      'min-h-65 phone:h-auto phone:min-h-0',
    ]}
    onkeydown={onPaletteKey}
    role="presentation"
  >
    <div
      bind:this={list}
      id={listId}
      role="listbox"
      aria-label={spec?.title ?? 'Commands'}
      tabindex="-1"
      class={[
        'relative overflow-y-auto overscroll-contain border-r border-line px-2 pt-1 pb-2 [scrollbar-color:var(--color-line-strong)_transparent] [scrollbar-width:thin]',
        'phone:border-r-0 phone:px-2 phone:pt-0.5 phone:pb-3',
        reading && 'invisible border-0 p-0 phone:hidden',
      ]}
      onpointermove={onListPointerMove}
    >
      <i
        bind:this={highlight}
        class="pointer-events-none absolute inset-x-2 top-0 block h-9.5 rounded-row bg-active opacity-0 will-change-transform"
        aria-hidden="true"
      ></i>
      {#each sections as section (section.heading)}
        <div role="group" aria-label={section.heading}>
          <p
            class="truncate px-2 pt-2.5 pb-1.25 text-label font-semibold tracking-[0.005em] text-fg-subtle"
            aria-hidden="true"
          >
            {section.heading}
          </p>
          {#each section.commands as c (c.id)}
            {@const isSelected = c.id === selectedId}
            <div
              id={rowDomId(c)}
              data-row={c.id}
              role="option"
              tabindex="-1"
              aria-selected={isSelected}
              class="relative z-1 flex h-9.5 cursor-default items-center gap-2.5 rounded-row px-2 select-none phone:h-11"
              onclick={() => onRowClick(c)}
              onkeydown={onPaletteKey}
            >
              <Glyph glyph={c.glyph} />
              <b
                class={[
                  'min-w-0 truncate font-medium text-fg',
                  view === 'Notes' ? 'flex-auto' : 'flex-initial',
                  c.mono && 'font-mono tracking-snug',
                ]}>{c.title}</b
              >
              {#if c.subtitle}
                <span class={['min-w-0 flex-1 truncate text-fg-subtle', isFallback(c) && 'font-mono']}
                  >{c.subtitle}</span
                >
              {/if}
              {@render trailing(c, isSelected)}
            </div>
          {/each}
        </div>
      {/each}
      {#if rows.length === 0}
        <p class="grid h-full place-items-center text-fg-subtle">No matching commands</p>
      {/if}
    </div>

    <div
      bind:this={detail}
      class={[
        'relative overflow-y-auto overscroll-contain [scrollbar-color:var(--color-line-strong)_transparent] [scrollbar-width:thin]',
        reading
          ? 'px-[clamp(--spacing(6),9%,--spacing(20))] pt-8.5 pb-11 phone:px-5 phone:pt-4.5 phone:pb-8'
          : 'px-6.5 pt-5.5 pb-6.5 phone:hidden',
      ]}
    >
      {#if selected}
        {#key selected.id}
          <PaletteDetail command={selected} {reading} />
        {/key}
      {/if}
    </div>
  </div>
{/snippet}

{#snippet foot()}
  <div
    class="flex h-10.5 flex-none items-center justify-between gap-3 border-t border-line bg-white/2 pr-2 pl-3.5 text-caption phone:h-auto phone:min-h-12 phone:pt-1.5 phone:pb-[calc(--spacing(1.5)+env(safe-area-inset-bottom))]"
  >
    <span class="flex min-w-0 items-center gap-2.25 font-medium whitespace-nowrap text-fg-muted">
      <img class="size-4.5 rounded-full" src={avatar} alt="" width="18" height="18" />
      <span class="truncate">{footerTitle}</span>
    </span>
    <span class="flex flex-none items-center gap-0.5">
      <button
        type="button"
        class="pressable inline-flex h-7 items-center gap-1 rounded-sm pr-1.5 pl-2 font-medium whitespace-nowrap text-fg transition-colors duration-(--duration-fast) hover:bg-active disabled:pointer-events-none disabled:opacity-40"
        disabled={!selected}
        onclick={() => run(false)}
      >
        {primaryLabel}
        <Kbd class="ml-1 phone:hidden"><Icon name="return" size={11} stroke={2.2} /></Kbd>
      </button>
      {#if selected?.secondary}
        <i class="mx-1 block h-3.5 w-px bg-line-strong" aria-hidden="true"></i>
        <button
          type="button"
          class="pressable inline-flex h-7 items-center gap-1 rounded-sm pr-1.5 pl-2 font-medium whitespace-nowrap text-fg-muted transition-colors duration-(--duration-fast) hover:bg-active"
          onclick={() => run(true)}
        >
          {selected.secondary.label}
          <span class="ml-1 inline-flex gap-0.5 phone:hidden"
            ><Kbd>⌘</Kbd><Kbd><Icon name="return" size={11} stroke={2.2} /></Kbd></span
          >
        </button>
      {/if}
    </span>
  </div>
{/snippet}

{#if phone.current}
  <Sheet open={open} fill label="Command palette" onclose={cancel}>
    {#snippet header()}
      {@render head()}
    {/snippet}
    <div class="flex min-h-0 flex-1 flex-col" bind:this={win}>
      {@render body()}
      {@render foot()}
    </div>
  </Sheet>
{:else if mounted}
  <div class="fixed inset-0 z-50">
    <!-- svelte-ignore a11y_click_events_have_key_events (pointer shortcut; Esc is the keyboard path) -->
    <div
      class="scrim absolute inset-0 bg-scrim"
      data-anim={anim}
      onclick={cancel}
      aria-hidden="true"
    ></div>
    <div
      bind:this={win}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      tabindex="-1"
      data-anim={anim}
      class="window fixed flex flex-col overflow-hidden rounded-palette border border-line-strong bg-window shadow-window outline-none backdrop-blur-window backdrop-saturate-170"
      style:--top="{pos.top}px"
      style:top="{pos.top}px"
      style:left="{pos.left}px"
      style:width="{pos.width}px"
      style:--ox="{pos.ox}px"
      onkeydown={onPaletteKey}
    >
      {@render head()}
      {@render body()}
      {@render foot()}
    </div>
  </div>
{/if}

<style>
  /* Pointer-opened: grow out of the top-bar pill. Keyboard-opened: no animation at all. */
  .window {
    transform-origin: var(--ox) 0;
  }
  .window[data-anim='from'],
  .window[data-anim='out'] {
    opacity: 0;
    scale: 0.94 0.9;
  }
  .window[data-anim='in'] {
    transition:
      opacity var(--duration-fast) var(--ease-out-strong),
      scale var(--duration-palette-in) var(--ease-out-strong);
  }
  .window[data-anim='out'] {
    transition:
      opacity var(--duration-palette-out) ease-in,
      scale var(--duration-palette-out) ease-in;
  }
  .scrim[data-anim='from'],
  .scrim[data-anim='out'] {
    opacity: 0;
  }
  .scrim[data-anim='in'],
  .scrim[data-anim='out'] {
    transition: opacity var(--duration-scrim) ease;
  }
</style>

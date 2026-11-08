<!--
  @component
  The terminal widget: an honest little zsh. Type, Tab-complete, ↑/↓ for history, ⌃L to clear
  — or tap a suggestion chip and watch it type itself. When it first scrolls into view it
  introduces itself (`whoami`, and `ls projects` on wider screens).

  All parsing and evaluation lives in `domain/terminal.ts`; this island renders lines, mirrors
  the hidden input with a block caret, and plays the evaluation's steps (pauses, links, toasts).
  `$terminalRequest` (palette commands like "sudo hire josh") types and runs a command here,
  with a soft band on the row it's typing into, which then stays on the command's line in the
  history for a moment, so the eye finds what was just run for you.
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { prefersReducedMotion } from 'svelte/motion';

  import {
    complete,
    emptySession,
    greeting,
    hint,
    recall,
    submit,
    suggestions,
    type Effect,
    type Facts,
    type Line,
    type Step,
    type Tone,
  } from '~/domain/terminal';
  import { perform, toast } from '~/lib/actions';
  import { casesHandled } from '~/lib/defects';
  import { $terminalRequest as terminalRequest } from '~/lib/ui-state';

  interface Props {
    facts: Facts;
    /** When the page was built (ISO instant): the server render's "last login". */
    builtAt: string;
  }
  const { facts, builtAt }: Props = $props();

  /** Keep the scrollback short; nobody scrolls a widget's history. */
  const MAX_LINES = 200;

  let lines = $state<ReadonlyArray<{ readonly id: number; readonly line: Line }>>([]);
  let nextId = 0;
  let clientNow = $state<Date>();
  let greeted = $state(true);
  let session = emptySession;
  let value = $state('');
  let caret = $state(0);
  let focused = $state(false);
  let busy = false;
  let root = $state<HTMLElement>();
  let body = $state<HTMLElement>();
  let input = $state<HTMLInputElement>();
  /**
   * The row lit for a command run from elsewhere: the prompt while it types, then the
   * command's echo (by line id) until it fades.
   */
  let lit = $state<{ readonly _tag: 'Typing' } | { readonly _tag: 'Echo'; readonly id: number } | null>(
    null,
  );

  /** How long a requested command's line stays lit after it runs. */
  const LIT_FOR_MS = 1600;

  const welcome = $derived(greeting(clientNow ?? new Date(builtAt), facts.timeZone));
  const before = $derived(value.slice(0, caret));
  const at = $derived(value[caret] ?? ' ');
  const after = $derived(value.slice(caret + 1));

  const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, prefersReducedMotion.current ? 0 : ms));

  async function print(line: Line): Promise<void> {
    lines = [...lines, { id: nextId++, line }].slice(-MAX_LINES);
    await tick();
    if (body) body.scrollTop = body.scrollHeight;
  }

  function clear(): void {
    lines = [];
    greeted = false;
  }

  function run(effect: Effect): void {
    switch (effect._tag) {
      case 'OpenLink':
        perform({ _tag: 'OpenLink', href: effect.href });
        return;
      case 'BrowseProjects':
        perform({ _tag: 'OpenPalette', view: { _tag: 'Projects' } });
        return;
      case 'Toast':
        toast(effect.message);
        return;
      default:
        casesHandled(effect);
    }
  }

  async function play(steps: ReadonlyArray<Step>): Promise<void> {
    for (const step of steps) {
      switch (step._tag) {
        case 'Print':
          await print(step.line);
          break;
        case 'Pause':
          await sleep(step.ms);
          break;
        case 'Clear':
          clear();
          break;
        case 'Effect':
          run(step.effect);
          break;
        default:
          casesHandled(step);
      }
    }
  }

  const width = (): 'wide' | 'narrow' =>
    (root?.closest('section')?.clientWidth ?? 0) > 640 ? 'wide' : 'narrow';

  async function execute(line: string): Promise<void> {
    const result = submit(session, line, { facts, now: new Date(), width: width() });
    session = result.session;
    await play(result.steps);
  }

  /**
   * Type `command` out like a person would, then run it. `highlight` lights the row for a
   * command run on the visitor's behalf (a pill, the palette).
   */
  async function typeAndRun(command: string, highlight = false): Promise<void> {
    if (highlight) lit = { _tag: 'Typing' };
    value = '';
    for (let i = 1; i <= command.length; i++) {
      value = command.slice(0, i);
      caret = i;
      await sleep(34 + Math.random() * 46);
    }
    await sleep(220);
    value = '';
    caret = 0;
    // The run's first printed line is always its echo, so it takes the next id.
    const echo = nextId;
    if (highlight) lit = { _tag: 'Echo', id: echo };
    await execute(command);
    if (highlight) {
      setTimeout(() => {
        if (lit?._tag === 'Echo' && lit.id === echo) lit = null;
      }, LIT_FOR_MS);
    }
  }

  // Everything that types for the user runs one after another, never interleaved.
  let queue: Promise<void> = Promise.resolve();
  function enqueue(job: () => Promise<void>): void {
    queue = queue.then(async () => {
      busy = true;
      try {
        await job();
      } finally {
        busy = false;
      }
    });
  }

  function syncCaret(): void {
    caret = input?.selectionStart ?? value.length;
  }

  function onkeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (busy) return;
      const line = value;
      value = '';
      caret = 0;
      enqueue(() => execute(line));
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const r = recall(session, e.key === 'ArrowUp' ? 'older' : 'newer');
      session = r.session;
      value = r.value;
      caret = value.length;
      void tick().then(() => input?.setSelectionRange(value.length, value.length));
    } else if (e.key === 'Tab' && !e.shiftKey && value.trim()) {
      // An empty line lets Tab move focus on, so keyboard users are never trapped here.
      e.preventDefault();
      const c = complete(value, facts);
      value = c.value;
      caret = value.length;
      if (c._tag === 'Ambiguous') {
        void print({ _tag: 'Echo', input: c.value });
        void print({ _tag: 'Output', spans: [{ _tag: 'Text', text: c.candidates.join('  '), tone: 'plain' }] });
      }
    } else if (e.key.toLowerCase() === 'l' && e.ctrlKey) {
      e.preventDefault();
      clear();
    }
    requestAnimationFrame(syncCaret);
  }

  function focusInput(e: MouseEvent): void {
    if (e.target instanceof Element && e.target.closest('a')) return;
    if (getSelection()?.toString()) return;
    input?.focus({ preventScroll: true });
  }

  function chip(command: string): void {
    if (busy) return;
    enqueue(() => typeAndRun(command));
  }

  // A command from elsewhere (palette, hero pill). A request made before hydration is the
  // one that scrolled this card into view (and so hydrated it), so it runs too.
  let handled = 0;
  let introduced = false;
  $effect(() => {
    const request = $terminalRequest;
    if (!request || request.seq === handled) return;
    handled = request.seq;
    introduced = true;
    enqueue(async () => {
      await sleep(420); // let the scroll to the widget land
      input?.focus({ preventScroll: true });
      await typeAndRun(request.command, true);
    });
  });

  onMount(() => {
    clientNow = new Date();
    // Introduce itself once half the card is on screen.
    const target = root?.closest('section') ?? root;
    if (!target) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        io.disconnect();
        if (introduced) return;
        introduced = true;
        enqueue(async () => {
          await sleep(500);
          await typeAndRun('whoami');
          if (innerWidth > 680) {
            await sleep(500);
            await typeAndRun('ls projects');
          }
          await print(hint);
        });
      },
      { threshold: 0.5 },
    );
    io.observe(target);
    return () => io.disconnect();
  });

  const toneClass: Record<Tone, string> = {
    plain: '',
    strong: 'font-semibold text-fg',
    dim: 'text-fg-subtle',
    accent: 'text-link',
    warn: 'text-gold',
    ok: 'text-up',
    error: 'text-accent',
  };
</script>

{#snippet prompt()}
  <span class="text-up">josh@sydney</span> <span class="text-fg-subtle">~ %</span>
{/snippet}

{#snippet render(line: Line)}
  {#if line._tag === 'Echo'}
    {@render prompt()} {line.input}
  {:else}
    {#each line.spans as span, i (i)}
      {#if span._tag === 'Link'}
        <a
          class="text-fg underline decoration-line-strong underline-offset-2"
          href={span.href}
          target={span.href.startsWith('mailto:') ? undefined : '_blank'}
          rel="noopener">{span.text}</a
        >
      {:else}
        <span class={toneClass[span.tone]}>{span.text}</span>
      {/if}
    {/each}
  {/if}
{/snippet}

<div class="term flex min-h-0 flex-1 flex-col" data-focus={focused ? '' : undefined} bind:this={root}>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions (pointer convenience: clicking anywhere focuses the input, which is reachable by Tab) -->
  <div
    bind:this={body}
    class="-mx-card min-h-0 flex-1 cursor-text overflow-y-auto px-card pt-0.5 pb-1.5 font-mono text-caption leading-terminal text-fg-muted [scrollbar-width:none]"
    onclick={focusInput}
  >
    <!-- pre-wrap per line, not on the list: whitespace between lines must not render. -->
    <div class="break-words" aria-live="polite">
      {#if greeted}<div class="whitespace-pre-wrap">{@render render(welcome)}</div>{/if}
      {#each lines as entry (entry.id)}
        <div
          class="row whitespace-pre-wrap"
          data-lit={lit?._tag === 'Echo' && lit.id === entry.id ? '' : undefined}
        >
          {@render render(entry.line)}
        </div>
      {/each}
    </div>
    <label class="row flex gap-2" data-lit={lit?._tag === 'Typing' ? '' : undefined}>
      <span class="flex-none">{@render prompt()}</span>
      <span class="relative min-w-0 flex-1 text-fg">
        <span class="whitespace-pre" aria-hidden="true"
          >{before}<span class="caret">{at}</span>{after}</span
        >
        <input
          bind:this={input}
          bind:value
          class="absolute inset-0 w-full border-0 bg-transparent p-0 text-touch-input text-transparent caret-transparent opacity-0 outline-none"
          aria-label="Terminal command"
          spellcheck="false"
          autocomplete="off"
          autocapitalize="off"
          enterkeyhint="go"
          {onkeydown}
          oninput={syncCaret}
          onselect={syncCaret}
          onkeyup={syncCaret}
          onclick={syncCaret}
          onfocus={() => (focused = true)}
          onblur={() => (focused = false)}
        />
      </span>
    </label>
  </div>
  <div class="flex flex-wrap gap-1.5 border-t border-line pt-2.5" role="toolbar" aria-label="Suggested commands">
    {#each suggestions as command (command)}
      <button
        type="button"
        class="pressable h-6 rounded-xs bg-kbd px-2 font-mono text-label leading-6 text-fg-muted hover:bg-active hover:text-fg"
        onclick={() => chip(command)}>{command}</button
      >
    {/each}
  </div>
</div>

<style>
  /* A row lit for a requested command: a band across the whole card, in quickly, out slowly. */
  .row {
    position: relative;
    /* Its own stacking context, so the band sits behind the text but above the card. */
    isolation: isolate;
  }
  .row::before {
    content: '';
    position: absolute;
    inset: 0 calc(var(--spacing-card) * -1);
    z-index: -1;
    background: var(--color-active);
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--duration-term-fade) ease;
  }
  .row[data-lit]::before {
    opacity: 1;
    transition-duration: var(--duration-fast);
  }
  /* The prompt hands the band to the command's line, so it lets go quickly. */
  label.row::before {
    transition-duration: var(--duration-fast);
  }
  .caret {
    outline: 1px solid var(--color-fg-subtle);
    outline-offset: -1px;
  }
  .term[data-focus] .caret {
    outline: 0;
    background: var(--color-fg);
    color: var(--color-surface);
    animation: blink 1.1s steps(1) infinite;
  }
  @keyframes blink {
    50% {
      opacity: 0;
    }
  }
</style>

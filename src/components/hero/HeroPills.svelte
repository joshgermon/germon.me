<!--
  @component
  Brings the hero's pills to life. The sentence itself is static HTML (`Hero.astro`); each
  pill is an `<a data-pill>` to its widget, so it works before this hydrates.

  - Fine pointer: hovering a pill shows its preview beside the cursor (it trails the cursor
    a little) and brings its widget forward while the rest of the bento recedes. Hovering a
    career pill also puts that pass at the front of the Engineering stack.
  - Keyboard: focusing a pill shows the preview next to it.
  - Click / Enter performs the pill's `Action`.
  - Phone: a tap opens the preview in the shared sheet, with the action as its button.
-->
<script lang="ts">
  import Icon from '~/components/ui/Icon.svelte';
  import Sheet from '~/components/ui/Sheet.svelte';
  import { perform } from '~/lib/actions';
  import { $frontRole as frontRole } from '~/lib/ui-state';
  import type { Pill } from '~/site/hero';
  import PillPreview from './PillPreview.svelte';
  import { placePeek, type Point } from './placement';
  import type { PreviewData } from './preview-data';

  interface Props {
    pills: ReadonlyArray<Pill>;
    data: PreviewData;
  }
  const { pills, data }: Props = $props();

  /* Desktop peek ---------------------------------------------------------------------------- */
  let peeked = $state<Pill | null>(null);
  let visible = $state(false);
  /** Set when the content changes while already visible, to cross-fade the swap. */
  let swapped = $state(false);
  let peek = $state<HTMLElement>();
  let card = $state<HTMLElement>();

  /* Phone sheet ----------------------------------------------------------------------------- */
  let sheetPill = $state<Pill | null>(null);
  let sheetOpen = $state(false);

  const phone = (): boolean => matchMedia('(max-width: 680px)').matches;
  const reduced = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;

  // The card trails the cursor: each frame it closes ~a quarter of the gap.
  let target: Point = { x: -999, y: -999 };
  let at: Point = { x: -999, y: -999 };
  let frame = 0;

  const paint = (): void => {
    if (peek) peek.style.transform = `translate3d(${at.x.toFixed(1)}px, ${at.y.toFixed(1)}px, 0)`;
  };
  const follow = (): void => {
    const k = reduced() ? 1 : 0.24;
    at = { x: at.x + (target.x - at.x) * k, y: at.y + (target.y - at.y) * k };
    paint();
    const moving = Math.abs(target.x - at.x) > 0.3 || Math.abs(target.y - at.y) > 0.3;
    frame = moving ? requestAnimationFrame(follow) : 0;
  };
  const aim = (cursor: Point, jump: boolean): void => {
    const size = { width: card?.offsetWidth || 264, height: card?.offsetHeight || 120 };
    target = placePeek(cursor, size, { width: innerWidth, height: innerHeight });
    if (jump) {
      at = target;
      paint();
    }
    if (!frame) frame = requestAnimationFrame(follow);
  };

  /* Lit: the pill's widget forward, its siblings back --------------------------------------- */
  let lit: HTMLElement | null = null;
  const light = (pill: Pill | null): void => {
    const next = pill ? document.getElementById(pill.widget) : null;
    if (lit === next) return;
    lit?.removeAttribute('data-lit');
    lit?.parentElement?.removeAttribute('data-lit');
    lit = next;
    lit?.setAttribute('data-lit', '');
    lit?.parentElement?.setAttribute('data-lit', '');
  };

  let anchors: ReadonlyArray<HTMLAnchorElement> = [];

  const show = (pill: Pill): void => {
    if (peeked?.id !== pill.id) {
      swapped = visible;
      peeked = pill;
    }
    visible = true;
    for (const a of anchors) a.toggleAttribute('data-on', a.dataset['pill'] === pill.id);
    light(pill);
    if (pill.preview._tag === 'Pass') frontRole.set(pill.preview.role);
  };

  const hide = (): void => {
    visible = false;
    for (const a of anchors) a.removeAttribute('data-on');
    light(null);
  };

  const run = (pill: Pill): void => {
    hide();
    if (pill.preview._tag === 'Pass') frontRole.set(pill.preview.role);
    if (phone()) {
      sheetPill = pill;
      sheetOpen = true;
      return;
    }
    perform(pill.action);
  };

  const runFromSheet = (): void => {
    const pill = sheetPill;
    sheetOpen = false;
    if (pill) perform(pill.action);
  };

  $effect(() => {
    const byId = new Map(pills.map((p) => [p.id, p]));
    anchors = [...document.querySelectorAll<HTMLAnchorElement>('a[data-pill]')];
    const controller = new AbortController();
    const on = { signal: controller.signal };

    for (const a of anchors) {
      const pill = byId.get(a.dataset['pill'] ?? '');
      if (!pill) continue;
      a.addEventListener(
        'pointerenter',
        (e) => {
          if (e.pointerType !== 'mouse' || phone()) return;
          const wasHidden = !visible;
          show(pill);
          aim({ x: e.clientX, y: e.clientY }, wasHidden);
        },
        on,
      );
      a.addEventListener(
        'pointermove',
        (e) => {
          if (e.pointerType === 'mouse' && visible) aim({ x: e.clientX, y: e.clientY }, false);
        },
        on,
      );
      a.addEventListener(
        'pointerleave',
        (e) => {
          if (e.pointerType === 'mouse') hide();
        },
        on,
      );
      a.addEventListener(
        'focus',
        () => {
          if (!a.matches(':focus-visible') || phone()) return;
          show(pill);
          const r = a.getBoundingClientRect();
          aim({ x: r.left - 18, y: r.bottom - 12 }, true);
        },
        on,
      );
      a.addEventListener('blur', hide, on);
      a.addEventListener(
        'click',
        (e) => {
          e.preventDefault();
          run(pill);
        },
        on,
      );
    }

    addEventListener(
      'scroll',
      () => {
        if (visible && !document.activeElement?.matches('a[data-pill]')) hide();
      },
      { passive: true, signal: controller.signal },
    );

    return () => {
      controller.abort();
      cancelAnimationFrame(frame);
      hide();
    };
  });
</script>

<div class="peek" bind:this={peek} data-on={visible ? '' : undefined} aria-hidden="true">
  <div
    class={['peek-card', peeked?.preview._tag === 'Pass' && 'peek-card--pass']}
    bind:this={card}
  >
    {#if peeked}
      {#key peeked.id}
        <div class={['peek-body', swapped && 'peek-body--swap']}>
          <PillPreview preview={peeked.preview} {data} variant="peek" />
        </div>
      {/key}
    {/if}
  </div>
</div>

<Sheet bind:open={sheetOpen} title={sheetPill?.title ?? ''}>
  {#if sheetPill}
    <PillPreview preview={sheetPill.preview} {data} variant="sheet" />
  {/if}
  {#snippet footer()}
    <button
      type="button"
      class="pressable flex h-11.5 w-full items-center justify-between rounded-lg bg-fg px-4 text-sheet font-semibold text-canvas"
      onclick={runFromSheet}
    >
      <span>{sheetPill?.cta ?? 'Open'}</span>
      <Icon name="arrow" size={14} stroke={2} />
    </button>
  {/snippet}
</Sheet>

<style>
  .peek {
    position: fixed;
    left: 0;
    top: 0;
    z-index: 40;
    pointer-events: none;
    transform: translate3d(-999px, -999px, 0);
    will-change: transform;
  }

  .peek-card {
    width: 264px;
    padding: 12px 14px 13px;
    border-radius: var(--radius-card);
    background: var(--color-surface-raised);
    box-shadow: var(--shadow-peek);
    opacity: 0;
    transform: scale(0.94) translateY(4px);
    transform-origin: 0 0;
    transition:
      opacity 140ms ease,
      transform 260ms var(--ease-out-strong);
  }
  .peek[data-on] .peek-card {
    opacity: 1;
    transform: none;
  }
  /* A pass is its own card. */
  .peek-card--pass {
    padding: 0;
    background: none;
    box-shadow: none;
    border-radius: var(--radius-md);
  }

  .peek-body--swap > :global(*) {
    animation: swap-in 260ms var(--ease-out-strong) both;
  }
  @keyframes swap-in {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
  }

  /* Phones never hover; the sheet is their preview. */
  @media (max-width: 680px) {
    .peek {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .peek-card {
      transform: none;
    }
    .peek-body--swap > :global(*) {
      animation: none;
    }
  }
</style>

<!--
  @component
  The phone bottom sheet. On phones (≤680px) every overlay on the site is this sheet, so it
  feels the same everywhere:

  - a grabber + header you can drag; release projects the flick's momentum, so a fast flick
    or a drag past half the height dismisses, anything else springs back
  - rubber-band resistance when pulled up past the top
  - spring settle, interruptible (grab it mid-flight)
  - scrim tap, Done and Esc close it; Tab stays inside; focus returns to where it was
  - the page underneath stops scrolling (`data-scroll-lock` on <html>)
  - `prefers-reduced-motion`: no travel, it just appears and disappears

  The sheet is portalled to <body>, so it can live inside any widget. Desktop callers render
  their own popover instead; the sheet does not check the viewport.

  Focus: on open, the first element marked `data-autofocus` inside it gets focus, else the
  sheet itself. Esc: handle it yourself first and call `preventDefault()` to stop the sheet
  closing (the palette uses this to step back through its views).

  @example
  ```svelte
  <script lang="ts">
    import Sheet from '~/components/ui/Sheet.svelte';
    let open = $state(false);
  </script>

  <button type="button" onclick={() => (open = true)}>Grab a coffee</button>
  <Sheet bind:open title="Grab a coffee" onclose={() => console.warn('closed')}>
    <p>Weekday mornings in Sydney.</p>
    {#snippet footer()}
      <button type="button">Email Josh</button>
    {/snippet}
  </Sheet>
  ```
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { tick, untrack } from 'svelte';
  import { prefersReducedMotion } from 'svelte/motion';

  import { lockScroll, rememberFocus, trapTab } from '~/lib/overlay';
  import { project, rubberband, Spring, springLoop } from '~/lib/spring';

  interface Props {
    /** Whether the sheet is showing. Set it to open; the sheet sets it back on dismiss. */
    open?: boolean;
    /** Shown in the header beside Done; also the dialog's accessible name. */
    title?: string;
    /** Accessible name when a custom `header` replaces the title row. */
    label?: string;
    /** Called once when the user dismisses the sheet (drag, scrim, Done, Esc). */
    onclose?: () => void;
    /** Replaces the title row (still a drag zone), e.g. the palette's search field. */
    header?: Snippet;
    /** Sticky actions under the scrolling body. */
    footer?: Snippet;
    /** Full height with a flush body: the content lays itself out (the palette does). */
    fill?: boolean;
    children: Snippet;
  }

  let {
    open = $bindable(false),
    title,
    label,
    onclose,
    header,
    footer,
    fill = false,
    children,
  }: Props = $props();

  const titleId = $props.id();

  /** Closed → nothing rendered; Closing → still on screen, sliding away. */
  let phase = $state<'closed' | 'open' | 'closing'>('closed');
  let win = $state<HTMLElement>();
  let scrim = $state<HTMLElement>();

  const y = new Spring(0, { response: 0.42, damping: 0.9 });
  let height = 1;
  let releaseScroll: (() => void) | undefined;
  let restoreFocus: (() => void) | undefined;

  const apply = (): void => {
    if (!win) return;
    win.style.transform = `translate3d(0, ${y.value.toFixed(2)}px, 0)`;
    if (scrim) scrim.style.opacity = String(Math.min(1, Math.max(0, 1 - y.value / height)));
    if (phase === 'closing' && y.value >= height - 0.5) finish();
  };
  const loop = springLoop([y], apply);

  const measure = (): void => {
    height = Math.max(1, win?.offsetHeight ?? 1);
  };

  function finish(): void {
    loop.stop();
    phase = 'closed';
    releaseScroll?.();
    releaseScroll = undefined;
    restoreFocus?.();
    restoreFocus = undefined;
  }

  /** Slide in (or, if mid-close, turn around from wherever it is). */
  function present(): void {
    const fresh = phase === 'closed';
    phase = 'open';
    if (fresh) {
      restoreFocus = rememberFocus();
      releaseScroll = lockScroll();
    }
  }

  /** Runs once the window exists in the DOM after `present`. */
  function settleIn(fresh: boolean): void {
    if (!win) return;
    measure();
    if (prefersReducedMotion.current) {
      y.set(0);
      apply();
    } else {
      if (fresh) y.set(height);
      y.to(0, { response: 0.42, damping: 0.9 });
      apply();
      loop.kick();
    }
    const target = win.querySelector<HTMLElement>('[data-autofocus]') ?? win;
    target.focus({ preventScroll: true });
  }

  /** Slide away. `velocity` carries a flick through. */
  function dismiss(velocity = 0): void {
    if (phase !== 'open') return;
    phase = 'closing';
    if (open) {
      open = false;
      onclose?.();
    }
    if (document.activeElement instanceof HTMLElement && win?.contains(document.activeElement)) {
      document.activeElement.blur();
    }
    measure();
    if (prefersReducedMotion.current) {
      finish();
      return;
    }
    y.to(height + 12, { velocity, response: 0.34, damping: 1 });
    loop.kick();
  }

  // Follow `open` from the caller.
  $effect(() => {
    const want = open;
    untrack(() => {
      if (want && phase !== 'open') {
        const fresh = phase === 'closed';
        present();
        // Wait for the {#if} to mount the window.
        void tick().then(() => settleIn(fresh));
      } else if (!want && phase === 'open') {
        dismiss();
      }
    });
  });

  // Never leave the page locked if the sheet unmounts mid-flight.
  $effect(() => () => {
    loop.stop();
    releaseScroll?.();
  });

  /* Drag ---------------------------------------------------------------------------------- */
  let dragFrom = -1;
  let startY = 0;
  let lastY = 0;
  let lastT = 0;
  let velocity = 0;

  const onpointerdown = (e: PointerEvent): void => {
    if (phase !== 'open' || e.button > 0) return;
    if (e.target instanceof Element && e.target.closest('input, button, a, textarea')) return;
    loop.stop();
    measure();
    dragFrom = e.clientY;
    startY = y.value;
    lastY = e.clientY;
    lastT = performance.now();
    velocity = 0;
    if (e.currentTarget instanceof Element) e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onpointermove = (e: PointerEvent): void => {
    if (dragFrom < 0) return;
    const d = startY + e.clientY - dragFrom;
    y.set(d < 0 ? rubberband(d, height) : d);
    const now = performance.now();
    const v = ((e.clientY - lastY) / Math.max(1, now - lastT)) * 1000;
    velocity = velocity * 0.6 + v * 0.4;
    lastY = e.clientY;
    lastT = now;
    apply();
  };

  const onpointerup = (): void => {
    if (dragFrom < 0) return;
    dragFrom = -1;
    // Held still before letting go: no flick.
    if (performance.now() - lastT > 90) velocity = 0;
    const landing = y.value + project(velocity);
    if (landing > height * 0.5 || velocity > 1100) {
      dismiss(velocity);
      return;
    }
    if (prefersReducedMotion.current) {
      y.set(0);
      apply();
      return;
    }
    y.to(0, { velocity, response: 0.42, damping: 0.86 });
    loop.kick();
  };

  const drag = { onpointerdown, onpointermove, onpointerup, onpointercancel: onpointerup };

  const onkeydown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && !e.defaultPrevented) {
      e.preventDefault();
      dismiss();
    } else if (e.key === 'Tab' && win && !e.defaultPrevented) {
      trapTab(e, win);
    }
  };

  /** Render at the end of <body> so no ancestor's transform or overflow can clip it. */
  const portal = (node: HTMLElement): (() => void) => {
    document.body.appendChild(node);
    return () => node.remove();
  };
</script>

{#if phase !== 'closed'}
  <div class="fixed inset-0 z-55" {@attach portal} {onkeydown} role="presentation">
    <!-- svelte-ignore a11y_click_events_have_key_events (pointer shortcut; Esc and Done are the keyboard paths) -->
    <div
      bind:this={scrim}
      class="absolute inset-0 bg-scrim opacity-0"
      onclick={() => dismiss()}
      aria-hidden="true"
    ></div>
    <div
      bind:this={win}
      role="dialog"
      aria-modal="true"
      aria-labelledby={header ? undefined : titleId}
      aria-label={header ? label : undefined}
      tabindex="-1"
      style="transform: translate3d(0, 100%, 0)"
      class={[
        'fixed inset-x-0 bottom-0 flex flex-col rounded-t-window border border-b-0 border-line-strong bg-surface-raised shadow-sheet outline-none will-change-transform',
        // The part that rubber-bands past the bottom edge stays the sheet's colour.
        'after:absolute after:-inset-x-px after:top-full after:h-50 after:bg-surface-raised',
        fill
          ? 'h-[calc(100dvh-var(--spacing)*10)]'
          : 'max-h-[calc(100dvh-var(--spacing)*10)] pb-[env(safe-area-inset-bottom)]',
      ]}
    >
      <div class="grid h-4 flex-none cursor-grab touch-none place-items-center" {...drag} aria-hidden="true">
        <i class="block h-1.25 w-9 rounded-pill bg-line-strong"></i>
      </div>
      {#if header}
        <div class="flex-none touch-none" {...drag}>{@render header()}</div>
      {:else}
        <div
          class="flex h-11 flex-none touch-none items-center justify-between gap-3 pr-2 pl-4.5"
          {...drag}
        >
          <h2 id={titleId} class="text-sheet font-semibold tracking-snug text-fg">{title}</h2>
          <button
            type="button"
            class="pressable px-2.5 py-2 text-sheet font-semibold text-fg"
            onclick={() => dismiss()}>Done</button
          >
        </div>
      {/if}
      <div
        class={[
          'min-h-0 flex-1 overscroll-contain',
          fill ? 'flex flex-col' : 'overflow-y-auto px-4.5 pt-1.5 pb-4.5',
        ]}
      >
        {@render children()}
      </div>
      {#if footer}
        <div class="flex-none border-t border-line px-4.5 pt-2.5 pb-[calc(var(--spacing)*3.5+env(safe-area-inset-bottom))]">
          {@render footer()}
        </div>
      {/if}
    </div>
  </div>
{/if}

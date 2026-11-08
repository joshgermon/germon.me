<!--
  @component
  The office widget's island: Josh's office as a live 3D room you can drag around, with a list
  of the objects in it. Picking one glides the camera to it (cuts, from the keyboard) and opens
  its detail — a panel beside the room on desktop, the shared sheet on phones. The lamp switches
  the room between its daylight and evening bakes; by default it follows the sun in Sydney.

  The poster (the default slot, rendered by OfficeCard.astro) is all that paints at first. The
  island hydrates once the card is in view and the rest of the page has loaded and gone idle
  (`client:settled`); then, in another idle task, three.js is imported, the room loads, and the
  canvas crossfades in over the poster. No WebGL2, Save-Data or a weak device keep the poster
  (the list still opens each object's detail). `$officeRequest` (palette "Look at …") drives it
  too; a request made before the room is ready waits for it.
-->
<script lang="ts">
  import { onMount, tick, untrack, type Snippet } from 'svelte';
  import { prefersReducedMotion } from 'svelte/motion';
  import { MediaQuery } from 'svelte/reactivity';

  import Glyph from '~/components/palette/Glyph.svelte';
  import Icon from '~/components/ui/Icon.svelte';
  import Sheet from '~/components/ui/Sheet.svelte';
  import { normaliseFreeArea, wholeView, type FreeArea } from '~/domain/office/framing';
  import type { HotspotId } from '~/domain/office/hotspot';
  import { lightingAt, toggleLighting, type Lighting } from '~/domain/office/lighting';
  import { ZOOM_STEP } from '~/domain/office/zoom';
  import { toast } from '~/lib/actions';
  import { casesHandled } from '~/lib/defects';
  import { $officeRequest as officeRequest, $palette as palette } from '~/lib/ui-state';
  import { hotspot, hotspots, office, type Hotspot, type HotspotPanel as Panel } from '~/site/office';
  import { profile } from '~/site/profile';
  import { detectCapability } from './capability';
  import type { Motion } from './engine/camera';
  import type { OfficeEngine } from './engine/engine';
  import HotspotPanel from './HotspotPanel.svelte';

  interface Props {
    /** The poster: shown until the room's first frame is ready, and kept as the fallback. */
    children?: Snippet;
  }
  const { children }: Props = $props();

  /** How an object was picked: keyboard cuts the camera, pointers glide it. */
  type Source = 'keyboard' | 'pointer' | 'touch';

  type Phase =
    | { readonly _tag: 'Poster' }
    | { readonly _tag: 'Loading' }
    | { readonly _tag: 'Ready' }
    | { readonly _tag: 'Fallback' };

  const phone = new MediaQuery('max-width: 680px');

  let phase = $state<Phase>({ _tag: 'Poster' });
  let available = $state<ReadonlyArray<HotspotId>>([]);
  let hovered = $state<HotspotId | null>(null);
  let active = $state<{ readonly id: HotspotId; readonly panel: Panel; readonly motion: Motion }>();
  let lighting = $state<Lighting>(lightingAt(new Date(), profile.place));
  let status = $state('');
  /** Where the manual zoom sits in its range (0 = the settled view, 1 = as close as it goes). */
  let zoom = $state(0);
  let sheetOpen = $state(false);

  let stage = $state<HTMLElement>();
  let canvas = $state<HTMLCanvasElement>();
  let label = $state<HTMLElement>();
  let list = $state<HTMLElement>();
  let pane = $state<HTMLElement>();
  let closeButton = $state<HTMLButtonElement>();

  let engine: OfficeEngine | undefined;
  /** The lamp was switched by hand: stop following the sun. */
  let manualLighting = false;
  let pending: { readonly target: HotspotId; readonly source: Source } | undefined;

  const ready = $derived(phase._tag === 'Ready');
  const listed = $derived(
    hotspots.filter((h) =>
      !h.listed
        ? false
        : phase._tag === 'Ready'
          ? available.includes(h.id)
          : phase._tag === 'Fallback' && h.kind._tag === 'Focus',
    ),
  );
  const hoverLabel = $derived(hovered && hovered !== active?.id ? hotspot(hovered).label : '');
  const activeHotspot = $derived(active ? hotspot(active.id) : undefined);

  /* Activation ---------------------------------------------------------------------------- */
  const motionFor = (source: Source): Motion => (source === 'keyboard' ? 'cut' : 'glide');

  /** A zoom button: a pointer press eases, Enter/Space cuts. */
  function onZoomClick(e: MouseEvent, direction: 1 | -1): void {
    engine?.zoomBy(direction > 0 ? ZOOM_STEP : 1 / ZOOM_STEP, motionFor(e.detail === 0 ? 'keyboard' : 'pointer'));
  }

  /** The part of the room the panel and list don't cover, as fractions of the stage. */
  function freeArea(): FreeArea {
    if (phone.current || !stage) return wholeView;
    const s = stage.getBoundingClientRect();
    const left = list ? (list.getBoundingClientRect().right - s.left) / s.width : 0;
    const right = pane ? (pane.getBoundingClientRect().left - s.left) / s.width : 1;
    return normaliseFreeArea({ x0: left, x1: right, y0: 0, y1: 1 });
  }

  async function activate(id: HotspotId, source: Source): Promise<void> {
    const h = hotspot(id);
    const motion = motionFor(source);
    switch (h.kind._tag) {
      case 'Lamp':
        manualLighting = true;
        lighting = toggleLighting(lighting);
        engine?.setLighting(lighting, motion);
        status = lighting === 'day' ? office.lamp.day : office.lamp.evening;
        return;
      case 'Shoot': {
        const shot = engine?.shoot();
        if (shot === 'shot') {
          status = office.shot;
          if (prefersReducedMotion.current) toast(office.shot);
        } else if (shot === 'busy') status = office.missed;
        return;
      }
      case 'Focus': {
        if (active && active.id !== id) leave(active.id);
        active = { id, panel: h.kind.panel, motion };
        if (h.kind.simLive) engine?.setSimLive(true);
        if (phone.current) sheetOpen = true;
        await tick();
        engine?.focus(id, motion, freeArea());
        if (source === 'keyboard' && !phone.current) closeButton?.focus({ preventScroll: true });
        return;
      }
      default:
        casesHandled(h.kind);
    }
  }

  function leave(id: HotspotId): void {
    const h = hotspot(id);
    if (h.kind._tag === 'Focus' && h.kind.simLive) engine?.setSimLive(false);
  }

  function close(via: 'keyboard' | 'pointer'): void {
    if (!active) return;
    const { id } = active;
    leave(id);
    active = undefined;
    sheetOpen = false;
    engine?.unfocus(via === 'keyboard' ? 'cut' : 'glide');
    if (via === 'keyboard') {
      list?.querySelector<HTMLElement>(`[data-hotspot="${id}"]`)?.focus({ preventScroll: true });
    }
  }

  function onListClick(e: MouseEvent, h: Hotspot): void {
    // `detail` is 0 for a click synthesised from Enter/Space.
    void activate(h.id, e.detail === 0 ? 'keyboard' : 'pointer');
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.key !== 'Escape' || e.defaultPrevented || !active || phone.current) return;
    if ($palette._tag === 'Open') return;
    e.preventDefault();
    close('keyboard');
  }

  // The palette asked to look at something. A request made before the room is ready (it may be
  // what scrolled the card into view) waits for it.
  let handled = 0;
  $effect(() => {
    const request = $officeRequest;
    if (!request || request.seq === handled) return;
    handled = request.seq;
    const next = { target: request.target, source: request.instant ? 'keyboard' : 'pointer' } as const;
    untrack(() => {
      if (phase._tag === 'Ready' || phase._tag === 'Fallback') void activate(next.target, next.source);
      else pending = next;
    });
  });

  /* Lifecycle ----------------------------------------------------------------------------- */
  function fallBack(): void {
    engine?.dispose();
    engine = undefined;
    phase = { _tag: 'Fallback' };
    const queued = pending;
    pending = undefined;
    if (queued) void activate(queued.target, queued.source);
  }

  function onContextLost(e: Event): void {
    e.preventDefault();
    active = undefined;
    fallBack();
  }

  onMount(() => {
    let cancelled = false;
    canvas?.addEventListener('webglcontextlost', onContextLost);

    const start = async (): Promise<void> => {
      if (cancelled) return;
      // The WebGL2 probe spins up a GPU context (a long task on a cold GPU process), so it runs
      // here, in its own idle task, not in hydration.
      if (detectCapability()._tag === 'Poster') {
        fallBack();
        return;
      }
      phase = { _tag: 'Loading' };
      try {
        const { createOfficeEngine } = await import('./engine/engine');
        if (cancelled || !canvas || !stage || !label) return;
        const created = await createOfficeEngine({
          canvas,
          container: stage,
          label,
          hotspots: hotspots.map((h) => h.id),
          reducedMotion: prefersReducedMotion.current,
          lighting,
          onHover: (id) => (hovered = id),
          onActivate: (id, source) => void activate(id, source),
          onBackgroundClick: () => close('pointer'),
          onZoom: (progress) => (zoom = progress),
        });
        if (cancelled) {
          created.dispose();
          return;
        }
        engine = created;
        available = created.available;
        phase = { _tag: 'Ready' };
        const queued = pending;
        pending = undefined;
        if (queued) void activate(queued.target, queued.source);
      } catch (cause) {
        if (cancelled) return;
        console.warn('[office] 3D room unavailable, keeping the still', cause);
        fallBack();
      }
    };
    // `client:settled` hydrated this only once the page had settled; still yield to anything
    // the visitor started meanwhile before probing WebGL and fetching three.js.
    const idle = window.requestIdleCallback?.(() => void start(), { timeout: 2000 });
    const timer = idle === undefined ? window.setTimeout(() => void start(), 200) : undefined;

    // Follow the sun until the lamp is switched by hand.
    const sun = window.setInterval(() => {
      const now = lightingAt(new Date(), profile.place);
      if (manualLighting || now === lighting) return;
      lighting = now;
      engine?.setLighting(now, 'glide');
    }, 60_000);

    return () => {
      cancelled = true;
      if (idle !== undefined) window.cancelIdleCallback(idle);
      if (timer !== undefined) window.clearTimeout(timer);
      window.clearInterval(sun);
      canvas?.removeEventListener('webglcontextlost', onContextLost);
      engine?.dispose();
      engine = undefined;
    };
  });
</script>

<svelte:window onkeydown={onKeydown} />

<div class="-mx-card -mb-3 flex min-h-0 flex-1 flex-col">
  <div
    bind:this={stage}
    class="relative min-h-0 flex-1 overflow-hidden rounded-b-card phone:aspect-square phone:flex-none"
  >
    <!-- The room's light on the card: a window wash by day, the lamp's warmth in the evening. -->
    <div class="glow glow-day" class:opacity-0={lighting === 'evening'} aria-hidden="true"></div>
    <div class="glow glow-evening" class:opacity-0={lighting !== 'evening'} aria-hidden="true"></div>

    <div
      class={[
        'pointer-events-none absolute inset-0 transition-opacity duration-(--duration-reveal) ease-out-strong select-none',
        ready && 'opacity-0',
      ]}
      aria-hidden={ready}
    >
      {@render children?.()}
    </div>

    {#if phase._tag !== 'Fallback'}
      <canvas
        bind:this={canvas}
        class={[
          'absolute inset-0 size-full opacity-0 outline-none transition-opacity duration-(--duration-reveal) ease-out-strong [-webkit-tap-highlight-color:transparent]',
          ready && 'opacity-100',
        ]}
        aria-hidden="true"
      ></canvas>
    {/if}

    <span
      bind:this={label}
      class={[
        'pointer-events-none absolute top-0 left-0 rounded-chip border border-line-bright bg-glass px-2 py-0.5 text-caption font-medium whitespace-nowrap text-fg opacity-0 shadow-float transition-opacity duration-(--duration-fast) ease-out-strong will-change-transform',
        ready && hoverLabel && 'opacity-100',
      ]}
      aria-hidden="true">{hoverLabel}</span
    >

    {#if phase._tag === 'Ready'}
      <div
        role="group"
        aria-label={office.zoom.label}
        class="absolute right-3 bottom-3 flex animate-fade-in overflow-hidden rounded-chip border border-line-strong bg-glass backdrop-blur-window phone:hidden"
      >
        <button
          type="button"
          class="pressable grid size-7.5 place-items-center text-fg-muted transition-colors duration-(--duration-fast) ease-out-strong hover:bg-hover hover:text-fg disabled:text-fg-faint disabled:hover:bg-transparent"
          aria-label={office.zoom.out}
          disabled={zoom <= 0.001}
          onclick={(e) => onZoomClick(e, -1)}
        >
          <Icon name="minus" size={13} />
        </button>
        <span class="w-px bg-line-strong" aria-hidden="true"></span>
        <button
          type="button"
          class="pressable grid size-7.5 place-items-center text-fg-muted transition-colors duration-(--duration-fast) ease-out-strong hover:bg-hover hover:text-fg disabled:text-fg-faint disabled:hover:bg-transparent"
          aria-label={office.zoom.in}
          disabled={zoom >= 0.999}
          onclick={(e) => onZoomClick(e, 1)}
        >
          <Icon name="plus" size={13} />
        </button>
      </div>
    {/if}

    {#if phase._tag === 'Loading'}
      <p
        class="absolute top-0 right-card animate-fade-in text-label text-fg-subtle"
        aria-hidden="true"
      >
        {office.loading}
      </p>
    {/if}

    {#if listed.length > 0}
      <nav
        bind:this={list}
        aria-label={office.listLabel}
        class={[
          'absolute bottom-3 left-2 animate-fade-in rounded-lg p-0.5 transition-colors duration-(--duration-ui) ease-out-strong phone:hidden',
          // Over a close-up, the list sits on glass so it stays legible.
          active && 'bg-glass inset-ring inset-ring-line backdrop-blur-window',
        ]}
      >
        <ul class="flex flex-col gap-px">
          {#each listed as h (h.id)}
            {@const isActive = active?.id === h.id}
            <li>
              <button
                data-hotspot={h.id}
                type="button"
                class={[
                  'flex h-7.5 w-full items-center gap-2.5 rounded-row pr-2.5 pl-1.5 text-left text-meta transition-colors duration-(--duration-fast) ease-out-strong',
                  isActive || hovered === h.id ? 'bg-active text-fg' : 'text-fg-muted hover:bg-hover hover:text-fg',
                ]}
                aria-label={h.ariaLabel}
                aria-pressed={h.kind._tag === 'Lamp' ? lighting === 'evening' : h.kind._tag === 'Focus' ? isActive : undefined}
                onclick={(e) => onListClick(e, h)}
                onpointerenter={() => engine?.preview(h.id)}
                onpointerleave={() => engine?.preview(null)}
                onfocus={() => engine?.preview(h.id)}
                onblur={() => engine?.preview(null)}
              >
                <Glyph glyph={{ _tag: 'Icon', name: h.icon }} />
                <span class="truncate">{h.label}</span>
                {#if h.kind._tag === 'Lamp'}
                  <span class="ml-auto pl-2 text-label text-fg-subtle">
                    {lighting === 'evening' ? office.lamp.on : office.lamp.off}
                  </span>
                {/if}
              </button>
            </li>
          {/each}
        </ul>
      </nav>
    {/if}

    {#if active && activeHotspot && !phone.current}
      <aside
        bind:this={pane}
        aria-label={active.panel.title}
        class="pane absolute top-0 right-3 max-h-[calc(100%-var(--spacing)*3)] w-76 overflow-y-auto overscroll-contain rounded-window border border-line-strong bg-surface-raised px-5 pt-4.5 pb-5 shadow-window [scrollbar-width:thin] [scrollbar-color:var(--color-line-strong)_transparent]"
        data-anim={active.motion === 'glide' ? '' : undefined}
      >
        <HotspotPanel
          hotspot={activeHotspot}
          panel={active.panel}
          variant="pane"
          onclose={close}
          bind:closeButton
        />
      </aside>
    {/if}
  </div>

  {#if listed.length > 0}
    <nav
      aria-label={office.listLabel}
      class="hidden animate-fade-in phone:block"
    >
      <ul class="flex snap-x gap-1.5 overflow-x-auto overscroll-x-contain px-card pt-1 pb-3 [scrollbar-width:none]">
        {#each listed as h (h.id)}
          <li class="flex-none snap-start">
            <button
              type="button"
              class={[
                'pressable flex h-9 items-center gap-2 rounded-chip border pr-3 pl-2 text-chip font-medium',
                active?.id === h.id || (h.kind._tag === 'Lamp' && lighting === 'evening')
                  ? 'border-line-bright bg-active text-fg'
                  : 'border-line-strong bg-chip text-fg-muted',
              ]}
              aria-label={h.ariaLabel}
              aria-pressed={h.kind._tag === 'Lamp' ? lighting === 'evening' : h.kind._tag === 'Focus' ? active?.id === h.id : undefined}
              onclick={(e) => onListClick(e, h)}
            >
              <Glyph glyph={{ _tag: 'Icon', name: h.icon, ghost: true }} />
              {h.label}
            </button>
          </li>
        {/each}
      </ul>
    </nav>
  {/if}
</div>

{#if phone.current}
  <Sheet bind:open={sheetOpen} title={active?.panel.title ?? ''} onclose={() => close('pointer')}>
    {#if active && activeHotspot}
      <HotspotPanel hotspot={activeHotspot} panel={active.panel} variant="sheet" onclose={close} />
    {/if}
  </Sheet>
{/if}

<p class="sr-only" aria-live="polite">{status}</p>

<style>
  /*
   * The glow: two radial washes behind the room (which is centred in the stage), crossfading
   * with the lamp. Day — pale sky light from the windows above. Evening — the lamp's warmth
   * high in the room and a pool on the floor beneath it.
   */
  .glow {
    position: absolute;
    inset: 0;
    pointer-events: none;
    transition: opacity var(--duration-lighting) var(--ease-out-strong);
    /* Fade in from the top edge, so the stage meets the card header without a seam. */
    mask-image: linear-gradient(to bottom, transparent, black 22%);
  }
  .glow-day {
    background:
      radial-gradient(46% 78% at 50% 30%, var(--color-office-day-sky), transparent 100%),
      radial-gradient(52% 46% at 50% 92%, var(--color-office-day-floor), transparent 100%);
  }
  .glow-evening {
    background:
      radial-gradient(40% 70% at 49% 28%, var(--color-office-evening-lamp), transparent 100%),
      radial-gradient(56% 50% at 50% 94%, var(--color-office-evening-floor), transparent 100%);
  }

  /* Pointer-opened: the panel slides in from the right. Keyboard-opened: it is simply there. */
  .pane[data-anim] {
    animation: pane-in var(--duration-ui) var(--ease-out-strong) both;
  }
  @keyframes pane-in {
    from {
      opacity: 0;
      transform: translateX(8px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .pane[data-anim] {
      animation: none;
    }
  }
</style>

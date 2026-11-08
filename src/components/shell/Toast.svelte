<!--
  @component
  The HUD: a small pill at the bottom of the screen confirming something just happened
  ("Copied to Clipboard"). Driven by `$toast` — call `toast(message)` from `lib/actions.ts`.
  A new message while one is showing replaces it and restarts the timer. Always in the DOM
  as a polite live region, so screen readers hear each message.
-->
<script lang="ts">
  import Icon from '~/components/ui/Icon.svelte';
  import { $toast as toastStore } from '~/lib/ui-state';

  let message = $state('');
  let shown = $state(false);
  let timer = 0;

  $effect(() => {
    const t = $toastStore;
    if (!t) return;
    message = t.message;
    shown = true;
    window.clearTimeout(timer);
    const visibleFor = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--toast-visible'),
    );
    timer = window.setTimeout(() => (shown = false), visibleFor || 1700);
  });

  $effect(() => () => window.clearTimeout(timer));
</script>

<div
  role="status"
  aria-live="polite"
  data-shown={shown ? '' : undefined}
  class={[
    'pointer-events-none fixed bottom-[max(--spacing(6.5),calc(env(safe-area-inset-bottom)+--spacing(2)))] left-1/2 z-70 flex h-9 items-center gap-2 rounded-md border border-line-strong bg-surface-raised pr-3.5 pl-3 text-meta font-medium text-fg shadow-window',
    'phone:bottom-[max(--spacing(15),calc(env(safe-area-inset-bottom)+--spacing(13)))]',
    shown
      ? '-translate-x-1/2 translate-y-0 scale-100 opacity-100 transition-[opacity,translate,scale] duration-(--duration-toast-in) ease-out-strong'
      : '-translate-x-1/2 translate-y-2 scale-97 opacity-0 transition-[opacity,translate,scale] duration-(--duration-toast-out) ease-out',
  ]}
>
  {#if message}
    <Icon name="check" size={13} stroke={2.6} class="text-up" />
    <span>{message}</span>
  {/if}
</div>

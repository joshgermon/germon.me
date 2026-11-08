<!--
  @component
  A decorative line icon from the shared set, for use inside Svelte islands.
  Mirrors Icon.astro exactly; both read icons.ts.
-->
<script lang="ts">
  import { iconPaths, type IconName } from './icons';

  interface Props {
    name: IconName;
    size?: number;
    stroke?: number;
    class?: string;
  }
  const { name, size = 16, stroke = 1.9, class: cls = '' }: Props = $props();
</script>

<svg
  class={cls}
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width={stroke}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  {@html iconPaths[name]}
</svg>

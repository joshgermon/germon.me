<!--
  @component
  A role as a Wallet pass, in Raycast's clothes: flat brand colour, a hairline inner edge,
  small precise type. Colours and logo come from the role's `brand` in `site/career.ts`.

  Variants:
  - `card` (default): the 156px pass — logo, status/years, role, company, type.
  - `stack`: `card` for the Engineering widget's stack (quieter header, no header label).
  - `peek`: `card` at the hover-preview width with a deeper shadow.
  - `full`: the detail pass — adds city, From/Until and the company site.

  Renders without JavaScript, so `.astro` files can use it without a `client:` directive.

  @example
  ```svelte
  <Pass role={career[0]} variant="full" />
  ```
-->
<script lang="ts">
  import { profile } from '~/site/profile';
  import { tenureYears, type Role } from '~/site/career';

  interface Props {
    role: Role;
    variant?: 'card' | 'stack' | 'peek' | 'full';
    class?: string;
  }
  const { role, variant = 'card', class: cls = '' }: Props = $props();

  const brand = $derived(role.brand);
  const current = $derived(role.tenure._tag === 'Current');
  const full = $derived(variant === 'full');
  const city = profile.location.split(',')[0] ?? profile.location;
</script>

<div
  class={[
    'pass flex flex-col rounded-md bg-(--pb) text-left text-(--pf)',
    full
      ? 'max-w-95 gap-4 px-4 pt-3.5 pb-4 shadow-pass-full phone:max-w-none'
      : 'h-39 gap-2.25 px-3 pt-2.25 pb-3 shadow-pass',
    variant === 'peek' && 'w-66 shadow-peek-pass',
    role.id === 'kodo' && 'pass-kodo',
    cls,
  ]}
  style:--pb={brand.bg}
  style:--pf={brand.fg}
  style:--pl={brand.label}
>
  <div class={['flex items-center justify-between', variant === 'stack' ? 'h-5' : 'h-5.5']}>
    {#if brand.logo._tag === 'logo'}
      <img
        class="w-auto max-w-27.5"
        src={brand.logo.src}
        alt={role.company}
        style:height="{brand.logo.height}px"
        loading="lazy"
        decoding="async"
      />
    {:else}
      <span class="flex items-center gap-1.75 text-bar font-semibold tracking-snug">
        <img class="rounded-full" src={brand.logo.src} alt="" width="20" height="20" loading="lazy" />
        {role.company}
      </span>
    {/if}
    <span class="flex flex-col items-end">
      {#if variant !== 'stack'}
        <span class="label">{current ? 'Status' : 'Years'}</span>
      {/if}
      <span class={['value', variant === 'stack' && 'font-medium opacity-85']}>
        {#if current}
          <i class="dot size-1.5 rounded-full bg-current"></i>Current
        {:else}
          {tenureYears(role.tenure)}
        {/if}
      </span>
    </span>
  </div>

  <div class="flex flex-col">
    <span class="label">Role</span>
    <span
      class={[
        'font-semibold tracking-tight',
        full ? 'text-pass-title-lg' : 'text-pass-title',
      ]}>{role.title}</span
    >
  </div>

  <div class={['grid gap-2.5', full ? 'grid-cols-[1fr_1fr_auto]' : 'grid-cols-2']}>
    <span class="min-w-0">
      <span class="label">Company</span>
      <span class="value block truncate"
        >{role.company}{#if role.formerly}<em class="font-normal not-italic opacity-70"
            >{` · ex-${role.formerly}`}</em
          >{/if}</span
      >
    </span>
    <span class="min-w-0">
      <span class="label">Type</span>
      <span class="value block truncate">{role.kind}</span>
    </span>
    {#if full}
      <span class="min-w-0">
        <span class="label">City</span>
        <span class="value block truncate">{city}</span>
      </span>
    {/if}
  </div>

  {#if full}
    <div class="foot flex items-end gap-5.5 pt-3">
      <span>
        <span class="label">From</span>
        <span class="value">{role.tenure.start}</span>
      </span>
      <span>
        <span class="label">Until</span>
        <span class="value">{role.tenure._tag === 'Current' ? 'Now' : role.tenure.end}</span>
      </span>
      <span class="ml-auto text-caption font-medium opacity-70">{brand.site}</span>
    </div>
  {/if}
</div>

<style>
  .label {
    display: block;
    color: var(--pl);
    font-size: var(--text-micro);
    font-weight: 500;
    line-height: var(--text-micro--line-height);
  }
  .value {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: var(--text-meta);
    font-weight: 600;
    line-height: var(--text-meta--line-height);
  }
  .value.block {
    display: block;
  }
  .foot {
    border-top: 1px solid color-mix(in srgb, var(--pf) 14%, transparent);
  }

  /* Kodo pink is a paper colour; on black it shouts. Same hue, a little quieter. */
  .pass-kodo {
    background:
      linear-gradient(180deg, rgb(255 255 255 / 0.07), transparent 38%, rgb(40 10 40 / 0.14)),
      color-mix(in oklch, var(--pb) 87%, #4a2a43);
    box-shadow:
      inset 0 0 0 1px rgb(255 255 255 / 0.16),
      inset 0 -18px 32px -18px rgb(40 10 40 / 0.28),
      0 -8px 20px -6px rgb(0 0 0 / 0.55);
  }
  .pass-kodo .dot {
    background: var(--pf);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--pf) 18%, transparent);
  }
</style>

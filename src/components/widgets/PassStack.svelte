<!--
  @component
  The Engineering widget's body: a Wallet-style stack of career passes beside the front role's
  summary and a row of company chips. `$frontRole` decides the front pass, so hero pills and
  the palette can shuffle it too. Clicking a pass behind brings it forward; clicking the front
  pass opens it in the palette.
-->
<script lang="ts">
  import Pass from '~/components/career/Pass.svelte';
  import { perform } from '~/lib/actions';
  import { $frontRole as frontRole } from '~/lib/ui-state';
  import { career, tenureYears, type Role } from '~/site/career';

  const n = career.length;
  const front = $derived(Math.max(0, career.findIndex((r) => r.id === $frontRole)));
  const current = $derived(career[front]);
  const depth = (i: number): number => (i - front + n) % n;

  const tabs: HTMLButtonElement[] = $state([]);

  function choose(role: Role): void {
    if (role.id === $frontRole) {
      perform({ _tag: 'OpenPalette', view: { _tag: 'Career', roleId: role.id } });
    } else {
      frontRole.set(role.id);
    }
  }

  /** Arrow keys move between the company chips (roving focus), like any tab list. */
  function onTabKey(e: KeyboardEvent, i: number): void {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    const to = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : step ? (i + step + n) % n : -1;
    const role = career[to];
    if (to < 0 || !role) return;
    e.preventDefault();
    frontRole.set(role.id);
    tabs[to]?.focus();
  }

  const short = (company: string): string => company.replace(/ Design$/, '');
</script>

<div
  class="relative z-1 grid min-h-0 flex-1 grid-cols-[minmax(0,236px)_minmax(0,1fr)] gap-5 phone:grid-cols-1 phone:gap-4"
>
  <ol class="stack relative phone:h-49">
    {#each career as role, i (role.id)}
      <li class="slot" style:--depth={depth(i)} data-front={depth(i) === 0 ? '' : undefined}>
        <button
          type="button"
          class="hit block w-full rounded-md"
          tabindex={depth(i) === 0 ? 0 : -1}
          onclick={() => choose(role)}
        >
          <!-- The pass's own text is the accessible name, so it matches what's on screen. -->
          <span class="sr-only">{depth(i) === 0 ? 'Open pass:' : 'Show pass:'}</span>
          <Pass {role} variant="stack" />
        </button>
      </li>
    {/each}
  </ol>

  <div class="flex min-w-0 flex-col">
    {#if current}
      {#key current.id}
        <div class="caption" id="engineering-role" role="tabpanel" aria-label={current.company}>
          <p class="flex items-baseline gap-2">
            <b class="text-heading font-semibold tracking-snug">{current.title}</b>
            <span class="ml-auto font-mono text-micro leading-none whitespace-nowrap text-fg-subtle"
              >{tenureYears(current.tenure)}</span
            >
          </p>
          <p class="mt-0.75 text-caption text-fg-subtle">
            {current.company}{current.formerly ? ` · formerly ${current.formerly}` : ''} · {current.kind}
          </p>
          <p class="mt-2.5 text-body leading-normal text-pretty text-fg-muted">{current.summary}</p>
        </div>
      {/key}
    {/if}
    <div class="mt-auto flex flex-wrap gap-1.25 pt-3 phone:mt-3.5 phone:pt-0" role="tablist" aria-label="Roles">
      {#each career as role, i (role.id)}
        <button
          bind:this={tabs[i]}
          type="button"
          role="tab"
          aria-selected={i === front}
          aria-controls="engineering-role"
          tabindex={i === front ? 0 : -1}
          class="inline-flex h-6 items-center gap-1.5 rounded-sm px-2 text-caption font-medium text-fg-subtle inset-ring inset-ring-line transition-colors duration-(--duration-fast) ease-out-strong hover:bg-hover hover:text-fg aria-selected:bg-active aria-selected:text-fg aria-selected:inset-ring-line-strong"
          onclick={() => frontRole.set(role.id)}
          onkeydown={(e) => onTabKey(e, i)}
        >
          <i class="size-1.75 rounded-full inset-ring inset-ring-line-bright" style:background={role.brand.bg}
          ></i>{short(role.company)}
        </button>
      {/each}
    </div>
  </div>
</div>

<style>
  /* The stack: each pass sits `--depth` places back, nudged up and shrunk, a little darker. */
  .stack {
    --peek: 13px;
    --shrink: 0.045;
    --dim: 0.13;
  }
  .slot {
    position: absolute;
    inset: auto 0 0;
    z-index: calc(10 - var(--depth));
    transform: translateY(calc(var(--depth) * var(--peek) * -1)) scale(calc(1 - var(--depth) * var(--shrink)));
    transform-origin: 50% 0;
    transition: transform var(--duration-stack) var(--ease-out-strong);
  }
  /* Darken passes behind with a black veil (opacity animates; a brightness filter would not be cheap). */
  .slot::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: var(--radius-md);
    background: var(--color-black);
    opacity: calc(var(--depth) * var(--dim));
    pointer-events: none;
    transition: opacity var(--duration-ui) var(--ease-out-strong);
  }
  /* Only the front pass shows its fields; the rest are colour edges. */
  .slot:not([data-front]) :global(.pass > *) {
    visibility: hidden;
  }
  .hit :global(.pass) {
    transition: transform var(--duration-ui) var(--ease-out-strong);
  }
  @media (hover: hover) and (pointer: fine) {
    .slot[data-front] .hit:hover :global(.pass) {
      transform: translateY(-2px);
    }
    .slot:not([data-front]):hover {
      transform: translateY(calc(var(--depth) * var(--peek) * -1 - 5px))
        scale(calc(1 - var(--depth) * var(--shrink)));
    }
  }
  .slot:not([data-front]) .hit:active {
    transform: scale(0.99);
  }

  .caption {
    animation: caption-in var(--duration-caption) var(--ease-out-strong) both;
  }
  @keyframes caption-in {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
  }
</style>

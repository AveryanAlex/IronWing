<script lang="ts">
import type { Snippet } from "svelte";

type Tab = {
  key: string;
  label: string;
  badge?: string;
  testId?: string;
  badgeTestId?: string;
  icon?: Snippet;
};

type Props = {
  tabs: ReadonlyArray<Tab>;
  active: string;
  onSelect: (key: string) => void;
  ariaLabel: string;
  testId?: string;
};

let { tabs, active, onSelect, ariaLabel, testId }: Props = $props();
</script>

<div class="ui-tabs" aria-label={ariaLabel} data-testid={testId} role="group">
  {#each tabs as tab (tab.key)}
    <button
      aria-label={tab.label}
      aria-pressed={tab.key === active}
      class="ui-tabs__tab"
      data-active={tab.key === active || undefined}
      data-testid={tab.testId}
      onclick={() => onSelect(tab.key)}
      type="button"
    >
      {#if tab.icon}
        <span class="ui-tabs__icon" aria-hidden="true">{@render tab.icon()}</span>
      {/if}
      <span class="ui-tabs__label">{tab.label}</span>
      {#if tab.badge}<span class="ui-tabs__badge" data-testid={tab.badgeTestId}>{tab.badge}</span>{/if}
    </button>
  {/each}
</div>

<style>
.ui-tabs { display: flex; gap: 4px; min-width: 0; flex-wrap: nowrap; }
.ui-tabs__tab { display: inline-flex; align-items: center; justify-content: center; gap: 6px; border: 1px solid transparent; border-radius: var(--radius-sm); background: transparent; color: var(--color-text-secondary); font-weight: 600; padding: 0.4rem 0.7rem; cursor: pointer; white-space: nowrap; min-width: 0; }
.ui-tabs__tab:hover { color: var(--color-text-primary); border-color: var(--color-border); }
.ui-tabs__tab[data-active] { color: var(--color-text-primary); border-color: var(--color-border-light); background: var(--color-bg-primary); }
.ui-tabs__icon { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; flex-shrink: 0; }
.ui-tabs__label { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.ui-tabs__badge { border-radius: 999px; background: var(--color-bg-tertiary); color: var(--color-text-secondary); font-size: 0.7rem; font-weight: 700; padding: 0.16rem 0.36rem; flex-shrink: 0; }

/* Phone tier: icon-only, tabs stretch evenly. */
@media (max-width: 767px) {
  .ui-tabs { overflow-x: auto; scrollbar-width: thin; }
  .ui-tabs__tab { flex: 1 1 auto; min-width: 36px; padding: 0.45rem 0.4rem; }
  .ui-tabs__label { display: none; }
}

/* Medium screens: icon + label, tabs stretch evenly. */
@media (min-width: 768px) and (max-width: 1279px) {
  .ui-tabs { overflow-x: auto; scrollbar-width: thin; }
  .ui-tabs__tab { flex: 1 1 auto; min-width: 0; }
}

/* Large screens: icon + label, hug content, no stretch. */
@media (min-width: 1280px) {
  .ui-tabs { overflow-x: visible; }
  .ui-tabs__tab { flex: 0 0 auto; }
}
</style>

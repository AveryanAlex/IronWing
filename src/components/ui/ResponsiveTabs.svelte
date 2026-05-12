<script lang="ts">
type Tab = { key: string; label: string; badge?: string };

type Props = {
  tabs: ReadonlyArray<Tab>;
  active: string;
  onSelect: (key: string) => void;
  ariaLabel: string;
  testId?: string;
};

let { tabs, active, onSelect, ariaLabel, testId }: Props = $props();
</script>

<div class="ui-tabs" role="tablist" aria-label={ariaLabel} data-testid={testId}>
  {#each tabs as tab (tab.key)}
    <button
      class="ui-tabs__tab"
      data-active={tab.key === active || undefined}
      role="tab"
      aria-selected={tab.key === active}
      tabindex={tab.key === active ? 0 : -1}
      onclick={() => onSelect(tab.key)}
      type="button"
    >
      <span class="ui-tabs__label">{tab.label}</span>
      {#if tab.badge}<span class="ui-tabs__badge">{tab.badge}</span>{/if}
    </button>
  {/each}
</div>

<style>
.ui-tabs { display: flex; gap: 4px; overflow-x: auto; min-width: 0; scrollbar-width: thin; }
.ui-tabs__tab { display: inline-flex; align-items: center; gap: 6px; border: 1px solid transparent; border-radius: var(--radius-sm); background: transparent; color: var(--color-text-secondary); font-weight: 600; padding: 0.4rem 0.7rem; cursor: pointer; white-space: nowrap; }
.ui-tabs__tab:hover { color: var(--color-text-primary); border-color: var(--color-border); }
.ui-tabs__tab[data-active] { color: var(--color-text-primary); border-color: var(--color-border-light); background: var(--color-bg-primary); }
.ui-tabs__badge { border-radius: 999px; background: var(--color-bg-tertiary); color: var(--color-text-secondary); font-size: 0.7rem; font-weight: 700; padding: 0.16rem 0.36rem; }
</style>

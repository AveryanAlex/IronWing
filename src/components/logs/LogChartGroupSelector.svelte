<script lang="ts">
import type { LogChartGroup } from "./log-chart-config";

type Props = {
  groups: LogChartGroup[];
  activeGroupKey: string | null;
  onSelectGroup: (groupKey: string) => void;
};

let { groups, activeGroupKey, onSelectGroup }: Props = $props();
</script>

<div class="logs-chart-groups" data-testid="logs-chart-groups">
  {#each groups as group (group.key)}
    <button
      class={`logs-chart-group ${activeGroupKey === group.key ? "is-selected" : ""}`}
      data-testid={`logs-chart-group-${group.key}`}
      disabled={!group.supported}
      onclick={() => onSelectGroup(group.key)}
      type="button"
    >
      <span>{group.title}</span>
      <small>{group.supported ? `${group.selectors.length} series` : "unsupported"}</small>
    </button>
  {/each}
</div>

<style>
  .logs-chart-groups {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }

  .logs-chart-group {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    min-width: 140px;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-bg-primary);
    color: var(--color-text-primary);
    padding: 10px 12px;
    text-align: left;
  }

  .logs-chart-group:disabled {
    opacity: 0.45;
  }

  .logs-chart-group.is-selected {
    border-color: var(--color-accent);
    background: color-mix(in srgb, var(--color-accent) 8%, var(--color-bg-primary));
  }

  .logs-chart-group small {
    color: var(--color-text-muted);
    font-family: "JetBrains Mono", monospace;
    font-size: 0.73rem;
  }
</style>

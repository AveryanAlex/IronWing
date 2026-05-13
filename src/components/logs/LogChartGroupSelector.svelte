<script lang="ts">
import type { LogChartGroup } from "./log-chart-config";

type Props = {
  groups: LogChartGroup[];
  activeGroupKey: string | null;
  onSelectGroup: (groupKey: string) => void;
};

let { groups, activeGroupKey, onSelectGroup }: Props = $props();

const selectedGroupClass = "border-accent/40 bg-accent/10";
</script>

<div class="flex flex-wrap gap-3" data-testid="logs-chart-groups">
  {#each groups as group (group.key)}
    <button
      class={`flex min-w-36 flex-col items-start gap-1 rounded-lg border border-border bg-bg-primary px-3 py-3 text-left text-text-primary disabled:opacity-45 ${activeGroupKey === group.key ? selectedGroupClass : ""}`}
      data-testid={`logs-chart-group-${group.key}`}
      disabled={!group.supported}
      onclick={() => onSelectGroup(group.key)}
      type="button"
    >
      <span>{group.title}</span>
      <small class="font-mono text-xs text-text-muted">{group.supported ? `${group.selectors.length} series` : "unsupported"}</small>
    </button>
  {/each}
</div>

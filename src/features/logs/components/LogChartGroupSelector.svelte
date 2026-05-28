<script lang="ts">
import type { LogChartGroup } from "../log-chart-config";
import { SelectableCard } from "../../../components/ui";

type Props = {
  groups: LogChartGroup[];
  activeGroupKey: string | null;
  onSelectGroup: (groupKey: string) => void;
};

let { groups, activeGroupKey, onSelectGroup }: Props = $props();
</script>

<div class="flex flex-wrap gap-3" data-testid="logs-chart-groups">
  {#each groups as group (group.key)}
    <SelectableCard
      class="flex min-w-36 flex-col items-start gap-1"
      density="compact"
      disabled={!group.supported}
      selected={activeGroupKey === group.key}
      testId={`logs-chart-group-${group.key}`}
      onSelect={() => onSelectGroup(group.key)}
    >
      <span>{group.title}</span>
      <small class="font-mono text-xs text-text-muted">{group.supported ? `${group.selectors.length} series` : "unsupported"}</small>
    </SelectableCard>
  {/each}
</div>

<script lang="ts">
import type { LogChartGroup } from "./log-chart-config";

type Props = {
  groups: LogChartGroup[];
  activeGroupKey: string | null;
  onSelectGroup: (groupKey: string) => void;
};

let { groups, activeGroupKey, onSelectGroup }: Props = $props();

const selectedGroupClass = "border-[var(--color-accent)] [background:color-mix(in_srgb,var(--color-accent)_8%,var(--color-bg-primary))]";
</script>

<div class="flex flex-wrap gap-3" data-testid="logs-chart-groups">
  {#each groups as group (group.key)}
    <button
      class={`flex min-w-[140px] flex-col items-start gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2.5 text-left text-[var(--color-text-primary)] disabled:opacity-45 ${activeGroupKey === group.key ? selectedGroupClass : ""}`}
      data-testid={`logs-chart-group-${group.key}`}
      disabled={!group.supported}
      onclick={() => onSelectGroup(group.key)}
      type="button"
    >
      <span>{group.title}</span>
      <small class="font-mono text-[0.73rem] text-[var(--color-text-muted)]">{group.supported ? `${group.selectors.length} series` : "unsupported"}</small>
    </button>
  {/each}
</div>

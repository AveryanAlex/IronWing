<script lang="ts">
import { getCommandCatalog } from "../../lib/mission-command-metadata";
import { missionWorkspaceTestIds } from "./mission-workspace-test-ids";

type Props = {
  value: string;
  disabled?: boolean;
  onSelect: (category: "Nav" | "Do" | "Condition", variant: string) => void;
};

const commandCatalog = getCommandCatalog();
const categories = ["Nav", "Do", "Condition"] as const;

let { value, disabled = false, onSelect }: Props = $props();

function entriesFor(category: (typeof categories)[number]) {
  return commandCatalog.filter((entry) => entry.category === category);
}

function handleChange(event: Event) {
  const nextValue = (event.currentTarget as HTMLSelectElement).value;
  const [category, variant] = nextValue.split(":");
  if (!category || !variant) {
    return;
  }

  onSelect(category as "Nav" | "Do" | "Condition", variant);
}
</script>

<select
  class="w-full rounded-md border border-border bg-bg-input px-2 py-1.5 text-sm text-text-primary"
  data-testid={missionWorkspaceTestIds.inspectorCommandSelect}
  disabled={disabled}
  id="mission-command-select"
  onchange={handleChange}
  value={value}
>
  {#each categories as category (category)}
    <optgroup label={category}>
      {#each entriesFor(category) as entry (entry.id)}
        <option value={`${entry.category}:${entry.variant}`}>{entry.label}</option>
      {/each}
    </optgroup>
  {/each}
</select>

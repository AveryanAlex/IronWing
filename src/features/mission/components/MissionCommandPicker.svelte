<script lang="ts">
import { NativeSelect } from "../../../components/ui";
import { getCommandCatalog, type CatalogEntry } from "../../../lib/mission-command-metadata";
import { missionWorkspaceTestIds } from "../mission-workspace-test-ids";

type Props = {
  value: string;
  disabled?: boolean;
  onSelect: (category: CatalogEntry["category"], variant: CatalogEntry["variant"]) => void;
};

const commandCatalog = getCommandCatalog();
const categories = ["Nav", "Do", "Condition"] as const;

let { value, disabled = false, onSelect }: Props = $props();

function entriesFor(category: (typeof categories)[number]) {
  return commandCatalog.filter((entry) => entry.category === category);
}

function handleChange(event: Event) {
  const nextValue = (event.currentTarget as HTMLSelectElement).value;
  const entry = commandCatalog.find((entry) => `${entry.category}:${entry.variant}` === nextValue);
  if (entry) onSelect(entry.category, entry.variant);
}
</script>

<NativeSelect
  disabled={disabled}
  id="mission-command-select"
  onchange={handleChange}
  testId={missionWorkspaceTestIds.inspectorCommandSelect}
  value={value}
>
  {#each categories as category (category)}
    <optgroup label={category}>
      {#each entriesFor(category) as entry (entry.id)}
        <option value={`${entry.category}:${entry.variant}`}>{entry.label}</option>
      {/each}
    </optgroup>
  {/each}
</NativeSelect>

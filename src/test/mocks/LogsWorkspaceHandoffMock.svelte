<script lang="ts">
import type { LogsWorkspaceMapHandoff } from "../../components/logs/logs-workspace-types";

type Props = {
  onMapHandoff?: (handoff: LogsWorkspaceMapHandoff) => void;
};

let {
  onMapHandoff = () => {},
}: Props = $props();
</script>

<section data-testid="mock-logs-workspace">
  <button
    data-testid="mock-logs-path-handoff"
    onclick={() => onMapHandoff({ kind: "path", entryId: "entry-1", startUsec: 100, endUsec: 200 })}
    type="button"
  >
    handoff
  </button>
</section>

<script lang="ts">
import type { LogsWorkspaceMapHandoff } from "../../features/logs/logs-workspace-types";
import { Button } from "../../components/ui";

type Props = {
  onMapHandoff?: (handoff: LogsWorkspaceMapHandoff) => void;
};

let {
  onMapHandoff = () => {},
}: Props = $props();
</script>

<section data-testid="mock-logs-workspace">
  <Button
    testId="mock-logs-path-handoff"
    onclick={() => onMapHandoff({ kind: "path", entryId: "entry-1", startUsec: 100, endUsec: 200 })}
  >
    handoff
  </Button>
</section>

<script lang="ts">
import { getLogsWorkspaceRouteContext } from "../../app/shell/runtime-context";
import { Button } from "../../components/ui";

const route = getLogsWorkspaceRouteContext();
</script>

<section data-testid="mock-logs-workspace">
  <Button
    testId="mock-logs-path-handoff"
    onclick={() => route.handleLogsMapHandoff({ kind: "path", entryId: "entry-1", startUsec: 100, endUsec: 200 })}
  >
    handoff
  </Button>
</section>

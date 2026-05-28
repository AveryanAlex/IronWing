<script lang="ts">
import { fromStore } from "svelte/store";

import { getMissionWorkspaceRouteContext } from "../../app/shell/runtime-context";

const route = getMissionWorkspaceRouteContext();
const replayMapOverlayStore = fromStore(route.replayMapOverlay);

let replayMapOverlay = $derived(replayMapOverlayStore.current);
</script>

<section data-testid="mock-mission-workspace">
  <span data-testid="mock-mission-overlay-phase">{replayMapOverlay?.phase ?? "none"}</span>
  <span data-testid="mock-mission-overlay-path-count">{replayMapOverlay?.path.length ?? 0}</span>
</section>

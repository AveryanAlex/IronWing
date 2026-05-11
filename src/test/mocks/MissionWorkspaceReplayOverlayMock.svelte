<script lang="ts">
import type { ReplayMapOverlayState } from "../../lib/replay-map-overlay";

type Props = {
  replayMapOverlay?: ReplayMapOverlayState | null;
};

let {
  replayMapOverlay = null,
}: Props = $props();
</script>

<section data-testid="mock-mission-workspace">
  <span data-testid="mock-mission-overlay-phase">{replayMapOverlay?.phase ?? "none"}</span>
  <span data-testid="mock-mission-overlay-path-count">{replayMapOverlay?.path.length ?? 0}</span>
</section>

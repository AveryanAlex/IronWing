<script lang="ts">
import type { MissionMapView } from "../../lib/mission-map-view";
import { missionWorkspaceTestIds } from "./mission-workspace-test-ids";

type Props = {
  mode: MissionMapView["mode"];
  state: MissionMapView["state"];
};

let { mode, state }: Props = $props();
</script>

{#if state === "empty"}
  <div
    class="pointer-events-none absolute inset-x-6 bottom-6 rounded-lg border border-border/80 bg-bg-primary/88 px-4 py-3 text-sm text-text-secondary"
    data-testid={missionWorkspaceTestIds.mapEmpty}
  >
    {mode === "fence"
      ? "Blank fence surface ready. Place an inclusion or exclusion shape, then refine vertices, circle radius, and the return point directly on the planner map."
      : mode === "rally"
        ? "Blank rally surface ready. Add a rally point from the list, then drag it on the map or refine its coordinates and altitude frame from the inspector."
        : "Blank planner surface ready. Draw a grid, corridor, or structure survey here, or add Home and manual mission items to project existing geometry."}
  </div>
{:else if state === "degraded"}
  <div
    class="pointer-events-none absolute inset-x-6 bottom-6 rounded-lg border border-warning/40 bg-bg-primary/88 px-4 py-3 text-sm text-warning"
    data-testid={missionWorkspaceTestIds.mapUnavailable}
  >
    {mode === "fence"
      ? "Some fence geometry degraded, but the planner surface stayed interactive so you can recover selection, fix malformed regions, or keep editing the return point safely."
      : mode === "rally"
        ? "Some rally geometry degraded, but the planner surface stayed interactive so you can keep the last valid rally markers, recover selection, and avoid moving the wrong point."
        : "Some survey geometry degraded, but the planner surface stayed interactive so you can finish drawing, recover selection, or edit the region safely."}
  </div>
{/if}

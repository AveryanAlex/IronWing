<script lang="ts">
import type { TypedDraftItem } from "../../lib/mission-draft-typed";
import { geoPoint3dAltitude, geoPoint3dLatLon, type GeoPoint3d } from "../../lib/mavkit-types";
import type { MissionPlannerRallySelection } from "../../lib/stores/mission-planner";
import { missionWorkspaceTestIds } from "./mission-workspace-test-ids";

type Props = {
  items: TypedDraftItem[];
  rallySelection: MissionPlannerRallySelection;
  readOnly: boolean;
  onAddPoint: () => void;
  onSelectPoint: (uiId: number) => void;
  onMovePointUp: (uiId: number) => void;
  onMovePointDown: (uiId: number) => void;
  onDeletePoint: (uiId: number) => void;
};

let {
  items,
  rallySelection,
  readOnly,
  onAddPoint,
  onSelectPoint,
  onMovePointUp,
  onMovePointDown,
  onDeletePoint,
}: Props = $props();

function altitudeFrameLabel(point: GeoPoint3d): string {
  const altitude = geoPoint3dAltitude(point);
  switch (altitude.frame) {
    case "msl":
      return "MSL";
    case "terrain":
      return "Terrain";
    case "rel_home":
    default:
      return "Rel Home";
  }
}

function pointSummary(item: TypedDraftItem): string {
  const point = item.document as GeoPoint3d;
  const coords = geoPoint3dLatLon(point);
  const altitude = geoPoint3dAltitude(point);
  return `${coords.latitude_deg.toFixed(5)}, ${coords.longitude_deg.toFixed(5)} · ${altitude.value.toFixed(1)} m · ${altitudeFrameLabel(point)}`;
}
</script>

<section class="rounded-lg border border-border bg-bg-primary p-3" data-testid={missionWorkspaceTestIds.rallyList}>
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Rally list</p>
      <h3 class="mt-1 text-sm font-semibold text-text-primary">Rally points</h3>
    </div>

    <button
      class="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-bg-primary transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
      data-testid={missionWorkspaceTestIds.rallyAdd}
      disabled={readOnly}
      onclick={onAddPoint}
      type="button"
    >
      Add rally point
    </button>
  </div>

  {#if items.length === 0}
    <div
      class="mt-4 rounded-lg border border-dashed border-border bg-bg-secondary/60 px-4 py-6 text-sm text-text-secondary"
      data-testid={missionWorkspaceTestIds.rallyListEmpty}
    >
      No rally points yet. Add one here or place it from the rally map surface without leaving the Mission workspace.
    </div>
  {:else}
    <div class="mt-4 space-y-3">
      {#each items as item (`rally-${item.uiId}`)}
        <div
          class={`rounded-lg border p-3 transition ${rallySelection.kind === "point" && rallySelection.pointUiId === item.uiId
            ? "border-accent/40 bg-accent/10 text-text-primary"
            : "border-border bg-bg-primary text-text-primary hover:border-accent/40"}`}
          data-selected={rallySelection.kind === "point" && rallySelection.pointUiId === item.uiId ? "true" : "false"}
          data-testid={`${missionWorkspaceTestIds.rallyPointPrefix}-${item.uiId}`}
          onclick={() => onSelectPoint(item.uiId)}
          onkeydown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelectPoint(item.uiId);
            }
          }}
          role="button"
          tabindex="0"
        >
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Rally point {item.index + 1}</p>
              <h4 class="mt-1 text-sm font-semibold text-text-primary">Emergency / diversion target</h4>
              <p class="mt-1 text-xs text-text-secondary">{pointSummary(item)}</p>
            </div>

            <span class="rounded-full border border-border bg-bg-secondary px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">
              {(item.document as GeoPoint3d) && altitudeFrameLabel(item.document as GeoPoint3d)}
            </span>
          </div>

          <div class="mt-3 flex flex-wrap gap-2">
            <button
              class="rounded-md border border-border bg-bg-secondary px-3 py-1.5 text-xs font-semibold text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
              data-testid={`${missionWorkspaceTestIds.rallyPointMoveUpPrefix}-${item.uiId}`}
              disabled={readOnly || item.index === 0}
              onclick={(event) => {
                event.stopPropagation();
                onMovePointUp(item.uiId);
              }}
              type="button"
            >
              Move up
            </button>
            <button
              class="rounded-md border border-border bg-bg-secondary px-3 py-1.5 text-xs font-semibold text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
              data-testid={`${missionWorkspaceTestIds.rallyPointMoveDownPrefix}-${item.uiId}`}
              disabled={readOnly || item.index === items.length - 1}
              onclick={(event) => {
                event.stopPropagation();
                onMovePointDown(item.uiId);
              }}
              type="button"
            >
              Move down
            </button>
            <button
              class="rounded-md border border-danger/40 bg-danger/10 px-3 py-1.5 text-xs font-semibold text-danger transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
              data-testid={`${missionWorkspaceTestIds.rallyPointDeletePrefix}-${item.uiId}`}
              disabled={readOnly}
              onclick={(event) => {
                event.stopPropagation();
                onDeletePoint(item.uiId);
              }}
              type="button"
            >
              Delete
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</section>

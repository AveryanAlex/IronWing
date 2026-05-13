<script lang="ts">
import type { TypedDraftItem, FenceRegionType } from "../../lib/mission-draft-typed";
import type { GeoPoint2d, FenceRegion } from "../../lib/mavkit-types";
import type { MissionPlannerFenceSelection } from "../../lib/stores/mission-planner";
import { missionWorkspaceTestIds } from "./mission-workspace-test-ids";

type Props = {
  items: TypedDraftItem[];
  fenceSelection: MissionPlannerFenceSelection;
  returnPoint: GeoPoint2d | null;
  readOnly: boolean;
  onSelectRegion: (uiId: number) => void;
  onDeleteRegion: (uiId: number) => void;
  onAddRegion: (type: FenceRegionType) => void;
  onSelectReturnPoint: () => void;
  onClearReturnPoint: () => void;
};

let {
  items,
  fenceSelection,
  returnPoint,
  readOnly,
  onSelectRegion,
  onDeleteRegion,
  onAddRegion,
  onSelectReturnPoint,
  onClearReturnPoint,
}: Props = $props();

function regionKind(region: FenceRegion): FenceRegionType {
  if ("inclusion_polygon" in region) {
    return "inclusion_polygon";
  }

  if ("exclusion_polygon" in region) {
    return "exclusion_polygon";
  }

  if ("inclusion_circle" in region) {
    return "inclusion_circle";
  }

  return "exclusion_circle";
}

function regionLabel(region: FenceRegion): string {
  const kind = regionKind(region);
  switch (kind) {
    case "inclusion_polygon":
      return "Inclusion polygon";
    case "exclusion_polygon":
      return "Exclusion polygon";
    case "inclusion_circle":
      return "Inclusion circle";
    case "exclusion_circle":
    default:
      return "Exclusion circle";
  }
}

function regionBadge(region: FenceRegion): string {
  return regionKind(region).startsWith("inclusion") ? "Incl" : "Excl";
}

function regionSummary(region: FenceRegion): string {
  if ("inclusion_polygon" in region) {
    return `${region.inclusion_polygon.vertices.length} vertices · group ${region.inclusion_polygon.inclusion_group}`;
  }

  if ("exclusion_polygon" in region) {
    return `${region.exclusion_polygon.vertices.length} vertices`;
  }

  if ("inclusion_circle" in region) {
    return `${region.inclusion_circle.radius_m.toFixed(1)} m radius · group ${region.inclusion_circle.inclusion_group}`;
  }

  return `${region.exclusion_circle.radius_m.toFixed(1)} m radius`;
}

function returnPointSummary(point: GeoPoint2d | null): string {
  return point
    ? `${point.latitude_deg.toFixed(5)}, ${point.longitude_deg.toFixed(5)}`
    : "No explicit return point yet. Place one on the map or from the inspector when fence recovery needs a dedicated landing context.";
}
</script>

<section class="rounded-lg border border-border bg-bg-primary p-3" data-testid={missionWorkspaceTestIds.fenceList}>
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div>
      <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">Fence list</p>
      <h3 class="mt-1 text-sm font-semibold text-text-primary">Fence regions and return point</h3>
    </div>

    <div class="flex flex-wrap gap-2">
      <button
        class="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-bg-primary transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
        data-testid={missionWorkspaceTestIds.fenceAddInclusionPolygon}
        disabled={readOnly}
        onclick={() => onAddRegion("inclusion_polygon")}
        type="button"
      >
        Inclusion polygon
      </button>
      <button
        class="rounded-md border border-accent/30 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
        data-testid={missionWorkspaceTestIds.fenceAddExclusionPolygon}
        disabled={readOnly}
        onclick={() => onAddRegion("exclusion_polygon")}
        type="button"
      >
        Exclusion polygon
      </button>
      <button
        class="rounded-md border border-success/30 bg-success/10 px-4 py-2 text-sm font-semibold text-success transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
        data-testid={missionWorkspaceTestIds.fenceAddInclusionCircle}
        disabled={readOnly}
        onclick={() => onAddRegion("inclusion_circle")}
        type="button"
      >
        Inclusion circle
      </button>
      <button
        class="rounded-md border border-warning/40 bg-warning/10 px-4 py-2 text-sm font-semibold text-warning transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
        data-testid={missionWorkspaceTestIds.fenceAddExclusionCircle}
        disabled={readOnly}
        onclick={() => onAddRegion("exclusion_circle")}
        type="button"
      >
        Exclusion circle
      </button>
    </div>
  </div>

  <div
    class={`mt-4 rounded-lg border p-3 text-left transition ${fenceSelection.kind === "return-point"
      ? "border-accent/40 bg-accent/10 text-text-primary"
      : "border-border bg-bg-secondary/60 text-text-primary hover:border-accent/40"}`}
    data-selected={fenceSelection.kind === "return-point" ? "true" : "false"}
    data-testid={missionWorkspaceTestIds.fenceReturnPointCard}
    onclick={onSelectReturnPoint}
    onkeydown={(event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onSelectReturnPoint();
      }
    }}
    role="button"
    tabindex="0"
  >
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">Fence return point</p>
        <p class="mt-1 text-sm font-semibold text-text-primary">Return-point handle</p>
        <p class="mt-1 text-xs text-text-secondary">{returnPointSummary(returnPoint)}</p>
      </div>

      <button
        class="rounded-md border border-danger/40 bg-danger/10 px-3 py-1.5 text-xs font-semibold text-danger transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
        data-testid={missionWorkspaceTestIds.fenceReturnPointClear}
        disabled={readOnly || returnPoint === null}
        onclick={(event) => {
          event.stopPropagation();
          onClearReturnPoint();
        }}
        type="button"
      >
        Clear return point
      </button>
    </div>
  </div>

  {#if items.length === 0}
    <div
      class="mt-4 rounded-lg border border-dashed border-border bg-bg-secondary/60 px-4 py-6 text-sm text-text-secondary"
      data-testid={missionWorkspaceTestIds.fenceListEmpty}
    >
      No fence regions yet. Add an inclusion or exclusion shape, then refine it on the map or in the inspector without leaving the Mission workspace.
    </div>
  {:else}
    <div class="mt-4 space-y-3">
      {#each items as item (`fence-${item.uiId}`)}
        <div
          class={`rounded-lg border p-3 transition ${fenceSelection.kind === "region" && fenceSelection.regionUiId === item.uiId
            ? "border-accent/40 bg-accent/10 text-text-primary"
            : "border-border bg-bg-primary text-text-primary hover:border-accent/40"}`}
          data-selected={fenceSelection.kind === "region" && fenceSelection.regionUiId === item.uiId ? "true" : "false"}
          data-testid={`${missionWorkspaceTestIds.fenceRegionPrefix}-${item.uiId}`}
          onclick={() => onSelectRegion(item.uiId)}
          onkeydown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelectRegion(item.uiId);
            }
          }}
          role="button"
          tabindex="0"
        >
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">Fence region {item.index + 1}</p>
              <h4 class="mt-1 text-sm font-semibold text-text-primary">{regionLabel(item.document as FenceRegion)}</h4>
              <p class="mt-1 text-xs text-text-secondary">{regionSummary(item.document as FenceRegion)}</p>
              {#if item.preview.latitude_deg !== null && item.preview.longitude_deg !== null}
                <p class="mt-2 text-xs text-text-muted">Anchor · {item.preview.latitude_deg.toFixed(5)}, {item.preview.longitude_deg.toFixed(5)}</p>
              {/if}
            </div>

            <div class="flex flex-wrap items-center gap-2">
              <span class="rounded-full border border-border bg-bg-secondary px-3 py-1 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                {regionBadge(item.document as FenceRegion)}
              </span>
              <button
                class="rounded-md border border-danger/40 bg-danger/10 px-3 py-1.5 text-xs font-semibold text-danger transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                data-testid={`${missionWorkspaceTestIds.fenceRegionDeletePrefix}-${item.uiId}`}
                disabled={readOnly}
                onclick={(event) => {
                  event.stopPropagation();
                  onDeleteRegion(item.uiId);
                }}
                type="button"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</section>

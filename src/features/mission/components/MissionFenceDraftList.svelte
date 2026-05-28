<script lang="ts">
import type { TypedDraftItem, FenceRegionType } from "../../../lib/mission-draft-typed";
import type { GeoPoint2d, FenceRegion } from "../../../lib/mavkit-types";
import type { MissionPlannerFenceSelection } from "../../../lib/stores/mission-planner";
import { ActionRow, Badge, Button, Card, EmptyState, Eyebrow, HelperText } from "../../../components/ui";
import { missionWorkspaceTestIds } from "../mission-workspace-test-ids";

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

<Card.Root as="section" density="compact" testId={missionWorkspaceTestIds.fenceList}>
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div>
      <Eyebrow>Fence list</Eyebrow>
      <h3 class="mt-1 text-sm font-semibold text-text-primary">Fence regions and return point</h3>
    </div>

    <ActionRow align="start" direction="row" class="flex-wrap">
      <Button
        disabled={readOnly}
        testId={missionWorkspaceTestIds.fenceAddInclusionPolygon}
        onclick={() => onAddRegion("inclusion_polygon")}
      >
        Inclusion polygon
      </Button>
      <Button
        disabled={readOnly}
        testId={missionWorkspaceTestIds.fenceAddExclusionPolygon}
        onclick={() => onAddRegion("exclusion_polygon")}
        tone="accent"
        variant="soft"
      >
        Exclusion polygon
      </Button>
      <Button
        disabled={readOnly}
        testId={missionWorkspaceTestIds.fenceAddInclusionCircle}
        onclick={() => onAddRegion("inclusion_circle")}
        tone="success"
        variant="soft"
      >
        Inclusion circle
      </Button>
      <Button
        disabled={readOnly}
        testId={missionWorkspaceTestIds.fenceAddExclusionCircle}
        onclick={() => onAddRegion("exclusion_circle")}
        tone="warning"
        variant="soft"
      >
        Exclusion circle
      </Button>
    </ActionRow>
  </div>

  <Card.Root
    class="mt-4 cursor-pointer transition hover:border-accent/40"
    data-selected={fenceSelection.kind === "return-point" ? "true" : "false"}
    density="compact"
    selected={fenceSelection.kind === "return-point"}
    surface="secondary"
    testId={missionWorkspaceTestIds.fenceReturnPointCard}
    onclick={onSelectReturnPoint}
    onkeydown={(event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onSelectReturnPoint();
      }
    }}
    role="button"
    tabindex={0}
  >
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <Eyebrow>Fence return point</Eyebrow>
        <p class="mt-1 text-sm font-semibold text-text-primary">Return-point handle</p>
        <HelperText class="mt-1" size="xs">{returnPointSummary(returnPoint)}</HelperText>
      </div>

      <Button
        disabled={readOnly || returnPoint === null}
        size="sm"
        testId={missionWorkspaceTestIds.fenceReturnPointClear}
        onclick={(event) => {
          event.stopPropagation();
          onClearReturnPoint();
        }}
        tone="danger"
        variant="soft"
      >
        Clear return point
      </Button>
    </div>
  </Card.Root>

  {#if items.length === 0}
    <EmptyState
      class="mt-4"
      testId={missionWorkspaceTestIds.fenceListEmpty}
      title="No fence regions"
      description="Add an inclusion or exclusion shape, then refine it on the map or in the inspector without leaving the Mission workspace."
    />
  {:else}
    <div class="mt-4 space-y-3">
      {#each items as item (`fence-${item.uiId}`)}
        <Card.Root
          class="cursor-pointer transition hover:border-accent/40"
          data-selected={fenceSelection.kind === "region" && fenceSelection.regionUiId === item.uiId ? "true" : "false"}
          density="compact"
          selected={fenceSelection.kind === "region" && fenceSelection.regionUiId === item.uiId}
          surface="primary"
          testId={`${missionWorkspaceTestIds.fenceRegionPrefix}-${item.uiId}`}
          onclick={() => onSelectRegion(item.uiId)}
          onkeydown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelectRegion(item.uiId);
            }
          }}
          role="button"
          tabindex={0}
        >
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Eyebrow>Fence region {item.index + 1}</Eyebrow>
              <h4 class="mt-1 text-sm font-semibold text-text-primary">{regionLabel(item.document as FenceRegion)}</h4>
              <HelperText class="mt-1" size="xs">{regionSummary(item.document as FenceRegion)}</HelperText>
              {#if item.preview.latitude_deg !== null && item.preview.longitude_deg !== null}
                <HelperText class="mt-2" size="xs" tone="muted">Anchor · {item.preview.latitude_deg.toFixed(5)}, {item.preview.longitude_deg.toFixed(5)}</HelperText>
              {/if}
            </div>

            <div class="flex flex-wrap items-center gap-2">
              <Badge variant="muted" size="sm" case="normal" shape="rounded">
                {regionBadge(item.document as FenceRegion)}
              </Badge>
              <Button
                disabled={readOnly}
                size="sm"
                testId={`${missionWorkspaceTestIds.fenceRegionDeletePrefix}-${item.uiId}`}
                onclick={(event) => {
                  event.stopPropagation();
                  onDeleteRegion(item.uiId);
                }}
                tone="danger"
                variant="soft"
              >
                Delete
              </Button>
            </div>
          </div>
        </Card.Root>
      {/each}
    </div>
  {/if}
</Card.Root>

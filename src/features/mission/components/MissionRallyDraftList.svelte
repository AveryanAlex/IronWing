<script lang="ts">
import type { TypedDraftItem } from "../../../lib/mission-draft-typed";
import { geoPoint3dAltitude, geoPoint3dLatLon, type GeoPoint3d } from "../../../lib/mavkit-types";
import type { MissionPlannerRallySelection } from "../../../lib/stores/mission-planner";
import { ActionRow, Badge, Button, Card, EmptyState, Eyebrow, HelperText } from "../../../components/ui";
import { missionWorkspaceTestIds } from "../mission-workspace-test-ids";

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

<Card.Root as="section" density="compact" testId={missionWorkspaceTestIds.rallyList}>
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div>
      <Eyebrow>Rally list</Eyebrow>
      <h3 class="mt-1 text-sm font-semibold text-text-primary">Rally points</h3>
    </div>

    <Button
      disabled={readOnly}
      testId={missionWorkspaceTestIds.rallyAdd}
      onclick={onAddPoint}
    >
      Add rally point
    </Button>
  </div>

  {#if items.length === 0}
    <EmptyState
      class="mt-4"
      testId={missionWorkspaceTestIds.rallyListEmpty}
      title="No rally points"
      description="Add one here or place it from the rally map surface without leaving the Mission workspace."
    />
  {:else}
    <div class="mt-4 space-y-3">
      {#each items as item (`rally-${item.uiId}`)}
        <Card.Root
          class="cursor-pointer transition hover:border-accent/40"
          data-selected={rallySelection.kind === "point" && rallySelection.pointUiId === item.uiId ? "true" : "false"}
          density="compact"
          selected={rallySelection.kind === "point" && rallySelection.pointUiId === item.uiId}
          surface="primary"
          testId={`${missionWorkspaceTestIds.rallyPointPrefix}-${item.uiId}`}
          onclick={() => onSelectPoint(item.uiId)}
          onkeydown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelectPoint(item.uiId);
            }
          }}
          role="button"
          tabindex={0}
        >
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Eyebrow>Rally point {item.index + 1}</Eyebrow>
              <h4 class="mt-1 text-sm font-semibold text-text-primary">Emergency / diversion target</h4>
              <HelperText class="mt-1" size="xs">{pointSummary(item)}</HelperText>
            </div>

            <Badge variant="muted" size="sm" case="normal" shape="rounded">
              {(item.document as GeoPoint3d) && altitudeFrameLabel(item.document as GeoPoint3d)}
            </Badge>
          </div>

          <ActionRow align="start" direction="row" class="mt-3 flex-wrap">
            <Button
              disabled={readOnly || item.index === 0}
              size="sm"
              testId={`${missionWorkspaceTestIds.rallyPointMoveUpPrefix}-${item.uiId}`}
              onclick={(event) => {
                event.stopPropagation();
                onMovePointUp(item.uiId);
              }}
              variant="secondary"
            >
              Move up
            </Button>
            <Button
              disabled={readOnly || item.index === items.length - 1}
              size="sm"
              testId={`${missionWorkspaceTestIds.rallyPointMoveDownPrefix}-${item.uiId}`}
              onclick={(event) => {
                event.stopPropagation();
                onMovePointDown(item.uiId);
              }}
              variant="secondary"
            >
              Move down
            </Button>
            <Button
              disabled={readOnly}
              size="sm"
              testId={`${missionWorkspaceTestIds.rallyPointDeletePrefix}-${item.uiId}`}
              onclick={(event) => {
                event.stopPropagation();
                onDeletePoint(item.uiId);
              }}
              tone="danger"
              variant="soft"
            >
              Delete
            </Button>
          </ActionRow>
        </Card.Root>
      {/each}
    </div>
  {/if}
</Card.Root>

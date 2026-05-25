<script lang="ts">
import type { MissionMapView } from "../../lib/mission-map-view";
import type { FenceRegionType } from "../../lib/mission-draft-typed";
import type { SurveyRegion } from "../../lib/survey-region";
import { missionWorkspaceTestIds } from "./mission-workspace-test-ids";

type FencePlacementMode = FenceRegionType | "return-point";

type Props = {
  mode: MissionMapView["mode"];
  surveySessionActive: boolean;
  selectedSurveyRegion: SurveyRegion | null;
  readOnly: boolean;
  fenceHasReturnPoint: boolean;
  fencePlacementActive: boolean;
  onStartSurveyEdit: () => void;
  onFinishSurveySession: () => void;
  onCancelSurveySession: () => void;
  onStartFencePlacement: (mode: FencePlacementMode) => void;
  onClearFenceReturnPoint: () => void;
  onCancelFencePlacement: () => void;
};

let {
  mode,
  surveySessionActive,
  selectedSurveyRegion,
  readOnly,
  fenceHasReturnPoint,
  fencePlacementActive,
  onStartSurveyEdit,
  onFinishSurveySession,
  onCancelSurveySession,
  onStartFencePlacement,
  onClearFenceReturnPoint,
  onCancelFencePlacement,
}: Props = $props();
</script>

{#if mode === "mission"}
  {#if surveySessionActive || selectedSurveyRegion}
    <div class="mt-4 flex flex-wrap gap-2">
      {#if !surveySessionActive && selectedSurveyRegion}
        <button
          class="rounded-md border border-accent/40 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
          data-testid={missionWorkspaceTestIds.mapDrawEdit}
          disabled={readOnly}
          onclick={onStartSurveyEdit}
          type="button"
        >
          Edit geometry on map
        </button>
      {/if}
      {#if surveySessionActive}
        <button
          class="rounded-md border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
          data-testid={missionWorkspaceTestIds.mapDrawFinish}
          onclick={onFinishSurveySession}
          type="button"
        >
          Finish editing
        </button>
        <button
          class="rounded-md border border-warning/40 bg-warning/10 px-4 py-2 text-sm font-semibold text-warning transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
          data-testid={missionWorkspaceTestIds.mapDrawCancel}
          onclick={onCancelSurveySession}
          type="button"
        >
          Cancel editing
        </button>
      {/if}
    </div>
  {/if}
{:else if mode === "fence"}
  <div class="mt-4 flex flex-wrap gap-2">
    <button
      class="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-bg-primary transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
      data-testid={missionWorkspaceTestIds.mapFencePlaceInclusionPolygon}
      disabled={readOnly}
      onclick={() => onStartFencePlacement("inclusion_polygon")}
      type="button"
    >
      Place inclusion polygon
    </button>
    <button
      class="rounded-md border border-accent/30 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
      data-testid={missionWorkspaceTestIds.mapFencePlaceExclusionPolygon}
      disabled={readOnly}
      onclick={() => onStartFencePlacement("exclusion_polygon")}
      type="button"
    >
      Place exclusion polygon
    </button>
    <button
      class="rounded-md border border-success/30 bg-success/10 px-4 py-2 text-sm font-semibold text-success transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
      data-testid={missionWorkspaceTestIds.mapFencePlaceInclusionCircle}
      disabled={readOnly}
      onclick={() => onStartFencePlacement("inclusion_circle")}
      type="button"
    >
      Place inclusion circle
    </button>
    <button
      class="rounded-md border border-warning/40 bg-warning/10 px-4 py-2 text-sm font-semibold text-warning transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
      data-testid={missionWorkspaceTestIds.mapFencePlaceExclusionCircle}
      disabled={readOnly}
      onclick={() => onStartFencePlacement("exclusion_circle")}
      type="button"
    >
      Place exclusion circle
    </button>
    <button
      class="rounded-md border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
      data-testid={missionWorkspaceTestIds.mapFencePlaceReturnPoint}
      disabled={readOnly}
      onclick={() => onStartFencePlacement("return-point")}
      type="button"
    >
      Place return point
    </button>
    <button
      class="rounded-md border border-danger/40 bg-danger/10 px-4 py-2 text-sm font-semibold text-danger transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
      data-testid={missionWorkspaceTestIds.mapFenceClearReturnPoint}
      disabled={readOnly || !fenceHasReturnPoint}
      onclick={onClearFenceReturnPoint}
      type="button"
    >
      Clear return point
    </button>
    <button
      class="rounded-md border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
      data-testid={missionWorkspaceTestIds.mapFencePlacementCancel}
      disabled={!fencePlacementActive}
      onclick={onCancelFencePlacement}
      type="button"
    >
      Cancel placement
    </button>
  </div>
{/if}

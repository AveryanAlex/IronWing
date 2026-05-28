<script lang="ts">
import type { MissionMapView } from "../../../lib/mission-map-view";
import type { FenceRegionType } from "../../../lib/mission-draft-typed";
import type { SurveyRegion } from "../../../lib/survey-region";
import { Toolbar, ToolbarButton } from "../../../components/ui";
import { missionWorkspaceTestIds } from "../mission-workspace-test-ids";

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
    <Toolbar ariaLabel="Mission survey geometry actions" wrap>
      {#if !surveySessionActive && selectedSurveyRegion}
        <ToolbarButton
          testId={missionWorkspaceTestIds.mapDrawEdit}
          disabled={readOnly}
          onclick={onStartSurveyEdit}
          tone="accent"
          variant="soft"
        >
          Edit geometry on map
        </ToolbarButton>
      {/if}
      {#if surveySessionActive}
        <ToolbarButton
          testId={missionWorkspaceTestIds.mapDrawFinish}
          onclick={onFinishSurveySession}
          variant="secondary"
        >
          Finish editing
        </ToolbarButton>
        <ToolbarButton
          testId={missionWorkspaceTestIds.mapDrawCancel}
          onclick={onCancelSurveySession}
          tone="warning"
          variant="soft"
        >
          Cancel editing
        </ToolbarButton>
      {/if}
    </Toolbar>
  {/if}
{:else if mode === "fence"}
  <Toolbar ariaLabel="Mission fence placement actions" wrap>
    <ToolbarButton
      testId={missionWorkspaceTestIds.mapFencePlaceInclusionPolygon}
      disabled={readOnly}
      onclick={() => onStartFencePlacement("inclusion_polygon")}
    >
      Place inclusion polygon
    </ToolbarButton>
    <ToolbarButton
      testId={missionWorkspaceTestIds.mapFencePlaceExclusionPolygon}
      disabled={readOnly}
      onclick={() => onStartFencePlacement("exclusion_polygon")}
      tone="accent"
      variant="soft"
    >
      Place exclusion polygon
    </ToolbarButton>
    <ToolbarButton
      testId={missionWorkspaceTestIds.mapFencePlaceInclusionCircle}
      disabled={readOnly}
      onclick={() => onStartFencePlacement("inclusion_circle")}
      tone="success"
      variant="soft"
    >
      Place inclusion circle
    </ToolbarButton>
    <ToolbarButton
      testId={missionWorkspaceTestIds.mapFencePlaceExclusionCircle}
      disabled={readOnly}
      onclick={() => onStartFencePlacement("exclusion_circle")}
      tone="warning"
      variant="soft"
    >
      Place exclusion circle
    </ToolbarButton>
    <ToolbarButton
      testId={missionWorkspaceTestIds.mapFencePlaceReturnPoint}
      disabled={readOnly}
      onclick={() => onStartFencePlacement("return-point")}
      variant="secondary"
    >
      Place return point
    </ToolbarButton>
    <ToolbarButton
      testId={missionWorkspaceTestIds.mapFenceClearReturnPoint}
      disabled={readOnly || !fenceHasReturnPoint}
      onclick={onClearFenceReturnPoint}
      tone="danger"
      variant="soft"
    >
      Clear return point
    </ToolbarButton>
    <ToolbarButton
      testId={missionWorkspaceTestIds.mapFencePlacementCancel}
      disabled={!fencePlacementActive}
      onclick={onCancelFencePlacement}
      variant="secondary"
    >
      Cancel placement
    </ToolbarButton>
  </Toolbar>
{/if}

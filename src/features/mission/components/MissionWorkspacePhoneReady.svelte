<script lang="ts">
import MissionDraftList from "./MissionDraftList.svelte";
import MissionFenceDraftList from "./MissionFenceDraftList.svelte";
import MissionFenceInspector from "./MissionFenceInspector.svelte";
import MissionHomeCard from "./MissionHomeCard.svelte";
import MissionInspector from "./MissionInspector.svelte";
import MissionMap from "./MissionMap.svelte";
import MissionPlanningStatsPanel from "./MissionPlanningStatsPanel.svelte";
import MissionRallyDraftList from "./MissionRallyDraftList.svelte";
import MissionRallyInspector from "./MissionRallyInspector.svelte";
import MissionTerrainProfilePanel from "./MissionTerrainProfilePanel.svelte";
import MissionWorkspaceModeShell from "./MissionWorkspaceModeShell.svelte";
import { SegmentedControl } from "../../../components/ui";
import { resolveSurveyCreationAnchor } from "../mission-workspace-helpers";
import { missionWorkspaceTestIds } from "../mission-workspace-test-ids";
import type { MissionWorkspaceActions, MissionWorkspaceContext, MissionWorkspacePhoneState } from "../mission-workspace-sections";

type Props = {
  context: MissionWorkspaceContext;
  actions: MissionWorkspaceActions;
  phoneState: MissionWorkspacePhoneState;
  showPhoneSegments: boolean;
  onSelectMissionPhoneSegment: (segment: "map" | "plan") => void;
};

let { context, actions, phoneState, showPhoneSegments, onSelectMissionPhoneSegment }: Props = $props();

let showMissionEditor = $derived(context.view.mode === "mission");
let showFenceEditor = $derived(context.view.mode === "fence");
let showRallyEditor = $derived(context.view.mode === "rally");

const missionPhoneSegmentOptions = [
  { value: "map", label: "Map", testId: missionWorkspaceTestIds.phoneSegmentMap },
  { value: "plan", label: "Plan", testId: missionWorkspaceTestIds.phoneSegmentPlan },
] as const;
</script>

<div class="mission-workspace__ready" data-testid={missionWorkspaceTestIds.ready}>
  <div class="mission-workspace__phone-stack space-y-4 overflow-y-auto">
    <MissionHomeCard
      attachment={context.view.attachment}
      home={context.planner.home}
      onChange={actions.onSetHome}
      onSelect={actions.onSelectHome}
      selected={context.homeSelected}
    />

    {#if showMissionEditor}
      {#if showPhoneSegments}
        <SegmentedControl
          ariaLabel="Mission phone segment"
          class="w-full border-border bg-bg-primary p-2"
          onValueChange={(segment) => onSelectMissionPhoneSegment(segment as "map" | "plan")}
          options={missionPhoneSegmentOptions}
          testId={missionWorkspaceTestIds.phoneSegmentBar}
          value={phoneState.missionPhoneSegment}
        />
      {/if}

      <div
        class={[
          "space-y-4",
          !phoneState.missionMapVisible && "hidden",
        ]}
        data-testid={missionWorkspaceTestIds.mapPane}
        data-visible={phoneState.missionMapVisible ? "true" : "false"}
      >
        <MissionMap
          blockedReason={context.planner.blockedReason}
          fallbackReference={resolveSurveyCreationAnchor(context.planner)}
          homePosition={context.sessionHomePosition}
          onAddWaypointAt={actions.onAddWaypointAt}
          onDeleteSurveyRegion={actions.onDeleteSurveyRegion}
          onMoveHome={actions.onMoveHomeFromMap}
          onMoveMissionItem={actions.onMoveMissionItemFromMap}
          onSelectHome={actions.onSelectHome}
          onSelectMissionItem={actions.onSelectMissionItemByUiId}
          onSelectSurveyRegion={actions.onSelectSurveyRegion}
          onSetHomeAt={actions.onSetHomeAt}
          onUpdateSurveyRegion={actions.onUpdateSurveyRegion}
          readOnly={!context.view.canEdit}
          readOnlyReason={context.view.attachment.detail}
          replayMapOverlay={context.replayMapOverlay}
          selectedSurveyRegion={context.selectedSurveyRegion}
          vehicleHeadingDeg={context.sessionVehicleHeadingDeg}
          vehiclePosition={context.sessionVehiclePosition}
          view={context.mapView}
        />
      </div>

      <div
        class={[
          "space-y-4",
          !phoneState.missionPlanVisible && "hidden",
        ]}
        data-testid={missionWorkspaceTestIds.planPane}
        data-visible={phoneState.missionPlanVisible ? "true" : "false"}
      >
          <MissionDraftList
            cruiseSpeed={context.planner.cruiseSpeed}
            items={context.missionItems}
            onDeleteMissionItem={actions.onDeleteMissionItem}
          onDeleteSurveyRegion={actions.onDeleteSurveyRegion}
          onGenerateSurveyRegion={actions.onGenerateSurveyRegion}
          onPromptDissolveSurveyRegion={actions.onPromptDissolveSurveyRegion}
          onReorderMissionEntries={actions.onReorderMissionEntries}
          onSelectMissionItem={actions.onSelectMissionItem}
          onSelectSurveyBlock={actions.onSelectSurveyRegion}
          onSetSurveyRegionCollapsed={actions.onSetSurveyRegionCollapsed}
          selectedMissionUiId={context.selectedMissionUiId}
          selectedSurface={context.planner.selection}
          surveyBlocks={context.surveyBlocks}
        />

        <MissionInspector
          cruiseSpeed={context.planner.cruiseSpeed}
          home={context.planner.home}
          item={context.selectedMissionItem}
          onConfirmSurveyPrompt={actions.onConfirmSurveyPrompt}
          onDeleteSurveyRegion={actions.onDeleteSurveyRegion}
          onDismissSurveyPrompt={actions.onDismissSurveyPrompt}
          onGenerateSurveyRegion={actions.onGenerateSurveyRegion}
          onMarkSurveyRegionItemAsEdited={actions.onMarkSurveyRegionItemAsEdited}
          onPromptDissolveSurveyRegion={actions.onPromptDissolveSurveyRegion}
          onUpdateAltitude={actions.onUpdateMissionItemAltitude}
          onUpdateCommand={actions.onUpdateMissionItemCommand}
          onUpdateLatitude={actions.onUpdateMissionItemLatitude}
          onUpdateLongitude={actions.onUpdateMissionItemLongitude}
          onUpdateSurveyRegion={actions.onUpdateSurveyRegion}
          previousItem={context.previousMissionItem}
          selectedSurveyRegion={context.selectedSurveyRegion}
          selection={context.planner.selection}
          surveyPrompt={context.surveyPrompt}
        />

        <MissionPlanningStatsPanel
          confirmedCruiseSpeed={context.appSettings.cruiseSpeedMps}
          confirmedHoverSpeed={context.appSettings.hoverSpeedMps}
          cruiseSpeed={context.planner.cruiseSpeed}
          fenceRegions={context.fenceRegions}
          home={context.planner.home}
          hoverSpeed={context.planner.hoverSpeed}
          missionItems={context.missionItems}
          mode={context.view.mode}
          onPersistPlanningSpeeds={actions.onPersistPlanningSpeeds}
          onSetPlanningSpeeds={actions.onSetPlanningSpeeds}
          rallyPoints={context.rallyPoints}
          readOnly={!context.view.canEdit}
        />

        <MissionTerrainProfilePanel
          onRetry={actions.onRetryTerrain}
          onSelectWarning={actions.onSelectTerrainWarning}
          state={context.terrain}
        />
      </div>
    {:else if showFenceEditor}
      <MissionMap
        blockedReason={context.planner.blockedReason}
        fallbackReference={resolveSurveyCreationAnchor(context.planner)}
        homePosition={context.sessionHomePosition}
        onAddFenceRegion={actions.onAddFenceRegion}
        onClearFenceReturnPoint={() => actions.onSetFenceReturnPoint(null)}
        onDeleteSurveyRegion={actions.onDeleteSurveyRegion}
        onMoveFenceCircleCenter={actions.onMoveFenceCircleCenterFromMap}
        onMoveFenceVertex={actions.onMoveFenceVertexFromMap}
        onMoveHome={actions.onMoveHomeFromMap}
        onMoveMissionItem={actions.onMoveMissionItemFromMap}
        onSelectFenceRegion={actions.onSelectFenceRegion}
        onSelectFenceReturnPoint={actions.onSelectFenceReturnPoint}
        onSelectHome={actions.onSelectHome}
        onSelectMissionItem={actions.onSelectMissionItemByUiId}
        onSelectSurveyRegion={actions.onSelectSurveyRegion}
        onSetFenceReturnPoint={(latitudeDeg, longitudeDeg) => actions.onSetFenceReturnPoint({ latitude_deg: latitudeDeg, longitude_deg: longitudeDeg })}
        onSetHomeAt={actions.onSetHomeAt}
        onUpdateFenceCircleRadius={actions.onUpdateFenceCircleRadiusFromMap}
        onUpdateSurveyRegion={actions.onUpdateSurveyRegion}
        readOnly={!context.view.canEdit}
        readOnlyReason={context.view.attachment.detail}
        replayMapOverlay={context.replayMapOverlay}
        selectedSurveyRegion={context.selectedSurveyRegion}
        vehicleHeadingDeg={context.sessionVehicleHeadingDeg}
        vehiclePosition={context.sessionVehiclePosition}
        view={context.mapView}
      />

      <MissionFenceDraftList
        fenceSelection={context.planner.fenceSelection}
        items={context.fenceItems}
        onAddRegion={actions.onAddFenceRegion}
        onClearReturnPoint={() => actions.onSetFenceReturnPoint(null)}
        onDeleteRegion={actions.onDeleteFenceRegion}
        onSelectRegion={actions.onSelectFenceRegion}
        onSelectReturnPoint={actions.onSelectFenceReturnPoint}
        readOnly={!context.view.canEdit}
        returnPoint={context.fenceReturnPoint}
      />

      <MissionFenceInspector
        item={context.selectedFenceItem}
        onSetReturnPoint={actions.onSetFenceReturnPoint}
        onUpdateRegion={actions.onUpdateFenceRegion}
        readOnly={!context.view.canEdit}
        returnPoint={context.fenceReturnPoint}
        selection={context.planner.fenceSelection}
      />

      <MissionPlanningStatsPanel
        confirmedCruiseSpeed={context.appSettings.cruiseSpeedMps}
        confirmedHoverSpeed={context.appSettings.hoverSpeedMps}
        cruiseSpeed={context.planner.cruiseSpeed}
        fenceRegions={context.fenceRegions}
        home={context.planner.home}
        hoverSpeed={context.planner.hoverSpeed}
        missionItems={context.missionItems}
        onPersistPlanningSpeeds={actions.onPersistPlanningSpeeds}
        onSetPlanningSpeeds={actions.onSetPlanningSpeeds}
        rallyPoints={context.rallyPoints}
        readOnly={!context.view.canEdit}
      />
    {:else if showRallyEditor}
      <MissionMap
        blockedReason={context.planner.blockedReason}
        fallbackReference={resolveSurveyCreationAnchor(context.planner)}
        homePosition={context.sessionHomePosition}
        onDeleteSurveyRegion={actions.onDeleteSurveyRegion}
        onMoveHome={actions.onMoveHomeFromMap}
        onMoveMissionItem={actions.onMoveMissionItemFromMap}
        onMoveRallyPoint={actions.onMoveRallyPointFromMap}
        onSelectHome={actions.onSelectHome}
        onSelectMissionItem={actions.onSelectMissionItemByUiId}
        onSelectRallyPoint={actions.onSelectRallyPoint}
        onSelectSurveyRegion={actions.onSelectSurveyRegion}
        onSetHomeAt={actions.onSetHomeAt}
        onUpdateSurveyRegion={actions.onUpdateSurveyRegion}
        readOnly={!context.view.canEdit}
        readOnlyReason={context.view.attachment.detail}
        replayMapOverlay={context.replayMapOverlay}
        selectedSurveyRegion={context.selectedSurveyRegion}
        vehicleHeadingDeg={context.sessionVehicleHeadingDeg}
        vehiclePosition={context.sessionVehiclePosition}
        view={context.mapView}
      />

      <MissionRallyDraftList
        items={context.rallyItems}
        onAddPoint={actions.onAddRallyPoint}
        onDeletePoint={actions.onDeleteRallyPoint}
        onMovePointDown={actions.onMoveRallyPointDown}
        onMovePointUp={actions.onMoveRallyPointUp}
        onSelectPoint={actions.onSelectRallyPoint}
        rallySelection={context.planner.rallySelection}
        readOnly={!context.view.canEdit}
      />

      <MissionRallyInspector
        item={context.selectedRallyItem}
        onUpdateAltitude={actions.onUpdateRallyAltitude}
        onUpdateAltitudeFrame={actions.onUpdateRallyAltitudeFrame}
        onUpdateLatitude={actions.onUpdateRallyLatitude}
        onUpdateLongitude={actions.onUpdateRallyLongitude}
        readOnly={!context.view.canEdit}
        selection={context.planner.rallySelection}
      />

      <MissionPlanningStatsPanel
        confirmedCruiseSpeed={context.appSettings.cruiseSpeedMps}
        confirmedHoverSpeed={context.appSettings.hoverSpeedMps}
        cruiseSpeed={context.planner.cruiseSpeed}
        fenceRegions={context.fenceRegions}
        home={context.planner.home}
        hoverSpeed={context.planner.hoverSpeed}
        missionItems={context.missionItems}
        onPersistPlanningSpeeds={actions.onPersistPlanningSpeeds}
        onSetPlanningSpeeds={actions.onSetPlanningSpeeds}
        rallyPoints={context.rallyPoints}
        readOnly={!context.view.canEdit}
      />
    {:else}
      <MissionWorkspaceModeShell mode={context.view.mode} view={context.view} />
    {/if}
  </div>
</div>

<style>
  .mission-workspace__ready {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .mission-workspace__phone-stack {
    height: 100%;
    min-height: 0;
    padding: var(--workspace-gutter-split);
  }
</style>

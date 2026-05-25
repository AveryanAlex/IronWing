<script lang="ts">
import MissionMap from "./MissionMap.svelte";
import { missionWorkspaceTestIds } from "./mission-workspace-test-ids";
import type { MissionWorkspaceEntryActionCard } from "./mission-workspace-helpers";
import type { MissionWorkspaceActions, MissionWorkspaceContext } from "./mission-workspace-sections";
import { resolveSurveyCreationAnchor } from "./mission-workspace-helpers";

type Props = {
  context: MissionWorkspaceContext;
  actions: MissionWorkspaceActions;
  entryCards: MissionWorkspaceEntryActionCard[];
  replayOverlayHasGeometry: boolean;
};

let { context, actions, entryCards, replayOverlayHasGeometry }: Props = $props();

let showMissionEditor = $derived(context.view.mode === "mission");
</script>

{#if context.view.status === "bootstrapping" && !context.view.workspaceMounted}
  <section
    class="mx-[var(--workspace-gutter-split)] mt-4 rounded-lg border border-border bg-bg-secondary/60 p-5"
    data-testid={missionWorkspaceTestIds.bootstrapping}
  >
    <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">Planner scope</p>
    <h3 class="mt-2 text-lg font-semibold text-text-primary">Loading the planner domain</h3>
    <p class="mt-2 text-sm text-text-secondary">
      IronWing is subscribing the planner workspace to the active session scope before live actions unlock.
    </p>
  </section>
{:else if !context.view.workspaceMounted}
  <section
    class="mx-[var(--workspace-gutter-split)] mt-4 rounded-lg border border-border bg-bg-secondary/60 p-5"
    data-testid={context.view.status === "unavailable" ? missionWorkspaceTestIds.unavailable : missionWorkspaceTestIds.empty}
  >
    <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">Planner entry</p>
    <h3 class="mt-2 text-lg font-semibold text-text-primary">
      {context.view.status === "unavailable" ? "Start planning locally or reconnect for live sync" : "Start this scope with a real planner entry action"}
    </h3>
    <p class="mt-2 text-sm text-text-secondary">
      {context.view.status === "unavailable"
        ? "The Mission tab stays mounted even without an active vehicle scope. Import .plan, .kml, or .kmz files now, or start a blank draft and reconnect later for live reads, validation, upload, and clear flows."
        : "Start from a vehicle download, a truthful file import, or a blank planner draft. Once you choose an entry action, Home, warnings, review state, and later domain editors stay mounted in the active workspace."}
    </p>

    <div class="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
      {#each entryCards as card (card.key)}
        <button
          class={`rounded-lg border px-4 py-3 text-left transition ${card.tone === "primary"
            ? "border-accent/40 bg-accent/10 text-text-primary hover:border-accent"
            : "border-border bg-bg-primary text-text-primary hover:border-accent"} disabled:cursor-not-allowed disabled:opacity-60`}
          data-testid={card.testId}
          disabled={card.disabled}
          onclick={card.onclick}
          type="button"
        >
          <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">Entry action</p>
          <h4 class="mt-1 text-sm font-semibold">{card.title}</h4>
          <p class="mt-1 text-xs text-text-secondary">{card.description}</p>
        </button>
      {/each}
    </div>

    {#if replayOverlayHasGeometry && showMissionEditor}
      <div class="mt-5">
        <MissionMap
          blockedReason={context.planner.blockedReason}
          fallbackReference={resolveSurveyCreationAnchor(context.planner)}
          homePosition={context.sessionHomePosition}
          onAddWaypointAt={actions.onAddWaypointAt}
          onCreateSurveyRegion={actions.onStartSurveyDraw}
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
    {/if}
  </section>
{/if}

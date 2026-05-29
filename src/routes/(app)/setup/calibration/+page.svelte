<script lang="ts">
import { Compass, Gauge, MessageSquare, Radio } from "lucide-svelte";
import { fromStore } from "svelte/store";
import { calibrateCompassAccept, calibrateCompassCancel, calibrateCompassStart } from "../../../../calibration";
import { trackAnalytics } from "../../../../lib/analytics/client";
import { REPLAY_READONLY_COPY, REPLAY_READONLY_TITLE, isReplayReadonly } from "../../../../lib/replay-readonly";
import type { SetupWorkspaceStoreState, SetupWorkspaceCalibrationCard } from "../../../../lib/stores/setup-workspace";
import { Button } from "../../../../components/ui";
import SetupFieldStack from "../../../../features/setup/shared/SetupFieldStack.svelte";
import SetupGuideCard from "../../../../features/setup/shared/SetupGuideCard.svelte";
import SetupNotice from "../../../../features/setup/shared/SetupNotice.svelte";
import SetupSectionCard from "../../../../features/setup/shared/SetupSectionCard.svelte";
import SetupSectionShell from "../../../../features/setup/components/SetupSectionShell.svelte";
import { setupWorkspaceTestIds } from "../../../../features/setup/setup-workspace-test-ids";
import { getSetupWorkspaceRouteContext } from "../../../../features/setup/components/setup-workspace-route-context";

const route = getSetupWorkspaceRouteContext();
const viewStore = fromStore(route.viewStore);

let view = $derived(viewStore.current);

let actionError = $state<string | null>(null);
let pendingCardId = $state<SetupWorkspaceCalibrationCard["id"] | null>(null);
let replayReadonly = $derived(isReplayReadonly(view.activeSource));

async function runCompassAction(card: SetupWorkspaceCalibrationCard) {
  if (replayReadonly || card.id !== "compass" || card.actionAvailability !== "available" || !card.actionLabel) {
    return;
  }

  actionError = null;
  pendingCardId = card.id;

  try {
    if (card.lifecycle === "running") {
      await calibrateCompassCancel();
      trackAnalytics("calibration_completed", { kind: "compass", result: "cancelled" });
    } else if (card.lifecycle === "complete") {
      await calibrateCompassAccept();
      trackAnalytics("calibration_completed", { kind: "compass", result: "accepted" });
    } else {
      trackAnalytics("calibration_started", { kind: "compass" });
      await calibrateCompassStart();
    }
  } catch (error) {
    actionError = error instanceof Error ? error.message : String(error);
    trackAnalytics("calibration_completed", { kind: "compass", result: "error" });
  } finally {
    pendingCardId = null;
  }
}

function cardTone(card: SetupWorkspaceCalibrationCard): "neutral" | "info" | "success" | "warning" | "danger" {
  switch (card.lifecycle) {
    case "complete":
      return "success";
    case "running":
      return "info";
    case "failed":
      return "danger";
    case "unavailable":
      return "warning";
    case "not_started":
    default:
      return "neutral";
  }
}

function calibrationIcon(cardId: SetupWorkspaceCalibrationCard["id"]) {
  if (cardId === "compass") {
    return Compass;
  }

  if (cardId === "radio") {
    return Radio;
  }

  return Gauge;
}
</script>

<SetupSectionShell
  sectionId="calibration"
  eyebrow="Calibration"
  title="Calibration status and guided actions"
  description="Review accelerometer, gyroscope, compass, and radio calibration status. Compass actions remain available here when the vehicle supports them."
  testId={setupWorkspaceTestIds.calibrationSection}
>
  {#snippet body()}
      {#if actionError}
        <SetupNotice tone="danger">{actionError}</SetupNotice>
      {/if}

      {#if replayReadonly}
        <SetupNotice tone="warning" testId={setupWorkspaceTestIds.calibrationReplayReadonly}>
          <strong>{REPLAY_READONLY_TITLE}</strong> {REPLAY_READONLY_COPY}
        </SetupNotice>
      {/if}

      {#if view.statusNotices.length > 0}
        <SetupSectionCard
          icon={MessageSquare}
          title="Calibration messages"
          description="Recent calibration status text from the vehicle."
          surface="elevated"
          testId={setupWorkspaceTestIds.calibrationNotices}
        >
          <ul class="space-y-2">
            {#each view.statusNotices as notice (notice.id)}
              <li class="rounded-lg border border-border bg-bg-secondary/70 px-3 py-2 text-sm text-text-secondary">
                {notice.text}
              </li>
            {/each}
          </ul>
        </SetupSectionCard>
      {/if}

      <div class="grid gap-3 xl:grid-cols-2">
        {#each view.calibrationSummary.cards as card (card.id)}
          {#snippet lifecycleStatus()}
            <span class="rounded-full border border-border bg-bg-primary/80 px-2 py-1 text-xs font-semibold uppercase tracking-widest text-text-secondary">
              {card.lifecycle}
            </span>
          {/snippet}

          <SetupSectionCard
            icon={calibrationIcon(card.id)}
            title={card.title}
            description={card.detailText}
            tone={cardTone(card)}
            surface="elevated"
            testId={`${setupWorkspaceTestIds.calibrationCardPrefix}-${card.id}`}
            status={lifecycleStatus}
          >
            <p class="text-sm font-semibold text-text-primary" data-testid={`${setupWorkspaceTestIds.calibrationStatusPrefix}-${card.id}`}>
              {card.statusText}
            </p>

            {#if card.actionLabel}
              <Button
                class="self-start"
                disabled={replayReadonly || card.actionAvailability !== "available" || pendingCardId === card.id}
                onclick={() => runCompassAction(card)}
                testId={`${setupWorkspaceTestIds.calibrationActionPrefix}-${card.id}`}
                variant="secondary"
              >
                {pendingCardId === card.id ? "Working…" : card.actionLabel}
              </Button>
            {/if}
          </SetupSectionCard>
        {/each}
      </div>

      <SetupGuideCard title="Calibration steps" description="Complete calibrations on a stable bench with the vehicle made safe.">
        <SetupFieldStack divided>
          <p class="pt-3 first:pt-0">Disconnect or secure propulsion before starting any calibration that can move surfaces or motors.</p>
          <p class="pt-3 first:pt-0">For compass calibration, rotate the vehicle through all orientations and accept the result only after the vehicle reports completion.</p>
          <p class="pt-3 first:pt-0">Re-run pre-arm checks after calibration so sensor health and status text reflect the new offsets.</p>
        </SetupFieldStack>
      </SetupGuideCard>
  {/snippet}
</SetupSectionShell>

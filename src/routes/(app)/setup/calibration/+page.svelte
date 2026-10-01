<script lang="ts">
import { Compass, Gauge, MessageSquare, Radio } from "lucide-svelte";
import { fromStore } from "svelte/store";
import {
  calibrateAccel,
  calibrateAccelConfirm,
  calibrateCompassAccept,
  calibrateCompassCancel,
  calibrateCompassStart,
  calibrateGyro,
  type AccelCalibrationPosition,
} from "../../../../calibration";
import { trackAnalytics } from "../../../../lib/analytics/client";
import { notifyUnknownError } from "../../../../lib/notifications";
import { isReplayReadonly } from "../../../../lib/replay-readonly";
import type { SetupWorkspaceStoreState, SetupWorkspaceCalibrationCard } from "../../../../lib/stores/setup-workspace";
import { Button } from "../../../../components/ui";
import SetupFieldStack from "../../../../features/setup/shared/SetupFieldStack.svelte";
import SetupGuideCard from "../../../../features/setup/shared/SetupGuideCard.svelte";
import SetupSectionCard from "../../../../features/setup/shared/SetupSectionCard.svelte";
import SetupSectionShell from "../../../../features/setup/components/SetupSectionShell.svelte";
import { setupWorkspaceTestIds } from "../../../../features/setup/setup-workspace-test-ids";
import { getSetupWorkspaceRouteContext } from "../../../../features/setup/components/setup-workspace-route-context";

const route = getSetupWorkspaceRouteContext();
const viewStore = fromStore(route.viewStore);

let view = $derived(viewStore.current);

let pendingCardId = $state<SetupWorkspaceCalibrationCard["id"] | null>(null);
let accelPending = $state<{
  scopeKey: string | null;
  position: AccelCalibrationPosition | null;
} | null>(null);
let gyroResult = $state<{
  scopeKey: string | null;
  lifecycle: "running" | "complete" | "failed";
  detailText: string;
} | null>(null);
let replayReadonly = $derived(isReplayReadonly(view.activeSource));
let calibrationCards = $derived.by(() =>
  view.calibrationSummary.cards.map((card) => {
    if (card.id !== "gyro" || gyroResult?.scopeKey !== view.activeScopeKey) {
      return card;
    }

    const statusText =
      gyroResult.lifecycle === "running" ? "Running" : gyroResult.lifecycle === "complete" ? "Complete" : "Failed";

    return {
      ...card,
      lifecycle: gyroResult.lifecycle,
      statusText,
      detailText: gyroResult.detailText,
      actionLabel:
        gyroResult.lifecycle === "complete"
          ? "Calibrate gyroscope again"
          : gyroResult.lifecycle === "failed"
            ? "Retry gyroscope calibration"
            : "Calibrating gyroscope…",
    } satisfies SetupWorkspaceCalibrationCard;
  }),
);

const accelPositions: Array<{
  id: AccelCalibrationPosition;
  label: string;
}> = [
  { id: "level", label: "Level" },
  { id: "left", label: "Left side" },
  { id: "right", label: "Right side" },
  { id: "nose_down", label: "Nose down" },
  { id: "nose_up", label: "Nose up" },
  { id: "back", label: "On its back" },
];

function isActionPending(card: SetupWorkspaceCalibrationCard): boolean {
  if (pendingCardId === card.id) {
    return true;
  }
  if (card.id !== "accel" || accelPending?.scopeKey !== view.activeScopeKey) {
    return false;
  }

  return accelPending.position === null
    ? card.lifecycle === "not_started"
    : card.lifecycle === "running" && card.requestedPosition === accelPending.position;
}

function accelPositionState(
  card: SetupWorkspaceCalibrationCard,
  position: AccelCalibrationPosition,
): "complete" | "current" | "upcoming" {
  if (card.lifecycle === "complete") {
    return "complete";
  }
  if (card.lifecycle !== "running" || !card.requestedPosition) {
    return "upcoming";
  }

  const currentIndex = accelPositions.findIndex((item) => item.id === card.requestedPosition);
  const positionIndex = accelPositions.findIndex((item) => item.id === position);
  if (positionIndex < currentIndex) {
    return "complete";
  }
  return positionIndex === currentIndex ? "current" : "upcoming";
}

async function runAccelAction(card: SetupWorkspaceCalibrationCard) {
  if (card.lifecycle === "running") {
    if (!card.requestedPosition) {
      return;
    }
    accelPending = {
      scopeKey: view.activeScopeKey,
      position: card.requestedPosition,
    };
    await calibrateAccelConfirm(card.requestedPosition);
    return;
  }

  accelPending = {
    scopeKey: view.activeScopeKey,
    position: null,
  };
  trackAnalytics("calibration_started", { kind: "accelerometer" });
  await calibrateAccel();
}

async function runGyroAction() {
  gyroResult = {
    scopeKey: view.activeScopeKey,
    lifecycle: "running",
    detailText: "Keep the vehicle completely still while the flight controller measures gyroscope offsets.",
  };
  trackAnalytics("calibration_started", { kind: "gyroscope" });
  await calibrateGyro();
  gyroResult = {
    scopeKey: view.activeScopeKey,
    lifecycle: "complete",
    detailText:
      "Gyroscope calibration completed successfully. Keep the vehicle still until any follow-up status text settles.",
  };
  trackAnalytics("calibration_completed", { kind: "gyroscope", result: "success" });
}

async function runCompassAction(card: SetupWorkspaceCalibrationCard) {
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
}

async function runCalibrationAction(card: SetupWorkspaceCalibrationCard) {
  if (replayReadonly || card.actionAvailability !== "available" || !card.actionLabel || isActionPending(card)) {
    return;
  }

  pendingCardId = card.id;
  try {
    if (card.id === "accel") {
      await runAccelAction(card);
    } else if (card.id === "gyro") {
      await runGyroAction();
    } else if (card.id === "compass") {
      await runCompassAction(card);
    }
  } catch (error) {
    if (card.id === "accel") {
      accelPending = null;
    } else if (card.id === "gyro") {
      gyroResult = {
        scopeKey: view.activeScopeKey,
        lifecycle: "failed",
        detailText: "Gyroscope calibration failed. Keep the vehicle still, review status text, and retry.",
      };
    }
    notifyUnknownError(`${card.title} calibration action failed`, error, {
      id: `setup-${card.id}-calibration-action-failed`,
    });
    trackAnalytics("calibration_completed", { kind: card.id, result: "error" });
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
  description="Run guided accelerometer, gyroscope, and compass calibration against the active live vehicle."
  testId={setupWorkspaceTestIds.calibrationSection}
>
  {#snippet body()}
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
        {#each calibrationCards as card (card.id)}
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

            {#if card.id === "accel" && (card.lifecycle === "running" || card.lifecycle === "complete")}
              <ol class="grid gap-2 sm:grid-cols-2" aria-label="Accelerometer calibration positions">
                {#each accelPositions as position, index (position.id)}
                  {@const positionState = accelPositionState(card, position.id)}
                  <li
                    class={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${positionState === "current" ? "border-accent-primary/60 bg-accent-primary/10 text-text-primary" : positionState === "complete" ? "border-success/40 bg-success/10 text-text-primary" : "border-border bg-bg-primary/50 text-text-secondary"}`}
                    aria-current={positionState === "current" ? "step" : undefined}
                  >
                    <span class="flex size-6 shrink-0 items-center justify-center rounded-full border border-current text-xs font-semibold">
                      {positionState === "complete" ? "✓" : index + 1}
                    </span>
                    <span>{position.label}</span>
                  </li>
                {/each}
              </ol>
            {/if}

            {#if card.actionLabel}
              <Button
                class="self-start"
                disabled={replayReadonly || card.actionAvailability !== "available" || isActionPending(card)}
                onclick={() => runCalibrationAction(card)}
                testId={`${setupWorkspaceTestIds.calibrationActionPrefix}-${card.id}`}
                variant="secondary"
              >
                {isActionPending(card) ? "Working…" : card.actionLabel}
              </Button>
            {/if}
          </SetupSectionCard>
        {/each}
      </div>

      <SetupGuideCard title="Calibration steps" description="Complete calibrations on a stable bench with the vehicle made safe.">
        <SetupFieldStack divided>
          <p class="pt-3 first:pt-0">Disconnect or secure propulsion before starting any calibration that can move surfaces or motors.</p>
          <p class="pt-3 first:pt-0">For accelerometer calibration, rest the vehicle in each requested orientation. Exact angles are less important than keeping it completely still after capture.</p>
          <p class="pt-3 first:pt-0">For gyroscope calibration, place the vehicle level on a stable surface and do not touch it until calibration completes.</p>
          <p class="pt-3 first:pt-0">For compass calibration, rotate the vehicle through all orientations and accept the result only after the vehicle reports completion.</p>
          <p class="pt-3 first:pt-0">Re-run pre-arm checks after calibration so sensor health and status text reflect the new offsets.</p>
        </SetupFieldStack>
      </SetupGuideCard>
  {/snippet}
</SetupSectionShell>

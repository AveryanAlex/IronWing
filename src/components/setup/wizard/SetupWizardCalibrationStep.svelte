<script lang="ts">
import { calibrateAccel, calibrateCompassStart } from "../../../calibration";
import type {
  SetupWorkspaceCalibrationCard,
  SetupWorkspaceStoreState,
} from "../../../lib/stores/setup-workspace";
import { setupWorkspaceTestIds } from "../setup-workspace-test-ids";

let {
  view,
  onAdvance,
}: {
  view: SetupWorkspaceStoreState;
  onAdvance: () => void;
} = $props();

let commandError = $state<string | null>(null);
let pending = $state<"accel" | "compass" | null>(null);

let cards = $derived(view.calibrationSummary.cards);
let accelCard = $derived<SetupWorkspaceCalibrationCard | null>(
  cards.find((card) => card.id === "accel") ?? null,
);
let compassCard = $derived<SetupWorkspaceCalibrationCard | null>(
  cards.find((card) => card.id === "compass") ?? null,
);
let continueDisabled = $derived(
  accelCard?.lifecycle !== "complete" || compassCard?.lifecycle !== "complete",
);

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function runAccel() {
  if (pending !== null) {
    return;
  }

  commandError = null;
  pending = "accel";
  try {
    await calibrateAccel();
  } catch (error) {
    commandError = `Accelerometer calibration failed: ${formatError(error)}`;
  } finally {
    pending = null;
  }
}

async function runCompass() {
  if (pending !== null) {
    return;
  }

  commandError = null;
  pending = "compass";
  try {
    await calibrateCompassStart(0);
  } catch (error) {
    commandError = `Compass calibration failed: ${formatError(error)}`;
  } finally {
    pending = null;
  }
}

function handleContinue() {
  if (continueDisabled) {
    return;
  }

  onAdvance();
}
</script>

<div class="space-y-4">
  <p class="text-sm text-text-secondary">
    Run accelerometer and compass calibration from the vehicle. Both lifecycles must report
    complete before we continue to the next step.
  </p>

  <div
    class="grid gap-3 rounded-2xl border border-border bg-bg-primary/80 p-4 md:grid-cols-2"
    data-testid={setupWorkspaceTestIds.wizardStepCalibSummary}
  >
    {#if accelCard}
      <article class="rounded-2xl border border-border bg-bg-secondary/60 p-3">
        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
          {accelCard.title}
        </p>
        <p class="mt-2 text-sm font-semibold text-text-primary">{accelCard.statusText}</p>
        <p class="mt-1 text-[11px] uppercase tracking-[0.16em] text-text-muted">
          {accelCard.lifecycle}
        </p>
        <button
          class="mt-3 rounded-full border border-border bg-bg-primary px-3 py-1 text-xs font-semibold text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
          data-testid={setupWorkspaceTestIds.wizardStepCalibAccel}
          disabled={view.checkpoint.blocksActions || pending !== null}
          onclick={runAccel}
          type="button"
        >
          {pending === "accel" ? "Calibrating…" : "Calibrate accelerometer"}
        </button>
      </article>
    {/if}

    {#if compassCard}
      <article class="rounded-2xl border border-border bg-bg-secondary/60 p-3">
        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
          {compassCard.title}
        </p>
        <p class="mt-2 text-sm font-semibold text-text-primary">{compassCard.statusText}</p>
        <p class="mt-1 text-[11px] uppercase tracking-[0.16em] text-text-muted">
          {compassCard.lifecycle}
        </p>
        <button
          class="mt-3 rounded-full border border-border bg-bg-primary px-3 py-1 text-xs font-semibold text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
          data-testid={setupWorkspaceTestIds.wizardStepCalibCompass}
          disabled={view.checkpoint.blocksActions || pending !== null}
          onclick={runCompass}
          type="button"
        >
          {pending === "compass" ? "Calibrating…" : "Calibrate compass"}
        </button>
      </article>
    {/if}
  </div>

  {#if commandError}
    <div class="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
      {commandError}
    </div>
  {/if}

  <div class="flex flex-wrap gap-2">
    <button
      class="rounded-full border border-accent bg-accent/10 px-4 py-2 text-sm font-semibold text-accent hover:bg-accent/20 disabled:cursor-not-allowed disabled:border-border disabled:bg-bg-primary disabled:text-text-muted"
      data-testid={setupWorkspaceTestIds.wizardStepCalibContinue}
      disabled={continueDisabled || view.checkpoint.blocksActions}
      onclick={handleContinue}
      type="button"
    >
      Continue
    </button>
  </div>
</div>

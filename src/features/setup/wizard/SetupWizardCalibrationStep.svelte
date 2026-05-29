<script lang="ts">
import { calibrateAccel, calibrateCompassStart } from "../../../calibration";
import type {
  SetupWorkspaceCalibrationCard,
  SetupWorkspaceStoreState,
} from "../../../lib/stores/setup-workspace";
import { Button, Card, Eyebrow, HelperText } from "../../../components/ui";
import { setupWorkspaceTestIds } from "../setup-workspace-test-ids";
import SetupWizardActions from "../shared/SetupWizardActions.svelte";
import SetupWizardApplyError from "../shared/SetupWizardApplyError.svelte";

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
  <HelperText>
    Run accelerometer and compass calibration from the vehicle. Both lifecycles must report
    complete before we continue to the next step.
  </HelperText>

  <Card.Root class="grid md:grid-cols-2" surface="primary" density="compact" gap="compact" testId={setupWorkspaceTestIds.wizardStepCalibSummary}>
    {#if accelCard}
      <Card.Root as="article" surface="secondary" density="compact">
        <Eyebrow tracking="widest">
          {accelCard.title}
        </Eyebrow>
        <p class="mt-2 text-sm font-semibold text-text-primary">{accelCard.statusText}</p>
        <Eyebrow class="mt-1" tracking="widest">
          {accelCard.lifecycle}
        </Eyebrow>
        <Button
          variant="outline"
          size="sm"
          class="mt-3"
          testId={setupWorkspaceTestIds.wizardStepCalibAccel}
          disabled={view.checkpoint.blocksActions || pending !== null}
          onclick={runAccel}
        >
          {pending === "accel" ? "Calibrating…" : "Calibrate accelerometer"}
        </Button>
      </Card.Root>
    {/if}

    {#if compassCard}
      <Card.Root as="article" surface="secondary" density="compact">
        <Eyebrow tracking="widest">
          {compassCard.title}
        </Eyebrow>
        <p class="mt-2 text-sm font-semibold text-text-primary">{compassCard.statusText}</p>
        <Eyebrow class="mt-1" tracking="widest">
          {compassCard.lifecycle}
        </Eyebrow>
        <Button
          variant="outline"
          size="sm"
          class="mt-3"
          testId={setupWorkspaceTestIds.wizardStepCalibCompass}
          disabled={view.checkpoint.blocksActions || pending !== null}
          onclick={runCompass}
        >
          {pending === "compass" ? "Calibrating…" : "Calibrate compass"}
        </Button>
      </Card.Root>
    {/if}
  </Card.Root>

  <SetupWizardApplyError message={commandError} prefix="" />

  <SetupWizardActions
    primaryLabel="Continue"
    primaryDisabled={continueDisabled || view.checkpoint.blocksActions}
    primaryTestId={setupWorkspaceTestIds.wizardStepCalibContinue}
    onPrimary={handleContinue}
  />
</div>

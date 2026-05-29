<script lang="ts">
import { fromStore, get } from "svelte/store";

import { getParamsStoreContext } from "../../../app/shell/runtime-context";
import {
  buildParameterItemIndex,
  type ParameterItemModel,
} from "../../../lib/params/parameter-item-model";
import type { SetupWorkspaceStoreState } from "../../../lib/stores/setup-workspace";
import { Card, Eyebrow, Field, HelperText, NativeSelect } from "../../../components/ui";
import { setupWorkspaceTestIds } from "../setup-workspace-test-ids";
import SetupWizardActions from "../shared/SetupWizardActions.svelte";
import SetupWizardApplyError from "../shared/SetupWizardApplyError.svelte";
import SetupWizardHintCard from "../shared/SetupWizardHintCard.svelte";

type EnumOption = { code: number; label: string };

let {
  view,
  onAdvance,
}: {
  view: SetupWorkspaceStoreState;
  onAdvance: () => void;
} = $props();

const paramsStore = getParamsStoreContext();
const paramsState = fromStore(paramsStore);

let applyPending = $state(false);
let failureMessage = $state<string | null>(null);

let params = $derived(paramsState.current);
let itemIndex = $derived(buildParameterItemIndex(params.paramStore, params.metadata));
let monitorItem = $derived(itemIndex.get("BATT_MONITOR") ?? null);
let monitorOptions = $derived(resolveEnumOptions(params.metadata?.get("BATT_MONITOR")?.values));
let monitorSelectOptions = $derived(monitorOptions.map((option) => ({ value: String(option.code), label: option.label })));

// Mirror the expert section: bind the draft to staged → current value, letting
// `bind:value` write back through the $derived accessor.
let monitorDraft = $derived(
  String(
    params.stagedEdits.BATT_MONITOR?.nextValue
      ?? monitorItem?.value
      ?? "",
  ),
);

let currentMonitorLabel = $derived(
  monitorItem?.valueLabel ?? monitorItem?.valueText ?? "Unavailable",
);

async function handleApply() {
  if (applyPending) {
    return;
  }

  failureMessage = null;

  const stagedNames: string[] = [];

  if (monitorItem && !monitorItem.readOnly) {
    const nextValue = resolveDraftNumber(monitorDraft);
    if (nextValue !== null && nextValue !== monitorItem.value) {
      paramsStore.stageParameterEdit(monitorItem, nextValue);
      stagedNames.push(monitorItem.name);
    } else if (params.stagedEdits.BATT_MONITOR) {
      stagedNames.push("BATT_MONITOR");
    }
  }

  // Draft already matches the vehicle and nothing was staged — just advance.
  if (stagedNames.length === 0) {
    onAdvance();
    return;
  }

  applyPending = true;
  try {
    await paramsStore.applyStagedEdits(stagedNames);
  } finally {
    applyPending = false;
  }

  const snapshot = get(paramsStore);
  const retainedFailureMessages = stagedNames
    .map((name) => snapshot.retainedFailures[name])
    .filter((failure): failure is NonNullable<typeof failure> => failure != null)
    .map((failure) => `${failure.name}: ${failure.message}`);

  const phaseFailed = snapshot.applyPhase === "failed" || snapshot.applyPhase === "partial-failure";

  if (retainedFailureMessages.length > 0 || phaseFailed) {
    failureMessage = retainedFailureMessages.length > 0
      ? retainedFailureMessages.join(" · ")
      : snapshot.applyError ?? "Applying the battery monitor preset failed.";
    return;
  }

  onAdvance();
}

function resolveEnumOptions(values: { code: number; label: string }[] | undefined): EnumOption[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return values.filter((value) => Number.isFinite(value.code) && value.label.trim().length > 0);
}

function resolveDraftNumber(value: string): number | null {
  if (value.trim().length === 0) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
</script>

<div class="space-y-4">
  <HelperText>
    Pick the battery monitor backend that matches the installed power module.
    Most beginner builds use an analog voltage-and-current sensor.
  </HelperText>

  <Card.Root
    surface="elevated"
    density="compact"
    testId={setupWorkspaceTestIds.wizardStepBatterySummary}
  >
    <SetupWizardApplyError message={failureMessage} class="mb-2" />
    <Eyebrow tracking="widest">Current battery monitor</Eyebrow>
    <p class="mt-2 text-sm font-semibold text-text-primary">{currentMonitorLabel}</p>
    <HelperText class="mt-1" size="xs" tone="muted">BATT_MONITOR</HelperText>
  </Card.Root>

  {#if monitorItem && monitorOptions.length > 0}
    <Field.Root>
      <Field.Label>
        Battery monitor preset
      </Field.Label>
      <NativeSelect
        bind:value={monitorDraft}
        disabled={view.checkpoint.blocksActions || applyPending}
        options={monitorSelectOptions}
        testId={setupWorkspaceTestIds.wizardStepBatteryPreset}
      />
    </Field.Root>
  {/if}

  <SetupWizardHintCard>
    Need to tweak board pins, sensor scaling, or chemistry thresholds? Open
    the Battery Monitor section from the wizard footer for the expert layout.
  </SetupWizardHintCard>

  <SetupWizardActions
    primaryLabel="Apply and continue"
    primaryPendingLabel="Applying…"
    primaryPending={applyPending}
    primaryDisabled={view.checkpoint.blocksActions || !monitorItem}
    primaryTestId={setupWorkspaceTestIds.wizardStepBatteryApply}
    onPrimary={handleApply}
  />
</div>

<script lang="ts">
import { CircleAlert, KeyRound, ListChecks, Power, ShieldCheck } from "lucide-svelte";
import { fromStore } from "svelte/store";

import { getParamsStoreContext, getSessionStoreContext } from "../../../../app/shell/runtime-context";
import { requestPrearmChecks } from "../../../../calibration";
import { trackAnalytics } from "../../../../lib/analytics/client";
import { resolveDocsUrl } from "../../../../data/ardupilot-docs";
import { buildParameterItemIndex } from "../../../../lib/params/parameter-item-model";
import { derivePrearmModel, type PrearmSnapshot } from "../../../../lib/setup/prearm-model";
import { getVehicleSlug } from "../../../../lib/setup/vehicle-profile";
import type { SetupWorkspaceSection, SetupWorkspaceStoreState } from "../../../../lib/stores/setup-workspace";
import { armVehicle, disarmVehicle } from "../../../../telemetry";
import { ActionRow, Badge, Button, StagedBadge as SetupStagedBadge } from "../../../../components/ui";
import SetupBitmaskTable from "../../../../features/setup/shared/SetupBitmaskTable.svelte";
import SetupFieldStack from "../../../../features/setup/shared/SetupFieldStack.svelte";
import SetupGuideCard from "../../../../features/setup/shared/SetupGuideCard.svelte";
import SetupNotice from "../../../../features/setup/shared/SetupNotice.svelte";
import SetupParamSection from "../../../../features/setup/shared/SetupParamSection.svelte";
import SetupSectionCard from "../../../../features/setup/shared/SetupSectionCard.svelte";
import SetupSectionShell from "../../../../features/setup/components/SetupSectionShell.svelte";
import { setupWorkspaceTestIds } from "../../../../features/setup/setup-workspace-test-ids";
import {
  getSetupWorkspaceRouteContext,
  setupRouteSection,
} from "../../../../features/setup/components/setup-workspace-route-context";

const route = getSetupWorkspaceRouteContext();
const viewStore = fromStore(route.viewStore);

let view = $derived(viewStore.current);
let section = $derived(setupRouteSection(view, "arming"));

const paramsStore = getParamsStoreContext();
const sessionStore = getSessionStoreContext();
const paramsState = fromStore(paramsStore);
const sessionState = fromStore(sessionStore);
const armingRequireParams = [{ id: "ARMING_REQUIRE" }] as const;

let prearmSnapshot = $state<PrearmSnapshot | null>(null);
let requestPhase = $state<"idle" | "running">("idle");
let actionPhase = $state<"idle" | "arming" | "disarming">("idle");
let confirmArm = $state(false);
let commandError = $state<string | null>(null);

let params = $derived(paramsState.current);
let session = $derived(sessionState.current);
let itemIndex = $derived(buildParameterItemIndex(params.paramStore, params.metadata));
let actionsBlocked = $derived(view.checkpoint.blocksActions);
let vehicleSlug = $derived(getVehicleSlug(session.sessionDomain.value?.vehicle_state?.vehicle_type ?? null));
let armed = $derived(session.sessionDomain.value?.vehicle_state?.armed === true);
let prearmModel = $derived(
  derivePrearmModel({
    scopeKey: view.activeScopeKey,
    liveConnected: session.sessionDomain.value?.connection.kind === "connected",
    armed,
    support: session.support,
    sensorHealth: session.sensorHealth,
    statusText: session.statusText,
    previousSnapshot: prearmSnapshot,
  }),
);
let armingDocsUrl = $derived(resolveDocsUrl("arming", vehicleSlug));
let prearmDocsUrl = $derived(resolveDocsUrl("prearm_safety_checks", vehicleSlug ?? undefined));
let armingCheckItem = $derived(itemIndex.get("ARMING_CHECK") ?? null);
let armingRequireItem = $derived(itemIndex.get("ARMING_REQUIRE") ?? null);
let armingCheckEntries = $derived.by(() => {
  const bitmask = params.metadata?.get("ARMING_CHECK")?.bitmask;
  const currentMask = params.stagedEdits.ARMING_CHECK?.nextValue ?? armingCheckItem?.value ?? null;
  if (!Array.isArray(bitmask) || !Number.isInteger(currentMask) || currentMask < 0) {
    return [];
  }

  return bitmask
    .filter(
      (entry) =>
        Number.isInteger(entry.bit) &&
        entry.bit >= 0 &&
        typeof entry.label === "string" &&
        entry.label.trim().length > 0,
    )
    .map((entry) => ({
      key: String(entry.bit),
      label: entry.label,
      checked: (currentMask & (1 << entry.bit)) !== 0,
    }));
});
let armingCheckValue = $derived(params.stagedEdits.ARMING_CHECK?.nextValue ?? armingCheckItem?.value ?? null);
let armingRequireValue = $derived(params.stagedEdits.ARMING_REQUIRE?.nextValue ?? armingRequireItem?.value ?? null);
let checksDisabled = $derived(armingCheckValue === 0);
let checksPartial = $derived(armingCheckValue !== null && armingCheckValue !== 0 && armingCheckValue !== 1);
let armingMethodDisabled = $derived(armingRequireValue === 0);

$effect(() => {
  const nextSnapshot = prearmModel.snapshot;
  if (!nextSnapshot) {
    return;
  }

  const currentIds = prearmSnapshot?.blockers.map((blocker) => blocker.id).join("|") ?? "";
  const nextIds = nextSnapshot.blockers.map((blocker) => blocker.id).join("|");
  if (prearmSnapshot?.scopeKey !== nextSnapshot.scopeKey || currentIds !== nextIds) {
    prearmSnapshot = nextSnapshot;
  }
});

$effect(() => {
  if (armed) {
    confirmArm = false;
  }
});

function toggleArmingCheck(bit: number) {
  if (actionsBlocked || !armingCheckItem || armingCheckItem.readOnly === true) {
    return;
  }

  const currentMask = params.stagedEdits.ARMING_CHECK?.nextValue ?? armingCheckItem.value;
  if (!Number.isInteger(currentMask) || currentMask < 0) {
    return;
  }

  paramsStore.stageParameterEdit(armingCheckItem, currentMask ^ (1 << bit));
}

function setArmingChecks(checked: boolean) {
  if (actionsBlocked || !armingCheckItem || armingCheckItem.readOnly === true || armingCheckEntries.length === 0) {
    return;
  }

  const nextMask = checked ? armingCheckEntries.reduce((mask, entry) => mask | (1 << Number(entry.key)), 0) : 0;
  paramsStore.stageParameterEdit(armingCheckItem, nextMask);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function handleRequestChecks() {
  if (actionsBlocked || !prearmModel.canRequestChecks || requestPhase === "running") {
    return;
  }

  commandError = null;
  requestPhase = "running";
  trackAnalytics("prearm_checks_requested", {
    connected: session.sessionDomain.value?.connection.kind === "connected" ? 1 : 0,
  });
  try {
    await requestPrearmChecks();
  } catch (error) {
    commandError = `Pre-arm check request failed: ${formatError(error)}`;
  } finally {
    requestPhase = "idle";
  }
}

async function handleArm() {
  if (actionsBlocked || !prearmModel.canAttemptArm || actionPhase !== "idle") {
    return;
  }

  if (!confirmArm) {
    confirmArm = true;
    return;
  }

  commandError = null;
  actionPhase = "arming";
  trackAnalytics("arming_command_requested", { action: "arm", force: 0 });
  try {
    await armVehicle(false);
    confirmArm = false;
  } catch (error) {
    commandError = `Arm request failed: ${formatError(error)}`;
  } finally {
    actionPhase = "idle";
  }
}

async function handleDisarm() {
  if (actionsBlocked || !prearmModel.canAttemptDisarm || actionPhase !== "idle") {
    return;
  }

  commandError = null;
  actionPhase = "disarming";
  trackAnalytics("arming_command_requested", { action: "disarm", force: 0 });
  try {
    await disarmVehicle(false);
  } catch (error) {
    commandError = `Disarm request failed: ${formatError(error)}`;
  } finally {
    actionPhase = "idle";
  }
}
</script>

<SetupSectionShell
  sectionId={section.id}
  eyebrow={section.title}
  title="Review pre-arm blockers and live arm controls"
  description="Review live support, sensor health, and status text before arming. Request fresh pre-arm checks when blockers are present; parameter edits are staged for review before they are applied."
  testId={setupWorkspaceTestIds.armingSection}
  docs={[
    { url: prearmDocsUrl, label: "Pre-arm docs", testId: setupWorkspaceTestIds.prearmDocsLink },
    { url: armingDocsUrl, label: "Arming docs", testId: setupWorkspaceTestIds.armingDocsLink },
  ]}
>
  {#snippet body()}
    {#snippet requestChecksAction()}
      <Button
        variant="outline"
        testId={setupWorkspaceTestIds.armingRefresh}
        disabled={actionsBlocked || !prearmModel.canRequestChecks || requestPhase === "running"}
        onclick={handleRequestChecks}
      >
          {requestPhase === "running" ? "Requesting checks…" : "Request pre-arm checks"}
      </Button>
    {/snippet}

    <div class="grid gap-3 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <SetupSectionCard
        icon={ShieldCheck}
        title="Pre-arm readiness"
        surface="elevated"
        testId={setupWorkspaceTestIds.armingSummary}
        actions={requestChecksAction}
      >
        <div data-arming-state={prearmModel.state}>
          <p class="text-base font-semibold text-text-primary" data-testid={setupWorkspaceTestIds.armingReadiness}>
            {prearmModel.statusText}
          </p>
          <p class="mt-2 text-sm leading-6 text-text-secondary">{prearmModel.detailText}</p>

          {#if prearmModel.requestChecksBlockedReason}
            <p class="mt-3 text-xs leading-5 text-warning">{prearmModel.requestChecksBlockedReason}</p>
          {/if}
        </div>
      </SetupSectionCard>

      <SetupSectionCard icon={Power} title="Live control" surface="elevated">
        <p class={`text-base font-semibold ${armed ? "text-danger" : "text-text-primary"}`}>
          {armed ? "Armed" : "Disarmed"}
        </p>
        <p class="mt-2 text-sm text-text-secondary">
          {armed
            ? "The vehicle currently reports ARMED. Disarm immediately if conditions become unsafe."
            : prearmModel.canAttemptArm
              ? "Current pre-arm state allows an arm request."
              : "Arm stays blocked until the vehicle reports a healthy pre-arm state."}
        </p>

        <ActionRow align="start" class="mt-4">
          {#if armed}
            <Button
              variant="destructive"
              testId={setupWorkspaceTestIds.armingDisarm}
              disabled={actionsBlocked || !prearmModel.canAttemptDisarm || actionPhase !== "idle"}
              onclick={handleDisarm}
            >
              {actionPhase === "disarming" ? "Disarming…" : "Disarm"}
            </Button>
          {:else}
            <Button
              tone="success"
              variant="soft"
              testId={setupWorkspaceTestIds.armingArm}
              disabled={actionsBlocked || (!confirmArm && !prearmModel.canAttemptArm) || actionPhase !== "idle"}
              onclick={handleArm}
            >
              {#if actionPhase === "arming"}
                Arming…
              {:else if confirmArm}
                Confirm arm
              {:else}
                Arm
              {/if}
            </Button>
            {#if confirmArm}
              <Button variant="secondary" onclick={() => (confirmArm = false)}>Cancel</Button>
            {/if}
          {/if}
        </ActionRow>
      </SetupSectionCard>
    </div>

    {#if commandError}
      <SetupNotice tone="danger" testId={setupWorkspaceTestIds.armingFailure}>{commandError}</SetupNotice>
    {/if}

    {#if checksDisabled}
      <SetupNotice tone="danger" testId={`${setupWorkspaceTestIds.armingBannerPrefix}-checks-disabled`}>
        ARMING_CHECK is disabled, so the vehicle can arm without normal pre-flight safety validation.
      </SetupNotice>
    {:else if checksPartial}
      <SetupNotice tone="warning" testId={`${setupWorkspaceTestIds.armingBannerPrefix}-checks-partial`}>
        ARMING_CHECK is using a partial check set. Review the disabled checks and request fresh pre-arm checks before flight.
      </SetupNotice>
    {/if}

    {#if armingMethodDisabled}
      <SetupNotice tone="warning" testId={`${setupWorkspaceTestIds.armingBannerPrefix}-method-disabled`}>
        ARMING_REQUIRE is disabled, so GCS arming can bypass the physical arming gesture safeguards.
      </SetupNotice>
    {/if}

    {#if prearmModel.blockers.length > 0}
      <SetupSectionCard icon={CircleAlert} title="Current blockers" surface="elevated" testId={setupWorkspaceTestIds.armingBlockers}>
        <SetupFieldStack divided>
          {#each prearmModel.blockers as blocker (blocker.id)}
            <div class="flex items-start justify-between gap-3 pt-3 first:pt-0">
              <div>
                <p class="text-sm font-semibold text-text-primary">{blocker.category}</p>
                <p class="mt-1 text-sm text-text-secondary">{blocker.rawText}</p>
                <p class="mt-2 text-xs leading-5 text-text-muted">{blocker.guidance}</p>
              </div>
              {#if blocker.stale}
                <Badge variant="warning">stale</Badge>
              {/if}
            </div>
          {/each}
        </SetupFieldStack>
      </SetupSectionCard>
    {/if}

    <div class="grid gap-3 xl:grid-cols-2">
      <SetupSectionCard
        icon={ListChecks}
        title={armingCheckItem?.label ?? "Arming checks"}
        description="Use the default all-checks setting when possible. Toggling a check stages the updated ARMING_CHECK value for later apply."
        surface="elevated"
        testId={setupWorkspaceTestIds.armingCheckChecklist}
      >
        {#if params.stagedEdits.ARMING_CHECK}
          <p>
            <SetupStagedBadge name="ARMING_CHECK" onUnstage={paramsStore.discardStagedEdit} testId={`${setupWorkspaceTestIds.armingStagedPrefix}-ARMING_CHECK`} />
          </p>
        {/if}

        {#if armingCheckEntries.length > 0}
          <SetupBitmaskTable
            clearAllLabel="Disable all"
            description="Most vehicles should keep all pre-arm checks enabled. Disable individual checks only for documented bench procedures."
            disabled={actionsBlocked || armingCheckItem?.readOnly === true}
            embedded
            items={armingCheckEntries}
            onSetAll={setArmingChecks}
            onToggle={(entry) => toggleArmingCheck(Number(entry.key))}
            title="Configured pre-arm checks"
          />
        {:else}
          <p class="text-sm text-text-secondary">No matching settings are available for this firmware.</p>
        {/if}
      </SetupSectionCard>

      <SetupParamSection
        id="arming-require"
        icon={KeyRound}
        title={armingRequireItem?.label ?? "Arming method"}
        description="Choose how the vehicle can be armed. Keep arming safeguards enabled unless the vehicle documentation and operating procedure require a different value."
        params={armingRequireParams}
        disabled={actionsBlocked}
        surface="elevated"
        testIdPrefix="setup-workspace-arming"
      />
    </div>

    <SetupGuideCard title="Pre-arm safety" description="ArduPilot's default all-checks behavior is the safest baseline for routine operation.">
      <p>Request checks after correcting blockers and before arming. Keep personnel clear of propellers, wheels, and control surfaces whenever an arm request is possible.</p>
    </SetupGuideCard>
  {/snippet}
</SetupSectionShell>

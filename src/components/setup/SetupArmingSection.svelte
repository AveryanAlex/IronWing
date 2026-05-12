<script lang="ts">
import { fromStore } from "svelte/store";

import {
  getParamsStoreContext,
  getSessionStoreContext,
} from "../../app/shell/runtime-context";
import { requestPrearmChecks } from "../../calibration";
import { resolveDocsUrl } from "../../data/ardupilot-docs";
import {
  buildParameterItemIndex,
  type ParameterItemModel,
} from "../../lib/params/parameter-item-model";
import {
  ARMING_REQUIRE_OPTIONS,
  buildArmingRecoveryReasons,
  derivePrearmModel,
  type PrearmSnapshot,
} from "../../lib/setup/prearm-model";
import { getVehicleSlug } from "../../lib/setup/vehicle-profile";
import type {
  SetupWorkspaceSection,
  SetupWorkspaceStoreState,
} from "../../lib/stores/setup-workspace";
import { armVehicle, disarmVehicle } from "../../telemetry";
import { Banner } from "../ui";
import SetupBitmaskChecklist from "./shared/SetupBitmaskChecklist.svelte";
import SetupSectionShell from "./SetupSectionShell.svelte";
import { setupWorkspaceTestIds } from "./setup-workspace-test-ids";

let {
  section,
  view,
  onSelectRecovery,
}: {
  section: SetupWorkspaceSection;
  view: SetupWorkspaceStoreState;
  onSelectRecovery: () => void;
} = $props();

const paramsStore = getParamsStoreContext();
const sessionStore = getSessionStoreContext();
const paramsState = fromStore(paramsStore);
const sessionState = fromStore(sessionStore);

let draftValues = $state<Record<string, string>>({});
let prearmSnapshot = $state<PrearmSnapshot | null>(null);
let requestPhase = $state<"idle" | "running">("idle");
let actionPhase = $state<"idle" | "arming" | "disarming">("idle");
let confirmArm = $state(false);
let commandError = $state<string | null>(null);

let params = $derived(paramsState.current);
let session = $derived(sessionState.current);
let itemIndex = $derived(buildParameterItemIndex(params.paramStore, params.metadata));
let actionsBlocked = $derived(view.checkpoint.blocksActions || section.availability === "blocked");
let vehicleSlug = $derived(getVehicleSlug(session.sessionDomain.value?.vehicle_state?.vehicle_type ?? null));
let armed = $derived(session.sessionDomain.value?.vehicle_state?.armed === true);
let armingRecoveryReasons = $derived(buildArmingRecoveryReasons({
  paramStore: params.paramStore,
  metadata: params.metadata,
}));
let prearmModel = $derived(derivePrearmModel({
  scopeKey: view.activeScopeKey,
  liveConnected: session.sessionDomain.value?.connection.kind === "connected",
  armed,
  support: session.support,
  sensorHealth: session.sensorHealth,
  statusText: session.statusText,
  previousSnapshot: prearmSnapshot,
}));
let armingDocsUrl = $derived(resolveDocsUrl("arming", vehicleSlug));
let prearmDocsUrl = $derived(resolveDocsUrl("prearm_safety_checks", vehicleSlug ?? undefined));
let armingCheckItem = $derived(itemIndex.get("ARMING_CHECK") ?? null);
let armingRequireItem = $derived(itemIndex.get("ARMING_REQUIRE") ?? null);
let armingRequireOptions = $derived.by(() => {
  const values = params.metadata?.get("ARMING_REQUIRE")?.values;
  if (!Array.isArray(values)) {
    return [];
  }

  return values.filter((entry) => Number.isFinite(entry.code) && entry.label.trim().length > 0);
});
let armingRequireRenderedOptions = $derived(
  armingRequireOptions.length > 0
    ? armingRequireOptions
    : ARMING_REQUIRE_OPTIONS.map((option) => ({ code: option.value, label: option.label })),
);
let armingCheckEntries = $derived.by(() => {
  const bitmask = params.metadata?.get("ARMING_CHECK")?.bitmask;
  const currentMask = params.stagedEdits.ARMING_CHECK?.nextValue ?? armingCheckItem?.value ?? null;
  if (!Array.isArray(bitmask) || !Number.isInteger(currentMask) || currentMask < 0) {
    return [];
  }

  return bitmask
    .filter((entry) => Number.isInteger(entry.bit) && entry.bit >= 0 && typeof entry.label === "string" && entry.label.trim().length > 0)
    .map((entry) => ({
      key: String(entry.bit),
      label: entry.label,
      checked: (currentMask & (1 << entry.bit)) !== 0,
    }));
});
let armingRequireDraft = $derived.by(() => draftValue("ARMING_REQUIRE", armingRequireItem?.value ?? null));
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

function item(name: string): ParameterItemModel | null {
  return itemIndex.get(name) ?? null;
}

function currentValueText(item: ParameterItemModel | null): string {
  return item?.valueLabel ?? item?.valueText ?? "Unavailable";
}

function draftValue(name: string, fallback: number | null): string {
  if (draftValues[name] !== undefined) {
    return draftValues[name];
  }

  const stagedValue = params.stagedEdits[name]?.nextValue;
  if (typeof stagedValue === "number" && Number.isFinite(stagedValue)) {
    return String(stagedValue);
  }

  return fallback === null ? "" : String(fallback);
}

function setDraft(name: string, value: string) {
  draftValues = {
    ...draftValues,
    [name]: value,
  };
}

function resolveDraftNumber(name: string, fallback: number | null): number | null {
  const raw = draftValue(name, fallback).trim();
  if (raw.length === 0) {
    return null;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function isQueued(name: string, fallback: number | null): boolean {
  const nextValue = resolveDraftNumber(name, fallback);
  return nextValue !== null && params.stagedEdits[name]?.nextValue === nextValue;
}

function canStageRequire(): boolean {
  if (actionsBlocked || !armingRequireItem || armingRequireItem.readOnly === true || armingRequireOptions.length === 0) {
    return false;
  }

  const nextValue = resolveDraftNumber("ARMING_REQUIRE", armingRequireItem.value);
  return nextValue !== null
    && armingRequireItem.value !== nextValue
    && params.stagedEdits.ARMING_REQUIRE?.nextValue !== nextValue;
}

function stageRequire() {
  if (!canStageRequire() || !armingRequireItem) {
    return;
  }

  const nextValue = resolveDraftNumber("ARMING_REQUIRE", armingRequireItem.value);
  if (nextValue === null) {
    return;
  }

  paramsStore.stageParameterEdit(armingRequireItem, nextValue);
}

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

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function handleRequestChecks() {
  if (actionsBlocked || !prearmModel.canRequestChecks || requestPhase === "running") {
    return;
  }

  commandError = null;
  requestPhase = "running";
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
  eyebrow={section.title}
  title="Review pre-arm blockers and live arm controls"
  description="Review live support, sensor health, and status text here before you arm. If a check is blocked, request fresh checks or open Full Parameters for deeper inspection; parameter edits still queue in the review tray."
  testId={setupWorkspaceTestIds.armingSection}
>
  {#snippet actions()}
    {#if prearmDocsUrl}
      <a class="rounded-md border border-border bg-bg-primary/80 px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent" data-testid={setupWorkspaceTestIds.prearmDocsLink} href={prearmDocsUrl} rel="noreferrer" target="_blank">Pre-arm docs</a>
    {/if}
    {#if armingDocsUrl}
      <a class="rounded-md border border-border bg-bg-primary/80 px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent" data-testid={setupWorkspaceTestIds.armingDocsLink} href={armingDocsUrl} rel="noreferrer" target="_blank">Arming docs</a>
    {/if}
  {/snippet}

  {#snippet body()}
      <div class="grid gap-3 xl:grid-cols-[minmax(0,1fr)_20rem]">
    <div
      class="rounded-lg border border-border bg-bg-primary/80 p-3"
      data-testid={setupWorkspaceTestIds.armingSummary}
      data-arming-state={prearmModel.state}
    >
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Pre-arm readiness</p>
          <p class="mt-2 text-base font-semibold text-text-primary" data-testid={setupWorkspaceTestIds.armingReadiness}>
            {prearmModel.statusText}
          </p>
          <p class="mt-2 text-sm leading-6 text-text-secondary">{prearmModel.detailText}</p>
        </div>
        <button
          class="rounded-md border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
          data-testid={setupWorkspaceTestIds.armingRefresh}
          disabled={actionsBlocked || !prearmModel.canRequestChecks || requestPhase === "running"}
          onclick={handleRequestChecks}
          type="button"
        >
          {requestPhase === "running" ? "Requesting checks…" : "Request pre-arm checks"}
        </button>
      </div>

      {#if prearmModel.requestChecksBlockedReason}
        <p class="mt-3 text-xs leading-5 text-warning">{prearmModel.requestChecksBlockedReason}</p>
      {/if}
    </div>

    <div class="rounded-lg border border-border bg-bg-primary/80 p-3">
      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Live control</p>
      <p class={`mt-2 text-base font-semibold ${armed ? "text-danger" : "text-text-primary"}`}>
        {armed ? "Armed" : "Disarmed"}
      </p>
      <p class="mt-2 text-sm text-text-secondary">
        {armed
          ? "The vehicle currently reports ARMED. Disarm immediately if conditions become unsafe."
          : prearmModel.canAttemptArm
            ? "Current pre-arm state allows an arm request."
            : "Arm stays blocked until the current scope reports a healthy pre-arm state."}
      </p>

      <div class="mt-4 flex flex-wrap gap-2">
        {#if armed}
          <button
            class="rounded-md border border-danger/40 bg-danger/10 px-4 py-2 text-sm font-semibold text-danger transition hover:bg-danger/20 disabled:cursor-not-allowed disabled:opacity-60"
            data-testid={setupWorkspaceTestIds.armingDisarm}
            disabled={actionsBlocked || !prearmModel.canAttemptDisarm || actionPhase !== "idle"}
            onclick={handleDisarm}
            type="button"
          >
            {actionPhase === "disarming" ? "Disarming…" : "Disarm"}
          </button>
        {:else}
          <button
            class="rounded-md border border-success/40 bg-success/10 px-4 py-2 text-sm font-semibold text-success transition hover:bg-success/20 disabled:cursor-not-allowed disabled:opacity-60"
            data-testid={setupWorkspaceTestIds.armingArm}
            disabled={actionsBlocked || (!confirmArm && !prearmModel.canAttemptArm) || actionPhase !== "idle"}
            onclick={handleArm}
            type="button"
          >
            {#if actionPhase === "arming"}
              Arming…
            {:else if confirmArm}
              Confirm arm
            {:else}
              Arm
            {/if}
          </button>
          {#if confirmArm}
            <button class="rounded-md border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent" onclick={() => (confirmArm = false)} type="button">Cancel</button>
          {/if}
        {/if}
      </div>
    </div>
  </div>

      {#if commandError}
        <Banner severity="danger" title={commandError} testId={setupWorkspaceTestIds.armingFailure} />
      {/if}

      {#if checksDisabled}
        <Banner
          severity="danger"
          title="ARMING_CHECK is disabled, so the vehicle can arm without the normal pre-flight safety validation."
          testId={`${setupWorkspaceTestIds.armingBannerPrefix}-checks-disabled`}
        />
      {:else if checksPartial}
        <Banner
          severity="warning"
          title="ARMING_CHECK is using a partial bitmask. Review the missing checks and request fresh blocker scans before flight."
          testId={`${setupWorkspaceTestIds.armingBannerPrefix}-checks-partial`}
        />
      {/if}

      {#if armingMethodDisabled}
        <Banner
          severity="warning"
          title="ARMING_REQUIRE is disabled, so GCS arming can bypass the physical arming gesture safeguards."
          testId={`${setupWorkspaceTestIds.armingBannerPrefix}-method-disabled`}
        />
      {/if}

      {#if armingRecoveryReasons.length > 0}
        <div
          class="rounded-lg border border-warning/40 bg-warning/10 px-4 py-4 text-sm leading-6 text-warning"
          data-testid={setupWorkspaceTestIds.armingRecovery}
        >
          <p class="font-semibold text-text-primary">Arming parameter editors are staying fail-closed while metadata is partial.</p>
          <ul class="mt-2 list-disc space-y-1 pl-5">
            {#each armingRecoveryReasons as reason (reason)}
              <li>{reason}</li>
            {/each}
          </ul>
          <button
            class="mt-4 rounded-md border border-warning/50 bg-bg-primary/80 px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent"
            onclick={onSelectRecovery}
            type="button"
          >
            Open Full Parameters recovery
          </button>
        </div>
      {/if}

      {#if prearmModel.blockers.length > 0}
        <div class="rounded-lg border border-border bg-bg-primary/80 p-3" data-testid={setupWorkspaceTestIds.armingBlockers}>
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Current blockers</p>
          <div class="mt-4 space-y-3">
            {#each prearmModel.blockers as blocker (blocker.id)}
              <div class="rounded-lg border border-border bg-bg-secondary/60 p-3">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="text-sm font-semibold text-text-primary">{blocker.category}</p>
                    <p class="mt-1 text-sm text-text-secondary">{blocker.rawText}</p>
                    <p class="mt-2 text-xs leading-5 text-text-muted">{blocker.guidance}</p>
                  </div>
                  {#if blocker.stale}
                    <span class="rounded-full border border-warning/40 bg-warning/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-warning">stale</span>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <div class="grid gap-3 xl:grid-cols-2">
        <article class="rounded-lg border border-border bg-bg-primary/80 p-3" data-testid={setupWorkspaceTestIds.armingCheckChecklist}>
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">ARMING_CHECK</p>
          <p class="mt-2 text-sm text-text-secondary">
            Review the active pre-arm check mask here. Toggling a bit stages the updated mask in the shared review tray instead of applying it directly.
          </p>
          <p class="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-text-muted" data-testid={`${setupWorkspaceTestIds.armingCurrentPrefix}-ARMING_CHECK`}>
            Current · {currentValueText(armingCheckItem)}
          </p>
          {#if params.stagedEdits.ARMING_CHECK}
            <p class="mt-1 text-xs text-accent" data-testid={`${setupWorkspaceTestIds.armingStagedPrefix}-ARMING_CHECK`}>
              Queued · {params.stagedEdits.ARMING_CHECK.nextValueText}
            </p>
          {/if}

          {#if armingCheckEntries.length > 0}
            <div class="mt-4">
              <SetupBitmaskChecklist
                disabled={actionsBlocked || armingCheckItem?.readOnly === true}
                items={armingCheckEntries}
                onToggle={(entry) => toggleArmingCheck(Number(entry.key))}
                title="Configured pre-arm checks"
              />
            </div>
          {:else}
            <p class="mt-4 text-sm text-warning">ARMING_CHECK metadata is incomplete for this scope, so the checklist stays read-only.</p>
          {/if}
        </article>

        <article class="rounded-lg border border-border bg-bg-primary/80 p-3">
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">ARMING_REQUIRE</p>
          <p class="mt-2 text-sm text-text-secondary">
            Choose how the vehicle can be armed. This selector stays read-only when the current scope is missing the required option list.
          </p>
          <p class="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-text-muted" data-testid={`${setupWorkspaceTestIds.armingCurrentPrefix}-ARMING_REQUIRE`}>
            Current · {currentValueText(armingRequireItem)}
          </p>
          {#if params.stagedEdits.ARMING_REQUIRE}
            <p class="mt-1 text-xs text-accent" data-testid={`${setupWorkspaceTestIds.armingStagedPrefix}-ARMING_REQUIRE`}>
              Queued · {params.stagedEdits.ARMING_REQUIRE.nextValueText}
            </p>
          {/if}

          <div class="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
            <select
              class="w-full rounded-xl border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary"
              data-testid={`${setupWorkspaceTestIds.armingInputPrefix}-ARMING_REQUIRE`}
              disabled={actionsBlocked || armingRequireOptions.length === 0 || !armingRequireItem}
              onchange={(event) => setDraft("ARMING_REQUIRE", (event.currentTarget as HTMLSelectElement).value)}
              value={armingRequireDraft}
            >
              {#each armingRequireRenderedOptions as option (option.code)}
                <option value={String(option.code)}>{option.label}</option>
              {/each}
            </select>

            <button
              class="self-end rounded-md border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
              data-testid={`${setupWorkspaceTestIds.armingStageButtonPrefix}-ARMING_REQUIRE`}
              disabled={!canStageRequire()}
              onclick={stageRequire}
              type="button"
            >
              {isQueued("ARMING_REQUIRE", armingRequireItem?.value ?? null) ? "Queued" : "Stage"}
            </button>
          </div>
        </article>
      </div>
  {/snippet}
</SetupSectionShell>

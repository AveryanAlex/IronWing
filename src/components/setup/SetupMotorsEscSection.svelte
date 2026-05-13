<script lang="ts">
import { fromStore } from "svelte/store";

import {
  getParamsStoreContext,
  getSessionStoreContext,
} from "../../app/shell/runtime-context";
import { motorTest } from "../../calibration";
import { resolveDocsUrl } from "../../data/ardupilot-docs";
import {
  buildParameterItemIndex,
  type ParameterItemModel,
} from "../../lib/params/parameter-item-model";
import {
  MOTOR_TEST_BRIDGE_LIMIT,
  buildMotorTestRows,
  type MotorDirection,
  type MotorTestRow,
} from "../../lib/setup/motor-test-model";
import {
  deriveVehicleProfile,
  getVehicleSlug,
  type VehicleProfile,
} from "../../lib/setup/vehicle-profile";
import {
  getApMotorDiagramModel,
  getVtolLayoutModel,
  type MotorDiagramModel,
} from "../../lib/setup/vtol-layout-model";
import type {
  SetupWorkspaceSection,
  SetupWorkspaceStoreState,
} from "../../lib/stores/setup-workspace";
import SetupSectionShell from "./SetupSectionShell.svelte";
import { setupWorkspaceTestIds } from "./setup-workspace-test-ids";
import MotorDiagram from "./shared/MotorDiagram.svelte";

type DirectionResult = "correct" | "reversed";
type Tone = "info" | "warning" | "danger";
type Banner = { id: string; tone: Tone; text: string };
type ScopedLayoutSummary = {
  scopeKey: string;
  label: string;
  detail: string;
};

const MOTOR_TEST_THROTTLE_PCT = 5;
const MOTOR_TEST_DURATION_S = 2;

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

let testUnlocked = $state(false);
let activeMotorNumber = $state<number | null>(null);
let selectedMotorNumber = $state<number | null>(null);
let testSuccessByMotor = $state<Record<number, boolean>>({});
let directionResultByMotor = $state<Record<number, DirectionResult>>({});
let commandErrorByMotor = $state<Record<number, string>>({});
let trackedScopeKey = $state<string | null>(null);
let lastScopedGoodLayoutSummary = $state<ScopedLayoutSummary | null>(null);

let params = $derived(paramsState.current);
let session = $derived(sessionState.current);
let vehicleType = $derived(
  params.vehicleType ?? session.sessionDomain.value?.vehicle_state?.vehicle_type ?? null,
);
let itemIndex = $derived(buildParameterItemIndex(params.paramStore, params.metadata));
let appliedProfile = $derived(
  deriveVehicleProfile(vehicleType, {
    paramStore: params.paramStore,
    stagedEdits: {},
  }),
);
let previewProfile = $derived(
  deriveVehicleProfile(vehicleType, {
    paramStore: params.paramStore,
    stagedEdits: params.stagedEdits,
  }),
);
let layoutModel = $derived(resolveAppliedLayoutModel(appliedProfile));
let rows = $derived(buildMotorTestRows(layoutModel, {
  paramStore: params.paramStore,
  stagedEdits: params.stagedEdits,
}));
let docsUrl = $derived(resolveDocsUrl("motors_esc", getVehicleSlug(vehicleType)));
let liveConnected = $derived(session.sessionDomain.value?.connection.kind === "connected");
let testableCount = $derived(rows.filter((row) => row.testStatus === "available").length);
let bridgeLimitedCount = $derived(rows.filter((row) => row.testStatus === "unsupported-bridge").length);
let resolvedOwnerCount = $derived(rows.filter((row) => row.ownerStatus === "resolved").length);
let pendingReversalCount = $derived(
  rows.filter((row) => row.reversalParamName && params.stagedEdits[row.reversalParamName]).length,
);
let retainedReversalFailures = $derived(
  Object.values(params.retainedFailures).filter((failure) => /SERVO\d+_REVERSED/.test(failure.name)),
);
let unlockDisabledReason = $derived(resolveUnlockDisabledReason({
  checkpointBlocked: view.checkpoint.blocksActions,
  liveConnected,
  layoutModel,
  rowCount: rows.length,
}));
let layoutStateLabel = $derived(resolveLayoutStateLabel(appliedProfile, layoutModel));
let layoutStateDetail = $derived.by(() => {
  if (layoutModel) {
    return layoutModelDetail(layoutModel);
  }

  if (lastScopedGoodLayoutSummary && lastScopedGoodLayoutSummary.scopeKey === view.activeScopeKey) {
    return `Last scoped-good layout · ${lastScopedGoodLayoutSummary.label}. Testing stays blocked until truth returns.`;
  }

  return unresolvedLayoutDetail(appliedProfile);
});
let safetyStateLabel = $derived.by(() => {
  if (view.checkpoint.blocksActions) {
    return "Blocked by checkpoint";
  }

  if (!liveConnected) {
    return "Live link required";
  }

  if (unlockDisabledReason) {
    return "Fail-closed";
  }

  return testUnlocked ? "Unlocked" : "Locked";
});
let safetyStateDetail = $derived.by(() => {
  if (view.checkpoint.blocksActions) {
    return "The reboot or reconnect checkpoint is unresolved, so unlock, test, and reversal actions stay disabled in this section.";
  }

  if (!liveConnected) {
    return "Reconnect the live vehicle link before trying to unlock motor testing.";
  }

  if (unlockDisabledReason) {
    return unlockDisabledReason;
  }

  return testUnlocked
    ? `Direct row actions are live. Each test sends a ${MOTOR_TEST_THROTTLE_PCT}% pulse for ${MOTOR_TEST_DURATION_S} seconds.`
    : "Use the single safety unlock once, then test rows directly without extra confirmation prompts.";
});
let reversalStateLabel = $derived.by(() => {
  if (pendingReversalCount > 0) {
    return `${pendingReversalCount} queued`;
  }

  return `${resolvedOwnerCount}/${rows.length} owner-proven`;
});
let reversalStateDetail = $derived.by(() => {
  if (rows.length === 0) {
    return "Reversal staging is hidden until the section can prove motor rows and output ownership.";
  }

  if (pendingReversalCount > 0) {
    return "Queued SERVOx_REVERSED edits are sitting in the shared review tray and still require review + apply outside this section.";
  }

  return `${resolvedOwnerCount} rows can stage one-click SERVOx_REVERSED fixes. The rest stay diagnosis-only because ownership or reverse params are not provable.`;
});
let hasQueuedLayoutChange = $derived(
  previewProfile.quadPlaneEnabled !== appliedProfile.quadPlaneEnabled
    || previewProfile.frameParamFamily !== appliedProfile.frameParamFamily
    || previewProfile.frameClassValue !== appliedProfile.frameClassValue
    || previewProfile.frameTypeValue !== appliedProfile.frameTypeValue,
);
let banners = $derived.by(() => {
  const next: Banner[] = [];

  if (hasQueuedLayoutChange) {
    next.push({
      id: "queued-layout",
      tone: "warning",
      text: "Frame or VTOL changes are queued in the shared review tray. This section keeps showing the last applied layout and fails closed if the queued edits would change motor truth after the next reboot or refresh.",
    });
  }

  if (!layoutModel) {
    next.push({
      id: "layout-unavailable",
      tone: appliedProfile.isPlane ? "warning" : "info",
      text: unresolvedLayoutDetail(appliedProfile),
    });
  } else if (layoutModel.status === "preview-only") {
    next.push({
      id: "layout-preview",
      tone: "warning",
      text: `${layoutModel.message ?? "This layout is preview-only."} Direction-dependent testing stays blocked until the layout becomes authoritative.`,
    });
  } else if (layoutModel.status === "unsupported") {
    next.push({
      id: "layout-unsupported",
      tone: "danger",
      text: `${layoutModel.message ?? "The current layout is unsupported."} Motor rows stay fail-closed and one-click fixes stop at manual guidance.`,
    });
  }

  if (
    lastScopedGoodLayoutSummary
    && lastScopedGoodLayoutSummary.scopeKey === view.activeScopeKey
    && (!layoutModel || layoutModel.status !== "supported")
  ) {
    next.push({
      id: "last-good-layout",
      tone: "info",
      text: `Last scoped-good layout: ${lastScopedGoodLayoutSummary.label}. ${lastScopedGoodLayoutSummary.detail} Test buttons stay blocked until live truth returns for this scope.`,
    });
  }

  if (bridgeLimitedCount > 0) {
    next.push({
      id: "bridge-limit",
      tone: "info",
      text: `${bridgeLimitedCount} row${bridgeLimitedCount === 1 ? " is" : "s are"} visible above the current motor_test bridge window. They remain on-screen with explicit manual-only guidance instead of being silently hidden.`,
    });
  }

  return next;
});

$effect(() => {
  if (view.activeScopeKey !== trackedScopeKey) {
    trackedScopeKey = view.activeScopeKey;
    testUnlocked = false;
    activeMotorNumber = null;
    selectedMotorNumber = null;
    testSuccessByMotor = {};
    directionResultByMotor = {};
    commandErrorByMotor = {};
  }

  if (view.activeScopeKey && layoutModel?.status === "supported") {
    lastScopedGoodLayoutSummary = {
      scopeKey: view.activeScopeKey,
      label: resolveLayoutStateLabel(appliedProfile, layoutModel),
      detail: layoutModelDetail(layoutModel),
    };
  }
});

function resolveAppliedLayoutModel(profile: VehicleProfile): MotorDiagramModel | null {
  if (profile.frameParamFamily === "quadplane") {
    return getVtolLayoutModel(profile);
  }

  if (
    profile.frameParamFamily === "copter"
    && profile.frameClassValue !== null
    && profile.frameTypeValue !== null
  ) {
    return getApMotorDiagramModel(profile.frameClassValue, profile.frameTypeValue);
  }

  return null;
}

function resolveUnlockDisabledReason(input: {
  checkpointBlocked: boolean;
  liveConnected: boolean;
  layoutModel: MotorDiagramModel | null;
  rowCount: number;
}): string | null {
  if (input.checkpointBlocked) {
    return "Testing stays locked while the reboot/reconnect checkpoint is unresolved.";
  }

  if (!input.liveConnected) {
    return "Testing stays locked until the live vehicle link is connected for this scope.";
  }

  if (!input.layoutModel) {
    return "Testing stays locked because the active layout is unknown for this scope.";
  }

  if (input.layoutModel.status === "preview-only") {
    return "Testing stays locked because this layout is preview-only and motor ownership is still advisory.";
  }

  if (input.layoutModel.status === "unsupported") {
    return "Testing stays locked because the active layout is unsupported and motor order cannot be trusted here.";
  }

  if (input.rowCount === 0) {
    return "Testing stays locked because no mapped motors are available for this layout.";
  }

  return null;
}

function resolveLayoutStateLabel(profile: VehicleProfile, currentLayoutModel: MotorDiagramModel | null): string {
  if (currentLayoutModel) {
    if (currentLayoutModel.status === "supported") {
      return `${currentLayoutModel.className} ${currentLayoutModel.typeName}`;
    }

    if (currentLayoutModel.status === "preview-only") {
      return `Preview only · ${currentLayoutModel.typeName}`;
    }

    return `Unsupported · ${currentLayoutModel.typeName}`;
  }

  if (profile.isPlane) {
    switch (profile.planeVtolState) {
      case "enable-pending":
        return "VTOL enable pending";
      case "awaiting-refresh":
        return "Awaiting VTOL refresh";
      case "partial-refresh":
        return "Partial VTOL refresh";
      case "plain-plane":
      default:
        return "Plain Plane";
    }
  }

  return "Layout unavailable";
}

function layoutModelDetail(currentLayoutModel: MotorDiagramModel): string {
  if (currentLayoutModel.message) {
    return currentLayoutModel.message;
  }

  return `${currentLayoutModel.motors.length} mapped motors are visible in ArduPilot test order for this scope.`;
}

function unresolvedLayoutDetail(profile: VehicleProfile): string {
  if (profile.isPlane) {
    switch (profile.planeVtolState) {
      case "enable-pending":
        return "Q_ENABLE is staged but not yet applied. Keep motor testing locked until the vehicle reboots and the Q_FRAME_* family refreshes for the same scope.";
      case "awaiting-refresh":
        return "QuadPlane is enabled, but Q_FRAME_CLASS and Q_FRAME_TYPE have not refreshed yet. This section refuses to invent motor order, direction, or row ownership while that truth is missing.";
      case "partial-refresh":
        return "Only part of the Q_FRAME family is present. Finish the refresh before trusting any direction-dependent motor guidance here.";
      case "plain-plane":
      default:
        return "Plane firmware is still in plain fixed-wing mode for this scope. Enable VTOL in Frame & Orientation first, then refresh parameters before opening motor-direction work here.";
    }
  }

  return "The active scope does not currently expose a motor layout the section can trust.";
}

function bannerClass(tone: Tone): string {
  switch (tone) {
    case "warning":
      return "border-warning/40 bg-warning/10 text-warning";
    case "danger":
      return "border-danger/40 bg-danger/10 text-danger";
    case "info":
    default:
      return "border-border bg-bg-primary/80 text-text-secondary";
  }
}

function directionBadge(direction: MotorDirection): { label: string; className: string } {
  switch (direction) {
    case "cw":
      return {
        label: "CW ↻",
        className: "border-accent/30 bg-accent/10 text-accent",
      };
    case "ccw":
      return {
        label: "CCW ↺",
        className: "border-success/30 bg-success/10 text-success",
      };
    default:
      return {
        label: "Unknown",
        className: "border-border bg-bg-primary text-text-muted",
      };
  }
}

function testButtonDisabled(row: MotorTestRow): boolean {
  return !testUnlocked
    || activeMotorNumber !== null
    || !liveConnected
    || view.checkpoint.blocksActions
    || row.testStatus !== "available";
}

function testButtonLabel(row: MotorTestRow): string {
  if (activeMotorNumber === row.motorNumber) {
    return "Testing…";
  }

  if (row.testStatus === "unsupported-bridge") {
    return `Bridge supports 1..=${MOTOR_TEST_BRIDGE_LIMIT}`;
  }

  if (row.testStatus === "blocked-layout") {
    return "Testing blocked";
  }

  return `Test motor ${row.motorNumber}`;
}

function rowAvailabilityText(row: MotorTestRow): string {
  if (row.testReason) {
    return row.testReason;
  }

  return `Bench pulse available at ${MOTOR_TEST_THROTTLE_PCT}% for ${MOTOR_TEST_DURATION_S}s once the section is unlocked.`;
}

function rowOwnerText(row: MotorTestRow): string {
  if (row.ownerStatus === "resolved" && row.servoIndex !== null) {
    return `Owner proven · SERVO${row.servoIndex}`;
  }

  return row.ownerReason ?? "Owner not proven";
}

function directionControlsVisible(row: MotorTestRow): boolean {
  if (!testUnlocked || layoutModel?.status !== "supported" || view.checkpoint.blocksActions) {
    return false;
  }

  if (row.testStatus === "unsupported-bridge") {
    return true;
  }

  return testSuccessByMotor[row.motorNumber] === true;
}

function canStageReversal(row: MotorTestRow): boolean {
  if (directionResultByMotor[row.motorNumber] !== "reversed") {
    return false;
  }

  if (row.ownerStatus !== "resolved" || !row.reversalParamName || view.checkpoint.blocksActions) {
    return false;
  }

  const item = itemIndex.get(row.reversalParamName) ?? null;
  return Boolean(item && item.readOnly !== true && !params.stagedEdits[row.reversalParamName]);
}

function reversalButtonLabel(row: MotorTestRow): string {
  if (!row.reversalParamName) {
    return "Manual guidance only";
  }

  const item = itemIndex.get(row.reversalParamName) ?? null;
  const nextValue = item?.value === 1 ? 0 : 1;
  const verb = nextValue === 1 ? "Stage reversal" : "Stage normal direction";
  return `${verb} in review tray`;
}

function selectRow(motorNumber: number) {
  selectedMotorNumber = motorNumber;
}

function toggleUnlock() {
  if (unlockDisabledReason) {
    return;
  }

  testUnlocked = !testUnlocked;
  selectedMotorNumber = null;
}

async function runMotorTest(row: MotorTestRow) {
  if (testButtonDisabled(row)) {
    return;
  }

  selectedMotorNumber = row.motorNumber;
  activeMotorNumber = row.motorNumber;
  const nextErrors = { ...commandErrorByMotor };
  delete nextErrors[row.motorNumber];
  commandErrorByMotor = nextErrors;

  try {
    await motorTest(row.motorNumber, MOTOR_TEST_THROTTLE_PCT, MOTOR_TEST_DURATION_S);
    testSuccessByMotor = {
      ...testSuccessByMotor,
      [row.motorNumber]: true,
    };
  } catch (error) {
    commandErrorByMotor = {
      ...commandErrorByMotor,
      [row.motorNumber]: error instanceof Error ? error.message : String(error),
    };
  } finally {
    activeMotorNumber = null;
  }
}

function markDirection(row: MotorTestRow, result: DirectionResult) {
  if (!directionControlsVisible(row)) {
    return;
  }

  directionResultByMotor = {
    ...directionResultByMotor,
    [row.motorNumber]: result,
  };
}

function stageReversal(row: MotorTestRow) {
  if (!canStageReversal(row) || !row.reversalParamName) {
    return;
  }

  const item = itemIndex.get(row.reversalParamName) ?? null;
  if (!item) {
    return;
  }

  paramsStore.stageParameterEdit(item, item.value === 1 ? 0 : 1);
}

function resultTone(result: DirectionResult | undefined): string {
  if (result === "correct") {
    return "border-success/30 bg-success/10 text-success";
  }

  if (result === "reversed") {
    return "border-danger/30 bg-danger/10 text-danger";
  }

  return "border-border bg-bg-primary text-text-muted";
}

function reverseItem(row: MotorTestRow): ParameterItemModel | null {
  if (!row.reversalParamName) {
    return null;
  }

  return itemIndex.get(row.reversalParamName) ?? null;
}
</script>

<SetupSectionShell
  eyebrow={section.title}
  title="Fail-closed motor direction proof with one shared unlock"
  description="Motor order, expected direction, and reversal staging only appear when this scope can prove the active layout. Unlock once at the section level, test rows directly, and queue any reversal fix through the shared review tray instead of a local apply path."
  testId={setupWorkspaceTestIds.motorsEscSection}
>
  {#snippet actions()}
    {#if docsUrl}
      <a
        class="rounded-md border border-border bg-bg-primary/80 px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent"
        data-testid={setupWorkspaceTestIds.motorsEscDocsLink}
        href={docsUrl}
        rel="noreferrer"
        target="_blank"
      >
        Motor & ESC docs
      </a>
    {/if}
  {/snippet}

  {#snippet body()}
      <div
        class="grid gap-3 rounded-lg border border-border bg-bg-primary/80 p-3 md:grid-cols-3"
        data-testid={setupWorkspaceTestIds.motorsEscSummary}
      >
    <div>
      <p class="text-xs font-semibold uppercase tracking-widest text-text-muted">Layout truth</p>
      <p class="mt-2 text-sm font-semibold text-text-primary" data-testid={setupWorkspaceTestIds.motorsEscLayoutState}>
        {layoutStateLabel}
      </p>
      <p class="mt-1 text-sm text-text-secondary">{layoutStateDetail}</p>

      {#if layoutModel}
        <div class="mt-4 flex justify-center">
          <MotorDiagram model={layoutModel} activeMotor={activeMotorNumber ?? selectedMotorNumber} size={160} />
        </div>
      {/if}
    </div>
    <div>
      <p class="text-xs font-semibold uppercase tracking-widest text-text-muted">Safety unlock</p>
      <p class="mt-2 text-sm font-semibold text-text-primary" data-testid={setupWorkspaceTestIds.motorsEscSafetyState}>
        {safetyStateLabel}
      </p>
      <p class="mt-1 text-sm text-text-secondary">{safetyStateDetail}</p>
    </div>
    <div>
      <p class="text-xs font-semibold uppercase tracking-widest text-text-muted">Reversal staging</p>
      <p class="mt-2 text-sm font-semibold text-text-primary" data-testid={setupWorkspaceTestIds.motorsEscReversalState}>
        {reversalStateLabel}
      </p>
      <p class="mt-1 text-sm text-text-secondary">{reversalStateDetail}</p>
    </div>
  </div>

  {#if retainedReversalFailures.length > 0}
    <div
      class="rounded-lg border border-danger/40 bg-danger/10 px-4 py-4 text-sm leading-6 text-danger"
      data-testid={setupWorkspaceTestIds.motorsEscFailure}
    >
      <p class="font-semibold text-text-primary">The shared review tray is still retaining reversal failures.</p>
      <ul class="mt-2 list-disc space-y-1 pl-5">
        {#each retainedReversalFailures as failure (failure.name)}
          <li>{failure.name} · {failure.message}</li>
        {/each}
      </ul>
    </div>
  {/if}

  {#each banners as banner (banner.id)}
    <div
      class={`rounded-lg border px-4 py-4 text-sm leading-6 ${bannerClass(banner.tone)}`}
      data-testid={`${setupWorkspaceTestIds.motorsEscBannerPrefix}-${banner.id}`}
    >
      {banner.text}
    </div>
  {/each}

  <div class="rounded-lg border border-border bg-bg-primary/80 p-3">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p class="text-xs font-semibold uppercase tracking-widest text-text-muted">Motor test gate</p>
        <p class="mt-2 text-sm text-text-secondary">
          Visible rows · {rows.length} · Direct test rows · {testableCount} · Bridge-limited rows · {bridgeLimitedCount}
        </p>
      </div>

      <button
        class={`rounded-md border px-4 py-2 text-sm font-semibold transition ${testUnlocked ? "border-danger/40 bg-danger/10 text-danger" : "border-border bg-bg-secondary text-text-primary hover:border-accent hover:text-accent"}`}
        data-testid={setupWorkspaceTestIds.motorsEscUnlock}
        disabled={unlockDisabledReason !== null}
        onclick={toggleUnlock}
        type="button"
      >
        {testUnlocked ? "Lock motor test" : "Unlock motor test"}
      </button>
    </div>

    {#if unlockDisabledReason}
      <p class="mt-3 text-sm leading-6 text-text-secondary">{unlockDisabledReason}</p>
    {:else if !testUnlocked}
      <p class="mt-3 text-sm leading-6 text-text-secondary">Unlock once to expose direct row actions. This gate stays section-level, so the rows below do not ask for another confirmation before each pulse.</p>
    {:else}
      <p class="mt-3 text-sm leading-6 text-text-secondary">Motor test is unlocked for this scoped session. Use the row actions below, confirm the observed direction, and queue any safe reversal fix into the shared review tray.</p>
    {/if}
  </div>

  {#if rows.length === 0}
    <div class="rounded-lg border border-border bg-bg-primary/80 px-4 py-4 text-sm leading-6 text-text-secondary">
      Motor rows are hidden until the section can prove a real layout. Use Frame & Orientation or Full Parameters to recover missing truth before testing.
      <button
        class="ml-3 rounded-md border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent"
        onclick={onSelectRecovery}
        type="button"
      >
        Open Full Parameters recovery
      </button>
    </div>
  {:else}
    <div class="space-y-3">
      {#each rows as row (row.motorNumber)}
        {@const badge = directionBadge(row.expectedDirection)}
        {@const directionResult = directionResultByMotor[row.motorNumber]}
        {@const reversalQueued = row.reversalParamName ? Boolean(params.stagedEdits[row.reversalParamName]) : false}
        {@const reversalFailure = row.reversalParamName ? params.retainedFailures[row.reversalParamName] : null}
        {@const reverseParamItem = reverseItem(row)}
        <article
          class={`rounded-lg border px-4 py-4 ${selectedMotorNumber === row.motorNumber ? "border-accent/40 bg-accent/5" : "border-border bg-bg-primary/80"}`}
          data-selected={selectedMotorNumber === row.motorNumber}
          data-testid={`${setupWorkspaceTestIds.motorsEscRowPrefix}-${row.motorNumber}`}
        >
          <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <button
                  class="rounded-md border border-border bg-bg-secondary px-2 py-1 text-xs font-semibold uppercase tracking-widest text-text-secondary transition hover:border-accent hover:text-accent"
                  onclick={() => selectRow(row.motorNumber)}
                  type="button"
                >
                  Test #{row.testOrder}
                </button>
                <span class="text-sm font-semibold text-text-primary">Motor {row.motorNumber}</span>
                <span class="rounded-full border border-border bg-bg-secondary px-2 py-1 text-xs font-semibold uppercase tracking-widest text-text-secondary">
                  {row.roleLabel}
                </span>
                <span class={`rounded-full border px-2 py-1 text-xs font-semibold uppercase tracking-widest ${badge.className}`}>
                  {badge.label}
                </span>
              </div>
              <p class="mt-2 text-sm leading-6 text-text-secondary" data-testid={`${setupWorkspaceTestIds.motorsEscRowAvailabilityPrefix}-${row.motorNumber}`}>
                {rowAvailabilityText(row)}
              </p>
              <p class="mt-1 text-xs font-semibold uppercase tracking-widest text-text-muted" data-testid={`${setupWorkspaceTestIds.motorsEscRowOwnerPrefix}-${row.motorNumber}`}>
                {rowOwnerText(row)}
              </p>
            </div>

            <button
              class="shrink-0 rounded-md border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
              data-testid={`${setupWorkspaceTestIds.motorsEscRowTestPrefix}-${row.motorNumber}`}
              disabled={testButtonDisabled(row)}
              onclick={() => runMotorTest(row)}
              type="button"
            >
              {testButtonLabel(row)}
            </button>
          </div>

          {#if commandErrorByMotor[row.motorNumber]}
            <div
              class="mt-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-3 text-sm text-danger"
              data-testid={`${setupWorkspaceTestIds.motorsEscRowErrorPrefix}-${row.motorNumber}`}
            >
              Motor test rejected · {commandErrorByMotor[row.motorNumber]}
            </div>
          {/if}

          {#if directionControlsVisible(row)}
            <div class="mt-4 rounded-lg border border-border bg-bg-secondary/70 px-4 py-4">
              <div class="flex flex-wrap items-center gap-2">
                <p class="text-xs font-semibold uppercase tracking-widest text-text-muted">Observed direction</p>
                <span class={`rounded-full border px-2 py-1 text-xs font-semibold uppercase tracking-widest ${resultTone(directionResult)}`} data-testid={`${setupWorkspaceTestIds.motorsEscRowResultPrefix}-${row.motorNumber}`}>
                  {directionResult ?? "Awaiting confirmation"}
                </span>
              </div>
              <p class="mt-2 text-sm leading-6 text-text-secondary">
                {row.testStatus === "unsupported-bridge"
                  ? `This row is outside the current 1..=${MOTOR_TEST_BRIDGE_LIMIT} bridge window. Verify it manually, then record the observed direction here before queueing a reversal.`
                  : `Compare the observed spin with ${badge.label}, then mark the result below.`}
              </p>
              <div class="mt-3 flex flex-wrap gap-2">
                <button
                  class={`rounded-md border px-4 py-2 text-sm font-semibold transition ${directionResult === "correct" ? "border-success/40 bg-success/10 text-success" : "border-border bg-bg-primary text-text-primary hover:border-accent hover:text-accent"}`}
                  data-testid={`${setupWorkspaceTestIds.motorsEscRowCorrectPrefix}-${row.motorNumber}`}
                  onclick={() => markDirection(row, "correct")}
                  type="button"
                >
                  Correct
                </button>
                <button
                  class={`rounded-md border px-4 py-2 text-sm font-semibold transition ${directionResult === "reversed" ? "border-danger/40 bg-danger/10 text-danger" : "border-border bg-bg-primary text-text-primary hover:border-accent hover:text-accent"}`}
                  data-testid={`${setupWorkspaceTestIds.motorsEscRowReversedPrefix}-${row.motorNumber}`}
                  onclick={() => markDirection(row, "reversed")}
                  type="button"
                >
                  Reversed
                </button>
              </div>

              {#if directionResult === "reversed"}
                <div class="mt-4 rounded-lg border border-border bg-bg-primary/80 px-4 py-4">
                  {#if row.ownerStatus === "resolved" && row.reversalParamName && reverseParamItem}
                    <p class="text-sm leading-6 text-text-secondary">
                      Queue a shared-tray reversal fix for {row.reversalParamName}. The section never writes this directly.
                    </p>
                    <button
                      class="mt-3 rounded-md border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
                      data-testid={`${setupWorkspaceTestIds.motorsEscRowReversePrefix}-${row.motorNumber}`}
                      disabled={!canStageReversal(row)}
                      onclick={() => stageReversal(row)}
                      type="button"
                    >
                      {reversalQueued ? "Queued in review tray" : reversalButtonLabel(row)}
                    </button>
                  {:else}
                    <p class="text-sm leading-6 text-text-secondary" data-testid={`${setupWorkspaceTestIds.motorsEscRowManualPrefix}-${row.motorNumber}`}>
                      {row.ownerReason ?? "The section cannot prove the owning SERVOx_FUNCTION / SERVOx_REVERSED rows, so reversal stops at manual guidance."}
                    </p>
                  {/if}

                  {#if reversalFailure}
                    <div class="mt-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-3 text-sm text-danger">
                      {reversalFailure.message}
                    </div>
                  {/if}
                </div>
              {/if}
            </div>
          {/if}
        </article>
      {/each}
    </div>
  {/if}
  {/snippet}
</SetupSectionShell>

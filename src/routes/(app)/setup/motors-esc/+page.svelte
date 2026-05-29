<script lang="ts">
import { Fan, Power } from "lucide-svelte";
import { fromStore } from "svelte/store";

import { getParamsStoreContext, getSessionStoreContext } from "../../../../app/shell/runtime-context";
import { motorTest } from "../../../../calibration";
import { resolveDocsUrl } from "../../../../data/ardupilot-docs";
import { buildParameterItemIndex, type ParameterItemModel } from "../../../../lib/params/parameter-item-model";
import {
  MOTOR_TEST_BRIDGE_LIMIT,
  buildMotorTestRows,
  type MotorDirection,
  type MotorTestRow,
} from "../../../../lib/setup/motor-test-model";
import { deriveVehicleProfile, getVehicleSlug, type VehicleProfile } from "../../../../lib/setup/vehicle-profile";
import {
  getApMotorDiagramModel,
  getVtolLayoutModel,
  type MotorDiagramModel,
} from "../../../../lib/setup/vtol-layout-model";
import SetupSectionShell from "../../../../features/setup/components/SetupSectionShell.svelte";
import { setupWorkspaceTestIds } from "../../../../features/setup/setup-workspace-test-ids";
import MotorDiagram from "../../../../features/setup/shared/MotorDiagram.svelte";
import { SetupFieldStack, SetupGuideCard, SetupNotice, SetupSectionCard } from "../../../../features/setup/shared";
import SetupNoticeList from "../../../../features/setup/shared/SetupNoticeList.svelte";
import { Alert, Badge, Button, Card, Eyebrow, HelperText } from "../../../../components/ui";
import {
  getSetupWorkspaceRouteContext,
  setupRouteSection,
} from "../../../../features/setup/components/setup-workspace-route-context";

const route = getSetupWorkspaceRouteContext();
const viewStore = fromStore(route.viewStore);

let view = $derived(viewStore.current);
let section = $derived(setupRouteSection(view, "motors_esc"));

type DirectionResult = "correct" | "reversed";
type Tone = "info" | "warning" | "danger";
type BadgeVariant = "accent" | "destructive" | "muted" | "success";
type Banner = { id: string; tone: Tone; text: string };
type ScopedLayoutSummary = {
  scopeKey: string;
  label: string;
  detail: string;
};

const MOTOR_TEST_THROTTLE_PCT = 5;
const MOTOR_TEST_DURATION_S = 2;

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
let vehicleType = $derived(params.vehicleType ?? session.sessionDomain.value?.vehicle_state?.vehicle_type ?? null);
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
let rows = $derived(
  buildMotorTestRows(layoutModel, {
    paramStore: params.paramStore,
    stagedEdits: params.stagedEdits,
  }),
);
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
let unlockDisabledReason = $derived(
  resolveUnlockDisabledReason({
    checkpointBlocked: view.checkpoint.blocksActions,
    liveConnected,
    layoutModel,
    rowCount: rows.length,
  }),
);
let layoutStateLabel = $derived(resolveLayoutStateLabel(appliedProfile, layoutModel));
let layoutStateDetail = $derived.by(() => {
  if (layoutModel) {
    return layoutModelDetail(layoutModel);
  }

  if (lastScopedGoodLayoutSummary && lastScopedGoodLayoutSummary.scopeKey === view.activeScopeKey) {
    return `Last valid layout · ${lastScopedGoodLayoutSummary.label}. Testing stays blocked until the layout refreshes.`;
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
    return "Locked";
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

  return `${resolvedOwnerCount}/${rows.length} outputs mapped`;
});
let reversalStateDetail = $derived.by(() => {
  if (rows.length === 0) {
    return "Reversal staging appears after motor rows and mapped outputs are available.";
  }

  if (pendingReversalCount > 0) {
    return "Queued SERVOx_REVERSED edits are waiting in staged changes and still require review + apply outside this section.";
  }

  return `${resolvedOwnerCount} rows can stage one-click SERVOx_REVERSED fixes. The rest stay diagnosis-only because mapped outputs or reverse settings are unavailable.`;
});
let hasQueuedLayoutChange = $derived(
  previewProfile.quadPlaneEnabled !== appliedProfile.quadPlaneEnabled ||
    previewProfile.frameParamFamily !== appliedProfile.frameParamFamily ||
    previewProfile.frameClassValue !== appliedProfile.frameClassValue ||
    previewProfile.frameTypeValue !== appliedProfile.frameTypeValue,
);
let banners = $derived.by(() => {
  const next: Banner[] = [];

  if (hasQueuedLayoutChange) {
    next.push({
      id: "queued-layout",
      tone: "warning",
      text: "Frame or VTOL changes are staged. This section keeps showing the last applied layout until those edits are applied and parameters refresh.",
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
      text: `${layoutModel.message ?? "This layout is preview-only."} Direction-dependent testing stays blocked until the layout is available from applied parameters.`,
    });
  } else if (layoutModel.status === "unsupported") {
    next.push({
      id: "layout-unsupported",
      tone: "danger",
      text: `${layoutModel.message ?? "The current layout is unsupported."} Motor rows stay locked and one-click fixes stop at manual guidance.`,
    });
  }

  if (
    lastScopedGoodLayoutSummary &&
    lastScopedGoodLayoutSummary.scopeKey === view.activeScopeKey &&
    (!layoutModel || layoutModel.status !== "supported")
  ) {
    next.push({
      id: "last-good-layout",
      tone: "info",
      text: `Last valid layout: ${lastScopedGoodLayoutSummary.label}. ${lastScopedGoodLayoutSummary.detail} Test buttons stay blocked until the current scope refreshes.`,
    });
  }

  if (bridgeLimitedCount > 0) {
    next.push({
      id: "bridge-limit",
      tone: "info",
      text: `${bridgeLimitedCount} row${bridgeLimitedCount === 1 ? " is" : "s are"} visible above the current motor_test bridge window. They remain on-screen with manual-only guidance.`,
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

  if (profile.frameParamFamily === "copter" && profile.frameClassValue !== null && profile.frameTypeValue !== null) {
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
    return "Testing stays locked until the live vehicle link is connected.";
  }

  if (!input.layoutModel) {
    return "Testing stays locked because the active layout is unavailable.";
  }

  if (input.layoutModel.status === "preview-only") {
    return "Testing stays locked because this layout is preview-only. Verify the airframe manually first.";
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

  return `${currentLayoutModel.motors.length} mapped motors are shown in ArduPilot test order.`;
}

function unresolvedLayoutDetail(profile: VehicleProfile): string {
  if (profile.isPlane) {
    switch (profile.planeVtolState) {
      case "enable-pending":
        return "Q_ENABLE is staged but not yet applied. Keep motor testing locked until the vehicle reboots and the Q_FRAME_* family refreshes for the same scope.";
      case "awaiting-refresh":
        return "QuadPlane is enabled, but Q_FRAME_CLASS and Q_FRAME_TYPE have not refreshed yet. Motor order and direction checks are unavailable until they do.";
      case "partial-refresh":
        return "Only part of the Q_FRAME family is present. Finish the refresh before trusting any direction-dependent motor guidance here.";
      case "plain-plane":
      default:
        return "Plane firmware is still in plain fixed-wing mode. Enable VTOL in Frame & Orientation first, then refresh parameters before opening motor-direction work here.";
    }
  }

  return "The active scope does not currently expose a supported motor layout.";
}

function directionBadge(direction: MotorDirection): { label: string; variant: BadgeVariant } {
  switch (direction) {
    case "cw":
      return {
        label: "CW ↻",
        variant: "accent",
      };
    case "ccw":
      return {
        label: "CCW ↺",
        variant: "success",
      };
    default:
      return {
        label: "Unknown",
        variant: "muted",
      };
  }
}

function testButtonDisabled(row: MotorTestRow): boolean {
  return (
    !testUnlocked ||
    activeMotorNumber !== null ||
    !liveConnected ||
    view.checkpoint.blocksActions ||
    row.testStatus !== "available"
  );
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
    return `Mapped output · SERVO${row.servoIndex}`;
  }

  return row.ownerReason ?? "Output mapping unavailable";
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
  return `${verb} for review`;
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

function resultVariant(result: DirectionResult | undefined): BadgeVariant {
  if (result === "correct") {
    return "success";
  }

  if (result === "reversed") {
    return "destructive";
  }

  return "muted";
}

function reverseItem(row: MotorTestRow): ParameterItemModel | null {
  if (!row.reversalParamName) {
    return null;
  }

  return itemIndex.get(row.reversalParamName) ?? null;
}
</script>

<SetupSectionShell
  sectionId={section.id}
  eyebrow={section.title}
  title="Motor order and direction checks with one shared unlock"
  description="Remove props before motor/ESC tests. Confirm ArduPilot motor order, expected spin direction, and SERVOx_REVERSED staging from the applied layout, then stage any reversal fix for review."
  testId={setupWorkspaceTestIds.motorsEscSection}
  docs={[{ url: docsUrl, label: "ArduPilot Docs", testId: setupWorkspaceTestIds.motorsEscDocsLink }]}
>
  {#snippet body()}
    <SetupSectionCard
      icon={Fan}
      title="Motor test readiness"
      description="Verify motor order and direction against the applied ArduPilot layout before staging any direction changes."
      surface="elevated"
      testId={setupWorkspaceTestIds.motorsEscSummary}
    >
      <div class="grid gap-4 md:grid-cols-3">
        <div>
          <Eyebrow tracking="widest">Motor layout</Eyebrow>
          <p class="mt-2 text-sm font-semibold text-text-primary" data-testid={setupWorkspaceTestIds.motorsEscLayoutState}>
            {layoutStateLabel}
          </p>
          <HelperText class="mt-1">{layoutStateDetail}</HelperText>

          {#if layoutModel}
            <div class="mt-4 flex justify-center">
              <MotorDiagram model={layoutModel} activeMotor={activeMotorNumber ?? selectedMotorNumber} size={160} />
            </div>
          {/if}
        </div>
        <div>
          <Eyebrow tracking="widest">Safety unlock</Eyebrow>
          <p class="mt-2 text-sm font-semibold text-text-primary" data-testid={setupWorkspaceTestIds.motorsEscSafetyState}>
            {safetyStateLabel}
          </p>
          <HelperText class="mt-1">{safetyStateDetail}</HelperText>
        </div>
        <div>
          <Eyebrow tracking="widest">Direction changes</Eyebrow>
          <p class="mt-2 text-sm font-semibold text-text-primary" data-testid={setupWorkspaceTestIds.motorsEscReversalState}>
            {reversalStateLabel}
          </p>
          <HelperText class="mt-1">{reversalStateDetail}</HelperText>
        </div>
      </div>
    </SetupSectionCard>

  {#if retainedReversalFailures.length > 0}
      <Alert
        variant="danger"
        density="compact"
        shadow={false}
      title="Some staged reversal changes still need attention."
      testId={setupWorkspaceTestIds.motorsEscFailure}
    >
      <ul class="mt-2 list-disc space-y-1 pl-5">
        {#each retainedReversalFailures as failure (failure.name)}
          <li>{failure.name} · {failure.message}</li>
        {/each}
      </ul>
    </Alert>
  {/if}

  <SetupNoticeList notices={banners} testIdPrefix={setupWorkspaceTestIds.motorsEscBannerPrefix} />

  <SetupSectionCard icon={Power} title="Motor test gate" surface="elevated" compact>
    {#snippet actions()}
      <Button
        variant={testUnlocked ? "destructive" : "secondary"}
        testId={setupWorkspaceTestIds.motorsEscUnlock}
        disabled={unlockDisabledReason !== null}
        onclick={toggleUnlock}
      >
        {testUnlocked ? "Lock motor test" : "Unlock motor test"}
      </Button>
    {/snippet}

    <SetupFieldStack gap="compact">
      <HelperText>
          Visible rows · {rows.length} · Direct test rows · {testableCount} · Bridge-limited rows · {bridgeLimitedCount}
      </HelperText>

    {#if unlockDisabledReason}
      <HelperText>{unlockDisabledReason}</HelperText>
    {:else if !testUnlocked}
      <HelperText>Unlock once to expose direct row actions. Keep props removed before sending any motor test pulse.</HelperText>
    {:else}
      <HelperText>Motor test is unlocked for this session. Use the row actions below, confirm the observed direction, and stage any reversal fix for review.</HelperText>
    {/if}
    </SetupFieldStack>
  </SetupSectionCard>

  {#if rows.length === 0}
    <SetupNotice tone="info">
      No matching motor settings are available for this firmware. Use Frame & Orientation to refresh layout settings before testing.
    </SetupNotice>
  {:else}
    <div class="space-y-3">
      {#each rows as row (row.motorNumber)}
        {@const badge = directionBadge(row.expectedDirection)}
        {@const directionResult = directionResultByMotor[row.motorNumber]}
        {@const reversalQueued = row.reversalParamName ? Boolean(params.stagedEdits[row.reversalParamName]) : false}
        {@const reversalFailure = row.reversalParamName ? params.retainedFailures[row.reversalParamName] : null}
        {@const reverseParamItem = reverseItem(row)}
        <Card.Root
          as="article"
          selected={selectedMotorNumber === row.motorNumber}
          surface="primary"
          testId={`${setupWorkspaceTestIds.motorsEscRowPrefix}-${row.motorNumber}`}
        >
          <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <Button
                  class="h-auto px-2 py-1 text-xs uppercase tracking-widest"
                  size="sm"
                  variant="secondary"
                  onclick={() => selectRow(row.motorNumber)}
                >
                  Test #{row.testOrder}
                </Button>
                <span class="text-sm font-semibold text-text-primary">Motor {row.motorNumber}</span>
                <Badge variant="muted" size="sm" case="normal" shape="pill">
                  {row.roleLabel}
                </Badge>
                <Badge variant={badge.variant} size="sm" case="normal" shape="pill">
                  {badge.label}
                </Badge>
              </div>
              <HelperText class="mt-2" testId={`${setupWorkspaceTestIds.motorsEscRowAvailabilityPrefix}-${row.motorNumber}`}>
                {rowAvailabilityText(row)}
              </HelperText>
              <Eyebrow class="mt-1" tracking="widest" testId={`${setupWorkspaceTestIds.motorsEscRowOwnerPrefix}-${row.motorNumber}`}>
                {rowOwnerText(row)}
              </Eyebrow>
            </div>

            <Button
              class="shrink-0"
              variant="secondary"
              testId={`${setupWorkspaceTestIds.motorsEscRowTestPrefix}-${row.motorNumber}`}
              disabled={testButtonDisabled(row)}
              onclick={() => runMotorTest(row)}
            >
              {testButtonLabel(row)}
            </Button>
          </div>

          {#if commandErrorByMotor[row.motorNumber]}
            <Alert
              class="mt-3"
              variant="danger"
              testId={`${setupWorkspaceTestIds.motorsEscRowErrorPrefix}-${row.motorNumber}`}
            >
              Motor test rejected · {commandErrorByMotor[row.motorNumber]}
            </Alert>
          {/if}

          {#if directionControlsVisible(row)}
            <Card.Root class="mt-4" surface="secondary" density="default">
              <div class="flex flex-wrap items-center gap-2">
                <Eyebrow tracking="widest">Observed direction</Eyebrow>
                <Badge variant={resultVariant(directionResult)} size="sm" case="normal" shape="pill" testId={`${setupWorkspaceTestIds.motorsEscRowResultPrefix}-${row.motorNumber}`}>
                  {directionResult ?? "Awaiting confirmation"}
                </Badge>
              </div>
              <HelperText class="mt-2">
                {row.testStatus === "unsupported-bridge"
                  ? `This row is outside the current 1..=${MOTOR_TEST_BRIDGE_LIMIT} bridge window. Verify it manually, then record the observed direction here before queueing a reversal.`
                  : `Compare the observed spin with ${badge.label}, then mark the result below.`}
              </HelperText>
              <div class="mt-3 flex flex-wrap gap-2">
                <Button
                  tone="success"
                  variant={directionResult === "correct" ? "soft" : "outline"}
                  testId={`${setupWorkspaceTestIds.motorsEscRowCorrectPrefix}-${row.motorNumber}`}
                  onclick={() => markDirection(row, "correct")}
                >
                  Correct
                </Button>
                <Button
                  tone="danger"
                  variant={directionResult === "reversed" ? "soft" : "outline"}
                  testId={`${setupWorkspaceTestIds.motorsEscRowReversedPrefix}-${row.motorNumber}`}
                  onclick={() => markDirection(row, "reversed")}
                >
                  Reversed
                </Button>
              </div>

              {#if directionResult === "reversed"}
                <Card.Root class="mt-4" surface="primary" density="default">
                  {#if row.ownerStatus === "resolved" && row.reversalParamName && reverseParamItem}
                    <p class="text-sm leading-6 text-text-secondary">
                      Stage a reversal fix for {row.reversalParamName}. The section does not apply it directly.
                    </p>
                    <Button
                      class="mt-3"
                      variant="secondary"
                      testId={`${setupWorkspaceTestIds.motorsEscRowReversePrefix}-${row.motorNumber}`}
                      disabled={!canStageReversal(row)}
                      onclick={() => stageReversal(row)}
                    >
                      {reversalQueued ? "Staged for review" : reversalButtonLabel(row)}
                    </Button>
                  {:else}
                    <p class="text-sm leading-6 text-text-secondary" data-testid={`${setupWorkspaceTestIds.motorsEscRowManualPrefix}-${row.motorNumber}`}>
                      {row.ownerReason ?? "The owning SERVOx_FUNCTION / SERVOx_REVERSED rows are unavailable, so reversal stops at manual guidance."}
                    </p>
                  {/if}

                  {#if reversalFailure}
                    <Alert class="mt-3" variant="danger">
                      {reversalFailure.message}
                    </Alert>
                  {/if}
                </Card.Root>
              {/if}
            </Card.Root>
          {/if}
        </Card.Root>
      {/each}
    </div>
  {/if}

  <SetupGuideCard title="Motor/ESC test checklist">
    <p>Remove all props before sending any motor test command.</p>
    <p>Run motors in ArduPilot test order, compare the observed spin against the expected CW/CCW direction, then stage SERVOx_REVERSED changes only for outputs that map to the tested motor.</p>
  </SetupGuideCard>
  {/snippet}
</SetupSectionShell>

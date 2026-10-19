<script lang="ts">
import { MotorRotation } from "../../../../lib/airframe";
import { page } from "$app/state";
import { Fan, Power } from "lucide-svelte";
import { fromStore } from "svelte/store";

import { getParamsStoreContext, getSessionStoreContext } from "../../../../app/shell/runtime-context";
import { motorTest } from "../../../../calibration";
import { resolveDocsUrl } from "../../../../data/ardupilot-docs";
import { notifyUnknownError } from "../../../../lib/notifications";
import {
  MOTOR_TEST_BRIDGE_LIMIT,
  buildMotorTestRows,
  findMotorTestFailureStatus,
  latestStatusTextSequence,
  resolveMotorTestUnlockDisabledReason,
  type MotorTestRow,
} from "../../../../lib/setup/motor-test-model";
import { readLiveStatusText } from "../../../../statustext";
import { deriveVehicleProfile, getVehicleSlug, type VehicleProfile } from "../../../../lib/setup/vehicle-profile";
import {
  getApMotorDiagramModel,
  getVtolTopologyDiagramModel,
  type MotorDiagramModel,
} from "../../../../lib/setup/vtol-layout-model";
import { buildVtolTopologyModel } from "../../../../lib/setup/vtol-topology-model";
import SetupSectionShell from "../../../../features/setup/components/SetupSectionShell.svelte";
import { setupWorkspaceTestIds } from "../../../../features/setup/setup-workspace-test-ids";
import MotorDiagram from "../../../../features/setup/shared/MotorDiagram.svelte";
import {
  SetupFieldStack,
  SetupGuideCard,
  SetupNotice,
  SetupParamSection,
  SetupSectionCard,
} from "../../../../features/setup/shared";
import SetupNoticeList from "../../../../features/setup/shared/SetupNoticeList.svelte";
import type { SetupParamRef } from "../../../../features/setup/shared/setup-param-refs";
import { Alert, Badge, Button, Card, Eyebrow, ExternalLink, HelperText } from "../../../../components/ui";
import {
  getSetupWorkspaceRouteContext,
  setupRouteSection,
} from "../../../../features/setup/components/setup-workspace-route-context";

const route = getSetupWorkspaceRouteContext();
const viewStore = fromStore(route.viewStore);

let view = $derived(viewStore.current);
let section = $derived(setupRouteSection(view, "motors_esc"));

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
const MOTOR_TEST_COMPLETION_GRACE_MS = 250;
const MOTOR_TEST_STATUS_WAIT_ATTEMPTS = 5;
const MOTOR_TEST_STATUS_WAIT_INTERVAL_MS = 100;
const vtolEscOutputParams = [
  { id: "Q_M_PWM_TYPE" },
  { id: "Q_M_PWM_MIN" },
  { id: "Q_M_PWM_MAX" },
  { id: "Q_M_SPIN_ARM" },
  { id: "Q_M_SPIN_MIN" },
  { id: "Q_M_SPIN_MAX" },
] satisfies readonly SetupParamRef[];
const vtolThrustParams = [
  { id: "Q_M_THST_EXPO" },
  { id: "Q_M_THST_HOVER" },
  { id: "Q_M_HOVER_LEARN" },
  { id: "Q_M_BAT_IDX" },
  { id: "Q_M_BAT_VOLT_MAX" },
  { id: "Q_M_BAT_VOLT_MIN" },
  { id: "Q_M_BAT_CURR_MAX" },
] satisfies readonly SetupParamRef[];
const vtolEscCalibrationParams = [{ id: "Q_ESC_CAL" }] satisfies readonly SetupParamRef[];

const paramsStore = getParamsStoreContext();
const sessionStore = getSessionStoreContext();
const paramsState = fromStore(paramsStore);
const sessionState = fromStore(sessionStore);

let testUnlocked = $state(false);
let activeMotorNumber = $state<number | null>(null);
let selectedMotorNumber = $state<number | null>(requestedMotorNumber());
let testSuccessByMotor = $state<Record<number, boolean>>({});
let commandErrorByMotor = $state<Record<number, string>>({});
let trackedScopeKey = $state<string | null>(null);
let lastScopedGoodLayoutSummary = $state<ScopedLayoutSummary | null>(null);

let params = $derived(paramsState.current);
let session = $derived(sessionState.current);
let vehicleType = $derived(params.vehicleType ?? session.sessionDomain.value?.vehicle_state?.vehicle_type ?? null);
let appliedProfile = $derived(
  deriveVehicleProfile(vehicleType, {
    paramStore: params.paramStore,
    stagedEdits: {},
  }),
);
let topology = $derived(buildVtolTopologyModel({ paramStore: params.paramStore, stagedEdits: params.stagedEdits }));
let layoutModel = $derived(resolveAppliedLayoutModel(appliedProfile));
let rows = $derived(
  buildMotorTestRows(layoutModel, {
    paramStore: params.paramStore,
    stagedEdits: params.stagedEdits,
  }),
);
let docsUrl = $derived(resolveDocsUrl("motors_esc", getVehicleSlug(vehicleType)));
let liveConnected = $derived(session.sessionDomain.value?.connection.kind === "connected");
let vehicleArmed = $derived(session.sessionDomain.value?.vehicle_state?.armed ?? null);
let statusTextEntries = $derived(readLiveStatusText(session.statusText));
let testableCount = $derived(rows.filter((row) => row.testStatus === "available").length);
let bridgeLimitedCount = $derived(rows.filter((row) => row.testStatus === "unsupported-bridge").length);
let resolvedOwnerCount = $derived(rows.filter((row) => row.ownerStatus === "resolved").length);
let unlockDisabledReason = $derived(
  resolveMotorTestUnlockDisabledReason({
    checkpointBlocked: view.checkpoint.blocksActions,
    liveConnected,
    vehicleArmed,
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
    return "The reboot or reconnect checkpoint is unresolved, so unlock and test actions stay disabled in this section.";
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
let hasQueuedLayoutChange = $derived(
  appliedProfile.frameParamFamily === "quadplane"
    ? topology.hasTopologyChanges
    : Object.keys(params.stagedEdits).some((name) => name === "FRAME_CLASS" || name === "FRAME_TYPE"),
);
let banners = $derived.by(() => {
  const next: Banner[] = [];

  if (hasQueuedLayoutChange) {
    next.push({
      id: "queued-layout",
      tone: "warning",
      text:
        appliedProfile.frameParamFamily === "quadplane"
          ? `Pending VTOL topology: ${topology.proposed.architectureLabel} · ${topology.proposed.frameClassLabel} ${topology.proposed.frameTypeLabel}. Motor tests still use applied ${topology.applied.frameClassLabel} ${topology.applied.frameTypeLabel} until Apply, reboot, and parameter refresh complete.`
          : "Frame changes are staged. Motor tests continue to use the applied layout until those edits are applied and parameters refresh.",
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
      text: `${layoutModel.message ?? "The current layout is unsupported."} Motor rows stay locked.`,
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
    selectedMotorNumber = requestedMotorNumber();
    testSuccessByMotor = {};
    commandErrorByMotor = {};
  }

  if (view.activeScopeKey && layoutModel?.status === "supported") {
    lastScopedGoodLayoutSummary = {
      scopeKey: view.activeScopeKey,
      label: resolveLayoutStateLabel(appliedProfile, layoutModel),
      detail: layoutModelDetail(layoutModel),
    };
  }

  if (testUnlocked && unlockDisabledReason !== null) {
    testUnlocked = false;
  }
});

function resolveAppliedLayoutModel(profile: VehicleProfile): MotorDiagramModel | null {
  if (profile.frameParamFamily === "quadplane") {
    return getVtolTopologyDiagramModel(topology.applied);
  }

  if (profile.frameParamFamily === "copter") {
    return getApMotorDiagramModel(profile.frame);
  }

  return null;
}

function requestedMotorNumber(): number | null {
  const value = Number(page.url.searchParams.get("motor"));
  return Number.isInteger(value) && value > 0 ? value : null;
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
        return "Plane firmware is still in plain fixed-wing mode. Enable VTOL in VTOL / QuadPlane first, then refresh parameters before opening motor-direction work here.";
    }
  }

  return "The active scope does not currently expose a supported motor layout.";
}

function directionBadge(direction: MotorRotation): { label: string; variant: BadgeVariant } {
  switch (direction) {
    case MotorRotation.Clockwise:
      return {
        label: "CW ↻",
        variant: "accent",
      };
    case MotorRotation.CounterClockwise:
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
    vehicleArmed !== false ||
    view.checkpoint.blocksActions ||
    row.testStatus !== "available"
  );
}

function testButtonLabel(row: MotorTestRow): string {
  if (activeMotorNumber === row.motorNumber) {
    return "Testing…";
  }

  if (row.testStatus === "unsupported-bridge") {
    return `Bridge supports sequences 1..=${MOTOR_TEST_BRIDGE_LIMIT}`;
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

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function waitForMotorTestFailureStatus(afterSequence: number): Promise<string | null> {
  for (let attempt = 0; attempt < MOTOR_TEST_STATUS_WAIT_ATTEMPTS; attempt += 1) {
    const status = findMotorTestFailureStatus(statusTextEntries, afterSequence);
    if (status) {
      return status;
    }

    await delay(MOTOR_TEST_STATUS_WAIT_INTERVAL_MS);
  }

  return null;
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
  const statusSequenceBeforeCommand = latestStatusTextSequence(statusTextEntries);

  try {
    await motorTest(row.testOrder, MOTOR_TEST_THROTTLE_PCT, MOTOR_TEST_DURATION_S);
    await delay(MOTOR_TEST_DURATION_S * 1000 + MOTOR_TEST_COMPLETION_GRACE_MS);
    testSuccessByMotor = {
      ...testSuccessByMotor,
      [row.motorNumber]: true,
    };
  } catch (error) {
    const commandMessage = error instanceof Error ? error.message : String(error);
    const statusMessage = await waitForMotorTestFailureStatus(statusSequenceBeforeCommand);
    const message = statusMessage ? `${statusMessage} · ${commandMessage}` : commandMessage;
    commandErrorByMotor = {
      ...commandErrorByMotor,
      [row.motorNumber]: message,
    };
    notifyUnknownError(`Motor ${row.motorNumber} test rejected`, new Error(message), {
      id: `setup-motor-${row.motorNumber}-test-failed`,
    });
  } finally {
    activeMotorNumber = null;
  }
}
</script>

<SetupSectionShell
  sectionId={section.id}
  eyebrow={section.title}
  title="Motor, ESC, and lift-powertrain setup"
  description="Configure QuadPlane ESC output and thrust response, then remove props before confirming motor order, expected spin direction from the applied layout."
  testId={setupWorkspaceTestIds.motorsEscSection}
  docs={[{ url: docsUrl, label: "ArduPilot Docs", testId: setupWorkspaceTestIds.motorsEscDocsLink }]}
>
  {#snippet body()}
    <SetupSectionCard
      icon={Fan}
      title="Motor test readiness"
      description="Verify motor order and direction against the applied ArduPilot layout with all propellers removed."
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
              <MotorDiagram model={layoutModel} activeMotor={activeMotorNumber ?? selectedMotorNumber} size={240} />
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
          <Eyebrow tracking="widest">Output mapping</Eyebrow>
          <p class="mt-2 text-sm font-semibold text-text-primary" data-testid="setup-workspace-motors-esc-mapping-state">
            {resolvedOwnerCount}/{rows.length} outputs mapped
          </p>
          <HelperText class="mt-1">Motor numbers follow ArduPilot; SERVO connectors follow the applied output assignments.</HelperText>
        </div>
      </div>
    </SetupSectionCard>

  <SetupNoticeList notices={banners} testIdPrefix={setupWorkspaceTestIds.motorsEscBannerPrefix} />

  <SetupParamSection
    id="vtol-esc-output"
    icon={Power}
    title="VTOL ESC output and idle"
    description="Match the lift-motor protocol and usable ESC range, then set armed and minimum spin points before hover testing."
    params={vtolEscOutputParams}
    disabled={view.checkpoint.blocksActions}
    surface="elevated"
    testIdPrefix="setup-workspace-motors-esc"
  />

  <SetupParamSection
    id="vtol-thrust"
    icon={Fan}
    title="VTOL thrust and battery compensation"
    description="Linearize lift thrust, select the VTOL battery monitor, and keep hover-throttle learning within the proven propulsion envelope."
    params={vtolThrustParams}
    disabled={view.checkpoint.blocksActions}
    surface="elevated"
    testIdPrefix="setup-workspace-motors-esc"
  />

  <SetupParamSection
    id="vtol-esc-calibration"
    icon={Power}
    title="VTOL ESC calibration mode"
    description="Props must be removed. This stages Q_ESC_CAL for normal review; follow the ArduPilot ESC calibration procedure before applying it."
    params={vtolEscCalibrationParams}
    disabled={view.checkpoint.blocksActions || testUnlocked}
    compact
    surface="elevated"
    testIdPrefix="setup-workspace-motors-esc"
  />

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
      <HelperText>Keep props removed, confirm the vehicle is disarmed, and release the hardware safety switch before unlocking.</HelperText>
    {:else}
      <HelperText>Motor test is unlocked for this session. Use the row actions below and compare the observed rotation with the diagram.</HelperText>
    {/if}
    </SetupFieldStack>
  </SetupSectionCard>

  {#if rows.length === 0}
    <SetupNotice tone="info">
      No matching motor settings are available for this firmware. Use VTOL / QuadPlane or Frame & Orientation to refresh the applicable layout before testing.
    </SetupNotice>
  {:else}
    <div class="space-y-3">
      {#each rows as row (row.motorNumber)}
        {@const badge = directionBadge(row.expectedDirection)}
        <Card.Root
          as="article"
          id={`motor-${row.motorNumber}`}
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

          {#if testSuccessByMotor[row.motorNumber]}
            <HelperText class="mt-3">Test pulse sent. Verify that the numbered motor and its rotation match the diagram.</HelperText>
          {/if}
        </Card.Root>
      {/each}
    </div>
  {/if}

  <SetupGuideCard title="Motor/ESC test checklist">
    <p>Remove all props before sending any motor test command.</p>
    <p>Test order and motor number can differ. Compare rotation from above; unspecified rotation must follow the airframe documentation.</p>
    <p>Change motor rotation in the ESC configuration or by swapping two motor phase wires. Supported DShot ESCs can use SERVO_BLH_RVMASK. SERVOx_REVERSED does not set propeller rotation.</p>
    {#if resolveDocsUrl("motor_direction")}
      <ExternalLink href={resolveDocsUrl("motor_direction")!}>ArduPilot motor direction setup</ExternalLink>
    {/if}
  </SetupGuideCard>
  {/snippet}
</SetupSectionShell>

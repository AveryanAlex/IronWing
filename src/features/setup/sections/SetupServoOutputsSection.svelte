<script lang="ts">
import { fromStore } from "svelte/store";

import {
  getParamsStoreContext,
  getSessionStoreContext,
} from "../../../app/shell/runtime-context";
import { setServo } from "../../../calibration";
import { resolveDocsUrl } from "../../../data/ardupilot-docs";
import {
  buildParameterItemIndex,
  type ParameterItemModel,
} from "../../../lib/params/parameter-item-model";
import { getDirectionGuidance } from "../../../lib/setup/servo-direction-guidance";
import {
  SERVO_LIVE_TEST_LIMIT,
  clampServoCommandPwm,
  deriveConfiguredServoOutputs,
  deriveServoOutputGroups,
  deriveServoTestTargets,
  groupServoTestTargetsByFunction,
  type ServoConfiguredOutput,
  type ServoTestTarget,
} from "../../../lib/setup/servo-test-model";
import { deriveVehicleProfile } from "../../../lib/setup/vehicle-profile";
import type {
  SetupWorkspaceSection,
  SetupWorkspaceStoreState,
} from "../../../lib/stores/setup-workspace";
import { selectTelemetryView } from "../../../lib/telemetry-selectors";
import SetupSectionShell from "../components/SetupSectionShell.svelte";
import { setupWorkspaceTestIds } from "../setup-workspace-test-ids";
import { Alert, Badge, Button, Card, EmptyState, Eyebrow, HelperText, Input, MonoValue } from "../../../components/ui";

type Tone = "info" | "warning" | "danger";
type Banner = { id: string; tone: Tone; text: string };
type DirectionResult = "correct" | "reversed";
type BadgeVariant = "destructive" | "muted" | "success" | "warning";
type ReadbackView = {
  state: "live" | "stale" | "unavailable";
  text: string;
  detail: string;
  value: number | null;
};

let {
  section,
  view,
}: {
  section: SetupWorkspaceSection;
  view: SetupWorkspaceStoreState;
} = $props();

const paramsStore = getParamsStoreContext();
const sessionStore = getSessionStoreContext();
const paramsState = fromStore(paramsStore);
const sessionState = fromStore(sessionStore);

let testUnlocked = $state(false);
let activeOutputIndex = $state<number | null>(null);
let selectedOutputIndex = $state<number | null>(null);
let testSuccessByOutput = $state<Record<number, boolean>>({});
let directionResultByOutput = $state<Record<number, DirectionResult>>({});
let commandErrorByOutput = $state<Record<number, string>>({});
let rawPwmByOutput = $state<Record<number, number>>({});
let trackedScopeKey = $state<string | null>(null);
let lastScopedGoodReadbacks = $state<Record<number, number>>({});

let params = $derived(paramsState.current);
let session = $derived(sessionState.current);
let telemetry = $derived(selectTelemetryView(session.telemetryDomain));
let vehicleType = $derived(
  params.vehicleType ?? session.sessionDomain.value?.vehicle_state?.vehicle_type ?? null,
);
let profile = $derived(
  deriveVehicleProfile(vehicleType, {
    paramStore: params.paramStore,
    stagedEdits: {},
  }),
);
let itemIndex = $derived(buildParameterItemIndex(params.paramStore, params.metadata));
let configuredOutputs = $derived(
  deriveConfiguredServoOutputs({
    paramStore: params.paramStore,
    metadata: params.metadata,
  }),
);
let testTargets = $derived(
  deriveServoTestTargets({
    paramStore: params.paramStore,
    metadata: params.metadata,
  }),
);
let supportedTargets = $derived(testTargets.filter((target) => target.supported));
let functionGroups = $derived(groupServoTestTargetsByFunction(supportedTargets));
let rawGroups = $derived(deriveServoOutputGroups(configuredOutputs, profile.subtype));
let liveConnected = $derived(session.sessionDomain.value?.connection.kind === "connected");
let docsUrl = $derived(resolveDocsUrl("servo_outputs"));
let pendingReversalCount = $derived(
  configuredOutputs.filter((output) => output.reverseParamName && params.stagedEdits[output.reverseParamName]).length,
);
let retainedReversalFailures = $derived(
  Object.values(params.retainedFailures).filter((failure) => /SERVO\d+_REVERSED/.test(failure.name)),
);
let unsupportedOutputs = $derived(
  configuredOutputs.filter((output) => !output.isMotorFunction && !output.supported),
);
let motorOutputs = $derived(configuredOutputs.filter((output) => output.isMotorFunction));
let pendingOutputEditCount = $derived(
  Object.keys(params.stagedEdits).filter((name) => /SERVO\d+_(FUNCTION|MIN|MAX|TRIM)$/.test(name)).length,
);
let genericFallbackActive = $derived(
  Boolean(profile.subtype && rawGroups.some((group) => group.kind === "general") && configuredOutputs.length > 0),
);
let unlockDisabledReason = $derived(resolveUnlockDisabledReason({
  checkpointBlocked: view.checkpoint.blocksActions,
  liveConnected,
  supportedTargetCount: supportedTargets.length,
  configuredOutputCount: configuredOutputs.length,
}));
let testerSummaryLabel = $derived(
  functionGroups.length > 0
    ? `${supportedTargets.length} live-test targets`
    : configuredOutputs.length > 0
      ? "Inventory only"
      : "No configured outputs",
);
let testerSummaryDetail = $derived.by(() => {
  if (configuredOutputs.length === 0) {
    return "No configured SERVOx_FUNCTION rows are available for this scope yet.";
  }

  if (functionGroups.length === 0) {
    return "No live-testable non-motor outputs are currently within the SERVO1–16 bridge window.";
  }

  return `${functionGroups.length} function group${functionGroups.length === 1 ? "" : "s"} drive the purpose-built tester, while the raw inventory keeps every configured output visible.`;
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
    return "The reboot or reconnect checkpoint is unresolved, so all servo actuation stays blocked in this section.";
  }

  if (!liveConnected) {
    return "Reconnect the live vehicle link before unlocking servo actuation.";
  }

  if (unlockDisabledReason) {
    return unlockDisabledReason;
  }

  return testUnlocked
    ? "The section-level unlock is open. Min/max probes and raw PWM sends now use the same shared gate."
    : "Unlock once at the section level, then use function testers or raw PWM sends without per-click confirmation spam.";
});
let readbackSummary = $derived.by(() => {
  let live = 0;
  let stale = 0;
  let unavailable = 0;

  for (const output of configuredOutputs) {
    const readback = resolveReadback(output);
    if (readback.state === "live") {
      live += 1;
    } else if (readback.state === "stale") {
      stale += 1;
    } else {
      unavailable += 1;
    }
  }

  return {
    label: live > 0
      ? `${live} live`
      : stale > 0
        ? `${stale} stale`
        : "Unavailable",
    detail: `${live} live · ${stale} stale · ${unavailable} unavailable`,
  };
});
let reversalStateLabel = $derived.by(() => {
  if (pendingReversalCount > 0) {
    return `${pendingReversalCount} queued`;
  }

  if (retainedReversalFailures.length > 0) {
    return `${retainedReversalFailures.length} retained failure${retainedReversalFailures.length === 1 ? "" : "s"}`;
  }

  return `${configuredOutputs.filter((output) => output.reverseParamName !== null).length}/${configuredOutputs.length} reversible`;
});
let reversalStateDetail = $derived.by(() => {
  if (configuredOutputs.length === 0) {
    return "No configured outputs are available to inspect or reverse yet.";
  }

  if (pendingReversalCount > 0) {
    return "Queued SERVOx_REVERSED edits are sitting in the shared review tray and still require review + apply outside this section.";
  }

  if (retainedReversalFailures.length > 0) {
    return "Retained SERVOx_REVERSED failures stay visible next to the affected rows until you restage or resolve them.";
  }

  return "Reversal fixes queue through the shared review tray only. This section never writes them directly.";
});
let banners = $derived.by(() => {
  const next: Banner[] = [];

  if (pendingOutputEditCount > 0) {
    next.push({
      id: "queued-output-edits",
      tone: "warning",
      text: `${pendingOutputEditCount} staged SERVOx FUNCTION/MIN/MAX/TRIM edit${pendingOutputEditCount === 1 ? " is" : "s are"} pending in the shared review tray. This section keeps testing scoped to the currently applied output map until those changes are reviewed and applied.`,
    });
  }

  if (unsupportedOutputs.length > 0) {
    next.push({
      id: "unsupported-outputs",
      tone: "info",
      text: `${unsupportedOutputs.length} configured output${unsupportedOutputs.length === 1 ? "" : "s"} sit above SERVO1–${SERVO_LIVE_TEST_LIMIT}. They remain visible with explicit unsupported copy instead of disappearing from the section.`,
    });
  }

  if (motorOutputs.length > 0) {
    next.push({
      id: "motor-outputs",
      tone: "info",
      text: `${motorOutputs.length} motor-assigned output${motorOutputs.length === 1 ? " remains" : "s remain"} visible for inventory truth here, but live motor actuation belongs in Motors & ESC.`,
    });
  }

  if (genericFallbackActive) {
    next.push({
      id: "generic-fallback",
      tone: "info",
      text: "Some VTOL-specific function labels are missing or partial, so those rows fall back to generic configured-output groups instead of being hidden.",
    });
  }

  return next;
});

$effect(() => {
  if (view.activeScopeKey !== trackedScopeKey) {
    trackedScopeKey = view.activeScopeKey;
    testUnlocked = false;
    activeOutputIndex = null;
    selectedOutputIndex = null;
    testSuccessByOutput = {};
    directionResultByOutput = {};
    commandErrorByOutput = {};
    rawPwmByOutput = {};
    lastScopedGoodReadbacks = {};
  }

  if (!Array.isArray(telemetry.servo_outputs)) {
    return;
  }

  const nextReadbacks = { ...lastScopedGoodReadbacks };
  let changed = false;

  for (let index = 1; index <= SERVO_LIVE_TEST_LIMIT; index += 1) {
    const value = telemetry.servo_outputs[index - 1];
    if (typeof value === "number" && Number.isFinite(value) && nextReadbacks[index] !== Math.round(value)) {
      nextReadbacks[index] = Math.round(value);
      changed = true;
    }
  }

  if (changed) {
    lastScopedGoodReadbacks = nextReadbacks;
  }
});

function resolveUnlockDisabledReason(input: {
  checkpointBlocked: boolean;
  liveConnected: boolean;
  supportedTargetCount: number;
  configuredOutputCount: number;
}): string | null {
  if (input.checkpointBlocked) {
    return "Servo actuation stays locked while the reboot/reconnect checkpoint is unresolved.";
  }

  if (!input.liveConnected) {
    return "Servo actuation stays locked until the live vehicle link is connected for this scope.";
  }

  if (input.configuredOutputCount === 0) {
    return "No configured SERVOx_FUNCTION rows are available yet for this scope.";
  }

  if (input.supportedTargetCount === 0) {
    return `No live-testable non-motor outputs are currently available inside the SERVO1–${SERVO_LIVE_TEST_LIMIT} bridge window.`;
  }

  return null;
}

function resolveReadback(output: ServoConfiguredOutput): ReadbackView {
  if (output.index > SERVO_LIVE_TEST_LIMIT) {
    return {
      state: "unavailable",
      text: "Unavailable",
      detail: `Current telemetry only exposes SERVO1–${SERVO_LIVE_TEST_LIMIT} live readback slots for this surface.`,
      value: null,
    };
  }

  if (Array.isArray(telemetry.servo_outputs)) {
    const slot = telemetry.servo_outputs[output.index - 1];
    if (typeof slot === "number" && Number.isFinite(slot)) {
      const rounded = Math.round(slot);
      return {
        state: "live",
        text: `${rounded} µs`,
        detail: "Live PWM readback from the current telemetry scope.",
        value: rounded,
      };
    }

    if (slot != null || output.index - 1 < telemetry.servo_outputs.length) {
      return {
        state: "unavailable",
        text: "Unavailable",
        detail: "The latest servo telemetry payload was malformed for this row, so the section refuses to guess the current PWM.",
        value: null,
      };
    }

    return {
      state: "unavailable",
      text: "Unavailable",
      detail: "The latest telemetry payload did not include this servo slot.",
      value: null,
    };
  }

  const staleValue = lastScopedGoodReadbacks[output.index];
  if (typeof staleValue === "number") {
    return {
      state: "stale",
      text: `${staleValue} µs`,
      detail: "Last scoped-good PWM retained while live telemetry settles for the current scope.",
      value: staleValue,
    };
  }

  return {
    state: "unavailable",
    text: "Unavailable",
    detail: liveConnected
      ? "Waiting for truthful servo readback from the current scope."
      : "Reconnect the live vehicle link to recover servo readback.",
    value: null,
  };
}

function bannerVariant(tone: Tone): "info" | "warning" | "danger" {
  switch (tone) {
    case "warning":
      return "warning";
    case "danger":
      return "danger";
    case "info":
    default:
      return "info";
  }
}

function readbackBadgeVariant(readback: ReadbackView): BadgeVariant {
  switch (readback.state) {
    case "live":
      return "success";
    case "stale":
      return "warning";
    case "unavailable":
    default:
      return "muted";
  }
}

function rawDraftValue(output: ServoConfiguredOutput): number {
  return rawPwmByOutput[output.index] ?? output.defaultPwm;
}

function updateRawDraft(output: ServoConfiguredOutput, value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return;
  }

  rawPwmByOutput = {
    ...rawPwmByOutput,
    [output.index]: Math.max(output.minPwm, Math.min(output.maxPwm, clampServoCommandPwm(parsed))),
  };
}

function selectOutput(index: number) {
  selectedOutputIndex = index;
}

function toggleUnlock() {
  if (unlockDisabledReason) {
    return;
  }

  testUnlocked = !testUnlocked;
  selectedOutputIndex = null;
}

function servoCommandDisabled(output: ServoConfiguredOutput): boolean {
  return !testUnlocked
    || activeOutputIndex !== null
    || !liveConnected
    || view.checkpoint.blocksActions
    || !output.supported;
}

async function sendServoCommand(output: ServoConfiguredOutput, pwm: number) {
  if (servoCommandDisabled(output)) {
    return;
  }

  selectedOutputIndex = output.index;
  activeOutputIndex = output.index;

  const nextErrors = { ...commandErrorByOutput };
  delete nextErrors[output.index];
  commandErrorByOutput = nextErrors;

  try {
    await setServo(output.index, pwm);
    rawPwmByOutput = {
      ...rawPwmByOutput,
      [output.index]: pwm,
    };
    testSuccessByOutput = {
      ...testSuccessByOutput,
      [output.index]: true,
    };
  } catch (error) {
    commandErrorByOutput = {
      ...commandErrorByOutput,
      [output.index]: error instanceof Error ? error.message : String(error),
    };
  } finally {
    activeOutputIndex = null;
  }
}

function stageReverseButtonLabel(output: ServoConfiguredOutput): string {
  const reverseItem = reverseParameterItem(output);
  if (!output.reverseParamName || !reverseItem) {
    return "Manual guidance only";
  }

  const nextValue = reverseItem.value === 1 ? 0 : 1;
  return nextValue === 1 ? "Queue reversal" : "Queue normal direction";
}

function reverseParameterItem(output: ServoConfiguredOutput): ParameterItemModel | null {
  if (!output.reverseParamName) {
    return null;
  }

  return itemIndex.get(output.reverseParamName) ?? null;
}

function canStageReverse(output: ServoConfiguredOutput): boolean {
  const reverseItem = reverseParameterItem(output);
  return Boolean(
    output.reverseParamName
      && reverseItem
      && reverseItem.readOnly !== true
      && !view.checkpoint.blocksActions
      && !params.stagedEdits[output.reverseParamName],
  );
}

function stageReverse(output: ServoConfiguredOutput) {
  if (!output.reverseParamName || !canStageReverse(output)) {
    return;
  }

  const reverseItem = reverseParameterItem(output);
  if (!reverseItem) {
    return;
  }

  paramsStore.stageParameterEdit(reverseItem, reverseItem.value === 1 ? 0 : 1);
}

function reverseStateText(output: ServoConfiguredOutput): string {
  if (!output.reverseParamName) {
    return "Reverse param unavailable";
  }

  if (params.stagedEdits[output.reverseParamName]) {
    return `Queued · ${params.stagedEdits[output.reverseParamName]?.nextValueText ?? "pending"}`;
  }

  const reverseItem = reverseParameterItem(output);
  if (!reverseItem) {
    return "Reverse param unavailable";
  }

  return reverseItem.value === 1 ? "Current · reversed" : "Current · normal";
}

function rawSendButtonLabel(output: ServoConfiguredOutput): string {
  if (activeOutputIndex === output.index) {
    return "Sending…";
  }

  if (output.liveTestStatus === "unsupported-bridge") {
    return `SERVO1–${SERVO_LIVE_TEST_LIMIT} only`;
  }

  if (output.liveTestStatus === "motor-function") {
    return "Use Motors & ESC";
  }

  return "Send raw PWM";
}

function directionControlsVisible(target: ServoTestTarget): boolean {
  return Boolean(testSuccessByOutput[target.index]) && !view.checkpoint.blocksActions;
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

function markDirection(target: ServoTestTarget, result: DirectionResult) {
  if (!directionControlsVisible(target)) {
    return;
  }

  directionResultByOutput = {
    ...directionResultByOutput,
    [target.index]: result,
  };
}
</script>

<SetupSectionShell
  sectionId={section.id}
  eyebrow={section.title}
  title="Grouped servo proof up front, raw PWM escape hatch below"
  description="Function-oriented testers stay grouped by the configured surface, raw per-servo PWM sends stay available as the escape hatch, and every configured output stays visible even when current metadata is partial or above the live actuation bridge window."
  testId={setupWorkspaceTestIds.servoOutputsSection}
  docs={[{ url: docsUrl, label: "ArduPilot Docs", testId: setupWorkspaceTestIds.servoOutputsDocsLink }]}
>
  {#snippet body()}
      <Card.Root class="grid xl:grid-cols-4" density="compact" gap="compact" testId={setupWorkspaceTestIds.servoOutputsSummary}>
    <div>
      <Eyebrow tracking="widest">Function testers</Eyebrow>
      <p class="mt-2 text-sm font-semibold text-text-primary" data-testid={setupWorkspaceTestIds.servoOutputsTesterState}>
        {testerSummaryLabel}
      </p>
      <HelperText class="mt-1">{testerSummaryDetail}</HelperText>
    </div>
    <div>
      <Eyebrow tracking="widest">Safety unlock</Eyebrow>
      <p class="mt-2 text-sm font-semibold text-text-primary" data-testid={setupWorkspaceTestIds.servoOutputsSafetyState}>
        {safetyStateLabel}
      </p>
      <HelperText class="mt-1">{safetyStateDetail}</HelperText>
    </div>
    <div>
      <Eyebrow tracking="widest">Readback truth</Eyebrow>
      <p class="mt-2 text-sm font-semibold text-text-primary" data-testid={setupWorkspaceTestIds.servoOutputsReadbackState}>
        {readbackSummary.label}
      </p>
      <HelperText class="mt-1">{readbackSummary.detail}</HelperText>
    </div>
    <div>
      <Eyebrow tracking="widest">Shared review tray</Eyebrow>
      <p class="mt-2 text-sm font-semibold text-text-primary" data-testid={setupWorkspaceTestIds.servoOutputsReversalState}>
        {reversalStateLabel}
      </p>
      <HelperText class="mt-1">{reversalStateDetail}</HelperText>
    </div>
  </Card.Root>

  {#if retainedReversalFailures.length > 0}
      <Alert
        variant="danger"
        density="compact"
        shadow={false}
      title="The shared review tray is still retaining servo reversal failures."
      testId={setupWorkspaceTestIds.servoOutputsFailure}
    >
      <ul class="mt-2 list-disc space-y-1 pl-5">
        {#each retainedReversalFailures as failure (failure.name)}
          <li>{failure.name} · {failure.message}</li>
        {/each}
      </ul>
    </Alert>
  {/if}

  {#each banners as banner (banner.id)}
      <Alert
        variant={bannerVariant(banner.tone)}
        density="compact"
        shadow={false}
      testId={`${setupWorkspaceTestIds.servoOutputsBannerPrefix}-${banner.id}`}
    >
      {banner.text}
    </Alert>
  {/each}

  <Card.Root density="compact">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <Eyebrow tracking="widest">Servo actuation gate</Eyebrow>
        <HelperText class="mt-2">
          Configured outputs · {configuredOutputs.length} · Live-testable targets · {supportedTargets.length} · Unsupported outputs · {unsupportedOutputs.length}
        </HelperText>
      </div>

      <Button
        variant={testUnlocked ? "destructive" : "secondary"}
        testId={setupWorkspaceTestIds.servoOutputsUnlock}
        disabled={unlockDisabledReason !== null}
        onclick={toggleUnlock}
      >
        {testUnlocked ? "Lock servo actuation" : "Unlock servo actuation"}
      </Button>
    </div>

    {#if unlockDisabledReason}
      <HelperText class="mt-3">{unlockDisabledReason}</HelperText>
    {:else if !testUnlocked}
      <HelperText class="mt-3">Unlock once to expose the grouped min/max testers and the raw per-servo PWM escape hatch below.</HelperText>
    {:else}
      <HelperText class="mt-3">Servo actuation is unlocked for this scoped session. Use the grouped tester first, then drop to the raw inventory only when you need a precise PWM escape hatch.</HelperText>
    {/if}
  </Card.Root>

  {#if configuredOutputs.length === 0}
    <EmptyState title="No configured outputs" description="No configured SERVOx_FUNCTION rows are available for this scope yet. Download parameters first to inspect output state here." />
  {:else}
    <div class="space-y-4">
      <Card.Root density="compact">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Eyebrow tracking="widest">Function-oriented tester</Eyebrow>
            <HelperText class="mt-2">Grouped by configured function so expert operators can test a surface family first, then confirm direction and stage shared-tray reversal fixes without dropping straight to raw PWM.</HelperText>
          </div>
          <Badge variant="muted" testId={setupWorkspaceTestIds.servoOutputsSelectedTarget}>
            {selectedOutputIndex ? `Selected · SERVO${selectedOutputIndex}` : "Selected · none"}
          </Badge>
        </div>

        {#if functionGroups.length === 0}
          <EmptyState class="mt-4" title="No grouped live-test targets" description={`No non-motor SERVO1-${SERVO_LIVE_TEST_LIMIT} targets are currently available for grouped live testing. Use the raw inventory below to inspect every configured output and the explicit unsupported-output copy.`} />
        {:else}
          <div class="mt-4 space-y-4">
            {#each functionGroups as group (group.id)}
              {@const guidance = getDirectionGuidance(group.functionValue)}
              <Card.Root surface="secondary" density="compact" testId={`${setupWorkspaceTestIds.servoOutputsFunctionGroupPrefix}-${group.functionValue}`}>
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p class="text-sm font-semibold text-text-primary">{group.functionLabel}</p>
                    <p class="mt-1 text-xs text-text-muted">Min → {guidance.minLabel} · Max → {guidance.maxLabel}</p>
                  </div>
                  <Badge variant="muted" size="sm" case="normal" shape="pill">
                    {group.targets.length} output{group.targets.length === 1 ? "" : "s"}
                  </Badge>
                </div>

                <div class="mt-4 space-y-3">
                  {#each group.targets as target (target.index)}
                    {@const readback = resolveReadback(target)}
                    {@const directionResult = directionResultByOutput[target.index]}
                    {@const reversalFailure = target.reverseParamName ? params.retainedFailures[target.reverseParamName] : null}
                    <article
                      class={`rounded-lg border px-4 py-4 ${selectedOutputIndex === target.index ? "border-accent/40 bg-accent/5" : "border-border bg-bg-primary/80"}`}
                      data-selected={selectedOutputIndex === target.index}
                      data-testid={`${setupWorkspaceTestIds.servoOutputsRowPrefix}-${target.index}`}
                    >
                      <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div class="flex flex-wrap items-center gap-2">
                            <Button
                              class="h-auto px-2 py-1 text-xs uppercase tracking-widest"
                              size="sm"
                              variant="secondary"
                              onclick={() => selectOutput(target.index)}
                            >
                              {target.outputLabel}
                            </Button>
                            <Badge variant="muted" size="sm" case="normal" shape="pill">
                              {target.minPwm}–{target.maxPwm} µs
                            </Badge>
                            <Badge variant={readbackBadgeVariant(readback)} size="sm" case="normal" shape="pill" testId={`${setupWorkspaceTestIds.servoOutputsRowReadbackPrefix}-${target.index}`}>
                              {readback.state} · {readback.text}
                            </Badge>
                          </div>
                          <HelperText class="mt-2">{readback.detail}</HelperText>
                        </div>

                        <div class="flex flex-wrap gap-2">
                          <Button
                            variant="secondary"
                            testId={`${setupWorkspaceTestIds.servoOutputsRowMinPrefix}-${target.index}`}
                            disabled={servoCommandDisabled(target)}
                            onclick={() => sendServoCommand(target, target.minPwm)}
                          >
                            {activeOutputIndex === target.index ? "Sending…" : `Send Min ${target.minPwm}`}
                          </Button>
                          <Button
                            variant="secondary"
                            testId={`${setupWorkspaceTestIds.servoOutputsRowMaxPrefix}-${target.index}`}
                            disabled={servoCommandDisabled(target)}
                            onclick={() => sendServoCommand(target, target.maxPwm)}
                          >
                            {activeOutputIndex === target.index ? "Sending…" : `Send Max ${target.maxPwm}`}
                          </Button>
                        </div>
                      </div>

                      {#if commandErrorByOutput[target.index]}
                        <Alert
                          class="mt-3"
                          variant="danger"
                          testId={`${setupWorkspaceTestIds.servoOutputsRowErrorPrefix}-${target.index}`}
                        >
                          Servo command rejected · {commandErrorByOutput[target.index]}
                        </Alert>
                      {/if}

                      {#if directionControlsVisible(target)}
                        <Card.Root class="mt-4" surface="secondary" density="default">
                          <div class="flex flex-wrap items-center gap-2">
                            <Eyebrow tracking="widest">Observed direction</Eyebrow>
                            <Badge variant={resultVariant(directionResult)} size="sm" case="normal" shape="pill" testId={`${setupWorkspaceTestIds.servoOutputsRowResultPrefix}-${target.index}`}>
                              {directionResult ?? "Awaiting confirmation"}
                            </Badge>
                          </div>
                          <HelperText class="mt-2">Compare the observed motion with the group guidance above, then record whether the surface moved in the expected direction.</HelperText>
                          <div class="mt-3 flex flex-wrap gap-2">
                            <Button
                              tone="success"
                              variant={directionResult === "correct" ? "soft" : "outline"}
                              testId={`${setupWorkspaceTestIds.servoOutputsRowCorrectPrefix}-${target.index}`}
                              onclick={() => markDirection(target, "correct")}
                            >
                              Correct
                            </Button>
                            <Button
                              tone="danger"
                              variant={directionResult === "reversed" ? "soft" : "outline"}
                              testId={`${setupWorkspaceTestIds.servoOutputsRowReversedPrefix}-${target.index}`}
                              onclick={() => markDirection(target, "reversed")}
                            >
                              Reversed
                            </Button>
                          </div>

                          {#if directionResult === "reversed"}
                            <div class="mt-4">
                              <p class="text-sm leading-6 text-text-secondary">Queue the corresponding SERVOx_REVERSED change through the shared review tray only; this section never writes it directly.</p>
                              <div class="mt-3 flex flex-wrap items-center gap-2">
                                <Button
                                  variant="secondary"
                                  testId={`${setupWorkspaceTestIds.servoOutputsRowReversePrefix}-${target.index}`}
                                  disabled={!canStageReverse(target)}
                                  onclick={() => stageReverse(target)}
                                >
                                  {target.reverseParamName && params.stagedEdits[target.reverseParamName]
                                    ? "Queued in review tray"
                                    : stageReverseButtonLabel(target)}
                                </Button>
                                <HelperText as="span" size="xs">{reverseStateText(target)}</HelperText>
                              </div>

                              {#if reversalFailure}
                                <Alert class="mt-3" variant="danger">
                                  {reversalFailure.message}
                                </Alert>
                              {/if}
                            </div>
                          {/if}
                        </Card.Root>
                      {/if}
                    </article>
                  {/each}
                </div>
              </Card.Root>
            {/each}
          </div>
        {/if}
      </Card.Root>

      <Card.Root density="compact">
        <div>
          <Eyebrow tracking="widest">Raw PWM escape hatch</Eyebrow>
          <HelperText class="mt-2">Every configured output stays visible here. Use the raw send only when the grouped tester is not enough, and keep unsupported or motor-owned rows visible for diagnosis instead of pretending they do not exist.</HelperText>
        </div>

        <div class="mt-4 space-y-4">
          {#each rawGroups as group (group.id)}
            <Card.Root surface="secondary" density="compact" testId={`${setupWorkspaceTestIds.servoOutputsRawGroupPrefix}-${group.id}`}>
              <div>
                <p class="text-sm font-semibold text-text-primary">{group.title}</p>
                <HelperText class="mt-1">{group.description}</HelperText>
              </div>

              <div class="mt-4 space-y-3">
                {#each group.outputs as output (output.index)}
                  {@const readback = resolveReadback(output)}
                  {@const reversalFailure = output.reverseParamName ? params.retainedFailures[output.reverseParamName] : null}
                  <article
                    class={`rounded-lg border px-4 py-4 ${selectedOutputIndex === output.index ? "border-accent/40 bg-accent/5" : "border-border bg-bg-primary/80"}`}
                    data-selected={selectedOutputIndex === output.index}
                    data-testid={`${setupWorkspaceTestIds.servoOutputsRawRowPrefix}-${output.index}`}
                  >
                    <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div class="flex flex-wrap items-center gap-2">
                          <Button
                            class="h-auto px-2 py-1 text-xs uppercase tracking-widest"
                            size="sm"
                            variant="secondary"
                            onclick={() => selectOutput(output.index)}
                          >
                            {output.outputLabel}
                          </Button>
                          <span class="text-sm font-semibold text-text-primary">{output.functionLabel}</span>
                          <Badge variant={readbackBadgeVariant(readback)} size="sm" case="normal" shape="pill" testId={`${setupWorkspaceTestIds.servoOutputsRawReadbackPrefix}-${output.index}`}>
                            {readback.state} · {readback.text}
                          </Badge>
                        </div>
                        <HelperText class="mt-2" testId={`${setupWorkspaceTestIds.servoOutputsRawAvailabilityPrefix}-${output.index}`}>
                          {output.liveTestReason ?? `Live actuation is available for this row once the section-level unlock is open. Safe window · ${output.minPwm}–${output.maxPwm} µs.`}
                        </HelperText>
                        <HelperText class="mt-1" size="xs" tone="muted">Raw default · <MonoValue size="xs" tone="muted" value={output.defaultPwm} /> µs · Reverse state · {reverseStateText(output)}</HelperText>
                      </div>

                      <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <Input
                          class="w-28 font-mono"
                          data-testid={`${setupWorkspaceTestIds.servoOutputsRawInputPrefix}-${output.index}`}
                          disabled={!output.supported || !testUnlocked || activeOutputIndex !== null || !liveConnected || view.checkpoint.blocksActions}
                          max={output.maxPwm}
                          min={output.minPwm}
                          oninput={(event) => updateRawDraft(output, (event.currentTarget as HTMLInputElement).value)}
                          type="number"
                          value={String(rawDraftValue(output))}
                        />
                        <Button
                          variant="secondary"
                          testId={`${setupWorkspaceTestIds.servoOutputsRawSendPrefix}-${output.index}`}
                          disabled={servoCommandDisabled(output)}
                          onclick={() => sendServoCommand(output, rawDraftValue(output))}
                        >
                          {rawSendButtonLabel(output)}
                        </Button>
                        <Button
                          variant="secondary"
                          testId={`${setupWorkspaceTestIds.servoOutputsRawReversePrefix}-${output.index}`}
                          disabled={!canStageReverse(output)}
                          onclick={() => stageReverse(output)}
                        >
                          {output.reverseParamName && params.stagedEdits[output.reverseParamName]
                            ? "Queued in review tray"
                            : stageReverseButtonLabel(output)}
                        </Button>
                      </div>
                    </div>

                    {#if commandErrorByOutput[output.index]}
                      <Alert
                        class="mt-3"
                        variant="danger"
                        testId={`${setupWorkspaceTestIds.servoOutputsRawErrorPrefix}-${output.index}`}
                      >
                        Servo command rejected · {commandErrorByOutput[output.index]}
                      </Alert>
                    {/if}

                    {#if reversalFailure}
                      <Alert class="mt-3" variant="danger">
                        {reversalFailure.message}
                      </Alert>
                    {/if}
                  </article>
                {/each}
              </div>
            </Card.Root>
          {/each}
        </div>
      </Card.Root>
    </div>
  {/if}
  {/snippet}
</SetupSectionShell>

<script lang="ts">
import { fromStore } from "svelte/store";

import {
  getParamsStoreContext,
  getSessionStoreContext,
} from "../../app/shell/runtime-context";
import { setServo } from "../../calibration";
import { resolveDocsUrl } from "../../data/ardupilot-docs";
import {
  buildParameterItemIndex,
  type ParameterItemModel,
} from "../../lib/params/parameter-item-model";
import { getDirectionGuidance } from "../../lib/setup/servo-direction-guidance";
import {
  SERVO_LIVE_TEST_LIMIT,
  clampServoCommandPwm,
  deriveConfiguredServoOutputs,
  deriveServoOutputGroups,
  deriveServoTestTargets,
  groupServoTestTargetsByFunction,
  type ServoConfiguredOutput,
  type ServoTestTarget,
} from "../../lib/setup/servo-test-model";
import { deriveVehicleProfile } from "../../lib/setup/vehicle-profile";
import type {
  SetupWorkspaceSection,
  SetupWorkspaceStoreState,
} from "../../lib/stores/setup-workspace";
import { selectTelemetryView } from "../../lib/telemetry-selectors";
import SetupSectionShell from "./SetupSectionShell.svelte";
import { setupWorkspaceTestIds } from "./setup-workspace-test-ids";

type Tone = "info" | "warning" | "danger";
type Banner = { id: string; tone: Tone; text: string };
type DirectionResult = "correct" | "reversed";
type ReadbackView = {
  state: "live" | "stale" | "unavailable";
  text: string;
  detail: string;
  value: number | null;
};

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

function readbackTone(readback: ReadbackView): string {
  switch (readback.state) {
    case "live":
      return "border-success/30 bg-success/10 text-success";
    case "stale":
      return "border-warning/30 bg-warning/10 text-warning";
    case "unavailable":
    default:
      return "border-border bg-bg-primary text-text-muted";
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

function resultTone(result: DirectionResult | undefined): string {
  if (result === "correct") {
    return "border-success/30 bg-success/10 text-success";
  }

  if (result === "reversed") {
    return "border-danger/30 bg-danger/10 text-danger";
  }

  return "border-border bg-bg-primary text-text-muted";
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
  eyebrow={section.title}
  title="Grouped servo proof up front, raw PWM escape hatch below"
  description="Function-oriented testers stay grouped by the configured surface, raw per-servo PWM sends stay available as the escape hatch, and every configured output stays visible even when current metadata is partial or above the live actuation bridge window."
  testId={setupWorkspaceTestIds.servoOutputsSection}
>
  {#snippet actions()}
    {#if docsUrl}
      <a
        class="rounded-md border border-border bg-bg-primary/80 px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent"
        data-testid={setupWorkspaceTestIds.servoOutputsDocsLink}
        href={docsUrl}
        rel="noreferrer"
        target="_blank"
      >
        Servo output docs
      </a>
    {/if}
  {/snippet}

  {#snippet body()}
      <div
        class="grid gap-3 rounded-lg border border-border bg-bg-primary/80 p-3 xl:grid-cols-4"
        data-testid={setupWorkspaceTestIds.servoOutputsSummary}
      >
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Function testers</p>
      <p class="mt-2 text-sm font-semibold text-text-primary" data-testid={setupWorkspaceTestIds.servoOutputsTesterState}>
        {testerSummaryLabel}
      </p>
      <p class="mt-1 text-sm text-text-secondary">{testerSummaryDetail}</p>
    </div>
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Safety unlock</p>
      <p class="mt-2 text-sm font-semibold text-text-primary" data-testid={setupWorkspaceTestIds.servoOutputsSafetyState}>
        {safetyStateLabel}
      </p>
      <p class="mt-1 text-sm text-text-secondary">{safetyStateDetail}</p>
    </div>
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Readback truth</p>
      <p class="mt-2 text-sm font-semibold text-text-primary" data-testid={setupWorkspaceTestIds.servoOutputsReadbackState}>
        {readbackSummary.label}
      </p>
      <p class="mt-1 text-sm text-text-secondary">{readbackSummary.detail}</p>
    </div>
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Shared review tray</p>
      <p class="mt-2 text-sm font-semibold text-text-primary" data-testid={setupWorkspaceTestIds.servoOutputsReversalState}>
        {reversalStateLabel}
      </p>
      <p class="mt-1 text-sm text-text-secondary">{reversalStateDetail}</p>
    </div>
  </div>

  {#if retainedReversalFailures.length > 0}
    <div
      class="rounded-lg border border-danger/40 bg-danger/10 px-4 py-4 text-sm leading-6 text-danger"
      data-testid={setupWorkspaceTestIds.servoOutputsFailure}
    >
      <p class="font-semibold text-text-primary">The shared review tray is still retaining servo reversal failures.</p>
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
      data-testid={`${setupWorkspaceTestIds.servoOutputsBannerPrefix}-${banner.id}`}
    >
      {banner.text}
    </div>
  {/each}

  <div class="rounded-lg border border-border bg-bg-primary/80 p-3">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Servo actuation gate</p>
        <p class="mt-2 text-sm text-text-secondary">
          Configured outputs · {configuredOutputs.length} · Live-testable targets · {supportedTargets.length} · Unsupported outputs · {unsupportedOutputs.length}
        </p>
      </div>

      <button
        class={`rounded-md border px-4 py-2 text-sm font-semibold transition ${testUnlocked ? "border-danger/40 bg-danger/10 text-danger" : "border-border bg-bg-secondary text-text-primary hover:border-accent hover:text-accent"}`}
        data-testid={setupWorkspaceTestIds.servoOutputsUnlock}
        disabled={unlockDisabledReason !== null}
        onclick={toggleUnlock}
        type="button"
      >
        {testUnlocked ? "Lock servo actuation" : "Unlock servo actuation"}
      </button>
    </div>

    {#if unlockDisabledReason}
      <p class="mt-3 text-sm leading-6 text-text-secondary">{unlockDisabledReason}</p>
    {:else if !testUnlocked}
      <p class="mt-3 text-sm leading-6 text-text-secondary">Unlock once to expose the grouped min/max testers and the raw per-servo PWM escape hatch below.</p>
    {:else}
      <p class="mt-3 text-sm leading-6 text-text-secondary">Servo actuation is unlocked for this scoped session. Use the grouped tester first, then drop to the raw inventory only when you need a precise PWM escape hatch.</p>
    {/if}
  </div>

  {#if configuredOutputs.length === 0}
    <div class="rounded-lg border border-border bg-bg-primary/80 px-4 py-4 text-sm leading-6 text-text-secondary">
      No configured SERVOx_FUNCTION rows are available for this scope yet. Download parameters first or open Full Parameters recovery to inspect raw output state.
      <button
        class="ml-3 rounded-md border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent"
        onclick={onSelectRecovery}
        type="button"
      >
        Open Full Parameters recovery
      </button>
    </div>
  {:else}
    <div class="space-y-4">
      <div class="rounded-lg border border-border bg-bg-primary/80 p-3">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Function-oriented tester</p>
            <p class="mt-2 text-sm text-text-secondary">Grouped by configured function so expert operators can test a surface family first, then confirm direction and stage shared-tray reversal fixes without dropping straight to raw PWM.</p>
          </div>
          <span class="rounded-full border border-border bg-bg-secondary px-3 py-1 text-xs font-semibold text-text-secondary" data-testid={setupWorkspaceTestIds.servoOutputsSelectedTarget}>
            {selectedOutputIndex ? `Selected · SERVO${selectedOutputIndex}` : "Selected · none"}
          </span>
        </div>

        {#if functionGroups.length === 0}
          <div class="mt-4 rounded-lg border border-border bg-bg-secondary/70 px-4 py-4 text-sm leading-6 text-text-secondary">
            No non-motor SERVO1–{SERVO_LIVE_TEST_LIMIT} targets are currently available for grouped live testing. Use the raw inventory below to inspect every configured output and the explicit unsupported-output copy.
          </div>
        {:else}
          <div class="mt-4 space-y-4">
            {#each functionGroups as group (group.id)}
              {@const guidance = getDirectionGuidance(group.functionValue)}
              <div class="rounded-lg border border-border bg-bg-secondary/70 p-3" data-testid={`${setupWorkspaceTestIds.servoOutputsFunctionGroupPrefix}-${group.functionValue}`}>
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p class="text-sm font-semibold text-text-primary">{group.functionLabel}</p>
                    <p class="mt-1 text-xs text-text-muted">Min → {guidance.minLabel} · Max → {guidance.maxLabel}</p>
                  </div>
                  <span class="rounded-full border border-border bg-bg-primary px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">
                    {group.targets.length} output{group.targets.length === 1 ? "" : "s"}
                  </span>
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
                            <button
                              class="rounded-md border border-border bg-bg-secondary px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary transition hover:border-accent hover:text-accent"
                              onclick={() => selectOutput(target.index)}
                              type="button"
                            >
                              {target.outputLabel}
                            </button>
                            <span class="rounded-full border border-border bg-bg-secondary px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">
                              {target.minPwm}–{target.maxPwm} µs
                            </span>
                            <span class={`rounded-full border px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${readbackTone(readback)}`} data-testid={`${setupWorkspaceTestIds.servoOutputsRowReadbackPrefix}-${target.index}`}>
                              {readback.state} · {readback.text}
                            </span>
                          </div>
                          <p class="mt-2 text-sm leading-6 text-text-secondary">{readback.detail}</p>
                        </div>

                        <div class="flex flex-wrap gap-2">
                          <button
                            class="rounded-md border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
                            data-testid={`${setupWorkspaceTestIds.servoOutputsRowMinPrefix}-${target.index}`}
                            disabled={servoCommandDisabled(target)}
                            onclick={() => sendServoCommand(target, target.minPwm)}
                            type="button"
                          >
                            {activeOutputIndex === target.index ? "Sending…" : `Send Min ${target.minPwm}`}
                          </button>
                          <button
                            class="rounded-md border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
                            data-testid={`${setupWorkspaceTestIds.servoOutputsRowMaxPrefix}-${target.index}`}
                            disabled={servoCommandDisabled(target)}
                            onclick={() => sendServoCommand(target, target.maxPwm)}
                            type="button"
                          >
                            {activeOutputIndex === target.index ? "Sending…" : `Send Max ${target.maxPwm}`}
                          </button>
                        </div>
                      </div>

                      {#if commandErrorByOutput[target.index]}
                        <div
                          class="mt-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-3 text-sm text-danger"
                          data-testid={`${setupWorkspaceTestIds.servoOutputsRowErrorPrefix}-${target.index}`}
                        >
                          Servo command rejected · {commandErrorByOutput[target.index]}
                        </div>
                      {/if}

                      {#if directionControlsVisible(target)}
                        <div class="mt-4 rounded-lg border border-border bg-bg-secondary/70 px-4 py-4">
                          <div class="flex flex-wrap items-center gap-2">
                            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Observed direction</p>
                            <span class={`rounded-full border px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${resultTone(directionResult)}`} data-testid={`${setupWorkspaceTestIds.servoOutputsRowResultPrefix}-${target.index}`}>
                              {directionResult ?? "Awaiting confirmation"}
                            </span>
                          </div>
                          <p class="mt-2 text-sm leading-6 text-text-secondary">Compare the observed motion with the group guidance above, then record whether the surface moved in the expected direction.</p>
                          <div class="mt-3 flex flex-wrap gap-2">
                            <button
                              class={`rounded-md border px-4 py-2 text-sm font-semibold transition ${directionResult === "correct" ? "border-success/40 bg-success/10 text-success" : "border-border bg-bg-primary text-text-primary hover:border-accent hover:text-accent"}`}
                              data-testid={`${setupWorkspaceTestIds.servoOutputsRowCorrectPrefix}-${target.index}`}
                              onclick={() => markDirection(target, "correct")}
                              type="button"
                            >
                              Correct
                            </button>
                            <button
                              class={`rounded-md border px-4 py-2 text-sm font-semibold transition ${directionResult === "reversed" ? "border-danger/40 bg-danger/10 text-danger" : "border-border bg-bg-primary text-text-primary hover:border-accent hover:text-accent"}`}
                              data-testid={`${setupWorkspaceTestIds.servoOutputsRowReversedPrefix}-${target.index}`}
                              onclick={() => markDirection(target, "reversed")}
                              type="button"
                            >
                              Reversed
                            </button>
                          </div>

                          {#if directionResult === "reversed"}
                            <div class="mt-4">
                              <p class="text-sm leading-6 text-text-secondary">Queue the corresponding SERVOx_REVERSED change through the shared review tray only; this section never writes it directly.</p>
                              <div class="mt-3 flex flex-wrap items-center gap-2">
                                <button
                                  class="rounded-md border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
                                  data-testid={`${setupWorkspaceTestIds.servoOutputsRowReversePrefix}-${target.index}`}
                                  disabled={!canStageReverse(target)}
                                  onclick={() => stageReverse(target)}
                                  type="button"
                                >
                                  {target.reverseParamName && params.stagedEdits[target.reverseParamName]
                                    ? "Queued in review tray"
                                    : stageReverseButtonLabel(target)}
                                </button>
                                <span class="text-xs text-text-secondary">{reverseStateText(target)}</span>
                              </div>

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
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <div class="rounded-lg border border-border bg-bg-primary/80 p-3">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Raw PWM escape hatch</p>
          <p class="mt-2 text-sm text-text-secondary">Every configured output stays visible here. Use the raw send only when the grouped tester is not enough, and keep unsupported or motor-owned rows visible for diagnosis instead of pretending they do not exist.</p>
        </div>

        <div class="mt-4 space-y-4">
          {#each rawGroups as group (group.id)}
            <div class="rounded-lg border border-border bg-bg-secondary/70 p-3" data-testid={`${setupWorkspaceTestIds.servoOutputsRawGroupPrefix}-${group.id}`}>
              <div>
                <p class="text-sm font-semibold text-text-primary">{group.title}</p>
                <p class="mt-1 text-sm leading-6 text-text-secondary">{group.description}</p>
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
                          <button
                            class="rounded-md border border-border bg-bg-secondary px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary transition hover:border-accent hover:text-accent"
                            onclick={() => selectOutput(output.index)}
                            type="button"
                          >
                            {output.outputLabel}
                          </button>
                          <span class="text-sm font-semibold text-text-primary">{output.functionLabel}</span>
                          <span class={`rounded-full border px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${readbackTone(readback)}`} data-testid={`${setupWorkspaceTestIds.servoOutputsRawReadbackPrefix}-${output.index}`}>
                            {readback.state} · {readback.text}
                          </span>
                        </div>
                        <p class="mt-2 text-sm leading-6 text-text-secondary" data-testid={`${setupWorkspaceTestIds.servoOutputsRawAvailabilityPrefix}-${output.index}`}>
                          {output.liveTestReason ?? `Live actuation is available for this row once the section-level unlock is open. Safe window · ${output.minPwm}–${output.maxPwm} µs.`}
                        </p>
                        <p class="mt-1 text-xs text-text-muted">Raw default · {output.defaultPwm} µs · Reverse state · {reverseStateText(output)}</p>
                      </div>

                      <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <input
                          class="w-28 rounded-xl border border-border bg-bg-secondary px-3 py-2 text-sm font-mono text-text-primary"
                          data-testid={`${setupWorkspaceTestIds.servoOutputsRawInputPrefix}-${output.index}`}
                          disabled={!output.supported || !testUnlocked || activeOutputIndex !== null || !liveConnected || view.checkpoint.blocksActions}
                          max={output.maxPwm}
                          min={output.minPwm}
                          oninput={(event) => updateRawDraft(output, (event.currentTarget as HTMLInputElement).value)}
                          type="number"
                          value={String(rawDraftValue(output))}
                        />
                        <button
                          class="rounded-md border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
                          data-testid={`${setupWorkspaceTestIds.servoOutputsRawSendPrefix}-${output.index}`}
                          disabled={servoCommandDisabled(output)}
                          onclick={() => sendServoCommand(output, rawDraftValue(output))}
                          type="button"
                        >
                          {rawSendButtonLabel(output)}
                        </button>
                        <button
                          class="rounded-md border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
                          data-testid={`${setupWorkspaceTestIds.servoOutputsRawReversePrefix}-${output.index}`}
                          disabled={!canStageReverse(output)}
                          onclick={() => stageReverse(output)}
                          type="button"
                        >
                          {output.reverseParamName && params.stagedEdits[output.reverseParamName]
                            ? "Queued in review tray"
                            : stageReverseButtonLabel(output)}
                        </button>
                      </div>
                    </div>

                    {#if commandErrorByOutput[output.index]}
                      <div
                        class="mt-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-3 text-sm text-danger"
                        data-testid={`${setupWorkspaceTestIds.servoOutputsRawErrorPrefix}-${output.index}`}
                      >
                        Servo command rejected · {commandErrorByOutput[output.index]}
                      </div>
                    {/if}

                    {#if reversalFailure}
                      <div class="mt-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-3 text-sm text-danger">
                        {reversalFailure.message}
                      </div>
                    {/if}
                  </article>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}
  {/snippet}
</SetupSectionShell>

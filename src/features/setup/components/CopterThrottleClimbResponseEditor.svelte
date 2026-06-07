<script lang="ts">
import { CircleDot, Gauge, RotateCcw } from "lucide-svelte";

import { Button, Card, EmptyState, Eyebrow, HelperText, MonoValue } from "../../../components/ui";
import { formatParamValue, type ParameterItemModel } from "../../../lib/params/parameter-item-model";
import {
  copterThrottleToClimbRateMps,
  resolveCopterPilotSpeedDownMps,
  resolveCopterThrottleControlMidpoint,
  resolveCopterThrottleDeadband,
  resolveCopterThrottleMarker,
  sampleCopterThrottleResponse,
  type CopterThrottleResponsePoint,
} from "../../../lib/setup/copter-throttle-response";
import { clampNumber, roundToIncrement } from "../../../lib/setup/rate-curves";
import type { RcChannelSample } from "../../../lib/setup/rc-input-normalization";
import SetupParamEditCard from "../shared/SetupParamEditCard.svelte";
import SetupParamEditGrid from "../shared/SetupParamEditGrid.svelte";
import { setupWorkspaceTestIds } from "../setup-workspace-test-ids";

type StagedEdit = { nextValue: number };

type Props = {
  itemIndex: ReadonlyMap<string, ParameterItemModel>;
  stagedEdits: Record<string, StagedEdit | undefined>;
  channels: RcChannelSample[];
  disabled?: boolean;
  onStageParameter: (item: ParameterItemModel, value: number) => void;
};

type ThrottleParameterName = "THR_DZ" | "PILOT_SPD_UP" | "PILOT_SPD_DN" | "PILOT_ACC_Z";

type ThrottleParameterSpec = {
  name: ThrottleParameterName;
  label: string;
  description: string;
  fallbackMin: number;
  fallbackMax: number;
  fallbackStep: number;
  unit: string;
};

type ThrottleParameterControl = ThrottleParameterSpec & {
  item: ParameterItemModel;
  currentValue: number;
  draftValue: number;
  min: number;
  max: number;
  step: number;
  readOnly: boolean;
  changed: boolean;
};

const CHART = {
  left: 62,
  right: 620,
  top: 20,
  bottom: 224,
};
const THROTTLE_SPECS: ThrottleParameterSpec[] = [
  {
    name: "THR_DZ",
    label: "AltHold stick deadband",
    description: "Zero-climb band around throttle midpoint. ArduCopter clamps this to 0–400 throttle control units.",
    fallbackMin: 0,
    fallbackMax: 400,
    fallbackStep: 1,
    unit: "control units",
  },
  {
    name: "PILOT_SPD_UP",
    label: "Maximum climb speed",
    description: "Positive climb-rate request at the top of the throttle control range.",
    fallbackMin: 0.5,
    fallbackMax: 5,
    fallbackStep: 0.1,
    unit: "m/s",
  },
  {
    name: "PILOT_SPD_DN",
    label: "Maximum descent speed",
    description: "Descent-rate magnitude at the bottom of the throttle control range. Set 0 to reuse climb speed.",
    fallbackMin: 0,
    fallbackMax: 5,
    fallbackStep: 0.1,
    unit: "m/s",
  },
  {
    name: "PILOT_ACC_Z",
    label: "Vertical acceleration feel",
    description: "Changes vertical responsiveness and dynamics. It does not modify the static curve.",
    fallbackMin: 0.5,
    fallbackMax: 5,
    fallbackStep: 0.1,
    unit: "m/s²",
  },
];

let {
  itemIndex,
  stagedEdits,
  channels,
  disabled = false,
  onStageParameter,
}: Props = $props();

let draftOverrides = $state<Record<string, number>>({});

function resolveValue(name: string): number | null {
  const item = itemIndex.get(name);
  const value = draftOverrides[name] ?? stagedEdits[name]?.nextValue ?? item?.value;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function buildControl(spec: ThrottleParameterSpec): ThrottleParameterControl | null {
  const item = itemIndex.get(spec.name);
  if (!item) {
    return null;
  }

  const min = item.range?.min ?? spec.fallbackMin;
  const max = item.range?.max ?? spec.fallbackMax;
  const step = item.increment ?? spec.fallbackStep;
  const draftValue = clampParameterDraft(resolveValue(spec.name) ?? item.value, min, max, step);
  return {
    ...spec,
    item,
    currentValue: item.value,
    draftValue,
    min,
    max,
    step,
    readOnly: item.readOnly,
    changed: Math.abs(draftValue - item.value) > Math.max(1e-6, step * 0.001),
  };
}

let controls = $derived(THROTTLE_SPECS.map(buildControl));
let allControlsAvailable = $derived(controls.every((control): control is ThrottleParameterControl => control != null));
let availableControls = $derived(controls.filter((control): control is ThrottleParameterControl => control != null));
let controlIndex = $derived(new Map(availableControls.map((control) => [control.name, control])));
let changedControls = $derived(availableControls.filter((control) => control.changed));

let liveMarker = $derived(resolveCopterThrottleMarker({ channels, itemIndex, resolveValue }));
let throttleMid = $derived(liveMarker?.throttleMid ?? resolveCopterThrottleControlMidpoint({ itemIndex, resolveValue }) ?? 500);
let currentCurveInput = $derived(allControlsAvailable ? buildCurveInput("currentValue") : null);
let draftCurveInput = $derived(allControlsAvailable ? buildCurveInput("draftValue") : null);
let currentPoints = $derived(currentCurveInput ? sampleCopterThrottleResponse(currentCurveInput) : []);
let draftPoints = $derived(draftCurveInput ? sampleCopterThrottleResponse(draftCurveInput) : []);
let currentDeadband = $derived(currentCurveInput ? resolveCopterThrottleDeadband(throttleMid, currentCurveInput.throttleDeadZone) : null);
let draftDeadband = $derived(draftCurveInput ? resolveCopterThrottleDeadband(throttleMid, draftCurveInput.throttleDeadZone) : null);
let maxChartSpeed = $derived(currentCurveInput && draftCurveInput
  ? Math.max(
      1,
      currentCurveInput.pilotSpeedUpMps,
      draftCurveInput.pilotSpeedUpMps,
      resolveCopterPilotSpeedDownMps(currentCurveInput.pilotSpeedDownMps, currentCurveInput.pilotSpeedUpMps),
      resolveCopterPilotSpeedDownMps(draftCurveInput.pilotSpeedDownMps, draftCurveInput.pilotSpeedUpMps),
    )
  : 1);
let currentPath = $derived(pathFor(currentPoints));
let draftPath = $derived(pathFor(draftPoints));
let liveClimbRateMps = $derived(liveMarker && draftCurveInput
  ? copterThrottleToClimbRateMps({ ...draftCurveInput, throttleControl: liveMarker.throttleControl })
  : null);

function buildCurveInput(key: "currentValue" | "draftValue") {
  return {
    throttleMid,
    throttleDeadZone: controlIndex.get("THR_DZ")?.[key] ?? 100,
    pilotSpeedUpMps: controlIndex.get("PILOT_SPD_UP")?.[key] ?? 2.5,
    pilotSpeedDownMps: controlIndex.get("PILOT_SPD_DN")?.[key] ?? 0,
  };
}

function chartX(throttleControl: number): number {
  return CHART.left + (clampNumber(throttleControl, 0, 1000) / 1000) * (CHART.right - CHART.left);
}

function chartY(climbRateMps: number): number {
  const midpoint = (CHART.top + CHART.bottom) / 2;
  return midpoint - (climbRateMps / maxChartSpeed) * ((CHART.bottom - CHART.top) / 2);
}

function pathFor(points: CopterThrottleResponsePoint[]): string {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${chartX(point.throttleControl)} ${chartY(point.climbRateMps)}`).join(" ");
}

function updateControl(control: ThrottleParameterControl, value: number) {
  if (disabled || control.readOnly || !Number.isFinite(value)) {
    return;
  }

  draftOverrides = {
    ...draftOverrides,
    [control.name]: clampParameterDraft(value, control.min, control.max, control.step),
  };
}

function stageDraft() {
  if (disabled) {
    return;
  }

  for (const control of changedControls) {
    if (!control.readOnly) {
      onStageParameter(control.item, control.draftValue);
    }
  }
}

function resetDraft() {
  draftOverrides = {};
}

function clampParameterDraft(value: number, min: number, max: number, step: number): number {
  return clampNumber(roundToIncrement(clampNumber(value, min, max), step), min, max);
}

function formatControlValue(control: ThrottleParameterControl, value: number): string {
  return `${formatParamValue(value, control.step)} ${control.unit}`;
}

function formatSpeed(value: number): string {
  return `${formatParamValue(value, 0.1)} m/s`;
}
</script>

{#snippet parameterControl(control: ThrottleParameterControl)}
  <SetupParamEditCard
    item={control.item}
    inputId={`copter-throttle-control-${control.name}`}
    label={control.label}
    description={control.description}
    value={control.draftValue}
    min={control.min}
    max={control.max}
    step={control.step}
    unit={control.unit}
    metadata={control.name}
    {disabled}
    inputTestId={`${setupWorkspaceTestIds.rcThrottleInputPrefix}-${control.name}`}
    onValueChange={(value) => typeof value === "number" && updateControl(control, value)}
  />
{/snippet}

{#if !allControlsAvailable || !currentCurveInput || !draftCurveInput || !currentDeadband || !draftDeadband}
  <EmptyState
    title="Copter climb response unavailable"
    description="This firmware did not expose THR_DZ, PILOT_SPD_UP, PILOT_SPD_DN, and PILOT_ACC_Z together, so there is no AltHold-style climb response to edit."
    testId={setupWorkspaceTestIds.rcThrottleUnavailable}
  />
{:else}
  <div class="min-w-0 space-y-4" data-testid={setupWorkspaceTestIds.rcThrottleCard}>
    <div class="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
      <div class="grid min-w-0 gap-3 rounded-lg border border-border bg-bg-secondary p-3">
        <div>
          <div class="flex flex-wrap items-center gap-2">
            <CircleDot size={16} class="text-accent" aria-hidden="true" />
            <p class="text-sm font-semibold text-text-primary">Throttle control input to climb rate</p>
          </div>
          <HelperText class="mt-1" size="xs">
            Static AltHold-style mapping after the throttle channel is normalized into a 0–1000 control range. Surface tracking may adjust effective limits in flight.
          </HelperText>
        </div>

        <div class="min-w-0 overflow-x-auto pb-1">
          <svg
            class="h-auto min-w-[36rem] w-full"
            viewBox="0 0 680 286"
            role="img"
            aria-label="Current and draft Copter throttle control input to climb-rate response curves with shaded deadband"
            data-testid={setupWorkspaceTestIds.rcThrottlePreview}
          >
            <rect x={CHART.left} y={CHART.top} width={CHART.right - CHART.left} height={CHART.bottom - CHART.top} rx="8" class="fill-bg-primary stroke-border" />
            <rect x={chartX(currentDeadband.bottom)} y={CHART.top} width={chartX(currentDeadband.top) - chartX(currentDeadband.bottom)} height={CHART.bottom - CHART.top} class="fill-text-muted/10" />
            <rect x={chartX(draftDeadband.bottom)} y={CHART.top} width={chartX(draftDeadband.top) - chartX(draftDeadband.bottom)} height={CHART.bottom - CHART.top} class="fill-accent/10" />
            <line x1={CHART.left} y1={chartY(0)} x2={CHART.right} y2={chartY(0)} class="stroke-border" stroke-width="1.5" />
            <line x1={chartX(throttleMid)} y1={CHART.top} x2={chartX(throttleMid)} y2={CHART.bottom} class="stroke-border/70" stroke-width="1" stroke-dasharray="4 5" />
            <text x={chartX(throttleMid)} y={CHART.top - 6} text-anchor="middle" class="fill-text-secondary text-xs">mid {Math.round(throttleMid)}</text>
            <path d={currentPath} class="fill-none stroke-text-muted" stroke-width="2.5" stroke-dasharray="6 5" />
            <path d={draftPath} class="fill-none stroke-accent" stroke-width="3" />
            {#if liveMarker && liveClimbRateMps != null}
              <line x1={chartX(liveMarker.throttleControl)} y1={CHART.top} x2={chartX(liveMarker.throttleControl)} y2={CHART.bottom} class="stroke-accent/50" stroke-width="1.5" />
              <circle cx={chartX(liveMarker.throttleControl)} cy={chartY(liveClimbRateMps)} r="6" class="fill-accent stroke-bg-primary" stroke-width="3" data-testid={setupWorkspaceTestIds.rcThrottleMarker} />
            {/if}
            <text x={CHART.left - 8} y={CHART.top + 4} text-anchor="end" class="fill-text-muted text-xs">+{formatParamValue(maxChartSpeed, 0.1)}</text>
            <text x={CHART.left - 8} y={chartY(0) + 4} text-anchor="end" class="fill-text-muted text-xs">0</text>
            <text x={CHART.left - 8} y={CHART.bottom + 4} text-anchor="end" class="fill-text-muted text-xs">-{formatParamValue(maxChartSpeed, 0.1)}</text>
            <text x={CHART.left} y={CHART.bottom + 20} text-anchor="middle" class="fill-text-muted text-xs">0</text>
            <text x={chartX(500)} y={CHART.bottom + 20} text-anchor="middle" class="fill-text-muted text-xs">500</text>
            <text x={CHART.right} y={CHART.bottom + 20} text-anchor="middle" class="fill-text-muted text-xs">1000</text>
            <text x={(CHART.left + CHART.right) / 2} y="276" text-anchor="middle" class="fill-text-secondary text-xs">Throttle command / control input (0–1000)</text>
            <text x="18" y={(CHART.top + CHART.bottom) / 2} text-anchor="middle" transform={`rotate(-90 18 ${(CHART.top + CHART.bottom) / 2})`} class="fill-text-secondary text-xs">Climb rate (m/s)</text>
          </svg>
        </div>

        <div class="flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-text-secondary">
          <span class="inline-flex items-center gap-2"><span class="w-5 border-t-2 border-dashed border-text-muted"></span>Current</span>
          <span class="inline-flex items-center gap-2"><span class="w-5 border-t-2 border-accent"></span>Draft</span>
          <span class="inline-flex items-center gap-2"><span class="size-3 rounded-sm bg-accent/15"></span>Draft deadband</span>
        </div>

        {#if liveMarker && liveClimbRateMps != null}
          <p class="text-center text-xs text-text-secondary">
            Live CH{liveMarker.channel} {Math.round(liveMarker.pwm)}µs → throttle control {Math.round(liveMarker.throttleControl)} → {formatSpeed(liveClimbRateMps)}{liveMarker.stale ? " · stale" : ""}
          </p>
        {:else}
          <p class="text-center text-xs text-text-muted">Live throttle marker unavailable until a mapped RC throttle channel is present.</p>
        {/if}
      </div>

      <SetupParamEditGrid>
        {#each availableControls as control (control.name)}
          {@render parameterControl(control)}
        {/each}
      </SetupParamEditGrid>
    </div>

    <div class="grid gap-3 rounded-lg border border-border bg-bg-secondary p-3 sm:grid-cols-3">
      <div>
        <Eyebrow>Throttle midpoint</Eyebrow>
        <p class="mt-1 text-sm font-semibold text-text-primary">{Math.round(throttleMid)} / 1000</p>
        <p class="mt-1 text-xs text-text-secondary">Estimated from mapped throttle RC range calibration.</p>
      </div>
      <div>
        <Eyebrow>Draft deadband</Eyebrow>
        <p class="mt-1 text-sm font-semibold text-text-primary">{Math.round(draftDeadband.bottom)}–{Math.round(draftDeadband.top)}</p>
        <p class="mt-1 text-xs text-text-secondary">Inside this command band the static climb request is zero.</p>
      </div>
      <div>
        <Eyebrow>Dynamics / feel</Eyebrow>
        <p class="mt-1 text-sm font-semibold text-text-primary">{formatControlValue(controlIndex.get("PILOT_ACC_Z")!, controlIndex.get("PILOT_ACC_Z")!.draftValue)}</p>
        <p class="mt-1 text-xs text-text-secondary">PILOT_ACC_Z changes vertical responsiveness, not the plotted static curve.</p>
      </div>
    </div>

    <Card.Root surface="default" density="compact" tone="info" appearance="solid">
      <div class="flex items-start justify-between gap-3 max-sm:flex-col">
        <div>
          <div class="flex items-center gap-2">
            <Gauge size={14} class="text-accent" aria-hidden="true" />
            <Eyebrow>Staged native parameters</Eyebrow>
          </div>
          <p class="mt-1 text-sm text-text-secondary">
            {changedControls.length === 0
              ? "No Copter climb-response changes in the draft."
              : `${changedControls.length} parameter${changedControls.length === 1 ? "" : "s"} will be staged for review.`}
          </p>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <Button size="sm" tone="accent" variant="soft" disabled={disabled || changedControls.length === 0} onclick={stageDraft} testId={setupWorkspaceTestIds.rcThrottleStage}>
            Stage climb response
          </Button>
          <Button size="sm" tone="neutral" variant="ghost" disabled={disabled} onclick={resetDraft} testId={setupWorkspaceTestIds.rcThrottleReset}>
            <RotateCcw size={14} aria-hidden="true" />
            Reset draft
          </Button>
        </div>
      </div>

      <div class="mt-3 grid gap-1">
        {#each availableControls as control (control.name)}
          <div class="grid gap-2 rounded-lg px-2 py-2 text-xs sm:grid-cols-[minmax(0,1fr)_minmax(8rem,auto)_auto] sm:items-center {control.changed ? 'bg-accent/10 text-text-primary' : 'text-text-muted'}">
            <span class="font-medium">{control.label}</span>
            <span class="text-text-secondary">{formatControlValue(control, control.currentValue)} → {formatControlValue(control, control.draftValue)}</span>
            <MonoValue size="xs" tone="muted" wrap>{control.name}</MonoValue>
          </div>
        {/each}
      </div>
    </Card.Root>
  </div>
{/if}

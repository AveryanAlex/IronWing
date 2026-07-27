<script lang="ts">
import { Box, GitBranch, MousePointer2 } from "lucide-svelte";
import { fromStore } from "svelte/store";

import { getParamsStoreContext } from "../../../app/shell/runtime-context";
import { Badge, HelperText, NativeSelect } from "../../../components/ui";
import { buildParameterItemIndex } from "../../../lib/params/parameter-item-model";
import {
  architectureParameterValues,
  getVtolFrameClassOptions,
  getVtolFrameLayoutOptions,
  toggleMotorMask,
  type VtolArchitecture,
  type VtolTopologyModel,
  type VtolValidationIssue,
} from "../../../lib/setup/vtol-topology-model";
import SetupNotice from "../shared/SetupNotice.svelte";
import SetupSectionCard from "../shared/SetupSectionCard.svelte";
import { stageSetupParameterEdit } from "../shared/parameter-editing";
import VtolOutputMapping from "./VtolOutputMapping.svelte";
import VtolTopologyDiagram from "./VtolTopologyDiagram.svelte";

let {
  topology,
  actionsBlocked = false,
}: {
  topology: VtolTopologyModel;
  actionsBlocked?: boolean;
} = $props();

const paramsStore = getParamsStoreContext();
const paramsState = fromStore(paramsStore);

const architectureOptions = [
  { value: "standard", label: "Lift + cruise QuadPlane" },
  { value: "tiltrotor", label: "Tiltrotor / tiltwing" },
  { value: "bicopter", label: "Bicopter tiltrotor" },
  { value: "tailsitter_single_dual", label: "Single / dual motor tailsitter" },
  { value: "tailsitter_copter", label: "Copter-motor tailsitter" },
  { value: "tailsitter_motor_only", label: "Motor-only tailsitter" },
  { value: "custom", label: "Scripted matrix — manual geometry", disabled: true },
  { value: "conflict", label: "Conflicting subtype flags", disabled: true },
] as const;

let params = $derived(paramsState.current);
let itemIndex = $derived(buildParameterItemIndex(params.paramStore, params.metadata));
let proposed = $derived(topology.proposed);
let airframeParamsReady = $derived(
  itemIndex.has("Q_FRAME_CLASS")
    && itemIndex.has("Q_FRAME_TYPE")
    && itemIndex.has("Q_TILT_ENABLE")
    && itemIndex.has("Q_TAILSIT_ENABLE"),
);
let classOptions = $derived.by(() => getVtolFrameClassOptions()
  .filter((option) => classAllowed(option.value, proposed.architecture))
  .map((option) => ({ value: String(option.value), label: `${option.label} — ${option.description}` })));
let layoutOptions = $derived(
  proposed.frameClass === null
    ? []
    : getVtolFrameLayoutOptions(proposed.frameClass).map((option) => ({
        value: String(option.value),
        label: `${option.label} — ${option.description}`,
      })),
);
let selectableMask = $derived(
  proposed.architecture === "tiltrotor"
    ? "tilt" as const
    : proposed.architecture === "tailsitter_copter"
      ? "forward" as const
      : null,
);
let maskParamAvailable = $derived(
  selectableMask === "tilt"
    ? itemIndex.has("Q_TILT_MASK")
    : selectableMask === "forward"
      ? itemIndex.has("Q_TAILSIT_MOTMX")
      : true,
);
let mappingDisabledReason = $derived.by(() => {
  if (actionsBlocked) {
    return "Output mapping is locked by the active reboot/reconnect checkpoint.";
  }
  if (topology.requiresRefreshBeforeMapping) {
    return `Apply ${topology.pendingTopologyParams.join(", ")}, reboot, and refresh parameters before mapping outputs. ArduPilot may create new default assignments on boot.`;
  }
  return null;
});

function classAllowed(frameClass: number, architecture: VtolArchitecture): boolean {
  if (architecture === "bicopter" || architecture === "tailsitter_single_dual") return frameClass === 10;
  if (architecture === "tiltrotor") return [1, 2, 3, 4, 5, 7].includes(frameClass);
  if (architecture === "tailsitter_copter" || architecture === "tailsitter_motor_only") {
    return [1, 2, 3, 4, 5, 7, 12, 14, 15, 17].includes(frameClass);
  }
  return frameClass !== 10;
}

function stage(name: string, nextValue: number) {
  stageSetupParameterEdit(paramsStore, itemIndex.get(name), nextValue, { actionsBlocked });
}

function stageArchitecture(nextArchitecture: VtolArchitecture) {
  const values = { ...architectureParameterValues(nextArchitecture) };
  if (nextArchitecture === "tailsitter_copter") {
    const hasCopterLayout = proposed.frameClass !== null && proposed.frameClass !== 10 && proposed.propulsors.length > 0;
    if (!hasCopterLayout) {
      values.Q_FRAME_CLASS = 1;
      values.Q_FRAME_TYPE = 1;
      values.Q_TAILSIT_MOTMX = 15;
    } else if (proposed.tailsitterMotorMask === 0) {
      values.Q_TAILSIT_MOTMX = proposed.propulsors.reduce(
        (mask, propulsor) => propulsor.motorNumber === null ? mask : mask | (1 << (propulsor.motorNumber - 1)),
        0,
      );
    }
  }
  if (nextArchitecture === "tailsitter_motor_only" && proposed.frameClass === 10) {
    values.Q_FRAME_CLASS = 1;
    values.Q_FRAME_TYPE = 1;
  }
  for (const [name, value] of Object.entries(values)) {
    stage(name, value);
  }
}

function stageFrameClass(value: string) {
  const nextClass = Number(value);
  if (!Number.isFinite(nextClass)) return;
  stage("Q_FRAME_CLASS", nextClass);
  const options = getVtolFrameLayoutOptions(nextClass);
  if (options.length > 0 && (proposed.frameType === null || !options.some((option) => option.matches(proposed.frameType ?? -1)))) {
    stage("Q_FRAME_TYPE", options[0].value);
  }
}

function stageFrameType(value: string) {
  const nextType = Number(value);
  if (Number.isFinite(nextType)) stage("Q_FRAME_TYPE", nextType);
}

function stageMechanism(value: string) {
  const nextType = Number(value);
  if (Number.isFinite(nextType)) stage("Q_TILT_TYPE", nextType);
}

function toggleDiagramMotor(motorNumber: number) {
  if (selectableMask === "tilt") {
    stage("Q_TILT_MASK", toggleMotorMask(proposed.tiltMask, motorNumber));
  } else if (selectableMask === "forward") {
    stage("Q_TAILSIT_MOTMX", toggleMotorMask(proposed.tailsitterMotorMask, motorNumber));
  }
}

function issueTone(issue: VtolValidationIssue): "info" | "warning" | "danger" {
  return issue.severity;
}

function currentLayoutValue(): string {
  if (proposed.frameClass === null || proposed.frameType === null) return "";
  const option = getVtolFrameLayoutOptions(proposed.frameClass).find((candidate) => candidate.matches(proposed.frameType ?? -1));
  return option ? String(option.value) : String(proposed.frameType);
}
</script>

<SetupSectionCard
  icon={Box}
  title="VTOL airframe"
  description="Frame class defines the hover mixer and logical motors. Frame layout only refines geometry and rotation where that class actually supports variants."
  surface="elevated"
  testId="vtol-airframe-configurator"
>
  {#if !airframeParamsReady}
    <SetupNotice tone="warning">Apply Q_ENABLE, reboot, and refresh parameters before selecting the VTOL architecture or hover geometry.</SetupNotice>
  {/if}

  <div class="grid gap-4 lg:grid-cols-3">
    <label class="space-y-2">
      <span class="text-sm font-semibold text-text-primary">Architecture</span>
      <NativeSelect
        value={proposed.architecture}
        options={architectureOptions}
        disabled={actionsBlocked || !airframeParamsReady}
        onchange={(event) => stageArchitecture(event.currentTarget.value as VtolArchitecture)}
        testId="vtol-architecture-select"
      />
      <HelperText size="xs">Sets the ArduPilot backend; it does not apply tuning or failsafe defaults.</HelperText>
    </label>

    <label class="space-y-2">
      <span class="text-sm font-semibold text-text-primary">Hover frame class</span>
      <NativeSelect
        value={proposed.frameClass === null ? "" : String(proposed.frameClass)}
        options={classOptions}
        placeholder="Select motor class"
        disabled={actionsBlocked || !itemIndex.has("Q_FRAME_CLASS") || proposed.architecture === "bicopter" || proposed.architecture === "tailsitter_single_dual"}
        onchange={(event) => stageFrameClass(event.currentTarget.value)}
        testId="vtol-frame-class-select"
      />
      <HelperText size="xs">Controls motor count and mixer in hover; it does not describe the fixed-wing planform.</HelperText>
    </label>

    <label class="space-y-2">
      <span class="text-sm font-semibold text-text-primary">Hover motor layout</span>
      {#if layoutOptions.length > 0}
        <NativeSelect
          value={currentLayoutValue()}
          options={layoutOptions}
          disabled={actionsBlocked || !itemIndex.has("Q_FRAME_TYPE")}
          onchange={(event) => stageFrameType(event.currentTarget.value)}
          testId="vtol-frame-type-select"
        />
      {:else}
        <div class="flex h-9 items-center rounded-md border border-border bg-bg-secondary px-3 text-sm text-text-muted">
          {proposed.frameClass === 10 ? "Not applicable for Single / Dual" : "Defined by script"}
        </div>
      {/if}
      <HelperText size="xs">
        {proposed.frameClass === 7
          ? "Tri ignores X/Plus. Only the pitch-reversed mixer is a distinct choice."
          : proposed.frameClass === 5
            ? "Y6 uses only A, B, and FireFly arrangements; other raw values mean Y6A."
            : proposed.frameTypeIgnored
              ? "Q_FRAME_TYPE does not affect this class."
              : "Defines arm geometry and expected motor rotation."}
      </HelperText>
    </label>
  </div>

  {#if proposed.architecture === "tiltrotor"}
    <div class="rounded-lg border border-border bg-bg-secondary/60 p-4">
      <label class="grid gap-2 md:grid-cols-[minmax(12rem,18rem)_minmax(0,1fr)] md:items-center">
        <span>
          <span class="block text-sm font-semibold text-text-primary">Tilt mechanism</span>
          <span class="mt-1 block text-xs leading-5 text-text-muted">This determines collective versus independent left/right actuator functions.</span>
        </span>
        <NativeSelect
          value={proposed.mechanism === "binary" ? "1" : proposed.mechanism === "vectored_yaw" ? "2" : "0"}
          options={[
            { value: "0", label: "Continuous collective tilt" },
            { value: "1", label: "Binary / retract mechanism" },
            { value: "2", label: "Independent vectored yaw" },
          ]}
          disabled={actionsBlocked || !itemIndex.has("Q_TILT_TYPE")}
          onchange={(event) => stageMechanism(event.currentTarget.value)}
          testId="vtol-tilt-mechanism-select"
        />
      </label>
    </div>
  {:else if proposed.architecture === "bicopter"}
    <SetupNotice tone="info">Bicopter fixes Q_FRAME_CLASS=10 and Q_TILT_TYPE=3. Its motors use ThrottleLeft/ThrottleRight and require independent left/right vector servos.</SetupNotice>
  {:else if proposed.architecture.startsWith("tailsitter")}
    <SetupNotice tone="info">Tailsitters rotate the complete airframe. Q_TILT_TYPE is ignored; vectored tailsitters are identified by left/right tilt output functions.</SetupNotice>
  {/if}
</SetupSectionCard>

<SetupSectionCard
  icon={GitBranch}
  title="Motors and mechanisms"
  description="The diagram uses logical Motor numbers from the ArduPilot mixer. Physical SERVO output numbers appear below each motor."
  surface="elevated"
  testId="vtol-topology-diagram"
>
  {#snippet status()}
    {#if topology.hasProposedChanges}
      <Badge tone="warning" case="normal">Proposed — not active</Badge>
    {:else}
      <Badge tone="success" case="normal">Applied</Badge>
    {/if}
  {/snippet}

  <div class="flex flex-wrap items-center gap-2 rounded-md border border-border bg-bg-secondary/60 px-3 py-2 text-xs text-text-secondary">
    <span class="font-semibold text-text-primary">Applied:</span>
    <span>{topology.applied.architectureLabel} · {topology.applied.frameClassLabel} {topology.applied.frameTypeLabel}</span>
    {#if topology.hasTopologyChanges}
      <span class="text-warning">→ proposed {proposed.frameClassLabel} {proposed.frameTypeLabel}</span>
    {/if}
  </div>

  {#if selectableMask}
    <div class="flex items-start gap-2 rounded-md border border-accent/25 bg-accent/5 p-3 text-sm text-text-secondary">
      <MousePointer2 class="mt-0.5 shrink-0 text-accent" size={16} aria-hidden="true" />
      <span>
        Click motors in the diagram to choose {selectableMask === "tilt" ? "which propellers physically tilt" : "which copter motors remain active in forward flight"}.
        Current mask: <span class="font-mono font-semibold text-text-primary">{selectableMask === "tilt" ? proposed.tiltMask : proposed.tailsitterMotorMask}</span>.
      </span>
    </div>
    {#if !maskParamAvailable}
      <SetupNotice tone="warning">The selected architecture is staged, but its mask parameter is not available yet. Apply, reboot, and refresh before choosing motors.</SetupNotice>
    {/if}
  {/if}

  <VtolTopologyDiagram
    topology={proposed}
    {selectableMask}
    disabled={actionsBlocked || !maskParamAvailable}
    onMotorToggle={toggleDiagramMotor}
  />

  {#if proposed.issues.length > 0}
    <div class="space-y-2">
      {#each proposed.issues as issue (issue.id)}
        <SetupNotice tone={issueTone(issue)}>
          <span class="font-semibold">{issue.title}.</span> {issue.detail}
        </SetupNotice>
      {/each}
    </div>
  {/if}
</SetupSectionCard>

{#if proposed.enabled}
  <VtolOutputMapping
    topology={proposed}
    disabled={actionsBlocked || topology.requiresRefreshBeforeMapping}
    disabledReason={mappingDisabledReason}
  />
{/if}

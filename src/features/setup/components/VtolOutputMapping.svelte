<script lang="ts">
import { Cable, ExternalLink, MoveRight } from "lucide-svelte";
import { fromStore } from "svelte/store";

import { getParamsStoreContext } from "../../../app/shell/runtime-context";
import { Button, InternalLink, NativeSelect } from "../../../components/ui";
import { buildParameterItemIndex } from "../../../lib/params/parameter-item-model";
import { THROTTLE_OUTPUT_FUNCTIONS, isPropulsionServoFunction } from "../../../lib/setup/motor-functions";
import {
  listVtolPhysicalOutputs,
  planVtolOutputAssignment,
  type VtolOutputAssignmentPlan,
} from "../../../lib/setup/vtol-output-mapping";
import type {
  VtolActuator,
  VtolOutputOwner,
  VtolPropulsor,
  VtolTopologySnapshot,
} from "../../../lib/setup/vtol-topology-model";
import { stageSetupParameterEdit } from "../shared/parameter-editing";
import SetupNotice from "../shared/SetupNotice.svelte";
import SetupSectionCard from "../shared/SetupSectionCard.svelte";

type MappingRow = {
  id: string;
  kind: "motor" | "actuator";
  label: string;
  detail: string;
  functionValue: number;
  outputOwners: VtolOutputOwner[];
};

type PendingAssignment = {
  row: MappingRow;
  plan: VtolOutputAssignmentPlan;
};

let {
  topology,
  disabled = false,
  disabledReason = null,
}: {
  topology: VtolTopologySnapshot;
  disabled?: boolean;
  disabledReason?: string | null;
} = $props();

const paramsStore = getParamsStoreContext();
const paramsState = fromStore(paramsStore);

let params = $derived(paramsState.current);
let itemIndex = $derived(buildParameterItemIndex(params.paramStore, params.metadata));
let outputs = $derived(listVtolPhysicalOutputs({ paramStore: params.paramStore, stagedEdits: params.stagedEdits }));
let customPropulsionOutputs = $derived(outputs.filter((output) => isPropulsionServoFunction(output.proposedFunctionValue)));
let rows = $derived.by(() => [
  ...topology.propulsors.map(propulsorRow),
  ...singleDualAlternatives(),
  ...topology.actuators.map(actuatorRow),
]);
let pendingAssignment = $state<PendingAssignment | null>(null);

function propulsorRow(propulsor: VtolPropulsor): MappingRow {
  return {
    id: propulsor.id,
    kind: "motor",
    label: propulsor.label,
    detail: `Propulsion function ${propulsor.functionValue}`,
    functionValue: propulsor.functionValue,
    outputOwners: propulsor.outputOwners,
  };
}

function actuatorRow(actuator: VtolActuator): MappingRow {
  return {
    id: actuator.id,
    kind: "actuator",
    label: actuator.label,
    detail: `${actuator.required ? "Required" : "Optional"} ${actuator.kind === "yaw" ? "yaw" : "tilt"} function ${actuator.functionValue}`,
    functionValue: actuator.functionValue,
    outputOwners: actuator.outputOwners,
  };
}

function singleDualAlternatives(): MappingRow[] {
  if (topology.architecture !== "tailsitter_single_dual") return [];

  const activeFunctions = new Set(topology.propulsors.map((propulsor) => propulsor.functionValue));
  const alternatives: MappingRow[] = [];
  if (!activeFunctions.has(THROTTLE_OUTPUT_FUNCTIONS.throttle)) {
    alternatives.push(alternativePropulsionRow("single-throttle", "Alternative single motor", THROTTLE_OUTPUT_FUNCTIONS.throttle));
  }
  if (!activeFunctions.has(THROTTLE_OUTPUT_FUNCTIONS.left)) {
    alternatives.push(alternativePropulsionRow("left-throttle", "Alternative left motor", THROTTLE_OUTPUT_FUNCTIONS.left));
  }
  if (!activeFunctions.has(THROTTLE_OUTPUT_FUNCTIONS.right)) {
    alternatives.push(alternativePropulsionRow("right-throttle", "Alternative right motor", THROTTLE_OUTPUT_FUNCTIONS.right));
  }
  return alternatives;
}

function alternativePropulsionRow(id: string, label: string, functionValue: number): MappingRow {
  const owners = outputs
    .filter((output) => output.proposedFunctionValue === functionValue)
    .map((output) => ({
      outputIndex: output.index,
      functionValue,
      functionParamName: output.paramName,
    }));
  return {
    id,
    kind: "motor",
    label,
    detail: `Optional propulsion function ${functionValue}; unassign the other throttle style before switching`,
    functionValue,
    outputOwners: owners,
  };
}

function functionLabel(outputIndex: number, functionValue: number): string {
  if (functionValue === 0) return "free";
  const metadata = params.metadata?.get(`SERVO${outputIndex}_FUNCTION`);
  return metadata?.values?.find((option) => option.code === functionValue)?.label ?? `function ${functionValue}`;
}

function outputOptions(row: MappingRow) {
  return [
    { value: "", label: "Unassigned" },
    ...outputs.map((output) => ({
      value: String(output.index),
      label: `SERVO${output.index} — ${output.proposedFunctionValue === row.functionValue ? row.label : functionLabel(output.index, output.proposedFunctionValue)}`,
      title: output.proposedFunctionValue > 0 && output.proposedFunctionValue !== row.functionValue
        ? `Selecting this output will replace ${functionLabel(output.index, output.proposedFunctionValue)}`
        : undefined,
    })),
  ];
}

function selectedOutput(row: MappingRow): string {
  return row.outputOwners.length === 1 ? String(row.outputOwners[0].outputIndex) : "";
}

function stagePlan(plan: VtolOutputAssignmentPlan) {
  for (const edit of plan.edits) {
    stageSetupParameterEdit(paramsStore, itemIndex.get(edit.paramName), edit.nextValue, { actionsBlocked: disabled });
  }
  pendingAssignment = null;
}

function handleOutputChange(row: MappingRow, value: string) {
  const targetOutputIndex = value === "" ? null : Number(value);
  const plan = planVtolOutputAssignment(
    { paramStore: params.paramStore, stagedEdits: params.stagedEdits },
    row.functionValue,
    targetOutputIndex,
  );
  if (!plan || plan.edits.length === 0) return;

  if (plan.displacedFunctionValue !== null) {
    pendingAssignment = { row, plan };
    return;
  }
  stagePlan(plan);
}

function verificationHref(row: MappingRow): string | null {
  const owner = row.outputOwners.length === 1 ? row.outputOwners[0] : null;
  if (!owner) return null;
  return row.kind === "motor" && row.id.startsWith("motor-")
    ? `/setup/motors-esc?motor=${row.id.replace("motor-", "")}#motor-${row.id.replace("motor-", "")}`
    : `/setup/servo-outputs?function=${row.functionValue}&output=${owner.outputIndex}#servo-output-${owner.outputIndex}`;
}

function verificationLabel(row: MappingRow): string {
  if (row.kind === "actuator") return "Servo setup";
  return row.id.startsWith("motor-") ? "Motor test" : "Output inspection";
}
</script>

<SetupSectionCard
  icon={Cable}
  title="Physical output mapping"
  description="Choose every physical flight-controller output manually. IronWing preserves valid assignments and never picks a free connector for you."
  surface="elevated"
>
  {#if disabledReason}
    <SetupNotice tone="warning">{disabledReason}</SetupNotice>
  {/if}

  {#if pendingAssignment}
    <div class="rounded-lg border border-warning/40 bg-warning/5 p-4" data-testid="vtol-output-reassign-confirmation">
      <p class="text-sm font-semibold text-text-primary">Replace an occupied output?</p>
      <p class="mt-1 text-sm leading-6 text-text-secondary">
        SERVO{pendingAssignment.plan.targetOutputIndex} currently owns {functionLabel(pendingAssignment.plan.targetOutputIndex ?? 0, pendingAssignment.plan.displacedFunctionValue ?? 0)}.
        Assigning {pendingAssignment.row.label} will replace that function and clear its previous output assignment.
      </p>
      <div class="mt-3 flex flex-wrap justify-end gap-2">
        <Button variant="outline" onclick={() => (pendingAssignment = null)}>Cancel</Button>
        <Button tone="warning" variant="solid" onclick={() => pendingAssignment && stagePlan(pendingAssignment.plan)}>Stage replacement</Button>
      </div>
    </div>
  {/if}

  {#if topology.architecture === "custom"}
    <SetupNotice tone="info">Scripted matrices own their mixer geometry. IronWing shows physical propulsion ownership, but motor position and direction must be verified against the active script.</SetupNotice>
    {#if customPropulsionOutputs.length > 0}
      <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {#each customPropulsionOutputs as output (output.index)}
          <div class="rounded-md border border-border bg-bg-primary/70 p-3">
            <p class="text-sm font-semibold text-text-primary">SERVO{output.index}</p>
            <p class="mt-1 text-xs text-text-muted">{functionLabel(output.index, output.proposedFunctionValue)} · Fn {output.proposedFunctionValue}</p>
          </div>
        {/each}
      </div>
    {:else}
      <p class="rounded-lg border border-border bg-bg-primary/70 p-4 text-sm text-text-muted">No propulsion functions are currently assigned.</p>
    {/if}
    <InternalLink class="self-start text-xs font-semibold" href="/setup/servo-outputs">Open the complete output inventory</InternalLink>
  {:else if rows.length === 0}
    <p class="rounded-lg border border-border bg-bg-primary/70 p-4 text-sm text-text-muted">
      Output rows appear when the selected architecture has a known motor or actuator topology.
    </p>
  {:else}
    <div class="overflow-x-auto rounded-lg border border-border" data-layout-scroll-x="allowed">
      <table class="w-full min-w-[42rem] text-left text-sm">
        <thead class="bg-bg-secondary text-xs uppercase tracking-wide text-text-muted">
          <tr>
            <th class="px-4 py-3 font-semibold">Logical function</th>
            <th class="px-4 py-3 font-semibold">Connection</th>
            <th class="px-4 py-3 font-semibold">Physical output</th>
            <th class="px-4 py-3 font-semibold">Verify</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border">
          {#each rows as row (row.id)}
            {@const href = verificationHref(row)}
            <tr class="bg-bg-primary/60 align-middle">
              <td class="px-4 py-3">
                <p class="font-semibold text-text-primary">{row.label}</p>
                <p class="mt-1 text-xs text-text-muted">{row.detail}</p>
              </td>
              <td class="px-4 py-3">
                <span class="inline-flex items-center gap-2 text-xs text-text-secondary">
                  Fn {row.functionValue}<MoveRight size={14} aria-hidden="true" />
                  {row.outputOwners.length === 0
                    ? "unassigned"
                    : row.outputOwners.map((owner) => `SERVO${owner.outputIndex}`).join(", ")}
                </span>
              </td>
              <td class="w-72 px-4 py-3">
                <NativeSelect
                  value={selectedOutput(row)}
                  options={outputOptions(row)}
                  disabled={disabled || outputs.length === 0}
                  aria-label={`Physical output for ${row.label}`}
                  onchange={(event) => handleOutputChange(row, event.currentTarget.value)}
                  testId={`vtol-output-${row.functionValue}`}
                />
              </td>
              <td class="px-4 py-3">
                {#if href}
                  <InternalLink class="text-xs font-semibold" href={href as "/"}>
                    {verificationLabel(row)}
                    <ExternalLink size={12} aria-hidden="true" />
                  </InternalLink>
                {:else}
                  <span class="text-xs text-text-muted">Assign first</span>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</SetupSectionCard>

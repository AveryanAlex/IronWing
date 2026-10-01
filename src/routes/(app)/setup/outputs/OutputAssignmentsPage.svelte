<script lang="ts">
import { Cable, Cpu, Plus, Search, Trash2, TriangleAlert } from "lucide-svelte";
import { fromStore } from "svelte/store";

import { getParamsStoreContext, getSessionStoreContext } from "../../../../app/shell/runtime-context";
import { Badge, Button, Dialog, EmptyState, Eyebrow, HelperText, Input, InternalLink } from "../../../../components/ui";
import { resolveDocsUrl } from "../../../../data/ardupilot-docs";
import {
  getSetupWorkspaceRouteContext,
  setupRouteSection,
} from "../../../../features/setup/components/setup-workspace-route-context";
import SetupSectionShell from "../../../../features/setup/components/SetupSectionShell.svelte";
import { setupWorkspaceTestIds } from "../../../../features/setup/setup-workspace-test-ids";
import { SetupNotice, SetupSectionCard } from "../../../../features/setup/shared";
import { stageSetupParameterEdit } from "../../../../features/setup/shared/parameter-editing";
import { motorNumberForServoFunction } from "../../../../lib/setup/motor-functions";
import {
  buildOutputMappingModel,
  planOutputFunctionAssignment,
  type OutputAssignmentPlan,
  type OutputFunctionCategory,
  type OutputFunctionRow,
} from "../../../../lib/setup/output-mapping-model";
import { buildParameterItemIndex, type ParameterItemModel } from "../../../../lib/params/parameter-item-model";
import OutputModeTabs from "./OutputModeTabs.svelte";
import ServoOutputSettings from "./ServoOutputSettings.svelte";

const route = getSetupWorkspaceRouteContext();
const viewStore = fromStore(route.viewStore);
const paramsStore = getParamsStoreContext();
const sessionStore = getSessionStoreContext();
const paramsState = fromStore(paramsStore);
const sessionState = fromStore(sessionStore);

let addedFunctionValues = $state<number[]>([]);
let functionPickerOpen = $state(false);
let functionPickerCategory = $state<OutputFunctionCategory>("servo");
let functionSearch = $state("");
let assignmentPickerOpen = $state(false);
let selectedFunctionValue = $state<number | null>(null);
let confirmationOpen = $state(false);
let pendingPlan = $state<OutputAssignmentPlan | null>(null);

let view = $derived(viewStore.current);
let section = $derived(setupRouteSection(view, "outputs"));
let params = $derived(paramsState.current);
let session = $derived(sessionState.current);
let vehicleType = $derived(params.vehicleType ?? session.sessionDomain.value?.vehicle_state?.vehicle_type ?? null);
let itemIndex = $derived(buildParameterItemIndex(params.paramStore, params.metadata));
let model = $derived(
  buildOutputMappingModel({
    paramStore: params.paramStore,
    metadata: params.metadata,
    stagedEdits: params.stagedEdits,
    vehicleType,
    addedFunctionValues,
  }),
);
let selectedRow = $derived(
  [...model.propulsionRows, ...model.servoRows].find((row) => row.value === selectedFunctionValue) ?? null,
);
let visibleFunctionValues = $derived(new Set([...model.propulsionRows, ...model.servoRows].map((row) => row.value)));
let filteredCatalog = $derived(
  model.catalog.filter(
    (item) =>
      item.category === functionPickerCategory &&
      !visibleFunctionValues.has(item.value) &&
      `${item.label} ${item.value}`.toLowerCase().includes(functionSearch.trim().toLowerCase()),
  ),
);
let actionsBlocked = $derived(view.checkpoint.blocksActions);
let docsUrl = $derived(resolveDocsUrl("servo_outputs"));

function sourceVariant(row: OutputFunctionRow): "accent" | "muted" | "warning" {
  if (row.required) return "warning";
  if (row.recommended) return "accent";
  return "muted";
}

function sourceLabel(row: OutputFunctionRow): string {
  if (row.required) return "Required";
  if (row.recommended) return "Recommended";
  if (row.source === "configured") return "Configured";
  return "Added";
}

function openFunctionPicker(category: OutputFunctionCategory) {
  functionPickerCategory = category;
  functionSearch = "";
  functionPickerOpen = true;
}

function addFunction(value: number) {
  if (!addedFunctionValues.includes(value)) {
    addedFunctionValues = [...addedFunctionValues, value];
  }
  functionPickerOpen = false;
}

function openAssignmentPicker(row: OutputFunctionRow) {
  if (actionsBlocked || row.mappingLocked) return;
  selectedFunctionValue = row.value;
  assignmentPickerOpen = true;
}

function requestStageAssignment(row: OutputFunctionRow, desiredOutputIndexes: number[]) {
  if (actionsBlocked || row.mappingLocked) return;
  selectedFunctionValue = row.value;
  const plan = planOutputFunctionAssignment(
    {
      paramStore: params.paramStore,
      metadata: params.metadata,
      stagedEdits: params.stagedEdits,
    },
    row.value,
    desiredOutputIndexes,
    {
      requiredFunctionValues: model.requiredFunctionValues,
      category: row.category,
    },
  );
  if (!plan || plan.edits.length === 0) {
    assignmentPickerOpen = false;
    return;
  }
  if (
    plan.displacedAssignments.length > 0 ||
    plan.newlyMissingRequiredFunctionValues.length > 0 ||
    plan.mirroredMotor
  ) {
    pendingPlan = plan;
    assignmentPickerOpen = false;
    confirmationOpen = true;
    return;
  }
  stagePlan(plan);
}

function stagePlan(plan: OutputAssignmentPlan) {
  if (actionsBlocked || selectedRow?.mappingLocked) return;
  for (const edit of plan.edits) {
    stageSetupParameterEdit(paramsStore, itemIndex.get(edit.paramName), edit.nextValue, { actionsBlocked });
  }
  pendingPlan = null;
  confirmationOpen = false;
  assignmentPickerOpen = false;
}

function stageServoSetting(item: ParameterItemModel, value: number) {
  stageSetupParameterEdit(paramsStore, item, value, { actionsBlocked });
}

function canAddOutput(row: OutputFunctionRow): boolean {
  return model.outputs.some((output) => !output.readOnly && !row.proposedOutputIndexes.includes(output.index));
}

function handleConfirmationOpenChange(open: boolean) {
  confirmationOpen = open;
  if (!open) pendingPlan = null;
}

function confirmPendingPlan() {
  if (pendingPlan) stagePlan(pendingPlan);
}

function outputOwnerText(index: number): string {
  const output = model.outputs.find((candidate) => candidate.index === index);
  if (!output || output.proposedFunctionValue === 0) return "Free";
  return `${output.proposedFunctionLabel} · Fn ${output.proposedFunctionValue}`;
}

function requiredFunctionLabel(value: number): string {
  return [...model.propulsionRows, ...model.servoRows].find((row) => row.value === value)?.label ?? `Function ${value}`;
}

function verificationHref(row: OutputFunctionRow): string | null {
  const firstOutput = row.appliedOutputIndexes[0];
  if (!firstOutput) return null;
  const motorNumber = motorNumberForServoFunction(row.value);
  if (row.category === "propulsion" && motorNumber !== null) {
    return `/setup/motors-esc?motor=${motorNumber}#motor-${motorNumber}`;
  }
  if (row.category === "servo") {
    return `/setup/outputs?mode=test&function=${row.value}&output=${firstOutput}#servo-output-${firstOutput}`;
  }
  return null;
}
</script>

{#snippet functionRows(rows: OutputFunctionRow[], category: OutputFunctionCategory)}
  {#if rows.length === 0}
    <EmptyState
      title={category === "propulsion" ? "No propulsion functions" : "No servo functions"}
      description="Use Add function to choose an output function exposed by the active firmware."
    />
  {:else}
    <div class="space-y-4">
      {#each rows as row (row.value)}
        {@const verifyHref = verificationHref(row)}
        <article
          id={`output-function-${row.value}`}
          class="min-w-0 rounded-lg border border-border bg-bg-primary/70 p-3 sm:p-4"
          data-testid={`${setupWorkspaceTestIds.outputsFunctionRowPrefix}-${row.value}`}
        >
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="font-semibold text-text-primary">{row.label}</h3>
                <Badge variant="muted" size="sm" case="normal" shape="pill">Fn {row.value}</Badge>
                <Badge variant={sourceVariant(row)} size="sm" case="normal" shape="pill">{sourceLabel(row)}</Badge>
                {#if row.hasStagedChange}
                  <Badge variant="warning" size="sm" case="normal" shape="pill">Staged</Badge>
                {/if}
              </div>
              <HelperText class="mt-1">{row.sourceDetail}</HelperText>
              {#if row.hasStagedChange}
                <HelperText class="mt-1">Applied · {row.appliedOutputIndexes.map((index) => `SERVO${index}`).join(", ") || "Unassigned"}</HelperText>
              {/if}
            </div>
            {#if verifyHref}
              <InternalLink href={verifyHref as "/"} variant="button">
                {row.category === "propulsion" ? "Motor test" : "Servo test"}
              </InternalLink>
            {/if}
          </div>

          {#if row.mirroredMotor}
            <p class="mt-3 flex items-start gap-2 text-sm leading-6 text-warning" data-testid={`${setupWorkspaceTestIds.outputsMirroredWarningPrefix}-${row.value}`}>
              <TriangleAlert class="mt-1 shrink-0" size={14} aria-hidden="true" />
              Mirrored motor command. ArduPilot supports this mapping, but it is unusual for a standard mixer; verify wiring and output protocol.
            </p>
          {/if}
          {#if row.mappingLocked}
            <p class="mt-3 text-sm leading-6 text-warning">Apply the pending frame or VTOL topology, reboot, and refresh parameters before mapping this required function.</p>
          {/if}

          <div class="mt-4 space-y-3" data-testid={`${setupWorkspaceTestIds.outputsFunctionOwnersPrefix}-${row.value}`}>
            {#each row.proposedOutputIndexes as outputIndex (outputIndex)}
              {@const output = model.outputs.find((candidate) => candidate.index === outputIndex)}
              <section
                class="min-w-0 rounded-lg border border-border bg-bg-secondary/50 p-3"
                aria-label={`SERVO${outputIndex} settings`}
                data-testid={`setup-workspace-output-settings-${outputIndex}`}
              >
                <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div class="flex flex-wrap items-center gap-2">
                    <h4 class="text-sm font-semibold text-text-primary">SERVO{outputIndex}</h4>
                    {#if output?.hasStagedChange}
                      <Badge variant="warning" size="sm" case="normal" shape="pill">Assignment staged</Badge>
                    {/if}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    ariaLabel={`Remove SERVO${outputIndex} from ${row.label}`}
                    disabled={actionsBlocked || row.mappingLocked || output?.readOnly}
                    onclick={() => requestStageAssignment(row, row.proposedOutputIndexes.filter((index) => index !== outputIndex))}
                  >
                    <Trash2 size={14} aria-hidden="true" /> Remove
                  </Button>
                </div>
                <ServoOutputSettings
                  {outputIndex}
                  {itemIndex}
                  stagedEdits={params.stagedEdits}
                  {actionsBlocked}
                  onStage={stageServoSetting}
                  onUnstage={paramsStore.discardStagedEdit}
                />
              </section>
            {:else}
              <HelperText>{row.required ? "Required function is unassigned." : "No outputs assigned."}</HelperText>
            {/each}
            <Button
              variant="outline"
              disabled={actionsBlocked || row.mappingLocked || !canAddOutput(row)}
              onclick={() => openAssignmentPicker(row)}
              testId={`${setupWorkspaceTestIds.outputsEditFunctionPrefix}-${row.value}`}
            >
              <Plus size={14} aria-hidden="true" /> Add {category === "servo" ? "servo" : "output"}
            </Button>
          </div>
        </article>
      {/each}
    </div>
  {/if}
{/snippet}

<SetupSectionShell
  sectionId={section.id}
  eyebrow={section.title}
  title="Configure outputs by function"
  description="Add physical outputs under each function, then tune direction and Min/Mid/Max PWM points for every servo. Changes stay staged until review and apply."
  testId={setupWorkspaceTestIds.outputsSection}
  docs={[{ url: docsUrl, label: "ArduPilot Docs", testId: setupWorkspaceTestIds.outputsDocsLink }]}
>
  {#snippet body()}
    <OutputModeTabs />

    <SetupSectionCard icon={Cable} title="Output map" description="Assignments remain staged until review and apply." surface="elevated" testId={setupWorkspaceTestIds.outputsSummary}>
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <Eyebrow tracking="widest">Physical outputs</Eyebrow>
          <p class="mt-2 text-sm font-semibold text-text-primary">{model.assignedOutputCount}/{model.outputs.length} assigned</p>
          <HelperText class="mt-1">Discovered from the active SERVOx_FUNCTION parameter set.</HelperText>
        </div>
        <div>
          <Eyebrow tracking="widest">Required functions</Eyebrow>
          <p class="mt-2 text-sm font-semibold text-text-primary">{model.missingRequiredCount} missing</p>
          <HelperText class="mt-1">Derived from the current motor and VTOL topology.</HelperText>
        </div>
        <div>
          <Eyebrow tracking="widest">Staged map</Eyebrow>
          <p class="mt-2 text-sm font-semibold text-text-primary">{model.stagedOutputCount} changed</p>
          <HelperText class="mt-1">The proposed map drives this editor; tests keep using the applied map.</HelperText>
        </div>
        <div>
          <Eyebrow tracking="widest">Catalog</Eyebrow>
          <p class="mt-2 text-sm font-semibold text-text-primary">{model.catalog.length} functions</p>
          <HelperText class="mt-1">Firmware metadata plus configured unknown function codes.</HelperText>
        </div>
      </div>
    </SetupSectionCard>

    {#if actionsBlocked}
      <SetupNotice tone="warning">Output assignment is locked by the active reboot/reconnect checkpoint.</SetupNotice>
    {:else if model.topologyMappingLocked}
      <SetupNotice tone="warning">Pending frame or VTOL topology changes lock only their required rows. Independent surfaces and auxiliary functions remain editable.</SetupNotice>
    {/if}

    <SetupSectionCard
      id="motor-assignments"
      icon={Cpu}
      title="Motors & propulsion"
      description="Frame-derived motors appear as required. Mirroring remains available because ArduPilot can fan one function out to multiple physical outputs."
      surface="elevated"
      testId={setupWorkspaceTestIds.outputsPropulsionSection}
    >
      {#snippet actions()}
        <Button variant="secondary" disabled={actionsBlocked} onclick={() => openFunctionPicker("propulsion")}>
          <Plus size={14} aria-hidden="true" /> Add function
        </Button>
      {/snippet}
      {@render functionRows(model.propulsionRows, "propulsion")}
    </SetupSectionCard>

    <SetupSectionCard
      id="servo-assignments"
      icon={Cable}
      title="Servos & auxiliary"
      description="Control surfaces, tilt/vector mechanisms, GPIO, scripting, payloads, and every other function exposed by the active firmware."
      surface="elevated"
      testId={setupWorkspaceTestIds.outputsServoSection}
    >
      {#snippet actions()}
        <Button variant="secondary" disabled={actionsBlocked} onclick={() => openFunctionPicker("servo")}>
          <Plus size={14} aria-hidden="true" /> Add function
        </Button>
      {/snippet}
      {@render functionRows(model.servoRows, "servo")}
    </SetupSectionCard>
  {/snippet}
</SetupSectionShell>

<Dialog.Root bind:open={functionPickerOpen}>
  <Dialog.Content size="lg">
    <Dialog.Header>
      <Dialog.Title>Add {functionPickerCategory === "propulsion" ? "propulsion" : "servo or auxiliary"} function</Dialog.Title>
      <Dialog.Description>Choose from functions exposed by the active firmware. Adding a row does not stage an assignment.</Dialog.Description>
    </Dialog.Header>
    <Input bind:value={functionSearch} type="search" placeholder="Search by name or function code" testId={setupWorkspaceTestIds.outputsFunctionSearch}>
      {#snippet left()}<Search size={16} aria-hidden="true" />{/snippet}
    </Input>
    <div class="grid max-h-[50dvh] gap-2 overflow-y-auto sm:grid-cols-2">
      {#each filteredCatalog as item (item.value)}
        <Button class="h-auto justify-start px-3 py-3 text-left" variant="outline" onclick={() => addFunction(item.value)}>
          <span class="min-w-0">
            <span class="block truncate font-semibold">{item.label}</span>
            <span class="mt-1 block text-xs text-text-muted">Function {item.value}</span>
          </span>
        </Button>
      {:else}
        <EmptyState title="No matching functions" description="Change the search or close the picker." />
      {/each}
    </div>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={assignmentPickerOpen}>
  <Dialog.Content size="lg">
    <Dialog.Header>
      <Dialog.Title>{selectedRow ? `Add output to ${selectedRow.label}` : "Add output"}</Dialog.Title>
      <Dialog.Description>Choose a physical output to add. Occupied outputs are replaced after confirmation.</Dialog.Description>
    </Dialog.Header>
    <div class="grid max-h-[55dvh] gap-2 overflow-y-auto sm:grid-cols-2" data-testid={setupWorkspaceTestIds.outputsOutputPicker}>
      {#each model.outputs.filter((output) => !selectedRow?.proposedOutputIndexes.includes(output.index)) as output (output.index)}
        <Button
          class="h-auto justify-start whitespace-normal px-3 py-3 text-left"
          variant="outline"
          disabled={output.readOnly || actionsBlocked || selectedRow?.mappingLocked}
          testId={`${setupWorkspaceTestIds.outputsOutputOptionPrefix}-${output.index}`}
          onclick={() => selectedRow && requestStageAssignment(selectedRow, [...selectedRow.proposedOutputIndexes, output.index])}
        >
          <span class="min-w-0">
            <span class="block font-semibold">SERVO{output.index}</span>
            <span class="mt-1 block text-xs text-text-muted">{outputOwnerText(output.index)}{output.hasStagedChange ? " · staged" : ""}</span>
          </span>
        </Button>
      {/each}
    </div>
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (assignmentPickerOpen = false)}>Cancel</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root open={confirmationOpen} onOpenChange={handleConfirmationOpenChange}>
  <Dialog.Content size="md">
    <Dialog.Header>
      <Dialog.Title>Review output reassignment</Dialog.Title>
      <Dialog.Description>The following changes affect occupied or topology-sensitive outputs.</Dialog.Description>
    </Dialog.Header>
    {#if pendingPlan}
      <div class="space-y-3" data-testid={setupWorkspaceTestIds.outputsReassignmentConfirmation}>
        {#if pendingPlan.displacedAssignments.length > 0}
          <div class="rounded-lg border border-warning/40 bg-warning/5 p-3">
            <p class="text-sm font-semibold text-text-primary">Occupied outputs</p>
            <ul class="mt-2 space-y-1 text-sm text-text-secondary">
              {#each pendingPlan.displacedAssignments as assignment (assignment.outputIndex)}
                <li>SERVO{assignment.outputIndex}: {assignment.previousFunctionLabel} → {selectedRow?.label ?? `Function ${pendingPlan.functionValue}`}</li>
              {/each}
            </ul>
          </div>
        {/if}
        {#if pendingPlan.newlyMissingRequiredFunctionValues.length > 0}
          <div class="rounded-lg border border-danger/40 bg-danger/5 p-3">
            <p class="text-sm font-semibold text-danger">Required functions become unassigned</p>
            <ul class="mt-2 space-y-1 text-sm text-text-secondary">
              {#each pendingPlan.newlyMissingRequiredFunctionValues as value (value)}
                <li>{requiredFunctionLabel(value)} · Fn {value}</li>
              {/each}
            </ul>
          </div>
        {/if}
        {#if pendingPlan.mirroredMotor}
          <SetupNotice tone="warning">This creates a mirrored motor command on {pendingPlan.desiredOutputIndexes.length} physical outputs. Verify that duplication is intentional.</SetupNotice>
        {/if}
      </div>
      <Dialog.Footer>
        <Button variant="outline" onclick={() => handleConfirmationOpenChange(false)}>Cancel</Button>
        <Button tone={pendingPlan.newlyMissingRequiredFunctionValues.length > 0 ? "danger" : "warning"} variant="solid" onclick={confirmPendingPlan}>
          Stage {pendingPlan.edits.length} change{pendingPlan.edits.length === 1 ? "" : "s"}
        </Button>
      </Dialog.Footer>
    {/if}
  </Dialog.Content>
</Dialog.Root>

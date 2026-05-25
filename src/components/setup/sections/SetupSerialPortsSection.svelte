<script lang="ts">
import { Cable, Lightbulb, RotateCw } from "lucide-svelte";
import { fromStore } from "svelte/store";

import {
  getParamsStoreContext,
  getSetupWorkspaceStoreContext,
} from "../../../app/shell/runtime-context";
import { resolveDocsUrl } from "../../../data/ardupilot-docs";
import {
  buildParameterItemIndex,
  type ParameterItemModel,
} from "../../../lib/params/parameter-item-model";
import {
  buildSerialPortModel,
  type SerialPortRow,
} from "../../../lib/setup/serial-port-model";
import type {
  SetupWorkspaceSection,
  SetupWorkspaceStoreState,
} from "../../../lib/stores/setup-workspace";
import SetupSectionShell from "../SetupSectionShell.svelte";
import { setupWorkspaceTestIds } from "../setup-workspace-test-ids";
import SetupCard from "../shared/SetupCard.svelte";
import SetupCardHeader from "../shared/SetupCardHeader.svelte";
import SetupHint from "../shared/SetupHint.svelte";
import SetupHintList from "../shared/SetupHintList.svelte";
import SetupNotice from "../shared/SetupNotice.svelte";
import SetupParamSelect from "../shared/SetupParamSelect.svelte";
import SetupParamTable from "../shared/SetupParamTable.svelte";
import SetupStatusPill from "../shared/SetupStatusPill.svelte";

let {
  section,
  view,
}: {
  section: SetupWorkspaceSection;
  view: SetupWorkspaceStoreState;
} = $props();

const paramsStore = getParamsStoreContext();
const setupWorkspaceStore = getSetupWorkspaceStoreContext();
const paramsState = fromStore(paramsStore);

let draftValues = $state<Record<string, string>>({});
let params = $derived(paramsState.current);
let itemIndex = $derived(buildParameterItemIndex(params.paramStore, params.metadata));
let model = $derived(buildSerialPortModel({
  paramStore: params.paramStore,
  metadata: params.metadata,
  stagedEdits: params.stagedEdits,
}));
let docsUrl = $derived(resolveDocsUrl("serial_ports"));
let actionsBlocked = $derived(view.checkpoint.blocksActions || section.availability === "blocked");
let canConfirm = $derived(
  !actionsBlocked
  && model.ports.length > 0
  && model.conflicts.length === 0
  && model.recoveryReasons.length === 0
  && !model.hasPendingChanges,
);

$effect(() => {
  if (canConfirm) {
    setupWorkspaceStore.confirmSection("serial_ports");
  } else {
    setupWorkspaceStore.clearSectionConfirmation("serial_ports");
  }
});

function item(name: string): ParameterItemModel | null {
  return itemIndex.get(name) ?? null;
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

function stage(name: string, value: string, fallback: number | null, rowMetadataReady: boolean) {
  setDraft(name, value);
  if (actionsBlocked || !rowMetadataReady) {
    return;
  }

  const target = item(name);
  const nextValue = resolveDraftNumber(name, fallback);
  if (!target || nextValue === null) {
    return;
  }

  paramsStore.stageParameterEdit(target, nextValue);
}

function unstage(name: string) {
  const nextDrafts = { ...draftValues };
  delete nextDrafts[name];
  draftValues = nextDrafts;
  paramsStore.discardStagedEdit(name);
}

function rowRecoveryVisible(row: SerialPortRow): boolean {
  return row.recoveryText !== null;
}

function conflictTone(): string {
  if (model.conflicts.length > 0) {
    return "Conflicts detected";
  }

  return model.ports.length === 0 ? "No ports detected" : "No conflicts";
}

function rebootTone(): string {
  if (model.hasPendingChanges) {
    return "Queued, reboot required";
  }

  return "Reboot required after apply";
}
</script>

<SetupSectionShell
  sectionId={section.id}
  eyebrow={section.title}
  title="Serial Ports"
  description="Assign protocols and baud rates to each serial port. GPS, telemetry, and RC receiver connections are configured here."
  testId={setupWorkspaceTestIds.serialPortsSection}
  docs={[{ url: docsUrl, label: "ArduPilot Docs", testId: setupWorkspaceTestIds.serialPortsDocsLink }]}
>
  {#snippet body()}
  <SetupNotice tone="danger" icon={RotateCw}>
    <p>
      Serial port changes require a <span class="font-semibold">reboot</span> to take effect.
      Apply your changes, then reboot the flight controller.
    </p>
  </SetupNotice>

  <SetupCard testId={setupWorkspaceTestIds.serialPortsSummary}>
    <SetupCardHeader icon={Cable} title="Serial Port Assignment" class="mb-2.5">
      {#snippet actions()}
      {#if model.ports.length > 0}
        <SetupStatusPill>
          {model.ports.length} {model.ports.length === 1 ? "port" : "ports"}
        </SetupStatusPill>
      {/if}
      <span class="sr-only" data-testid={setupWorkspaceTestIds.serialPortsConflictState}>{conflictTone()}</span>
      <span class="sr-only" data-testid={setupWorkspaceTestIds.serialPortsRebootState}>{rebootTone()}</span>
      {/snippet}
    </SetupCardHeader>

    {#if model.ports.length === 0}
      <div
        class="flex flex-col items-center gap-2 py-8 text-center text-text-muted"
      >
        <Cable size={24} class="opacity-30" aria-hidden="true" />
        <p class="text-xs">No serial ports detected. Connect a vehicle and download parameters.</p>
      </div>
    {:else}
      <SetupParamTable columns={["Port", "Protocol", "Baud Rate"]}>
        {#each model.ports as row (row.prefix)}
          <tr class="border-b border-border/50 last:border-b-0" data-testid={`${setupWorkspaceTestIds.serialPortsRowPrefix}-${row.index}`}>
            <td class="py-2.5 pl-4 pr-3 align-middle">
              <div class="flex flex-col gap-0.5">
                <span class="font-mono text-xs font-medium text-text-primary">{row.prefix}</span>
                {#if row.boardLabel}
                  <span class="text-[10px] text-text-muted">{row.boardLabel}</span>
                {/if}
              </div>
            </td>

            <td class="px-2 py-2.5 align-middle">
              <SetupParamSelect
                id={`${row.prefix}-protocol-select`}
                value={draftValue(row.protocolParamName, row.protocolValue)}
                options={row.protocolOptions}
                compact
                disabled={actionsBlocked || !row.protocolMetadataReady}
                testId={`${setupWorkspaceTestIds.serialPortsInputPrefix}-${row.protocolParamName}`}
                stagedName={params.stagedEdits[row.protocolParamName] ? row.protocolParamName : undefined}
                stagedTestId={`${setupWorkspaceTestIds.serialPortsStagedPrefix}-${row.protocolParamName}`}
                rebootRequired={item(row.protocolParamName)?.rebootRequired === true}
                onChange={(value) => stage(row.protocolParamName, value, row.protocolValue, row.protocolMetadataReady)}
                onUnstage={unstage}
              />
            </td>

            <td class="py-2.5 pl-2 pr-4 align-middle">
              <SetupParamSelect
                id={`${row.prefix}-baud-select`}
                value={draftValue(row.baudParamName, row.baudValue)}
                options={row.baudOptions}
                compact
                disabled={actionsBlocked || !row.baudMetadataReady}
                testId={`${setupWorkspaceTestIds.serialPortsInputPrefix}-${row.baudParamName}`}
                stagedName={params.stagedEdits[row.baudParamName] ? row.baudParamName : undefined}
                stagedTestId={`${setupWorkspaceTestIds.serialPortsStagedPrefix}-${row.baudParamName}`}
                rebootRequired={item(row.baudParamName)?.rebootRequired === true}
                onChange={(value) => stage(row.baudParamName, value, row.baudValue, row.baudMetadataReady)}
                onUnstage={unstage}
              />
            </td>
          </tr>
        {/each}
      </SetupParamTable>
    {/if}
  </SetupCard>

  {#if model.recoveryText}
    <div
      class="rounded-lg border border-warning/40 bg-warning/10 px-4 py-4 text-sm leading-6 text-warning"
      data-testid={setupWorkspaceTestIds.serialPortsRecovery}
    >
      <p class="font-semibold text-text-primary">Metadata recovery is active for Serial Ports.</p>
      <p class="mt-2">{model.recoveryText}</p>
    </div>
  {/if}

  {#each model.conflicts as conflict (conflict.protocol)}
    <SetupNotice tone="warning" testId={`${setupWorkspaceTestIds.serialPortsBannerPrefix}-conflict-${conflict.protocol}`}>
      <p>
        <span class="font-medium">{conflict.protocolLabel}</span> (protocol {conflict.protocol}) is assigned to multiple ports:
        <span class="font-mono font-medium"> {conflict.ports.join(", ")}</span>.
        This protocol does not support sharing and may cause conflicts.
      </p>
    </SetupNotice>
  {/each}

  {#each model.ports.filter(rowRecoveryVisible) as row (row.prefix)}
    <div
      class="rounded-lg border border-warning/40 bg-warning/10 px-4 py-4 text-sm leading-6 text-warning"
      data-testid={`${setupWorkspaceTestIds.serialPortsBannerPrefix}-recovery-${row.index}`}
    >
      {row.recoveryText}
    </div>
  {/each}

  <SetupHintList icon={Lightbulb} title="Common Configurations">
      <SetupHint>
        <p>
          <span class="font-medium text-text-primary">GPS</span> — typically on SERIAL3 or SERIAL4.
          Set protocol to <span class="font-mono text-text-primary">GPS (5)</span> with baud
          <span class="font-mono text-text-primary"> 115200</span>.
        </p>
      </SetupHint>

      <SetupHint>
        <p>
          <span class="font-medium text-text-primary">CRSF / ELRS receiver</span> — set protocol to
          <span class="font-mono text-text-primary"> RCInput (23)</span> on the connected UART.
          Baud rate is auto-negotiated.
        </p>
      </SetupHint>

      <SetupHint>
        <p>
          <span class="font-medium text-text-primary">Telemetry</span> — MAVLink2 on SERIAL1/SERIAL2 with baud
          <span class="font-mono text-text-primary"> 57600</span> or
          <span class="font-mono text-text-primary"> 921600</span> for high-bandwidth links.
        </p>
      </SetupHint>
  </SetupHintList>
  {/snippet}
</SetupSectionShell>

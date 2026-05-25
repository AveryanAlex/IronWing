<script lang="ts">
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
import SetupStagedBadge from "../../ui/StagedBadge.svelte";
import { setupWorkspaceTestIds } from "../setup-workspace-test-ids";

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

function currentValueText(name: string): string {
  return item(name)?.valueLabel ?? item(name)?.valueText ?? "Unavailable";
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

function rowRecoveryVisible(row: SerialPortRow): boolean {
  return row.recoveryText !== null;
}
</script>

<SetupSectionShell
  sectionId={section.id}
  eyebrow={section.title}
  title="Protocol ownership and reboot-required port truth"
  description="Serial protocol and baud assignments stay inspectable even when metadata is degraded. Each row stages through the shared review tray, conflict detection uses staged values before apply, and completion only advances when the current scope is conflict-free without pending serial edits."
  testId={setupWorkspaceTestIds.serialPortsSection}
>
  {#snippet actions()}
    {#if docsUrl}
      <a
        class="rounded-md border border-border bg-bg-primary/80 px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent"
        data-testid={setupWorkspaceTestIds.serialPortsDocsLink}
        href={docsUrl}
        rel="noreferrer"
        target="_blank"
      >
        Serial-port docs
      </a>
    {/if}
  {/snippet}

  {#snippet body()}
      <div
        class="grid gap-3 rounded-lg border border-border bg-bg-primary/80 p-3 md:grid-cols-3"
        data-testid={setupWorkspaceTestIds.serialPortsSummary}
      >
    <div>
      <p class="text-xs font-semibold uppercase tracking-widest text-text-muted">Port summary</p>
      <p class="mt-2 text-sm font-semibold text-text-primary">{model.summaryText}</p>
      <p class="mt-1 text-sm text-text-secondary">Visible rows stay scoped to detected SERIALn_* families instead of a hardcoded port list.</p>
    </div>
    <div>
      <p class="text-xs font-semibold uppercase tracking-widest text-text-muted">Conflict state</p>
      <p class="mt-2 text-sm font-semibold text-text-primary" data-testid={setupWorkspaceTestIds.serialPortsConflictState}>
        {conflictTone()}
      </p>
      <p class="mt-1 text-sm text-text-secondary">
        {model.conflicts.length > 0
          ? "Exclusive protocols are staged on more than one port. Resolve conflicts before trusting this section as complete."
          : "Exclusive protocols are currently unique across the detected port set."}
      </p>
    </div>
    <div>
      <p class="text-xs font-semibold uppercase tracking-widest text-text-muted">Reboot state</p>
      <p class="mt-2 text-sm font-semibold text-text-primary" data-testid={setupWorkspaceTestIds.serialPortsRebootState}>
        {rebootTone()}
      </p>
      <p class="mt-1 text-sm text-text-secondary">{model.rebootWarningText}</p>
    </div>
  </div>

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
    <div
      class="rounded-lg border border-danger/40 bg-danger/10 px-4 py-4 text-sm leading-6 text-danger"
      data-testid={`${setupWorkspaceTestIds.serialPortsBannerPrefix}-conflict-${conflict.protocol}`}
    >
      {conflict.message}
    </div>
  {/each}

  {#if model.ports.length === 0}
    <div class="rounded-lg border border-border bg-bg-primary/80 px-4 py-4 text-sm leading-6 text-text-secondary">
      No serial rows are available for this scope yet. Connect a vehicle with SERIALn_* parameters.
    </div>
  {:else}
    <div class="space-y-3">
      {#each model.ports as row (row.prefix)}
        <article class="rounded-lg border border-border bg-bg-primary/80 p-3" data-testid={`${setupWorkspaceTestIds.serialPortsRowPrefix}-${row.index}`}>
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <p class="text-sm font-semibold text-text-primary">{row.prefix}</p>
                {#if row.boardLabel}
                  <span class="rounded-full border border-border bg-bg-secondary px-2 py-1 text-xs font-semibold uppercase tracking-widest text-text-secondary">
                    {row.boardLabel}
                  </span>
                {/if}
                {#if row.hasPendingChange}
                  <span class="rounded-full border border-accent/30 bg-accent/10 px-2 py-1 text-xs font-semibold uppercase tracking-widest text-accent">
                    {row.pendingChangeCount} queued
                  </span>
                {/if}
              </div>
              <p class="mt-2 text-sm text-text-secondary">{row.summaryText}</p>
            </div>
            <div class="text-right text-xs text-text-muted" data-testid={`${setupWorkspaceTestIds.serialPortsCurrentPrefix}-${row.index}`}>
              Protocol · {currentValueText(row.protocolParamName)}<br />
              Baud · {currentValueText(row.baudParamName)}
            </div>
          </div>

          <div class="mt-4 grid gap-3 xl:grid-cols-2">
            <div>
              <label class="text-xs font-semibold uppercase tracking-widest text-text-muted" for={`${row.prefix}-protocol-select`}>
                Protocol
              </label>
              <select
                class="mt-2 w-full rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary"
                data-testid={`${setupWorkspaceTestIds.serialPortsInputPrefix}-${row.protocolParamName}`}
                disabled={actionsBlocked || !row.protocolMetadataReady}
                id={`${row.prefix}-protocol-select`}
                onchange={(event) => stage(row.protocolParamName, (event.currentTarget as HTMLSelectElement).value, row.protocolValue, row.protocolMetadataReady)}
                value={draftValue(row.protocolParamName, row.protocolValue)}
              >
                {#each row.protocolOptions as option (option.code)}
                  <option value={String(option.code)}>{option.label}</option>
                {/each}
              </select>
              {#if params.stagedEdits[row.protocolParamName]}
                <p class="mt-2">
                  <SetupStagedBadge name={row.protocolParamName} onUnstage={unstage} testId={`${setupWorkspaceTestIds.serialPortsStagedPrefix}-${row.protocolParamName}`} />
                </p>
              {/if}
            </div>

            <div>
              <label class="text-xs font-semibold uppercase tracking-widest text-text-muted" for={`${row.prefix}-baud-select`}>
                Baud
              </label>
              <select
                class="mt-2 w-full rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary"
                data-testid={`${setupWorkspaceTestIds.serialPortsInputPrefix}-${row.baudParamName}`}
                disabled={actionsBlocked || !row.baudMetadataReady}
                id={`${row.prefix}-baud-select`}
                onchange={(event) => stage(row.baudParamName, (event.currentTarget as HTMLSelectElement).value, row.baudValue, row.baudMetadataReady)}
                value={draftValue(row.baudParamName, row.baudValue)}
              >
                {#each row.baudOptions as option (option.code)}
                  <option value={String(option.code)}>{option.label}</option>
                {/each}
              </select>
              {#if params.stagedEdits[row.baudParamName]}
                <p class="mt-2">
                  <SetupStagedBadge name={row.baudParamName} onUnstage={unstage} testId={`${setupWorkspaceTestIds.serialPortsStagedPrefix}-${row.baudParamName}`} />
                </p>
              {/if}
            </div>
          </div>

          {#if rowRecoveryVisible(row)}
            <div
              class="mt-4 rounded-lg border border-warning/40 bg-warning/10 px-4 py-4 text-sm leading-6 text-warning"
              data-testid={`${setupWorkspaceTestIds.serialPortsBannerPrefix}-recovery-${row.index}`}
            >
              {row.recoveryText}
            </div>
          {/if}
        </article>
      {/each}
    </div>
  {/if}
  {/snippet}
</SetupSectionShell>

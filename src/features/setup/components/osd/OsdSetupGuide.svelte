<script lang="ts">
import { Cable, CheckCircle2, Monitor, RadioTower, Tv } from "lucide-svelte";

import { Button, NativeSelect, StagedBadge } from "../../../../components/ui";
import type { ParamStore } from "../../../../params";
import type { ParameterItemModel } from "../../../../lib/params/parameter-item-model";
import type { ArduPilotOsdModel } from "../../../../lib/osd/ardupilot-osd-model";
import {
  OSD_VIDEO_SYSTEM_PROFILE_LIST,
  OSD_VIDEO_SYSTEM_PROFILES,
  buildOsdConfigurationPlan,
  detectOsdConfiguration,
  isMspOsdProtocol,
  type OsdSetupStageTarget,
  type OsdVideoSystemId,
} from "../../../../lib/osd/ardupilot-osd-setup";
import type { SerialPortModel, SerialPortRow } from "../../../../lib/setup/serial-port-model";
import type { StagedParameterEdit } from "../../../../lib/stores/params";
import SetupSectionCard from "../../shared/SetupSectionCard.svelte";
import SetupStatusPill from "../../shared/SetupStatusPill.svelte";
import { setupWorkspaceTestIds } from "../../setup-workspace-test-ids";

type StagedSerialRow = {
  key: string;
  label: string;
  name: string;
  nextValueText: string;
};

type Props = {
  osdModel: ArduPilotOsdModel;
  serialModel: SerialPortModel;
  selectedScreen: number | null;
  paramStore: ParamStore | null;
  stagedEdits: Record<string, StagedParameterEdit>;
  itemIndex: Map<string, ParameterItemModel>;
  disabled?: boolean;
  onStageParam: (name: string, value: number) => void;
};

let {
  osdModel,
  serialModel,
  selectedScreen,
  paramStore,
  stagedEdits,
  itemIndex,
  disabled = false,
  onStageParam,
}: Props = $props();

let selectedProfileId = $state<OsdVideoSystemId | null>(null);
let selectedPortByProfile = $state<Partial<Record<OsdVideoSystemId, string>>>({});

let detected = $derived(detectOsdConfiguration({ paramStore, stagedEdits }));
let draftProfileId = $derived(selectedProfileId ?? (
  detected.state === "analog" || detected.state === "dji" || detected.state === "walksnail"
    ? detected.state
    : null
));
let profile = $derived(draftProfileId ? OSD_VIDEO_SYSTEM_PROFILES[draftProfileId] : null);
let profileOptions = $derived(
  OSD_VIDEO_SYSTEM_PROFILE_LIST.map((entry) => ({
    value: entry.id,
    label: entry.label,
  })),
);
let profilePlaceholder = $derived(
  detected.state === "disabled"
    ? "OSD disabled — select a video system"
    : detected.state === "unknown"
      ? "OSD profile unavailable — select a video system"
      : "Select a video system",
);
let noProfileMessage = $derived(
  detected.state === "disabled"
    ? "OSD is disabled on the vehicle. Select a video system to prepare a setup transaction."
    : "The vehicle does not expose a recognized OSD backend. Select a video system to prepare a setup transaction.",
);
let currentProfilePorts = $derived.by(() => {
  if (profile?.serialProtocol === null || profile === null) {
    return [];
  }

  return serialModel.ports.filter((row) => row.protocolValue === profile.serialProtocol);
});
let selectedPortPrefix = $derived.by(() => {
  if (!draftProfileId || profile?.serialProtocol === null) {
    return null;
  }

  const manual = selectedPortByProfile[draftProfileId];
  if (manual !== undefined) {
    return manual || null;
  }

  return currentProfilePorts[0]?.prefix ?? null;
});
let portOptions = $derived(
  serialModel.ports.map((row) => ({
    value: row.prefix,
    label: portOptionLabel(row),
    title: row.summaryText,
    disabled: !row.hasProtocolParam,
  })),
);
let configurationPlan = $derived.by(() => draftProfileId
  ? buildOsdConfigurationPlan({
      profileId: draftProfileId,
      selectedPortPrefix,
      ports: serialModel.ports,
      paramStore,
      stagedEdits,
    })
  : null,
);
let planTargets = $derived(configurationPlan?.targets ?? []);
let proposedTargets = $derived(planTargets.filter((target) => target.willChange));
let targetActionabilityIssues = $derived(
  proposedTargets.flatMap((target) => [targetActionabilityIssue(target)]).filter((issue): issue is string => issue !== null),
);
let configurationIssues = $derived([
  ...(configurationPlan?.issues ?? []),
  ...targetActionabilityIssues,
]);
let canStageConfiguration = $derived(
  !disabled
  && configurationPlan?.canStage === true
  && proposedTargets.length > 0
  && targetActionabilityIssues.length === 0,
);
let proposedTargetCount = $derived(proposedTargets.length);
let stagedTargetCount = $derived(planTargets.filter((target) => isTargetAlreadyStaged(target)).length);
let alreadyStagedTargetNames = $derived(new Set(planTargets.filter((target) => isTargetAlreadyStaged(target)).map((target) => target.name)));
let selectedScreenModel = $derived.by(() => {
  if (osdModel.screens.length === 0) {
    return null;
  }

  return osdModel.screens.find((screen) => screen.screen === selectedScreen) ?? osdModel.screens[0] ?? null;
});
let resolutionOptions = $derived([
  { value: "0", label: "SD 30 x 16" },
  { value: "1", label: "HD 50 x 18" },
  { value: "3", label: "HD 60 x 22" },
]);
let resolutionSelectValue = $derived(String(selectedScreenModel?.txtResValue ?? 1));
let stagedSerialRows = $derived(
  serialModel.ports.flatMap((row) => stagedSerialChanges(row, alreadyStagedTargetNames)),
);
let mspOsdPorts = $derived(serialModel.ports.filter((row) => isMspOsdProtocol(row.protocolValue)));

function handleProfileChange(value: string) {
  selectedProfileId = isProfileId(value) ? value : null;
}

function handlePortChange(value: string) {
  if (!draftProfileId) {
    return;
  }

  selectedPortByProfile = {
    ...selectedPortByProfile,
    [draftProfileId]: value,
  };
}

function stageConfiguration() {
  if (!configurationPlan || !canStageConfiguration) {
    return;
  }

  for (const target of proposedTargets) {
    onStageParam(target.name, target.value);
  }
}

function stageResolution(value: string) {
  const screen = selectedScreenModel;
  const parsed = Number(value);
  if (!screen || !screen.txtResParamName || !Number.isFinite(parsed)) {
    return;
  }

  if (!canStageTarget({ name: screen.txtResParamName })) {
    return;
  }

  onStageParam(screen.txtResParamName, parsed);
}

function canStageTarget(target: Pick<OsdSetupStageTarget, "name">): boolean {
  return !disabled && targetActionabilityIssue(target) === null;
}

function targetActionabilityIssue(target: Pick<OsdSetupStageTarget, "name">): string | null {
  const item = itemIndex.get(target.name);
  if (!item) {
    return `${target.name} is unavailable in the loaded parameter metadata.`;
  }
  if (item.readOnly) {
    return `${target.name} is read-only and cannot be staged here.`;
  }

  return null;
}

function isTargetAlreadyStaged(target: OsdSetupStageTarget): boolean {
  return stagedEdits[target.name]?.nextValue === target.value;
}

function isProfileId(value: string): value is OsdVideoSystemId {
  return value === "analog" || value === "dji" || value === "walksnail";
}

function portOptionLabel(row: SerialPortRow): string {
  const label = row.boardLabel ? `${row.prefix} (${row.boardLabel})` : row.prefix;
  const pending = row.hasPendingChange ? " · staged" : "";
  return `${label} — ${row.protocolValueText} @ ${row.baudValueText}${pending}`;
}

function stagedSerialChanges(row: SerialPortRow, visibleNames: Set<string>): StagedSerialRow[] {
  const rows: StagedSerialRow[] = [];
  const protocolEdit = stagedEdits[row.protocolParamName];
  if (protocolEdit && visibleNames.has(row.protocolParamName)) {
    rows.push({
      key: row.protocolParamName,
      label: `${row.prefix} protocol`,
      name: row.protocolParamName,
      nextValueText: protocolEdit.nextValueText,
    });
  }

  const baudEdit = stagedEdits[row.baudParamName];
  if (baudEdit && visibleNames.has(row.baudParamName)) {
    rows.push({
      key: row.baudParamName,
      label: `${row.prefix} baud`,
      name: row.baudParamName,
      nextValueText: baudEdit.nextValueText,
    });
  }

  return rows;
}

function mspStatusText(): string {
  if (!profile) {
    return "Select a video system to review the OSD setup transaction.";
  }
  if (profile.serialProtocol === null) {
    return "Analog onboard OSD uses the flight controller video overlay chip and does not need a SERIAL/MSP port.";
  }
  if (serialModel.ports.length === 0) {
    return "No SERIALn_* ports are loaded yet. Download parameters before assigning the video UART.";
  }
  if (currentProfilePorts.length === 0) {
    return `No ${profile.serialProtocolLabel} UART is configured yet. Pick the UART wired to the video system before staging protocol and baud changes.`;
  }

  return `${profile.serialProtocolLabel} is currently assigned to ${currentProfilePorts.map((row) => row.prefix).join(", ")}. Choose another UART to include reassignment in the proposed transaction.`;
}

function backendStatusText(): string {
  if (detected.osdType === null) {
    return "OSD_TYPE unavailable";
  }
  if (detected.state === "disabled") {
    return "OSD disabled (OSD_TYPE=0)";
  }
  if (detected.state === "unknown") {
    return `Unknown OSD_TYPE=${detected.osdType}`;
  }

  return `OSD_TYPE=${detected.osdType}`;
}

function targetValueText(target: OsdSetupStageTarget): string {
  const current = target.currentValue === null ? "--" : String(target.currentValue);
  return `${current} → ${target.value}`;
}
</script>

<SetupSectionCard
  icon={Monitor}
  title="OSD Setup"
  description="Stage the essential ArduPilot parameters for analog onboard OSD, DJI Custom OSD, or Walksnail DisplayPort before refining the layout below."
  testId={setupWorkspaceTestIds.osdSetup}
>
  {#snippet status()}
    {#if !profile}
      <SetupStatusPill tone="muted">No profile</SetupStatusPill>
    {:else if profile.serialProtocol === null}
      <SetupStatusPill tone="success">No UART</SetupStatusPill>
    {:else if currentProfilePorts.length > 0}
      <SetupStatusPill tone="success">UART ready</SetupStatusPill>
    {:else}
      <SetupStatusPill tone="warning">UART needed</SetupStatusPill>
    {/if}
  {/snippet}

  <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.75fr)]">
    <div class="flex min-w-0 flex-col gap-3">
      <label class="grid gap-1 text-xs font-medium uppercase tracking-wide text-text-muted">
        Video system
        <NativeSelect
          value={draftProfileId ?? ""}
          options={profileOptions}
          placeholder={profilePlaceholder}
          disabled={disabled}
          testId={setupWorkspaceTestIds.osdSetupProfileSelect}
          onchange={(event) => handleProfileChange(event.currentTarget.value)}
        />
      </label>

      <div class="rounded-lg border border-border bg-bg-secondary p-3">
        <div class="flex flex-wrap items-center gap-2">
          <Tv size={16} class="text-accent" aria-hidden="true" />
          <h3 class="text-sm font-semibold text-text-primary">{profile?.label ?? "No OSD profile selected"}</h3>
          <SetupStatusPill tone="muted">{backendStatusText()}</SetupStatusPill>
        </div>
        {#if profile}
          <p class="mt-2 text-sm leading-6 text-text-secondary">{profile.summary}</p>
          <div class="mt-3 flex flex-wrap gap-2">
            {#each profile.keyParams as param (param)}
              <span class="rounded-full border border-border bg-bg-primary px-2 py-1 font-mono text-[10px] text-text-muted">{param}</span>
            {/each}
          </div>
        {:else}
          <p class="mt-2 text-sm leading-6 text-text-secondary">{noProfileMessage}</p>
        {/if}
      </div>

      {#if profile && profile.serialProtocol !== null}
        <div class="rounded-lg border border-border bg-bg-primary p-3">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <label class="grid min-w-0 flex-1 gap-1 text-xs font-medium uppercase tracking-wide text-text-muted">
              UART wired to video system
              <NativeSelect
                value={selectedPortPrefix ?? ""}
                options={portOptions}
                placeholder={`No ${profile.shortLabel} MSP port selected`}
                disabled={disabled || serialModel.ports.length === 0}
                testId={setupWorkspaceTestIds.osdSetupUartSelect}
                onchange={(event) => handlePortChange(event.currentTarget.value)}
              />
            </label>
            <Cable class="mt-6 shrink-0 text-text-muted" size={18} aria-hidden="true" />
          </div>
          <p class="mt-2 text-xs leading-5 text-text-muted">{mspStatusText()}</p>

          {#if stagedSerialRows.length > 0}
            <div class="mt-3 rounded-md border border-warning/30 bg-warning/10 p-2">
              <p class="text-[10px] font-semibold uppercase tracking-wide text-warning">Already staged serial changes</p>
              <div class="mt-2 flex flex-col gap-1.5">
                {#each stagedSerialRows as row (row.key)}
                  <div class="flex flex-wrap items-center gap-2 text-xs text-text-secondary" data-testid={`${setupWorkspaceTestIds.osdSetupSerialStagedPrefix}-${row.name}`}>
                    <span class="font-medium text-text-primary">{row.label}</span>
                    <span class="font-mono">→ {row.nextValueText}</span>
                    <StagedBadge name={row.name} />
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      {:else if profile}
        <div class="rounded-lg border border-success/30 bg-success/10 p-3 text-sm leading-6 text-text-secondary">
          <div class="flex items-start gap-2">
            <CheckCircle2 class="mt-0.5 shrink-0 text-success" size={16} aria-hidden="true" />
            <p>Analog OSD is configured through OSD parameters and the layout editor. There is no MSP UART to assign for this video path.</p>
          </div>
        </div>
      {:else}
        <div class="rounded-lg border border-dashed border-border bg-bg-primary p-3 text-sm leading-6 text-text-muted">
          Select a profile before assigning a UART or reviewing the parameters that will change.
        </div>
      {/if}
    </div>

    <div class="flex min-w-0 flex-col gap-3">
      <div class="rounded-lg border border-border bg-bg-primary p-3">
        <div class="flex items-center gap-2">
          <RadioTower size={16} class="text-accent" aria-hidden="true" />
          <h3 class="text-sm font-semibold text-text-primary">Operator checklist</h3>
        </div>
        {#if profile}
          <ul class="mt-3 grid gap-2 text-xs leading-5 text-text-secondary">
            {#each profile.operatorNotes as note (note)}
              <li class="flex gap-2">
                <span class="mt-2 size-1.5 shrink-0 rounded-full bg-accent"></span>
                <span>{note}</span>
              </li>
            {/each}
            {#if mspOsdPorts.length > 0 && profile.serialProtocol !== null}
              <li class="flex gap-2">
                <span class="mt-2 size-1.5 shrink-0 rounded-full bg-text-muted"></span>
                <span>Detected MSP/OSD protocols on {mspOsdPorts.map((row) => row.prefix).join(", ")}.</span>
              </li>
            {/if}
          </ul>
        {:else}
          <p class="mt-3 text-xs leading-5 text-text-muted">Pick Analog, DJI, or Walksnail to see wiring and display guidance.</p>
        {/if}
      </div>

      {#if draftProfileId === "walksnail"}
        <div class="rounded-lg border border-border bg-bg-primary p-3">
          <label class="grid gap-1 text-xs font-medium uppercase tracking-wide text-text-muted">
            DisplayPort grid for active screen
            <NativeSelect
              value={resolutionSelectValue}
              options={resolutionOptions}
              disabled={disabled || !selectedScreenModel?.txtResParamName}
              testId={setupWorkspaceTestIds.osdSetupResolutionSelect}
              onchange={(event) => stageResolution(event.currentTarget.value)}
            />
          </label>
          {#if selectedScreenModel?.txtResParamName}
            <p class="mt-2 text-xs leading-5 text-text-muted">
              Stages <span class="font-mono text-text-primary">{selectedScreenModel.txtResParamName}</span> for {selectedScreenModel.label}. Use HD grids before placing Walksnail items.
              {#if stagedEdits[selectedScreenModel.txtResParamName]}
                <span class="ml-1 inline-block"><StagedBadge name={selectedScreenModel.txtResParamName} testId={`${setupWorkspaceTestIds.osdSetupStagedPrefix}-${selectedScreenModel.txtResParamName}`} /></span>
              {/if}
            </p>
          {:else}
            <p class="mt-2 text-xs leading-5 text-warning">No OSDn_TXT_RES parameter is loaded for the active screen, so grid resolution cannot be staged here.</p>
          {/if}
        </div>
      {/if}

      <div class="rounded-lg border border-border bg-bg-secondary p-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="text-sm font-semibold text-text-primary">OSD setup transaction</h3>
          <SetupStatusPill tone={proposedTargetCount > 0 ? "accent" : "muted"}>
            {proposedTargetCount} will change
          </SetupStatusPill>
        </div>
        <p class="mt-2 text-xs leading-5 text-text-muted">
          Review the complete backend and UART transaction, then stage it in one explicit action. DisplayPort grid resolution is staged only from its own selector above.
        </p>

        <div class="mt-3 flex flex-wrap gap-2 text-xs text-text-secondary">
          <span class="rounded-full border border-border bg-bg-primary px-2 py-1">{proposedTargetCount} will change</span>
          <span class="rounded-full border border-border bg-bg-primary px-2 py-1">{stagedTargetCount} already staged</span>
        </div>

        {#if !configurationPlan}
          <p class="mt-3 rounded-md border border-dashed border-border px-3 py-4 text-sm text-text-muted">
            Select a video system to build an OSD setup transaction.
          </p>
        {:else}
          {#if configurationIssues.length > 0}
            <div class="mt-3 rounded-md border border-warning/30 bg-warning/10 p-3">
              <p class="text-xs font-semibold text-warning">OSD setup cannot be staged yet</p>
              <ul class="mt-2 grid gap-1 text-xs leading-5 text-text-secondary">
                {#each configurationIssues as issue (issue)}
                  <li>{issue}</li>
                {/each}
              </ul>
            </div>
          {/if}

          {#if planTargets.length === 0 && configurationIssues.length === 0}
            <p class="mt-3 rounded-md border border-dashed border-border px-3 py-4 text-sm text-text-muted">
              This OSD profile does not expose any configurable backend parameters on this vehicle.
            </p>
          {/if}

          <div class="mt-3 grid gap-2">
            {#each planTargets as target (`${target.name}-${target.value}`)}
              <div class="rounded-md border border-border bg-bg-primary p-2 text-xs" data-testid={`${setupWorkspaceTestIds.osdSetupTargetPrefix}-${target.name}`}>
                <div class="flex flex-wrap items-start justify-between gap-2">
                  <div class="min-w-0">
                    <p class="font-medium text-text-primary">{target.label}</p>
                    <p class="mt-1 leading-5 text-text-muted">{target.detail}</p>
                  </div>
                  {#if isTargetAlreadyStaged(target)}
                    <StagedBadge name={target.name} testId={`${setupWorkspaceTestIds.osdSetupStagedPrefix}-${target.name}`} />
                  {:else if !target.willChange}
                    <span class="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">set</span>
                  {/if}
                </div>
                <div class="mt-2 flex flex-wrap items-center gap-2 font-mono text-[10px] text-text-muted">
                  <span>{target.name}</span>
                  <span>{targetValueText(target)}</span>
                  {#if targetActionabilityIssue(target)}
                    <span class="font-sans text-warning">{targetActionabilityIssue(target)}</span>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}

        <Button class="mt-3 w-full" disabled={!canStageConfiguration} onclick={stageConfiguration}>
          Stage OSD setup
        </Button>
      </div>
    </div>
  </div>
</SetupSectionCard>

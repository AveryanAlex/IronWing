<script lang="ts">
import { Cable, CheckCircle2, Monitor, RadioTower, Tv } from "lucide-svelte";

import { NativeSelect, StagedBadge } from "../../../../components/ui";
import type { ParamStore } from "../../../../params";
import type { ParameterItemModel } from "../../../../lib/params/parameter-item-model";
import type { ArduPilotOsdModel } from "../../../../lib/osd/ardupilot-osd-model";
import {
  OSD_TYPE_DISPLAYPORT,
  OSD_TYPE_MSP,
  OSD_VIDEO_SYSTEM_PROFILE_LIST,
  OSD_VIDEO_SYSTEM_PROFILES,
  SERIAL_BAUD_115200,
  SERIAL_PROTOCOL_DJI_FPV,
  SERIAL_PROTOCOL_DISPLAYPORT,
  SERIAL_PROTOCOL_NONE,
  buildMspPortStagePlan,
  buildOsdProfileStagePlan,
  effectiveParamValue,
  isMspOsdProtocol,
  type MspPortStageTarget,
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
  onDiscardParam: (name: string) => void;
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
  onDiscardParam,
}: Props = $props();

let selectedProfileOverride = $state<OsdVideoSystemId | null>(null);
let selectedPortByProfile = $state<Partial<Record<OsdVideoSystemId, string>>>({});
let resolutionDraftByScreen = $state<Record<number, string>>({});
let autoStagedProfileNames = $state<string[]>([]);
let autoStagedSerialNames = $state<string[]>([]);

let currentOsdType = $derived(effectiveParamValue({ paramStore, stagedEdits }, "OSD_TYPE"));
let detectedProfileId = $derived(detectProfileId());
let selectedProfileId = $derived(selectedProfileOverride ?? detectedProfileId);
let profile = $derived(OSD_VIDEO_SYSTEM_PROFILES[selectedProfileId]);
let profileOptions = $derived(
  OSD_VIDEO_SYSTEM_PROFILE_LIST.map((entry) => ({
    value: entry.id,
    label: entry.label,
  })),
);
let profileTargets = $derived(
  buildOsdProfileStagePlan({
    profileId: selectedProfileId,
    paramStore,
    stagedEdits,
  }),
);
let currentProfilePorts = $derived.by(() => {
  if (profile.serialProtocol === null) {
    return [];
  }

  return serialModel.ports.filter((row) => row.protocolValue === profile.serialProtocol);
});
let selectedPortPrefix = $derived.by(() => {
  const manual = selectedPortByProfile[selectedProfileId];
  if (manual !== undefined) {
    return manual;
  }

  return currentProfilePorts[0]?.prefix ?? "";
});
let portOptions = $derived(
  serialModel.ports.map((row) => ({
    value: row.prefix,
    label: portOptionLabel(row),
    title: row.summaryText,
    disabled: !row.hasProtocolParam,
  })),
);
let portTargets = $derived.by((): MspPortStageTarget[] => {
  if (profile.serialProtocol === null) {
    return [];
  }

  return buildMspPortStagePlan({
    ports: serialPortsForStaging(),
    selectedPortPrefix,
    protocol: profile.serialProtocol,
    protocolLabel: profile.serialProtocolLabel ?? `Protocol ${profile.serialProtocol}`,
  });
});
let combinedTargets = $derived([...profileTargets, ...portTargets]);
let actionableChangeCount = $derived(combinedTargets.filter((target) => target.willChange && canStageTarget(target)).length);
let digitalProfileNeedsPort = $derived(profile.serialProtocol !== null && selectedPortPrefix.length === 0);
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
let resolutionSelectValue = $derived.by(() => {
  if (!selectedScreenModel) {
    return "1";
  }

  return resolutionDraftByScreen[selectedScreenModel.screen] ?? String(selectedScreenModel.txtResValue ?? 1);
});
let visibleSerialStageNames = $derived(new Set([...autoStagedSerialNames, ...portTargets.map((target) => target.name)]));
let stagedSerialRows = $derived(serialModel.ports.flatMap((row) => stagedSerialChanges(row, visibleSerialStageNames)));
let mspOsdPorts = $derived(serialModel.ports.filter((row) => isMspOsdProtocol(row.protocolValue)));

function handleProfileChange(value: string) {
  if (isProfileId(value)) {
    selectedProfileOverride = value;
    stageProfileSelection(value);

    const nextProfile = OSD_VIDEO_SYSTEM_PROFILES[value];
    if (nextProfile.serialProtocol === null) {
      discardStagedNames(autoStagedSerialNames);
      autoStagedSerialNames = [];
      return;
    }

    const nextPort = selectedPortByProfile[value] ?? firstPortForProtocol(nextProfile.serialProtocol);
    if (nextPort) {
      stagePortSelection(nextPort, value);
    }
  }
}

function detectProfileId(): OsdVideoSystemId {
  if (currentOsdType === OSD_TYPE_DISPLAYPORT) {
    return "walksnail";
  }

  if (currentOsdType === OSD_TYPE_MSP) {
    return "dji";
  }

  if (currentOsdType !== null) {
    return "analog";
  }

  if (serialModel.ports.some((row) => row.protocolValue === SERIAL_PROTOCOL_DISPLAYPORT)) {
    return "walksnail";
  }

  if (serialModel.ports.some((row) => row.protocolValue === SERIAL_PROTOCOL_DJI_FPV)) {
    return "dji";
  }

  return "analog";
}

function handlePortChange(value: string) {
  selectedPortByProfile = {
    ...selectedPortByProfile,
    [selectedProfileId]: value,
  };
  stagePortSelection(value, selectedProfileId);
}

function stageProfileSelection(profileId: OsdVideoSystemId) {
  if (disabled) {
    return;
  }

  const targets = buildOsdProfileStagePlan({
    profileId,
    paramStore,
    stagedEdits,
  });
  const targetNames = new Set(targets.map((target) => target.name));
  discardStagedNames(autoStagedProfileNames.filter((name) => !targetNames.has(name)));
  stageTargets(targets);
  autoStagedProfileNames = targets.map((target) => target.name);
}

function stagePortSelection(prefix: string, profileId: OsdVideoSystemId) {
  const selectedProfile = OSD_VIDEO_SYSTEM_PROFILES[profileId];
  if (disabled || selectedProfile.serialProtocol === null || prefix.length === 0) {
    return;
  }

  const targets = buildMspPortStagePlan({
    ports: serialPortsForStaging(),
    selectedPortPrefix: prefix,
    protocol: selectedProfile.serialProtocol,
    protocolLabel: selectedProfile.serialProtocolLabel ?? `Protocol ${selectedProfile.serialProtocol}`,
  });
  const targetNames = new Set(targets.map((target) => target.name));
  discardStagedNames(uniqueNames([
    ...autoStagedSerialNames.filter((name) => !targetNames.has(name)),
    ...staleSerialStageNames(targetNames, selectedProfile.serialProtocol),
  ]));
  stageTargets(targets);
  autoStagedSerialNames = targets.map((target) => target.name);
}

function stageTargets(targets: OsdSetupStageTarget[]) {
  for (const target of targets) {
    stageTarget(target);
  }
}

function stageTarget(target: OsdSetupStageTarget) {
  if (!canStageTarget(target)) {
    return;
  }

  onStageParam(target.name, target.value);
}

function discardStagedNames(names: string[]) {
  for (const name of names) {
    if (stagedEdits[name]) {
      onDiscardParam(name);
    }
  }
}

function staleSerialStageNames(targetNames: Set<string>, protocol: number): string[] {
  return serialModel.ports.flatMap((row) => {
    const names: string[] = [];
    const protocolEdit = stagedEdits[row.protocolParamName];
    if (
      protocolEdit
      && !targetNames.has(row.protocolParamName)
      && (protocolEdit.nextValue === protocol || protocolEdit.nextValue === SERIAL_PROTOCOL_NONE)
    ) {
      names.push(row.protocolParamName);
    }

    const baudEdit = stagedEdits[row.baudParamName];
    if (baudEdit && !targetNames.has(row.baudParamName) && baudEdit.nextValue === SERIAL_BAUD_115200) {
      names.push(row.baudParamName);
    }

    return names;
  });
}

function uniqueNames(names: string[]): string[] {
  return [...new Set(names)];
}

function stageResolution(value: string) {
  const screen = selectedScreenModel;
  const parsed = Number(value);
  if (!screen || !screen.txtResParamName || !Number.isFinite(parsed)) {
    return;
  }

  resolutionDraftByScreen = {
    ...resolutionDraftByScreen,
    [screen.screen]: value,
  };
  stageTarget({
    name: screen.txtResParamName,
    value: parsed,
    currentValue: screen.txtResValue,
    label: `${screen.label} text resolution`,
    detail: "Set the DisplayPort character grid for this OSD screen.",
    willChange: screen.txtResValue !== parsed,
  });
}

function canStageTarget(target: Pick<OsdSetupStageTarget, "name">): boolean {
  return !disabled && itemIndex.get(target.name)?.readOnly !== true && itemIndex.has(target.name);
}

function serialPortsForStaging(): SerialPortRow[] {
  return serialModel.ports.map((row) => ({
    ...row,
    protocolValue: actualParamValue(row.protocolParamName) ?? row.protocolValue,
    baudValue: actualParamValue(row.baudParamName) ?? row.baudValue,
  }));
}

function actualParamValue(name: string): number | null {
  const value = paramStore?.params[name]?.value;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function firstPortForProtocol(protocol: number): string {
  return serialModel.ports.find((row) => row.protocolValue === protocol)?.prefix ?? "";
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
  if (profile.serialProtocol === null) {
    return "Analog onboard OSD uses the flight controller video overlay chip and does not need a SERIAL/MSP port.";
  }

  if (serialModel.ports.length === 0) {
    return "No SERIALn_* ports are loaded yet. Download parameters before assigning the video UART.";
  }

  if (currentProfilePorts.length === 0) {
    return `No ${profile.serialProtocolLabel} UART is configured yet. Pick the UART wired to the video system to stage protocol and baud changes.`;
  }

  return `${profile.serialProtocolLabel} is currently assigned to ${currentProfilePorts.map((row) => row.prefix).join(", ")}. Selecting another UART stages the old assignment to None and enables the new port.`;
}

function backendStatusText(): string {
  return currentOsdType === null ? "OSD_TYPE unavailable" : `OSD_TYPE=${currentOsdType}`;
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
    {#if profile.serialProtocol === null}
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
          value={selectedProfileId}
          options={profileOptions}
          disabled={disabled}
          testId={setupWorkspaceTestIds.osdSetupProfileSelect}
          onchange={(event) => handleProfileChange(event.currentTarget.value)}
        />
      </label>

      <div class="rounded-lg border border-border bg-bg-secondary p-3">
        <div class="flex flex-wrap items-center gap-2">
          <Tv size={16} class="text-accent" aria-hidden="true" />
          <h3 class="text-sm font-semibold text-text-primary">{profile.label}</h3>
          <SetupStatusPill tone="muted">{backendStatusText()}</SetupStatusPill>
        </div>
        <p class="mt-2 text-sm leading-6 text-text-secondary">{profile.summary}</p>
        <div class="mt-3 flex flex-wrap gap-2">
          {#each profile.keyParams as param (param)}
            <span class="rounded-full border border-border bg-bg-primary px-2 py-1 font-mono text-[10px] text-text-muted">{param}</span>
          {/each}
        </div>
      </div>

      {#if profile.serialProtocol !== null}
        <div class="rounded-lg border border-border bg-bg-primary p-3">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <label class="grid min-w-0 flex-1 gap-1 text-xs font-medium uppercase tracking-wide text-text-muted">
              UART wired to video system
              <NativeSelect
                value={selectedPortPrefix}
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
              <p class="text-[10px] font-semibold uppercase tracking-wide text-warning">Staged serial changes</p>
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
      {:else}
        <div class="rounded-lg border border-success/30 bg-success/10 p-3 text-sm leading-6 text-text-secondary">
          <div class="flex items-start gap-2">
            <CheckCircle2 class="mt-0.5 shrink-0 text-success" size={16} aria-hidden="true" />
            <p>Analog OSD is configured through OSD parameters and the layout editor. There is no MSP UART to assign for this video path.</p>
          </div>
        </div>
      {/if}
    </div>

    <div class="flex min-w-0 flex-col gap-3">
      <div class="rounded-lg border border-border bg-bg-primary p-3">
        <div class="flex items-center gap-2">
          <RadioTower size={16} class="text-accent" aria-hidden="true" />
          <h3 class="text-sm font-semibold text-text-primary">Operator checklist</h3>
        </div>
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
      </div>

      {#if selectedProfileId === "walksnail"}
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
          <h3 class="text-sm font-semibold text-text-primary">Auto-staged setup</h3>
          <SetupStatusPill tone={actionableChangeCount > 0 ? "accent" : "muted"}>
            {actionableChangeCount} pending
          </SetupStatusPill>
        </div>
        <p class="mt-2 text-xs leading-5 text-text-muted">
          Changing the video system, UART, or DisplayPort grid stages the matching parameters immediately for the global review tray.
        </p>

        {#if combinedTargets.length === 0}
          <p class="mt-3 rounded-md border border-dashed border-border px-3 py-4 text-sm text-text-muted">
            Required setup parameters are not loaded yet. Download parameters or use Full Parameters if this firmware exposes the values elsewhere.
          </p>
        {:else}
          <div class="mt-3 grid gap-2">
            {#each combinedTargets as target (`${target.name}-${target.value}`)}
              <div class="rounded-md border border-border bg-bg-primary p-2 text-xs" data-testid={`${setupWorkspaceTestIds.osdSetupTargetPrefix}-${target.name}`}>
                <div class="flex flex-wrap items-start justify-between gap-2">
                  <div class="min-w-0">
                    <p class="font-medium text-text-primary">{target.label}</p>
                    <p class="mt-1 leading-5 text-text-muted">{target.detail}</p>
                  </div>
                  {#if stagedEdits[target.name]}
                    <StagedBadge name={target.name} testId={`${setupWorkspaceTestIds.osdSetupStagedPrefix}-${target.name}`} />
                  {:else if !target.willChange}
                    <span class="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">set</span>
                  {/if}
                </div>
                <div class="mt-2 flex flex-wrap items-center gap-2 font-mono text-[10px] text-text-muted">
                  <span>{target.name}</span>
                  <span>{targetValueText(target)}</span>
                  {#if !canStageTarget(target)}
                    <span class="font-sans text-warning">read-only or unavailable</span>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}

        {#if digitalProfileNeedsPort}
          <p class="mt-3 text-xs leading-5 text-warning">Select the UART wired to the video system before staging this digital OSD setup.</p>
        {/if}
      </div>
    </div>
  </div>
</SetupSectionCard>

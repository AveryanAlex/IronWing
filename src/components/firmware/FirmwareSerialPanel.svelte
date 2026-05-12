<script lang="ts">
import { onMount } from "svelte";

import type {
  CatalogEntry,
  CatalogTargetSummary,
  SerialReadinessBlockedReason,
} from "../../firmware";
import type { FirmwareFileIo } from "../../lib/firmware-file-io";
import type { FirmwareService } from "../../lib/platform/firmware";
import {
  createCatalogSourceMetadata,
  createLocalFileSourceMetadata,
  type FirmwareWorkspaceStore,
} from "../../lib/stores/firmware-workspace";
import {
  ALL_TARGET_VEHICLE_TYPES,
  catalogTargetKey,
  filterCatalogTargets,
  listCatalogTargetVehicleTypes,
  sanitizeCatalogTargetSummaries,
} from "./firmware-target-filter";
import type { FirmwareWorkspaceLayout } from "./firmware-workspace-layout";
import { firmwareWorkspaceTestIds } from "./firmware-workspace-test-ids";
import { Banner, Button, Panel, SectionHeader, StatusPill } from "../ui";

const BAUD_RATES = [115200, 57600, 230400, 460800, 921600];

type CatalogLoadPhase = "idle" | "loading" | "ready" | "failed";
type TargetProofState =
  | "loading"
  | "missing"
  | "ambiguous"
  | "target_list_failed"
  | "entry_loading"
  | "entry_failed"
  | "entry_missing"
  | "detected";

type Props = {
  store: FirmwareWorkspaceStore;
  service: FirmwareService;
  fileIo: FirmwareFileIo;
  layout: FirmwareWorkspaceLayout;
  replayReadonly: boolean;
};

let {
  store,
  service,
  fileIo,
  layout,
  replayReadonly,
}: Props = $props();

let workspaceState = $derived($store);
let isSerialActive = $derived(workspaceState.activePath === "serial_primary");
let isSerialCancelling = $derived(
  workspaceState.sessionStatus.kind === "cancelling" && workspaceState.sessionStatus.path === "serial_primary",
);

let catalogTargets = $state<CatalogTargetSummary[]>([]);
let targetListPhase = $state<CatalogLoadPhase>("idle");
let targetListError = $state<string | null>(null);
let catalogEntries = $state<CatalogEntry[]>([]);
let catalogEntryPhase = $state<CatalogLoadPhase>("idle");
let catalogEntryError = $state<string | null>(null);
let selectedEntryIndex = $state(0);
let manualOverrideExpanded = $state(false);
let manualSelectionCommitted = $state(false);
let targetSearch = $state("");
let targetVehicleType = $state(ALL_TARGET_VEHICLE_TYPES);

let targetLoadRequest = 0;
let entryLoadRequest = 0;
let currentEntryTargetKey = "";
let lastObservedPort = $state("");
let portObservationInitialized = $state(false);
let lastAutoTargetKey = "";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function sanitizeCatalogEntries(value: unknown): CatalogEntry[] {
  if (!Array.isArray(value)) {
    throw new Error("Firmware catalog entries returned an unexpected payload.");
  }

  const sanitized: CatalogEntry[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }

    const candidate = entry as Record<string, unknown>;
    if (
      typeof candidate.board_id !== "number"
      || !Number.isInteger(candidate.board_id)
      || candidate.board_id <= 0
      || !isNonEmptyString(candidate.platform)
      || !isNonEmptyString(candidate.vehicle_type)
      || !isNonEmptyString(candidate.version)
      || !isNonEmptyString(candidate.version_type)
      || !isNonEmptyString(candidate.format)
      || !isNonEmptyString(candidate.url)
      || typeof candidate.image_size !== "number"
      || !Number.isFinite(candidate.image_size)
      || candidate.image_size < 0
      || typeof candidate.latest !== "boolean"
      || !isNonEmptyString(candidate.git_sha)
    ) {
      continue;
    }

    if (candidate.format.toLowerCase() !== "apj") {
      continue;
    }

    sanitized.push({
      board_id: candidate.board_id,
      platform: candidate.platform.trim(),
      vehicle_type: candidate.vehicle_type.trim(),
      version: candidate.version.trim(),
      version_type: candidate.version_type.trim(),
      format: candidate.format.trim(),
      url: candidate.url.trim(),
      image_size: candidate.image_size,
      latest: candidate.latest,
      git_sha: candidate.git_sha.trim(),
      brand_name: isNonEmptyString(candidate.brand_name) ? candidate.brand_name.trim() : null,
      manufacturer: isNonEmptyString(candidate.manufacturer) ? candidate.manufacturer.trim() : null,
    });
  }

  return sanitized;
}

function targetLabel(target: CatalogTargetSummary | null): string {
  if (!target) {
    return "No target selected";
  }

  return target.brand_name ?? target.platform;
}

function targetMeta(target: CatalogTargetSummary | null): string {
  if (!target) {
    return "Unproven target";
  }

  const details = [
    target.brand_name && target.brand_name !== target.platform ? target.platform : null,
    target.manufacturer,
    `Board ID ${target.board_id}`,
  ].filter((value): value is string => Boolean(value));

  return details.join(" · ");
}

function entryLabel(entry: CatalogEntry): string {
  const vehicle = `${entry.vehicle_type} ${entry.version}`;
  const suffix = entry.latest ? "latest" : entry.version_type;
  return `${vehicle} · ${suffix}`;
}

function entryDetail(entry: CatalogEntry): string {
  const details = [
    entry.brand_name ?? entry.platform,
    entry.manufacturer,
    `${Math.round(entry.image_size / 1024)} KiB`,
  ].filter((value): value is string => Boolean(value));

  return details.join(" · ");
}

function blockedReasonCopy(reason: SerialReadinessBlockedReason | null): string {
  switch (reason) {
    case "session_busy":
      return "Another firmware session is already active.";
    case "port_unselected":
      return "Choose a serial port before flashing.";
    case "port_unavailable":
      return "The selected serial port is no longer available. Refresh ports and keep the intended bootloader port selected.";
    case "source_missing":
      return "Choose an official catalog entry or load a local APJ before flashing.";
    default:
      return "Serial install is still blocked by the current readiness state.";
  }
}

function bootloaderTransitionCopy() {
  const transition = workspaceState.serial.readiness.response?.bootloader_transition?.kind;
  switch (transition) {
    case "auto_reboot_supported":
      return "The active MAVLink link safely matches this port, so IronWing can request bootloader entry automatically when flashing starts.";
    case "already_in_bootloader":
      return "This port is already in bootloader, so install can begin without an additional reboot step.";
    case "auto_reboot_attemptable":
      return "A controller was detected on this port. IronWing will attempt a bootloader reboot before erase/program begins.";
    case "target_mismatch":
      return "The backend cannot safely prove the active MAVLink link matches this serial port. Enter bootloader manually if needed, then start the install.";
    default:
      return "Assume manual bootloader entry unless the board is already in bootloader or the backend proves a safe reboot path.";
  }
}

function serialStateLabel() {
  if (isSerialCancelling) {
    return "cancelling";
  }

  if (isSerialActive) {
    return `active:${workspaceState.sessionPhase ?? "running"}`;
  }

  return workspaceState.serial.readiness.phase;
}

async function loadCatalogTargets() {
  const requestId = ++targetLoadRequest;
  targetListPhase = "loading";
  targetListError = null;

  try {
    const rawTargets = await service.catalogTargets();
    if (requestId !== targetLoadRequest) {
      return;
    }

    if (!Array.isArray(rawTargets)) {
      throw new Error("Firmware catalog targets returned an unexpected payload.");
    }

    catalogTargets = sanitizeCatalogTargetSummaries(rawTargets);
    targetListPhase = "ready";
    targetListError = null;
  } catch (error) {
    if (requestId !== targetLoadRequest) {
      return;
    }

    targetListPhase = "failed";
    targetListError = service.formatError(error);
  }
}

function setCatalogSourceFromEntry(entry: CatalogEntry | null) {
  if (!entry) {
    return store.setSerialSource({ kind: "catalog_url", url: "" }, null);
  }

  return store.setSerialSource(
    { kind: "catalog_url", url: entry.url },
    createCatalogSourceMetadata(entry.url, entryLabel(entry), entryDetail(entry)),
  );
}

async function loadCatalogEntriesForTarget(target: CatalogTargetSummary, sourceKind: "manual" | "detected") {
  const requestId = ++entryLoadRequest;
  const targetKey = catalogTargetKey(target);
  const reloadingSameTarget = currentEntryTargetKey === targetKey;

  catalogEntryPhase = "loading";
  catalogEntryError = null;

  if (!reloadingSameTarget) {
    catalogEntries = [];
    selectedEntryIndex = 0;
    currentEntryTargetKey = targetKey;

    if (workspaceState.serial.source.kind === "catalog_url") {
      await store.setSerialSource({ kind: "catalog_url", url: "" }, null);
    }
  }

  try {
    const rawEntries = await service.catalogEntries(target.board_id, target.platform);
    if (requestId !== entryLoadRequest) {
      return;
    }

    const nextEntries = sanitizeCatalogEntries(rawEntries).filter((entry) => (
      entry.board_id === target.board_id && entry.platform === target.platform
    ));

    catalogEntries = nextEntries;
    catalogEntryPhase = "ready";
    catalogEntryError = null;

    const currentCatalogUrl = workspaceState.serial.source.kind === "catalog_url" ? workspaceState.serial.source.url : null;
    const preservedIndex = currentCatalogUrl
      ? nextEntries.findIndex((entry) => entry.url === currentCatalogUrl)
      : -1;
    const nextIndex = preservedIndex >= 0 ? preservedIndex : 0;
    selectedEntryIndex = nextEntries[nextIndex] ? nextIndex : 0;

    if (workspaceState.serial.source.kind !== "local_apj_bytes") {
      await setCatalogSourceFromEntry(nextEntries[nextIndex] ?? null);
    }

    if (sourceKind === "detected") {
      await store.setSerialTarget(target);
    }
  } catch (error) {
    if (requestId !== entryLoadRequest) {
      return;
    }

    catalogEntryPhase = "failed";
    catalogEntryError = service.formatError(error);

    if (workspaceState.serial.source.kind === "catalog_url") {
      await store.setSerialSource({ kind: "catalog_url", url: "" }, null);
    }
  }
}

async function retryCatalogEntries() {
  const target = manualSelectionActive ? workspaceState.serial.target : autoTarget;
  if (!target) {
    return;
  }

  await loadCatalogEntriesForTarget(target, manualSelectionActive ? "manual" : "detected");
}

async function handleSelectManualTarget(target: CatalogTargetSummary) {
  manualSelectionCommitted = true;
  manualOverrideExpanded = true;
  await store.setSerialTarget(target);
  await loadCatalogEntriesForTarget(target, "manual");
}

async function handleUseCatalogSource() {
  await setCatalogSourceFromEntry(catalogEntries[selectedEntryIndex] ?? null);
}

async function handleCatalogEntryChange(index: number) {
  selectedEntryIndex = index;

  if (workspaceState.serial.source.kind === "catalog_url") {
    await setCatalogSourceFromEntry(catalogEntries[index] ?? null);
  }
}

async function handleChooseLocalApj() {
  try {
    const result = await fileIo.pickApjFile();
    if (result.status === "cancelled") {
      return;
    }

    await store.setSerialSource(
      result.selection,
      createLocalFileSourceMetadata({
        kind: result.selection.kind,
        fileName: result.selection.fileName,
        byteLength: result.selection.byteLength,
        digest: result.selection.digest,
        detail: `${result.selection.byteLength} bytes`,
      }),
    );
  } catch (error) {
    store.setSerialSourceError(service.formatError(error));
  }
}

onMount(() => {
  void loadCatalogTargets();
});

let detectedBoardId = $derived(workspaceState.serial.readiness.response?.target_hint?.detected_board_id ?? null);
let detectedTargets = $derived.by(() => (
  detectedBoardId === null
    ? []
    : catalogTargets.filter((target) => target.board_id === detectedBoardId)
));
let autoTarget = $derived(detectedTargets.length === 1 ? detectedTargets[0] : null);
let targetProofState = $derived.by<TargetProofState>(() => {
  if (targetListPhase === "loading" && catalogTargets.length === 0) {
    return "loading";
  }

  if (detectedBoardId === null) {
    return "missing";
  }

  if (targetListPhase === "failed" && catalogTargets.length === 0) {
    return "target_list_failed";
  }

  if (detectedTargets.length !== 1) {
    return "ambiguous";
  }

  if (catalogEntryPhase === "loading" && catalogEntries.length === 0) {
    return "entry_loading";
  }

  if (catalogEntryPhase === "failed" && catalogEntries.length === 0) {
    return "entry_failed";
  }

  if (catalogEntryPhase === "ready" && catalogEntries.length === 0) {
    return "entry_missing";
  }

  return "detected";
});
let manualTargetRequired = $derived(targetProofState !== "detected");
let manualSelectionActive = $derived(
  workspaceState.serial.target !== null
  && (
    manualSelectionCommitted
    || autoTarget === null
    || catalogTargetKey(workspaceState.serial.target) !== catalogTargetKey(autoTarget)
  ),
);
let manualSectionOpen = $derived(manualTargetRequired || manualOverrideExpanded || manualSelectionActive);
let filteredTargets = $derived(filterCatalogTargets(catalogTargets, {
  searchText: targetSearch,
  vehicleType: targetVehicleType,
}));
let targetVehicleTypes = $derived(listCatalogTargetVehicleTypes(catalogTargets));
let selectedTargetKey = $derived(workspaceState.serial.target ? catalogTargetKey(workspaceState.serial.target) : null);
let selectedTargetVisible = $derived(
  !manualSelectionActive
  || !selectedTargetKey
  || filteredTargets.some((match) => match.key === selectedTargetKey)
);
let selectedCatalogEntry = $derived(catalogEntries[selectedEntryIndex] ?? null);
let usingCatalogSource = $derived(workspaceState.serial.source.kind === "catalog_url");
let usingLocalSource = $derived(workspaceState.serial.source.kind === "local_apj_bytes");
let manualTargetChosen = $derived(
  !manualTargetRequired || (manualSelectionActive && workspaceState.serial.target !== null),
);
let sourceReady = $derived.by(() => {
  if (workspaceState.serial.source.kind === "catalog_url") {
    return workspaceState.serial.source.url.trim().length > 0;
  }

  return workspaceState.serial.source.data.length > 0;
});
let canStartSerial = $derived(
  layout.actionsEnabled
  && !isSerialActive
  && workspaceState.serial.readiness.phase === "ready"
  && sourceReady
  && manualTargetChosen
  && selectedTargetVisible,
);
let selectedTargetState = $derived.by(() => {
  if (manualSelectionActive && workspaceState.serial.target) {
    return `manual · ${targetLabel(workspaceState.serial.target)} · ${targetMeta(workspaceState.serial.target)}`;
  }

  if (autoTarget) {
    return `detected · ${targetLabel(autoTarget)} · ${targetMeta(autoTarget)}`;
  }

  if (detectedBoardId !== null) {
    return detectedTargets.length > 1
      ? `unproven · detected Board ID ${detectedBoardId} matches multiple catalog targets`
      : `unproven · detected Board ID ${detectedBoardId} is missing a usable catalog target`;
  }

  return "unproven · manual choice required";
});
let selectedSourceState = $derived.by(() => {
  const metadata = workspaceState.serial.sourceMetadata;
  if (!metadata) {
    return usingLocalSource ? "local-apj · no file loaded" : "catalog · no official entry selected";
  }

  const detail = metadata.detail ? ` · ${metadata.detail}` : "";
  return `${metadata.kind} · ${metadata.label}${detail}`;
});
let targetProofMessage = $derived.by(() => {
  switch (targetProofState) {
    case "loading":
      return "Loading official catalog targets. Manual override stays available while board proof is incomplete.";
    case "missing":
      return "No board hint is available from the selected port. Choose the exact target manually before flashing.";
    case "ambiguous":
      return detectedBoardId === null
        ? "Choose the exact target manually before flashing."
        : `Detected Board ID ${detectedBoardId} maps to multiple catalog targets. Choose the exact lineage manually before flashing.`;
    case "target_list_failed":
      return "The target list could not be refreshed. Retry it, then choose the exact target manually before flashing.";
    case "entry_loading":
      return `Loading official APJ entries for detected Board ID ${detectedBoardId}. Manual override stays available until the source is proven.`;
    case "entry_failed":
      return detectedBoardId === null
        ? "Official APJ entries could not be loaded. Choose the target manually or use a local APJ."
        : `Official APJ entries could not be proven for detected Board ID ${detectedBoardId}. Choose the target manually or use a local APJ.`;
    case "entry_missing":
      return detectedBoardId === null
        ? "No usable official APJ entry is available. Choose the target manually or use a local APJ."
        : `No usable official APJ entry was found for detected Board ID ${detectedBoardId}. Choose the target manually or use a local APJ.`;
    case "detected":
      return detectedBoardId === null
        ? "Official catalog proof is ready."
        : `Detected Board ID ${detectedBoardId} maps to ${targetLabel(autoTarget)}. Manual override remains available if you need to force a different board lineage.`;
  }
});
let readinessDetail = $derived.by(() => {
  if (!layout.actionsEnabled) {
    return layout.blockedDetail ?? blockedReasonCopy(null);
  }

  if (workspaceState.serial.readiness.phase === "checking") {
    return "Serial readiness is refreshing for the current port, source, and erase settings.";
  }

  if (workspaceState.serial.readiness.phase === "failed") {
    return workspaceState.serial.readiness.error ?? "Serial readiness failed. Retry the current source selection.";
  }

  if (manualTargetRequired && !manualTargetChosen) {
    return targetProofMessage;
  }

  if (!selectedTargetVisible) {
    return "The selected manual target is hidden by the current search or vehicle filter. Clear the filter or reselect a visible target before flashing.";
  }

  if (workspaceState.serial.readiness.phase === "blocked") {
    return blockedReasonCopy(workspaceState.serial.readiness.response?.readiness.kind === "blocked"
      ? workspaceState.serial.readiness.response.readiness.reason
      : null);
  }

  return "Ready to install over serial once you confirm the selected source and bootloader path.";
});

$effect(() => {
  const port = workspaceState.serial.port;
  if (!portObservationInitialized) {
    portObservationInitialized = true;
    lastObservedPort = port;
    return;
  }

  if (port === lastObservedPort) {
    return;
  }

  lastObservedPort = port;
  manualSelectionCommitted = false;
  currentEntryTargetKey = "";
  catalogEntries = [];
  catalogEntryPhase = "idle";
  catalogEntryError = null;
  selectedEntryIndex = 0;

  if (workspaceState.serial.target !== null) {
    void store.setSerialTarget(null);
  }

  if (workspaceState.serial.source.kind === "catalog_url" && workspaceState.serial.source.url.trim().length > 0) {
    void store.setSerialSource({ kind: "catalog_url", url: "" }, null);
  }
});

$effect(() => {
  if (!manualSelectionActive || !workspaceState.serial.target) {
    return;
  }

  const key = catalogTargetKey(workspaceState.serial.target);
  if (currentEntryTargetKey === key && catalogEntryPhase !== "idle") {
    return;
  }

  void loadCatalogEntriesForTarget(workspaceState.serial.target, "manual");
});

$effect(() => {
  if (manualSelectionActive) {
    return;
  }

  const key = autoTarget ? catalogTargetKey(autoTarget) : "none";
  if (key === lastAutoTargetKey) {
    return;
  }

  lastAutoTargetKey = key;

  if (!autoTarget) {
    if (workspaceState.serial.target !== null) {
      void store.setSerialTarget(null);
    }
    return;
  }

  void loadCatalogEntriesForTarget(autoTarget, "detected");
});
</script>

<Panel padded testId={firmwareWorkspaceTestIds.serialPanel}>
  <SectionHeader
    eyebrow="Serial install"
    title="Install / Update"
    description="Use the official ArduPilot catalog first. Manual target override stays available when the backend cannot prove the exact board lineage."
  >
    {#snippet actions()}
      <div data-testid={firmwareWorkspaceTestIds.serialState}>
        <StatusPill tone="neutral">{serialStateLabel()}</StatusPill>
      </div>
    {/snippet}
  </SectionHeader>

  <div class="firmware-grid-main">
    <Panel padded>
      <div class="firmware-row">
        <label class="firmware-field firmware-field--grow">
          <span class="firmware-field__label">Serial port</span>
          <select
            class="firmware-select"
            data-testid={firmwareWorkspaceTestIds.serialPort}
            disabled={isSerialActive}
            onchange={(event) => void store.setSerialPort((event.currentTarget as HTMLSelectElement).value)}
            value={workspaceState.serial.port}
          >
            {#if workspaceState.serial.availablePorts.length === 0}
              <option value="">No serial ports available</option>
            {/if}
            {#each workspaceState.serial.availablePorts as port (port.port_name)}
              <option value={port.port_name}>
                {port.port_name}{port.product ? ` · ${port.product}` : ""}
              </option>
            {/each}
          </select>
        </label>

        <label class="firmware-field firmware-field--baud">
          <span class="firmware-field__label">Baud</span>
          <select
            class="firmware-select"
            data-testid={firmwareWorkspaceTestIds.serialBaud}
            disabled={isSerialActive}
            onchange={(event) => store.setSerialBaud(Number((event.currentTarget as HTMLSelectElement).value))}
            value={String(workspaceState.serial.baud)}
          >
            {#each BAUD_RATES as baud (baud)}
              <option value={String(baud)}>{baud}</option>
            {/each}
          </select>
        </label>

        <Button
          testId={firmwareWorkspaceTestIds.serialPortRefresh}
          disabled={isSerialActive}
          onclick={() => void store.refreshSerialPreflight()}
        >
          Refresh ports
        </Button>
      </div>

      {#if workspaceState.serial.preflightError}
        <div class="firmware-stack">
          <Banner severity="danger" title={workspaceState.serial.preflightError} />
        </div>
      {/if}

      <div class="firmware-grid-sources">
        <Panel padded tone={usingCatalogSource ? "info" : "neutral"} testId={firmwareWorkspaceTestIds.sourceCatalog}>
          <div class="firmware-row firmware-row--between">
            <div>
              <p class="firmware-eyebrow">Official catalog</p>
              <h4 class="firmware-subtitle">Recommended source</h4>
            </div>
            {#if !usingCatalogSource}
              <Button size="sm" tone="accent" onclick={handleUseCatalogSource}>Use catalog</Button>
            {/if}
          </div>

          <p class="firmware-prose">
            Use official APJ releases for the selected target first. Manual APJ files stay available below as an advanced override.
          </p>

          <div class="firmware-info-block">
            <span class="firmware-info-block__title">Target proof</span>
            <p class="firmware-info-block__value" data-testid={firmwareWorkspaceTestIds.selectedTargetState}>{selectedTargetState}</p>
          </div>

          {#if !manualTargetRequired}
            <div class="firmware-stack">
              <Banner severity="success" title={targetProofMessage} />
            </div>
          {/if}

          <div class="firmware-info-block">
            <span class="firmware-info-block__title">Catalog source</span>
            <p class="firmware-info-block__value" data-testid={firmwareWorkspaceTestIds.selectedSourceState}>{selectedSourceState}</p>
          </div>

          <Panel padded>
            <div class="firmware-row firmware-row--between">
              <div>
                <p class="firmware-eyebrow">Manual target override</p>
                <p class="firmware-prose firmware-prose--tight">Search targets when board proof is missing or uncertain.</p>
              </div>
              <Button
                size="sm"
                testId={firmwareWorkspaceTestIds.manualTargetToggle}
                disabled={manualTargetRequired}
                onclick={() => (manualOverrideExpanded = !manualOverrideExpanded)}
              >
                {manualSectionOpen ? "Hide override" : "Show override"}
              </Button>
            </div>

            {#if manualTargetRequired}
              <div class="firmware-stack">
                <Banner
                  severity="warning"
                  title={targetProofMessage}
                  testId={firmwareWorkspaceTestIds.manualTargetRequired}
                />
              </div>
            {/if}

            {#if manualSectionOpen}
              <div class="firmware-grid-filters">
                <label class="firmware-field">
                  <span class="firmware-field__label">Search target</span>
                  <input
                    class="firmware-input"
                    data-testid={firmwareWorkspaceTestIds.manualTargetSearch}
                    oninput={(event) => (targetSearch = (event.currentTarget as HTMLInputElement).value)}
                    placeholder="Cube, Matek, board ID…"
                    type="search"
                    value={targetSearch}
                  />
                </label>

                <label class="firmware-field">
                  <span class="firmware-field__label">Vehicle type</span>
                  <select
                    class="firmware-select"
                    data-testid={firmwareWorkspaceTestIds.manualTargetVehicleFilter}
                    onchange={(event) => (targetVehicleType = (event.currentTarget as HTMLSelectElement).value)}
                    value={targetVehicleType}
                  >
                    <option value={ALL_TARGET_VEHICLE_TYPES}>All vehicle types</option>
                    {#each targetVehicleTypes as vehicleType (vehicleType)}
                      <option value={vehicleType}>{vehicleType}</option>
                    {/each}
                  </select>
                </label>
              </div>

              {#if targetListError}
                <div class="firmware-stack" data-testid={firmwareWorkspaceTestIds.targetListError}>
                  <Banner
                    severity="danger"
                    title={targetListError}
                    actionLabel="Retry targets"
                    onAction={() => void loadCatalogTargets()}
                    actionTestId={firmwareWorkspaceTestIds.targetListRetry}
                  />
                </div>
              {/if}

              {#if targetListPhase === "loading" && catalogTargets.length === 0}
                <p class="firmware-prose">Loading official targets…</p>
              {:else if filteredTargets.length > 0}
                <div
                  class="firmware-target-grid"
                  data-testid={firmwareWorkspaceTestIds.manualTargetResults}
                >
                  {#each filteredTargets as match (match.key)}
                    <button
                      aria-pressed={selectedTargetKey === match.key}
                      class="firmware-target-card"
                      data-selected={selectedTargetKey === match.key || undefined}
                      onclick={() => void handleSelectManualTarget(match.target)}
                      type="button"
                    >
                      <div class="firmware-target-card__row">
                        <span class="firmware-target-card__name">{match.label}</span>
                        <span class="firmware-target-card__platform">{match.target.platform}</span>
                      </div>
                      <p class="firmware-target-card__meta">{match.metadata.join(" · ")}</p>
                      <p class="firmware-target-card__vehicles">{match.vehicleTypesLabel}</p>
                    </button>
                  {/each}
                </div>
              {:else if catalogTargets.length === 0}
                <p
                  class="firmware-info-block firmware-info-block--standalone"
                  data-testid={firmwareWorkspaceTestIds.manualTargetEmpty}
                >
                  No catalog targets are available right now. Retry the list or keep browsing with a local APJ.
                </p>
              {:else}
                <p
                  class="firmware-info-block firmware-info-block--standalone"
                  data-testid={firmwareWorkspaceTestIds.manualTargetNoMatches}
                >
                  No targets match the current search or vehicle filter.
                </p>
              {/if}

              {#if manualSelectionActive && workspaceState.serial.target}
                <div class="firmware-stack" data-testid={firmwareWorkspaceTestIds.manualTargetSelected}>
                  <Banner
                    severity="info"
                    title={`Manual target selected · ${targetLabel(workspaceState.serial.target)} · ${targetMeta(workspaceState.serial.target)}`}
                  />
                </div>
              {/if}

              {#if manualSelectionActive && !selectedTargetVisible}
                <div class="firmware-stack" data-testid={firmwareWorkspaceTestIds.manualTargetHidden}>
                  <Banner
                    severity="warning"
                    title="The selected manual target is hidden by the current filter. Clear the filter or reselect a visible target before flashing."
                  />
                </div>
              {/if}
            {/if}
          </Panel>

          <Panel padded>
            <div class="firmware-row firmware-row--between">
              <div>
                <p class="firmware-eyebrow">Official APJ entry</p>
                <p class="firmware-prose firmware-prose--tight">Keep the proven catalog entry selected unless you explicitly need a different release.</p>
              </div>
              <span class="firmware-tag" data-testid={firmwareWorkspaceTestIds.catalogEntryState}>
                {catalogEntryPhase}
              </span>
            </div>

            {#if catalogEntryError}
              <div class="firmware-stack" data-testid={firmwareWorkspaceTestIds.catalogEntryError}>
                <Banner
                  severity="danger"
                  title={catalogEntryError}
                  actionLabel="Retry entries"
                  onAction={() => void retryCatalogEntries()}
                  actionTestId={firmwareWorkspaceTestIds.catalogEntryRetry}
                />
              </div>
            {/if}

            {#if catalogEntries.length > 0}
              <label class="firmware-field firmware-field--block">
                <span class="firmware-field__label">Selected release</span>
                <select
                  class="firmware-select"
                  data-testid={firmwareWorkspaceTestIds.catalogEntrySelect}
                  disabled={isSerialActive}
                  onchange={(event) => void handleCatalogEntryChange(Number((event.currentTarget as HTMLSelectElement).value))}
                  value={String(selectedEntryIndex)}
                >
                  {#each catalogEntries as entry, index (`${entry.url}-${index}`)}
                    <option value={String(index)}>{entryLabel(entry)}</option>
                  {/each}
                </select>
              </label>
              {#if selectedCatalogEntry}
                <p class="firmware-prose firmware-prose--small">{entryDetail(selectedCatalogEntry)}</p>
              {/if}
            {:else}
              <p class="firmware-prose">
                {catalogEntryPhase === "loading"
                  ? "Loading official APJ entries for the current target…"
                  : "No official APJ entry is selected yet."}
              </p>
            {/if}
          </Panel>
        </Panel>

        <Panel padded tone={usingLocalSource ? "warning" : "neutral"} testId={firmwareWorkspaceTestIds.sourceLocal}>
          <div class="firmware-row firmware-row--between">
            <div>
              <p class="firmware-eyebrow">Advanced source</p>
              <h4 class="firmware-subtitle">Local APJ</h4>
            </div>
            {#if usingLocalSource}
              <Button size="sm" onclick={handleUseCatalogSource}>Use catalog instead</Button>
            {/if}
          </div>

          <p class="firmware-prose">
            Supply a local APJ only when you deliberately need to override the catalog. The workspace keeps that choice visible instead of silently pretending it came from the official feed.
          </p>

          <Button
            tone="warning"
            testId={firmwareWorkspaceTestIds.sourceBrowse}
            disabled={isSerialActive}
            onclick={() => void handleChooseLocalApj()}
          >
            Choose local APJ
          </Button>

          <div class="firmware-info-block">
            <span class="firmware-info-block__title">Selected source</span>
            <p class="firmware-info-block__value">{selectedSourceState}</p>
          </div>

          {#if workspaceState.serial.sourceError}
            <div class="firmware-stack" data-testid={firmwareWorkspaceTestIds.sourceError}>
              <Banner severity="danger" title={workspaceState.serial.sourceError} />
            </div>
          {/if}

          <label class="firmware-checkbox">
            <input
              checked={workspaceState.serial.fullChipErase}
              data-testid={firmwareWorkspaceTestIds.fullChipErase}
              disabled={isSerialActive}
              onchange={(event) => void store.setSerialFullChipErase((event.currentTarget as HTMLInputElement).checked)}
              type="checkbox"
            />
            <span>
              <span class="firmware-checkbox__title">Full-chip erase</span><br />
              Use this only when you intentionally need to clear the full external flash area instead of performing a normal update.
            </span>
          </label>

          {#if workspaceState.serial.preflight?.has_params_to_backup}
            <div class="firmware-stack" data-testid={firmwareWorkspaceTestIds.paramBackup}>
              <Banner
                severity="warning"
                title="Parameter backup recommended"
                message={`Flashing will break the current vehicle session. ${workspaceState.serial.preflight.param_count} parameter${workspaceState.serial.preflight.param_count === 1 ? " is" : "s are"} currently available to back up before install.`}
                messageTestId={firmwareWorkspaceTestIds.paramBackupState}
              />
            </div>
          {:else if workspaceState.serial.preflightPhase === "ready"}
            <p
              class="firmware-info-block firmware-info-block--standalone"
              data-testid={firmwareWorkspaceTestIds.paramBackupState}
            >
              No backed-up parameter set is currently reported for this controller, so install proceeds without a preflight backup reminder.
            </p>
          {/if}
        </Panel>
      </div>

      <Panel padded testId={firmwareWorkspaceTestIds.serialReadiness}>
        <div class="firmware-row firmware-row--between">
          <div>
            <p class="firmware-eyebrow">Readiness</p>
            <h4 class="firmware-subtitle">Bootloader and start gating</h4>
          </div>
          <span class="firmware-tag" data-testid={firmwareWorkspaceTestIds.serialReadinessState}>
            {workspaceState.serial.readiness.phase}
          </span>
        </div>

        <p class="firmware-prose" data-testid={firmwareWorkspaceTestIds.serialBootloaderTransition}>
          {bootloaderTransitionCopy()}
        </p>

        {#if workspaceState.serial.readiness.response?.validation_pending}
          <p class="firmware-prose firmware-prose--small" data-testid={firmwareWorkspaceTestIds.serialValidationPending}>
            Firmware compatibility will be validated after bootloader sync before erase/program begins.
          </p>
        {/if}

        <div class="firmware-info-block firmware-info-block--standalone">
          <p data-testid={firmwareWorkspaceTestIds.serialBlockedReason}>{readinessDetail}</p>
        </div>

        {#if isSerialActive}
          <div class="firmware-active">
            <p class="firmware-active__title">Serial install in progress</p>
            <p class="firmware-active__detail">{workspaceState.progress?.phase_label ?? workspaceState.sessionPhase ?? "working"}</p>
            {#if workspaceState.progress}
              <div class="firmware-progress" data-testid={firmwareWorkspaceTestIds.serialProgress}>
                <div class="firmware-progress__fill" style={`width: ${Math.max(0, Math.min(100, workspaceState.progress.pct))}%`}></div>
              </div>
              <p class="firmware-progress__caption">
                {workspaceState.progress.bytes_written} / {workspaceState.progress.bytes_total} bytes · {Math.round(workspaceState.progress.pct)}%
              </p>
            {/if}
          </div>
        {/if}

        <div class="firmware-actions">
          {#if isSerialActive && !isSerialCancelling}
            <Button
              tone="warning"
              testId={firmwareWorkspaceTestIds.cancelSerial}
              onclick={() => void store.cancel()}
            >
              Cancel install
            </Button>
          {/if}

          <Button
            tone="accent"
            testId={firmwareWorkspaceTestIds.startSerial}
            disabled={!canStartSerial || isSerialActive || isSerialCancelling || replayReadonly}
            onclick={() => void store.startSerial()}
          >
            Start install
          </Button>
        </div>
      </Panel>
    </Panel>
  </div>
</Panel>

<style>
.firmware-grid-main {
  display: grid;
  gap: var(--space-3);
  margin-top: var(--space-3);
}
@media (min-width: 1280px) {
  .firmware-grid-main {
    grid-template-columns: minmax(0, 1.2fr) minmax(18rem, 0.8fr);
  }
}
.firmware-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
}
.firmware-row--between {
  justify-content: space-between;
  align-items: flex-start;
}
.firmware-field {
  display: flex;
  flex-direction: column;
}
.firmware-field--grow {
  flex: 1;
  min-width: 13rem;
}
.firmware-field--baud {
  width: 100%;
}
@media (min-width: 640px) {
  .firmware-field--baud {
    width: 10rem;
  }
}
.firmware-field--block {
  display: block;
  margin-top: var(--space-3);
}
.firmware-field__label {
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}
.firmware-select,
.firmware-input {
  margin-top: var(--space-2);
  width: 100%;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-bg-input);
  padding: 8px 12px;
  font-size: 0.86rem;
  color: var(--color-text-primary);
}
.firmware-stack {
  margin-top: var(--space-3);
}
.firmware-grid-sources {
  display: grid;
  gap: var(--space-3);
  margin-top: var(--space-4);
}
@media (min-width: 1280px) {
  .firmware-grid-sources {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
.firmware-eyebrow {
  margin: 0;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}
.firmware-subtitle {
  margin: 4px 0 0;
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--color-text-primary);
}
.firmware-prose {
  margin: var(--space-2) 0 0;
  font-size: 0.88rem;
  line-height: 1.5;
  color: var(--color-text-secondary);
}
.firmware-prose--tight {
  margin-top: var(--space-1);
}
.firmware-prose--small {
  margin-top: var(--space-2);
  font-size: 0.78rem;
}
.firmware-info-block {
  margin-top: var(--space-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-bg-input);
  padding: 8px 12px;
  font-size: 0.78rem;
  color: var(--color-text-secondary);
}
.firmware-info-block--standalone {
  margin-top: var(--space-3);
  font-size: 0.86rem;
}
.firmware-info-block__title {
  font-weight: 600;
  color: var(--color-text-primary);
}
.firmware-info-block__value {
  margin: var(--space-1) 0 0;
}
.firmware-grid-filters {
  display: grid;
  gap: var(--space-2);
  margin-top: var(--space-3);
}
@media (min-width: 768px) {
  .firmware-grid-filters {
    grid-template-columns: minmax(0, 1fr) 14rem;
  }
}
.firmware-target-grid {
  display: grid;
  gap: var(--space-2);
  margin-top: var(--space-3);
  max-height: 18rem;
  overflow-y: auto;
  padding-right: 4px;
}
.firmware-target-card {
  display: block;
  text-align: left;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
  padding: 12px;
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}
.firmware-target-card:hover {
  background: var(--color-bg-primary);
  border-color: var(--color-border-light);
}
.firmware-target-card[data-selected] {
  border-color: color-mix(in srgb, var(--color-accent) 45%, transparent);
  background: color-mix(in srgb, var(--color-accent) 10%, transparent);
}
.firmware-target-card__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}
.firmware-target-card__name {
  font-weight: 600;
  color: var(--color-text-primary);
  font-size: 0.88rem;
}
.firmware-target-card__platform {
  font-size: 0.72rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}
.firmware-target-card__meta {
  margin: 4px 0 0;
  font-size: 0.78rem;
  color: var(--color-text-secondary);
}
.firmware-target-card__vehicles {
  margin: 4px 0 0;
  font-size: 0.78rem;
  color: var(--color-text-muted);
}
.firmware-tag {
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}
.firmware-checkbox {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  margin-top: var(--space-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-bg-input);
  padding: 12px;
  font-size: 0.86rem;
  color: var(--color-text-secondary);
}
.firmware-checkbox input {
  margin-top: 4px;
}
.firmware-checkbox__title {
  font-weight: 600;
  color: var(--color-text-primary);
}
.firmware-active {
  margin-top: var(--space-3);
  border-radius: var(--radius-md);
  border: 1px solid color-mix(in srgb, var(--color-accent) 35%, transparent);
  background: color-mix(in srgb, var(--color-accent) 10%, transparent);
  padding: 12px;
  font-size: 0.86rem;
  color: var(--color-text-primary);
}
.firmware-active__title {
  margin: 0;
  font-weight: 600;
}
.firmware-active__detail {
  margin: 4px 0 0;
}
.firmware-progress {
  margin-top: var(--space-3);
  height: 8px;
  border-radius: 999px;
  background: var(--color-bg-primary);
  overflow: hidden;
}
.firmware-progress__fill {
  height: 100%;
  border-radius: 999px;
  background: var(--color-accent);
  transition: width 0.2s ease;
}
.firmware-progress__caption {
  margin: var(--space-2) 0 0;
  font-size: 0.72rem;
  color: var(--color-text-secondary);
}
.firmware-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin-top: var(--space-4);
}
</style>

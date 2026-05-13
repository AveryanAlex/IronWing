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

const fieldLabelClass = "text-xs font-semibold uppercase tracking-wide text-text-muted";
const selectInputClass = "mt-2 w-full rounded-md border border-border bg-bg-input px-3 py-2 text-sm text-text-primary";
const proseClass = "mt-2 text-sm leading-6 text-text-secondary";
const tightProseClass = "mt-1 text-sm leading-6 text-text-secondary";
const smallProseClass = "mt-2 text-xs leading-5 text-text-secondary";
const infoBlockClass = "mt-3 rounded-md border border-border bg-bg-input px-3 py-2 text-xs text-text-secondary";
const standaloneInfoBlockClass = "mt-3 rounded-md border border-border bg-bg-input px-3 py-2 text-sm text-text-secondary";
const eyebrowClass = "m-0 text-xs font-semibold uppercase tracking-wide text-text-muted";
const subtitleClass = "m-0 mt-1 text-sm font-semibold text-text-primary";
const tagClass = "text-xs font-semibold uppercase tracking-wide text-text-muted";
const checkboxClass = "mt-3 flex items-start gap-3 rounded-md border border-border bg-bg-input p-3 text-sm text-text-secondary";

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

  <div class="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
    <Panel padded>
      <div class="flex flex-wrap items-center gap-3">
        <label class="flex min-w-[13rem] flex-1 flex-col">
          <span class={fieldLabelClass}>Serial port</span>
          <select
            class={selectInputClass}
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

        <label class="flex w-full flex-col sm:w-40">
          <span class={fieldLabelClass}>Baud</span>
          <select
            class={selectInputClass}
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
        <div class="mt-3">
          <Banner severity="danger" title={workspaceState.serial.preflightError} />
        </div>
      {/if}

      <div class="mt-4 grid gap-3 xl:grid-cols-2">
        <Panel padded tone={usingCatalogSource ? "info" : "neutral"} testId={firmwareWorkspaceTestIds.sourceCatalog}>
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p class={eyebrowClass}>Official catalog</p>
              <h4 class={subtitleClass}>Recommended source</h4>
            </div>
            {#if !usingCatalogSource}
              <Button size="sm" tone="accent" onclick={handleUseCatalogSource}>Use catalog</Button>
            {/if}
          </div>

          <p class={proseClass}>
            Use official APJ releases for the selected target first. Manual APJ files stay available below as an advanced override.
          </p>

          <div class={infoBlockClass}>
            <span class="font-semibold text-text-primary">Target proof</span>
            <p class="m-0 mt-1" data-testid={firmwareWorkspaceTestIds.selectedTargetState}>{selectedTargetState}</p>
          </div>

          {#if !manualTargetRequired}
            <div class="mt-3">
              <Banner severity="success" title={targetProofMessage} />
            </div>
          {/if}

          <div class={infoBlockClass}>
            <span class="font-semibold text-text-primary">Catalog source</span>
            <p class="m-0 mt-1" data-testid={firmwareWorkspaceTestIds.selectedSourceState}>{selectedSourceState}</p>
          </div>

          <Panel padded>
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p class={eyebrowClass}>Manual target override</p>
                <p class={tightProseClass}>Search targets when board proof is missing or uncertain.</p>
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
              <div class="mt-3">
                <Banner
                  severity="warning"
                  title={targetProofMessage}
                  testId={firmwareWorkspaceTestIds.manualTargetRequired}
                />
              </div>
            {/if}

            {#if manualSectionOpen}
              <div class="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_14rem]">
                <label class="flex flex-col">
                  <span class={fieldLabelClass}>Search target</span>
                  <input
                    class={selectInputClass}
                    data-testid={firmwareWorkspaceTestIds.manualTargetSearch}
                    oninput={(event) => (targetSearch = (event.currentTarget as HTMLInputElement).value)}
                    placeholder="Cube, Matek, board ID…"
                    type="search"
                    value={targetSearch}
                  />
                </label>

                <label class="flex flex-col">
                  <span class={fieldLabelClass}>Vehicle type</span>
                  <select
                    class={selectInputClass}
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
                <div class="mt-3" data-testid={firmwareWorkspaceTestIds.targetListError}>
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
                <p class={proseClass}>Loading official targets…</p>
              {:else if filteredTargets.length > 0}
                <div
                  class="mt-3 grid max-h-72 gap-2 overflow-y-auto pr-1"
                  data-testid={firmwareWorkspaceTestIds.manualTargetResults}
                >
                  {#each filteredTargets as match (match.key)}
                    <button
                      aria-pressed={selectedTargetKey === match.key}
                      class="block rounded-md border border-border bg-bg-secondary p-3 text-left transition-colors hover:border-border-light hover:bg-bg-primary data-[selected]:border-accent/45 data-[selected]:bg-accent/10"
                      data-selected={selectedTargetKey === match.key || undefined}
                      onclick={() => void handleSelectManualTarget(match.target)}
                      type="button"
                    >
                      <div class="flex flex-wrap items-center justify-between gap-2">
                        <span class="text-sm font-semibold text-text-primary">{match.label}</span>
                        <span class="text-xs uppercase tracking-wide text-text-muted">{match.target.platform}</span>
                      </div>
                      <p class="m-0 mt-1 text-xs text-text-secondary">{match.metadata.join(" · ")}</p>
                      <p class="m-0 mt-1 text-xs text-text-muted">{match.vehicleTypesLabel}</p>
                    </button>
                  {/each}
                </div>
              {:else if catalogTargets.length === 0}
                <p
                  class={standaloneInfoBlockClass}
                  data-testid={firmwareWorkspaceTestIds.manualTargetEmpty}
                >
                  No catalog targets are available right now. Retry the list or keep browsing with a local APJ.
                </p>
              {:else}
                <p
                  class={standaloneInfoBlockClass}
                  data-testid={firmwareWorkspaceTestIds.manualTargetNoMatches}
                >
                  No targets match the current search or vehicle filter.
                </p>
              {/if}

              {#if manualSelectionActive && workspaceState.serial.target}
                <div class="mt-3" data-testid={firmwareWorkspaceTestIds.manualTargetSelected}>
                  <Banner
                    severity="info"
                    title={`Manual target selected · ${targetLabel(workspaceState.serial.target)} · ${targetMeta(workspaceState.serial.target)}`}
                  />
                </div>
              {/if}

              {#if manualSelectionActive && !selectedTargetVisible}
                <div class="mt-3" data-testid={firmwareWorkspaceTestIds.manualTargetHidden}>
                  <Banner
                    severity="warning"
                    title="The selected manual target is hidden by the current filter. Clear the filter or reselect a visible target before flashing."
                  />
                </div>
              {/if}
            {/if}
          </Panel>

          <Panel padded>
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p class={eyebrowClass}>Official APJ entry</p>
                <p class={tightProseClass}>Keep the proven catalog entry selected unless you explicitly need a different release.</p>
              </div>
              <span class={tagClass} data-testid={firmwareWorkspaceTestIds.catalogEntryState}>
                {catalogEntryPhase}
              </span>
            </div>

            {#if catalogEntryError}
              <div class="mt-3" data-testid={firmwareWorkspaceTestIds.catalogEntryError}>
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
              <label class="mt-3 block">
                <span class={fieldLabelClass}>Selected release</span>
                <select
                  class={selectInputClass}
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
                <p class={smallProseClass}>{entryDetail(selectedCatalogEntry)}</p>
              {/if}
            {:else}
              <p class={proseClass}>
                {catalogEntryPhase === "loading"
                  ? "Loading official APJ entries for the current target…"
                  : "No official APJ entry is selected yet."}
              </p>
            {/if}
          </Panel>
        </Panel>

        <Panel padded tone={usingLocalSource ? "warning" : "neutral"} testId={firmwareWorkspaceTestIds.sourceLocal}>
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p class={eyebrowClass}>Advanced source</p>
              <h4 class={subtitleClass}>Local APJ</h4>
            </div>
            {#if usingLocalSource}
              <Button size="sm" onclick={handleUseCatalogSource}>Use catalog instead</Button>
            {/if}
          </div>

          <p class={proseClass}>
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

          <div class={infoBlockClass}>
            <span class="font-semibold text-text-primary">Selected source</span>
            <p class="m-0 mt-1">{selectedSourceState}</p>
          </div>

          {#if workspaceState.serial.sourceError}
            <div class="mt-3" data-testid={firmwareWorkspaceTestIds.sourceError}>
              <Banner severity="danger" title={workspaceState.serial.sourceError} />
            </div>
          {/if}

          <label class={checkboxClass}>
            <input
              class="mt-1"
              checked={workspaceState.serial.fullChipErase}
              data-testid={firmwareWorkspaceTestIds.fullChipErase}
              disabled={isSerialActive}
              onchange={(event) => void store.setSerialFullChipErase((event.currentTarget as HTMLInputElement).checked)}
              type="checkbox"
            />
            <span>
              <span class="font-semibold text-text-primary">Full-chip erase</span><br />
              Use this only when you intentionally need to clear the full external flash area instead of performing a normal update.
            </span>
          </label>

          {#if workspaceState.serial.preflight?.has_params_to_backup}
            <div class="mt-3" data-testid={firmwareWorkspaceTestIds.paramBackup}>
              <Banner
                severity="warning"
                title="Parameter backup recommended"
                message={`Flashing will break the current vehicle session. ${workspaceState.serial.preflight.param_count} parameter${workspaceState.serial.preflight.param_count === 1 ? " is" : "s are"} currently available to back up before install.`}
                messageTestId={firmwareWorkspaceTestIds.paramBackupState}
              />
            </div>
          {:else if workspaceState.serial.preflightPhase === "ready"}
            <p
              class={standaloneInfoBlockClass}
              data-testid={firmwareWorkspaceTestIds.paramBackupState}
            >
              No backed-up parameter set is currently reported for this controller, so install proceeds without a preflight backup reminder.
            </p>
          {/if}
        </Panel>
      </div>

      <Panel padded testId={firmwareWorkspaceTestIds.serialReadiness}>
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class={eyebrowClass}>Readiness</p>
            <h4 class={subtitleClass}>Bootloader and start gating</h4>
          </div>
          <span class={tagClass} data-testid={firmwareWorkspaceTestIds.serialReadinessState}>
            {workspaceState.serial.readiness.phase}
          </span>
        </div>

        <p class={proseClass} data-testid={firmwareWorkspaceTestIds.serialBootloaderTransition}>
          {bootloaderTransitionCopy()}
        </p>

        {#if workspaceState.serial.readiness.response?.validation_pending}
          <p class={smallProseClass} data-testid={firmwareWorkspaceTestIds.serialValidationPending}>
            Firmware compatibility will be validated after bootloader sync before erase/program begins.
          </p>
        {/if}

        <div class={standaloneInfoBlockClass}>
          <p data-testid={firmwareWorkspaceTestIds.serialBlockedReason}>{readinessDetail}</p>
        </div>

        {#if isSerialActive}
          <div class="mt-3 rounded-md border border-accent/35 bg-accent/10 p-3 text-sm text-text-primary">
            <p class="m-0 font-semibold">Serial install in progress</p>
            <p class="m-0 mt-1">{workspaceState.progress?.phase_label ?? workspaceState.sessionPhase ?? "working"}</p>
            {#if workspaceState.progress}
              <div class="mt-3 h-2 overflow-hidden rounded-full bg-bg-primary" data-testid={firmwareWorkspaceTestIds.serialProgress}>
                <div class="h-full rounded-full bg-accent transition-[width] duration-200 ease-in-out" style={`width: ${Math.max(0, Math.min(100, workspaceState.progress.pct))}%`}></div>
              </div>
              <p class="m-0 mt-2 text-xs text-text-secondary">
                {workspaceState.progress.bytes_written} / {workspaceState.progress.bytes_total} bytes · {Math.round(workspaceState.progress.pct)}%
              </p>
            {/if}
          </div>
        {/if}

        <div class="mt-4 flex flex-wrap gap-3">
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

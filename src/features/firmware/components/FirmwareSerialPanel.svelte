<script lang="ts">
import { onMount } from "svelte";

import type {
  CatalogEntry,
  CatalogTargetSummary,
  FirmwareInstallReadinessBlockedReason,
} from "../../../firmware";
import type { FirmwareFileIo } from "../../../lib/firmware-file-io";
import type { FirmwareService } from "../../../lib/platform/firmware";
import type { SerialPortInventoryStore } from "../../../lib/stores/serial-port-inventory";
import type { SessionStore } from "../../../lib/stores/session";
import {
  createCatalogSourceMetadata,
  createLocalFileSourceMetadata,
  type FirmwareWorkspaceStore,
} from "../../../lib/stores/firmware-workspace";
import type { SessionEnvelope, SourceKind } from "../../../session";
import {
  catalogTargetKey,
  filterCatalogTargets,
  sanitizeCatalogTargetSummaries,
} from "../firmware-target-filter";
import type { FirmwareWorkspaceLayout } from "../firmware-workspace-layout";
import { firmwareWorkspaceTestIds } from "../firmware-workspace-test-ids";
import FirmwareChecklist from "./FirmwareChecklist.svelte";
import {
  buildFirmwareInstallReviewChecklist,
  installBootloaderStatusDetail,
  installBootloaderStatusLabel,
  installBootloaderStatusTone,
  resolveFirmwareInstallStepStates,
} from "../firmware-install-flow";
import { Banner, Button, Checkbox, EmptyState, Eyebrow, HelperText, InfoBlock, Input, NativeSelect, Panel, Progress, SelectableCard, StatusPill } from "../../../components/ui";

const BAUD_RATES = [115200, 57600, 230400, 460800, 921600];

type CatalogLoadPhase = "idle" | "loading" | "ready" | "failed";
type InstallSourceMode = "catalog" | "local";
type SemverKey = {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
};
type TargetProofState =
  | "loading"
  | "missing"
  | "ambiguous"
  | "target_list_failed"
  | "entry_loading"
  | "entry_failed"
  | "entry_missing"
  | "detected";
type FirmwareQuickConnectSessionStore = Pick<SessionStore, "connect" | "updateConnectionForm">;
type FirmwareSerialSessionView = {
  activeSource: SourceKind | null;
  activeEnvelope: SessionEnvelope | null;
  connected: boolean;
  isConnecting: boolean;
};

type Props = {
  store: FirmwareWorkspaceStore;
  service: FirmwareService;
  fileIo: FirmwareFileIo;
  layout: FirmwareWorkspaceLayout;
  replayReadonly: boolean;
  serialInventory: SerialPortInventoryStore;
  sessionStore?: FirmwareQuickConnectSessionStore | null;
  sessionView?: FirmwareSerialSessionView;
};

const disconnectedSessionView: FirmwareSerialSessionView = {
  activeSource: null,
  activeEnvelope: null,
  connected: false,
  isConnecting: false,
};

let {
  store,
  service,
  fileIo,
  layout,
  replayReadonly,
  serialInventory,
  sessionStore = null,
  sessionView = disconnectedSessionView,
}: Props = $props();

let workspaceState = $derived($store);
let serialInventoryState = $derived($serialInventory);
let isSerialActive = $derived(workspaceState.activePath === "firmware_install_update");
let isSerialCancelling = $derived(
  workspaceState.sessionStatus.kind === "cancelling" && workspaceState.sessionStatus.path === "firmware_install_update",
);
let bootloaderStatusKind = $derived(workspaceState.serial.readiness.response?.bootloader_status?.kind ?? "unknown");

let catalogTargets = $state<CatalogTargetSummary[]>([]);
let targetListPhase = $state<CatalogLoadPhase>("idle");
let targetListError = $state<string | null>(null);
let catalogEntries = $state<CatalogEntry[]>([]);
let catalogEntryPhase = $state<CatalogLoadPhase>("idle");
let catalogEntryError = $state<string | null>(null);
let selectedCatalogVehicleType = $state("");
let selectedCatalogEntryUrl = $state("");
let selectedSourceMode = $state<InstallSourceMode>("catalog");
let manualSelectionCommitted = $state(false);
let targetSearch = $state("");

let targetLoadRequest = 0;
let entryLoadRequest = 0;
let currentEntryTargetKey = "";
let lastObservedPort = $state("");
let portObservationInitialized = $state(false);
let lastReadinessInventoryRefreshAt = $state<number | null>(null);
let lastObservedMavlinkState = $state("");
let mavlinkObservationInitialized = $state(false);
let mavlinkQuickConnectPhase = $state<"idle" | "connecting" | "failed">("idle");
let mavlinkQuickConnectError = $state<string | null>(null);

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

function firmwareVersionLabel(entry: CatalogEntry): string {
  const suffix = entry.latest ? "latest" : entry.version_type;
  return `${entry.version} · ${suffix}`;
}

function entryDetail(entry: CatalogEntry): string {
  const details = [
    entry.brand_name ?? entry.platform,
    entry.manufacturer,
    `${Math.round(entry.image_size / 1024)} KiB`,
  ].filter((value): value is string => Boolean(value));

  return details.join(" · ");
}

function parseSemver(value: string): SemverKey | null {
  const match = value.trim().match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  if (!match) {
    return null;
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2] ?? 0),
    patch: Number(match[3] ?? 0),
    prerelease: match[4]?.split(".").filter((part) => part.length > 0) ?? [],
  };
}

function comparePrereleaseDescending(left: string[], right: string[]): number {
  if (left.length === 0 && right.length > 0) {
    return -1;
  }

  if (left.length > 0 && right.length === 0) {
    return 1;
  }

  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const leftPart = left[index];
    const rightPart = right[index];
    if (leftPart === undefined) {
      return 1;
    }
    if (rightPart === undefined) {
      return -1;
    }

    const leftNumber = /^\d+$/.test(leftPart) ? Number(leftPart) : null;
    const rightNumber = /^\d+$/.test(rightPart) ? Number(rightPart) : null;
    if (leftNumber !== null && rightNumber !== null && leftNumber !== rightNumber) {
      return rightNumber - leftNumber;
    }
    if (leftNumber !== null && rightNumber === null) {
      return 1;
    }
    if (leftNumber === null && rightNumber !== null) {
      return -1;
    }

    const textComparison = rightPart.localeCompare(leftPart, undefined, { numeric: true, sensitivity: "base" });
    if (textComparison !== 0) {
      return textComparison;
    }
  }

  return 0;
}

function compareSemverDescending(left: string, right: string): number {
  const leftSemver = parseSemver(left);
  const rightSemver = parseSemver(right);

  if (leftSemver && !rightSemver) {
    return -1;
  }
  if (!leftSemver && rightSemver) {
    return 1;
  }
  if (!leftSemver || !rightSemver) {
    return right.localeCompare(left, undefined, { numeric: true, sensitivity: "base" });
  }

  const majorComparison = rightSemver.major - leftSemver.major;
  if (majorComparison !== 0) {
    return majorComparison;
  }

  const minorComparison = rightSemver.minor - leftSemver.minor;
  if (minorComparison !== 0) {
    return minorComparison;
  }

  const patchComparison = rightSemver.patch - leftSemver.patch;
  if (patchComparison !== 0) {
    return patchComparison;
  }

  return comparePrereleaseDescending(leftSemver.prerelease, rightSemver.prerelease);
}

function compareCatalogEntriesByVersionDescending(left: CatalogEntry, right: CatalogEntry): number {
  return compareSemverDescending(left.version, right.version);
}

function listCatalogEntryVehicleTypes(entries: readonly CatalogEntry[]): string[] {
  const seen = new Map<string, string>();
  for (const entry of entries) {
    const vehicleType = entry.vehicle_type.trim();
    if (vehicleType.length === 0) {
      continue;
    }

    const key = vehicleType.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, vehicleType);
    }
  }

  return Array.from(seen.values()).sort((left, right) => left.localeCompare(right));
}

function catalogEntriesForVehicleType(entries: readonly CatalogEntry[], vehicleType: string): CatalogEntry[] {
  const normalizedVehicleType = vehicleType.trim().toLowerCase();
  if (normalizedVehicleType.length === 0) {
    return [];
  }

  return entries
    .filter((entry) => entry.vehicle_type.trim().toLowerCase() === normalizedVehicleType)
    .sort(compareCatalogEntriesByVersionDescending);
}

function findCatalogEntryByUrl(entries: readonly CatalogEntry[], url: string): CatalogEntry | null {
  if (url.trim().length === 0) {
    return null;
  }

  return entries.find((entry) => entry.url === url) ?? null;
}

function blockedReasonCopy(reason: FirmwareInstallReadinessBlockedReason | null): string {
  switch (reason) {
    case "session_busy":
      return "Another firmware session is already active.";
    case "port_unselected":
      return "Choose a serial port before flashing.";
    case "port_unavailable":
      return "The selected serial port is no longer available. Refresh ports and keep the intended bootloader port selected.";
    case "source_missing":
      return "Choose a catalog firmware version or load a local APJ before flashing.";
    default:
      return "Firmware install/update is still blocked by the current readiness state.";
  }
}

function bootloaderStatusCopy() {
  switch (bootloaderStatusKind) {
    case "already_in_bootloader":
      return "Selected port appears to be in bootloader mode.";
    case "not_in_bootloader":
      return "A live vehicle is connected on this port. Reboot it to bootloader before starting install.";
    default:
      return "IronWing is not sure whether the selected serial port is already a bootloader.";
  }
}

function unknownBootloaderGuidance() {
  return "Two safe paths: click Autodetect board; if it returns a Board ID, the selected port is the bootloader. Or connect MAVLink to this serial port, then use Reboot to bootloader after the status changes.";
}

async function handleRebootToBootloader() {
  await store.rebootFirmwareInstallToBootloader();
}

function isWebSerialPort(port: string): boolean {
  return port.startsWith("webserial:");
}

function mavlinkStateKey(): string {
  const envelope = sessionView.activeEnvelope;
  const source = sessionView.activeSource ?? "none";
  const linkState = sessionView.connected ? "connected" : "disconnected";
  return `${source}:${linkState}:${envelope?.session_id ?? "none"}:${envelope?.seek_epoch ?? 0}:${envelope?.reset_revision ?? 0}`;
}

async function handleQuickMavlinkConnect() {
  const port = workspaceState.serial.port.trim();
  if (!sessionStore || port.length === 0 || mavlinkQuickConnectDisabled) {
    return;
  }

  mavlinkQuickConnectPhase = "connecting";
  mavlinkQuickConnectError = null;

  try {
    sessionStore.updateConnectionForm(
      isWebSerialPort(port)
        ? { mode: "web_serial", serialPort: "", webSerialPortId: port, baud: workspaceState.serial.baud }
        : { mode: "serial", serialPort: port, webSerialPortId: "", baud: workspaceState.serial.baud },
    );
    await sessionStore.connect();
    await store.requestFirmwareInstallReadiness();
    mavlinkQuickConnectPhase = "idle";
  } catch (error) {
    mavlinkQuickConnectPhase = "failed";
    mavlinkQuickConnectError = service.formatError(error);
  }
}

async function handleAutodetectBoard() {
  if (!canAutodetectBoard) {
    return;
  }

  await store.detectFirmwareInstallBootloaderBoard();
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
    return store.setFirmwareInstallSource({ kind: "catalog_url", url: "" }, null);
  }

  return store.setFirmwareInstallSource(
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
    selectedCatalogVehicleType = "";
    selectedCatalogEntryUrl = "";
    currentEntryTargetKey = targetKey;

    if (workspaceState.serial.source.kind === "catalog_url") {
      await store.setFirmwareInstallSource({ kind: "catalog_url", url: "" }, null);
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

    const currentCatalogUrl = workspaceState.serial.source.kind === "catalog_url" ? workspaceState.serial.source.url : "";
    const preservedEntry = findCatalogEntryByUrl(nextEntries, currentCatalogUrl);

    if (preservedEntry) {
      selectedCatalogVehicleType = preservedEntry.vehicle_type;
      selectedCatalogEntryUrl = preservedEntry.url;
    } else {
      selectedCatalogVehicleType = "";
      selectedCatalogEntryUrl = "";

      if (workspaceState.serial.source.kind === "catalog_url") {
        await store.setFirmwareInstallSource({ kind: "catalog_url", url: "" }, null);
      }
    }

    if (sourceKind === "detected") {
      await store.setFirmwareInstallTarget(target);
    }
  } catch (error) {
    if (requestId !== entryLoadRequest) {
      return;
    }

    catalogEntryPhase = "failed";
    catalogEntryError = service.formatError(error);
    selectedCatalogVehicleType = "";
    selectedCatalogEntryUrl = "";

    if (workspaceState.serial.source.kind === "catalog_url") {
      await store.setFirmwareInstallSource({ kind: "catalog_url", url: "" }, null);
    }
  }
}

async function retryCatalogEntries() {
  const target = workspaceState.serial.target;
  if (!target) {
    return;
  }

  await loadCatalogEntriesForTarget(target, "manual");
}

async function handleSelectManualTarget(target: CatalogTargetSummary) {
  manualSelectionCommitted = true;
  await store.setFirmwareInstallTarget(target);
  await loadCatalogEntriesForTarget(target, "manual");
}

async function handleUseCatalogSource() {
  selectedSourceMode = "catalog";
  await setCatalogSourceFromEntry(selectedCatalogEntry);
}

async function handleCatalogVehicleTypeChange(vehicleType: string) {
  selectedCatalogVehicleType = vehicleType;
  selectedCatalogEntryUrl = "";

  if (workspaceState.serial.source.kind === "catalog_url") {
    await store.setFirmwareInstallSource({ kind: "catalog_url", url: "" }, null);
  }
}

async function handleCatalogEntryChange(url: string) {
  selectedCatalogEntryUrl = url;
  const entry = findCatalogEntryByUrl(catalogEntries, url);

  if (entry && selectedCatalogVehicleType.trim().length === 0) {
    selectedCatalogVehicleType = entry.vehicle_type;
  }

  if (effectiveSourceMode === "catalog") {
    await setCatalogSourceFromEntry(entry);
  }
}

async function handleChooseLocalApj() {
  try {
    const result = await fileIo.pickApjFile();
    if (result.status === "cancelled") {
      return;
    }

    selectedSourceMode = "local";
    await store.setFirmwareInstallSource(
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
    store.setFirmwareInstallSourceError(service.formatError(error));
  }
}

async function handleRemoveLocalApj() {
  await handleUseCatalogSource();
}

async function handleRefreshSerialPorts(refreshPreflight = true) {
  await serialInventory.refresh();
  await selectPreferredFirmwarePortFromInventory();
  if (refreshPreflight) {
    await store.refreshFirmwareInstallPreflight();
    await store.requestFirmwareInstallReadiness();
  }
}

async function handleGrantWebSerialPort() {
  const grantedPort = await serialInventory.grantWebSerialPort();
  if (grantedPort) {
    await store.setFirmwareInstallPort(grantedPort.portName);
    await store.refreshFirmwareInstallPreflight();
  }
}

async function selectPreferredFirmwarePortFromInventory() {
  const ports = serialInventoryState.ports;
  if (ports.length === 0) {
    return;
  }

  const currentPort = workspaceState.serial.port.trim();
  if (currentPort && ports.some((port) => port.portName === currentPort)) {
    return;
  }

  const nextPort = ports[0]?.portName;
  if (nextPort) {
    await store.setFirmwareInstallPort(nextPort);
  }
}

onMount(() => {
  void loadCatalogTargets();
  void handleRefreshSerialPorts(false);
});

let detectedBoardId = $derived(workspaceState.serial.boardDetection.info?.board_id ?? null);
let detectedTargets = $derived.by(() => (
  detectedBoardId === null
    ? []
    : catalogTargets.filter((target) => target.board_id === detectedBoardId)
));
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

  if (workspaceState.serial.target && catalogEntryPhase === "loading" && catalogEntries.length === 0) {
    return "entry_loading";
  }

  if (workspaceState.serial.target && catalogEntryPhase === "failed" && catalogEntries.length === 0) {
    return "entry_failed";
  }

  if (workspaceState.serial.target && catalogEntryPhase === "ready" && catalogEntries.length === 0) {
    return "entry_missing";
  }

  return "detected";
});
let manualTargetRequired = $derived(workspaceState.serial.target === null);
let manualSelectionActive = $derived(workspaceState.serial.target !== null);
let filteredTargets = $derived(filterCatalogTargets(catalogTargets, {
  searchText: targetSearch,
}).filter((match) => detectedBoardId === null || match.target.board_id === detectedBoardId));
let selectedTargetKey = $derived(workspaceState.serial.target ? catalogTargetKey(workspaceState.serial.target) : null);
let selectedTargetVisible = $derived(
  !selectedTargetKey
  || filteredTargets.some((match) => match.key === selectedTargetKey)
);
let catalogVehicleTypes = $derived(listCatalogEntryVehicleTypes(catalogEntries));
let catalogEntriesForSelectedVehicleType = $derived(
  catalogEntriesForVehicleType(catalogEntries, selectedCatalogVehicleType),
);
let selectedCatalogEntry = $derived(findCatalogEntryByUrl(catalogEntriesForSelectedVehicleType, selectedCatalogEntryUrl));
let usingCatalogSource = $derived(workspaceState.serial.source.kind === "catalog_url");
let usingLocalSource = $derived(workspaceState.serial.source.kind === "local_apj_bytes");
let effectiveSourceMode = $derived(usingLocalSource ? "local" : selectedSourceMode);
let catalogTargetChosen = $derived(effectiveSourceMode !== "catalog" || workspaceState.serial.target !== null);
let catalogVehicleTypeChosen = $derived(effectiveSourceMode !== "catalog" || selectedCatalogVehicleType.trim().length > 0);
let catalogVersionChosen = $derived(effectiveSourceMode !== "catalog" || selectedCatalogEntry !== null);
let firmwareSerialPorts = $derived(serialInventoryState.ports);
let serialInventoryBusy = $derived(serialInventoryState.phase === "refreshing" || serialInventoryState.phase === "granting");
let showBootloaderGrantPrompt = $derived(
  workspaceState.serial.bootloaderReboot.phase === "requested" && serialInventoryState.canGrantWebSerial,
);
let sourceReady = $derived.by(() => {
  if (effectiveSourceMode === "catalog") {
    return workspaceState.serial.source.kind === "catalog_url"
      && selectedCatalogEntry !== null
      && workspaceState.serial.source.url === selectedCatalogEntry.url;
  }

  return workspaceState.serial.source.kind === "local_apj_bytes" && workspaceState.serial.source.data.length > 0;
});
let quickMavlinkConnectDisabledReason = $derived.by(() => {
  if (!sessionStore) {
    return "MAVLink session controls are not available in this view.";
  }

  if (workspaceState.serial.port.trim().length === 0) {
    return "Choose a serial port first.";
  }

  if (replayReadonly) {
    return "Replay is read-only.";
  }

  if (isSerialActive) {
    return "Firmware install is already active.";
  }

  if (sessionView.isConnecting || mavlinkQuickConnectPhase === "connecting") {
    return "MAVLink connection is already starting.";
  }

  if (sessionView.connected) {
    return "A MAVLink link is already connected. Disconnect it first if it is not this serial port.";
  }

  return null;
});
let mavlinkQuickConnectDisabled = $derived(quickMavlinkConnectDisabledReason !== null);
let bootloaderBlocksStart = $derived(workspaceState.serial.readiness.response?.bootloader_status?.kind === "not_in_bootloader");
let autodetectDisabledReason = $derived.by(() => {
  if (workspaceState.serial.port.trim().length === 0) {
    return "Choose a serial port first.";
  }

  if (bootloaderBlocksStart) {
    return "Autodetect is disabled because this port is currently the active MAVLink link. Use Reboot to bootloader first, then autodetect the bootloader port.";
  }

  if (isSerialActive) {
    return "Firmware install is already active.";
  }

  return null;
});
let canAutodetectBoard = $derived(
  autodetectDisabledReason === null && workspaceState.serial.boardDetection.phase !== "detecting",
);
let canStartSerial = $derived(
  layout.actionsEnabled
  && !isSerialActive
  && workspaceState.serial.readiness.phase === "ready"
  && sourceReady
  && catalogTargetChosen
  && catalogVehicleTypeChosen
  && catalogVersionChosen
  && !bootloaderBlocksStart
  && (effectiveSourceMode !== "catalog" || selectedTargetVisible),
);
let selectedTargetState = $derived.by(() => {
  if (manualSelectionActive && workspaceState.serial.target) {
    return `selected · ${targetLabel(workspaceState.serial.target)} · ${targetMeta(workspaceState.serial.target)}`;
  }

  if (detectedBoardId !== null) {
    return detectedTargets.length > 1
      ? `unproven · detected Board ID ${detectedBoardId} matches multiple catalog targets`
      : `unproven · detected Board ID ${detectedBoardId} is missing a usable catalog target`;
  }

  return "manual choice required";
});
let selectedSourceState = $derived.by(() => {
  const metadata = workspaceState.serial.sourceMetadata;
  if (!metadata) {
    if (effectiveSourceMode === "local") {
      return "local-apj · no file loaded";
    }

    if (!catalogTargetChosen) {
      return "catalog · choose a board";
    }

    if (!catalogVehicleTypeChosen) {
      return "catalog · choose a vehicle type";
    }

    return "catalog · choose a firmware version";
  }

  const detail = metadata.detail ? ` · ${metadata.detail}` : "";
  return `${metadata.kind} · ${metadata.label}${detail}`;
});
let targetProofMessage = $derived.by(() => {
  switch (targetProofState) {
    case "loading":
      return "Loading official catalog targets. Manual override stays available while board proof is incomplete.";
    case "missing":
      return bootloaderBlocksStart
        ? "Reboot the selected MAVLink port to bootloader before using Autodetect board. Flashing remains blocked while this port is known not to be in bootloader."
        : "Choose the exact target manually, or click Autodetect board after the selected port is in bootloader mode.";
    case "ambiguous":
      return detectedBoardId === null
        ? "Choose the exact target manually before flashing."
        : `Detected Board ID ${detectedBoardId} filters the catalog to multiple targets. Choose the exact lineage manually before flashing.`;
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
        ? "Choose a catalog target manually before selecting vehicle type and version."
        : `Detected Board ID ${detectedBoardId} is filtering the catalog target list. Select the exact board lineage manually.`;
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

  if (bootloaderBlocksStart) {
    return bootloaderStatusCopy();
  }

  if (effectiveSourceMode === "catalog" && !catalogTargetChosen) {
    return targetProofMessage;
  }

  if (effectiveSourceMode === "catalog" && !selectedTargetVisible) {
    return "The selected board is hidden by the current search. Clear the search or reselect a visible board before flashing.";
  }

  if (effectiveSourceMode === "catalog" && !catalogVehicleTypeChosen) {
    return "Choose a vehicle type for the selected board before flashing from the official catalog.";
  }

  if (effectiveSourceMode === "catalog" && !catalogVersionChosen) {
    return "Choose a firmware version for the selected board and vehicle type before flashing from the official catalog.";
  }

  if (effectiveSourceMode === "local" && !sourceReady) {
    return "Choose a local APJ file before flashing from a custom file.";
  }

  if (workspaceState.serial.readiness.phase === "blocked") {
    return blockedReasonCopy(workspaceState.serial.readiness.response?.readiness.kind === "blocked"
      ? workspaceState.serial.readiness.response.readiness.reason
      : null);
  }

  return "Ready to install over serial once you confirm the selected source and bootloader path.";
});
let bootloaderStatusLabel = $derived(installBootloaderStatusLabel(bootloaderStatusKind));
let bootloaderStatusDetail = $derived(installBootloaderStatusDetail(bootloaderStatusKind));
let bootloaderStatusTone = $derived(installBootloaderStatusTone(bootloaderStatusKind));
let installReviewChecklist = $derived(buildFirmwareInstallReviewChecklist({
  actionsEnabled: layout.actionsEnabled,
  layoutBlockedDetail: layout.blockedDetail,
  replayReadonly,
  portSelected: workspaceState.serial.port.trim().length > 0,
  readinessReady: workspaceState.serial.readiness.phase === "ready",
  readinessChecking: workspaceState.serial.readiness.phase === "checking",
  readinessDetail,
  bootloaderStatusKind,
  sourceMode: effectiveSourceMode,
  sourceReady,
  targetSelected: workspaceState.serial.target !== null,
  targetVisible: selectedTargetVisible,
  vehicleTypeSelected: catalogVehicleTypeChosen,
  versionSelected: catalogVersionChosen,
  paramBackupRecommended: Boolean(workspaceState.serial.preflight?.has_params_to_backup),
  fullChipErase: workspaceState.serial.fullChipErase,
}));
let installStepStates = $derived(resolveFirmwareInstallStepStates({
  portSelected: workspaceState.serial.port.trim().length > 0,
  bootloaderStatusKind,
  sourceMode: effectiveSourceMode,
  sourceReady,
  targetSelected: workspaceState.serial.target !== null,
  vehicleTypeSelected: catalogVehicleTypeChosen,
  versionSelected: catalogVersionChosen,
  readinessReady: workspaceState.serial.readiness.phase === "ready",
}));

const fieldLabelClass = "text-xs font-semibold uppercase tracking-wide text-text-muted";
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
  selectedCatalogVehicleType = "";
  selectedCatalogEntryUrl = "";

  if (workspaceState.serial.target !== null) {
    void store.setFirmwareInstallTarget(null);
  }

  if (workspaceState.serial.source.kind === "catalog_url" && workspaceState.serial.source.url.trim().length > 0) {
    void store.setFirmwareInstallSource({ kind: "catalog_url", url: "" }, null);
  }
});

$effect(() => {
  const refreshedAt = serialInventoryState.phase === "ready" ? serialInventoryState.lastRefreshedAt : null;
  if (refreshedAt === null || refreshedAt === lastReadinessInventoryRefreshAt) {
    return;
  }

  lastReadinessInventoryRefreshAt = refreshedAt;

  if (workspaceState.serial.port.trim().length === 0) {
    return;
  }

  void store.requestFirmwareInstallReadiness();
});

$effect(() => {
  const linkKey = mavlinkStateKey();
  if (!mavlinkObservationInitialized) {
    mavlinkObservationInitialized = true;
    lastObservedMavlinkState = linkKey;
    return;
  }

  if (linkKey === lastObservedMavlinkState) {
    return;
  }

  lastObservedMavlinkState = linkKey;

  if (workspaceState.serial.port.trim().length > 0) {
    void store.requestFirmwareInstallReadiness();
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
</script>

<Panel padded testId={firmwareWorkspaceTestIds.serialPanel}>
  <div class="grid gap-3">
    <Panel padded tone={installStepStates.connection === "complete" ? "success" : "info"}>
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Eyebrow>Step 1</Eyebrow>
          <h4 class={subtitleClass}>Select controller and prepare bootloader</h4>
          <HelperText class="mt-1">Choose the serial port that represents the controller, then make sure that port is the bootloader before flashing.</HelperText>
        </div>
        <StatusPill tone={installStepStates.connection === "complete" ? "success" : "info"}>{installStepStates.connection}</StatusPill>
      </div>

      <div class="mt-3 flex flex-wrap items-center gap-3">
        <label class="flex min-w-[13rem] flex-1 flex-col">
          <span class={fieldLabelClass}>Serial port</span>
          <NativeSelect
            class="mt-2"
            testId={firmwareWorkspaceTestIds.serialPort}
            disabled={isSerialActive}
            onchange={(event) => void store.setFirmwareInstallPort((event.currentTarget as HTMLSelectElement).value)}
            value={workspaceState.serial.port}
          >
            {#if firmwareSerialPorts.length === 0}
              <option value="">No serial ports available</option>
            {/if}
            {#each firmwareSerialPorts as port (port.id)}
              <option value={port.portName}>{port.label}</option>
            {/each}
          </NativeSelect>
        </label>

        <label class="flex w-full flex-col sm:w-40">
          <span class={fieldLabelClass}>Baud</span>
          <NativeSelect
            class="mt-2"
            testId={firmwareWorkspaceTestIds.serialBaud}
            disabled={isSerialActive}
            onchange={(event) => store.setFirmwareInstallBaud(Number((event.currentTarget as HTMLSelectElement).value))}
            value={String(workspaceState.serial.baud)}
          >
            {#each BAUD_RATES as baud (baud)}
              <option value={String(baud)}>{baud}</option>
            {/each}
          </NativeSelect>
        </label>

        <Button
          testId={firmwareWorkspaceTestIds.serialPortRefresh}
          disabled={isSerialActive || serialInventoryBusy}
          onclick={() => void handleRefreshSerialPorts()}
        >
          Refresh ports
        </Button>

        <Button
          disabled={isSerialActive || serialInventoryState.phase === "granting" || !serialInventoryState.canGrantWebSerial}
          onclick={() => void handleGrantWebSerialPort()}
        >
          Grant WebSerial port
        </Button>
      </div>

      {#if serialInventoryState.error}
        <div class="mt-3">
          <Banner severity="warning" title={serialInventoryState.error} />
        </div>
      {/if}

      {#if workspaceState.serial.preflightError}
        <div class="mt-3">
          <Banner severity="danger" title={workspaceState.serial.preflightError} />
        </div>
      {/if}

      <div class="mt-3 rounded-lg border border-border bg-bg-secondary p-3">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Eyebrow>Bootloader status</Eyebrow>
            <h4 class={subtitleClass}>{bootloaderStatusLabel}</h4>
          </div>
          <span class={tagClass} data-testid={firmwareWorkspaceTestIds.serialBootloaderTransition}>{bootloaderStatusKind}</span>
        </div>

        <div class="mt-3">
          <Banner severity={bootloaderStatusTone} title={bootloaderStatusCopy()} message={bootloaderStatusDetail} />
        </div>

        {#if bootloaderStatusKind === "unknown"}
          <HelperText class="mt-3" size="xs">{unknownBootloaderGuidance()}</HelperText>

          <div class="mt-3 flex flex-wrap items-center gap-3">
            <Button
              variant="default"
              disabled={!canAutodetectBoard}
              onclick={() => void handleAutodetectBoard()}
            >
              {workspaceState.serial.boardDetection.phase === "detecting" ? "Checking selected port…" : "Autodetect board"}
            </Button>

            <Button
              variant="outline"
              testId={firmwareWorkspaceTestIds.serialQuickMavlinkConnect}
              disabled={mavlinkQuickConnectDisabled}
              onclick={() => void handleQuickMavlinkConnect()}
            >
              {mavlinkQuickConnectPhase === "connecting" ? "Connecting MAVLink…" : "Connect MAVLink to this port"}
            </Button>

            {#if quickMavlinkConnectDisabledReason && mavlinkQuickConnectPhase !== "connecting"}
              <HelperText size="xs">{quickMavlinkConnectDisabledReason}</HelperText>
            {/if}
          </div>
        {:else if bootloaderStatusKind === "not_in_bootloader"}
          <div class="mt-3 flex flex-wrap items-center gap-3">
            <Button
              variant="default"
              disabled={isSerialActive || workspaceState.serial.bootloaderReboot.phase === "requesting"}
              onclick={() => void handleRebootToBootloader()}
            >
              {workspaceState.serial.bootloaderReboot.phase === "requesting" ? "Requesting reboot…" : "Reboot to bootloader"}
            </Button>
            <Button variant="outline" disabled={!canAutodetectBoard} onclick={() => void handleAutodetectBoard()}>
              Autodetect board
            </Button>
            {#if autodetectDisabledReason}
              <HelperText size="xs">{autodetectDisabledReason}</HelperText>
            {/if}
          </div>
        {/if}

        {#if detectedBoardId !== null}
          <p class="m-0 mt-3 text-xs font-semibold uppercase tracking-wide text-text-muted">Filtering by Board ID {detectedBoardId}</p>
        {/if}

        {#if workspaceState.serial.boardDetection.error}
          <div class="mt-3">
            <Banner severity="warning" title={workspaceState.serial.boardDetection.error} />
          </div>
        {/if}

        {#if mavlinkQuickConnectError}
          <div class="mt-3" data-testid={firmwareWorkspaceTestIds.serialQuickMavlinkError}>
            <Banner severity="warning" title={mavlinkQuickConnectError} />
          </div>
        {/if}

        {#if workspaceState.serial.bootloaderReboot.message}
          <HelperText class="mt-3" size="xs">{workspaceState.serial.bootloaderReboot.message}</HelperText>
        {/if}

        {#if showBootloaderGrantPrompt}
          <div class="mt-3 rounded-lg border border-border bg-surface-card p-3" data-testid={firmwareWorkspaceTestIds.serialBootloaderGrant}>
            <h5 class="m-0 text-sm font-semibold text-text-primary">Select the new bootloader port</h5>
            <HelperText class="mt-1" size="xs">
              The bootloader usually reappears as a new WebSerial device. Re-grant it in the browser chooser so IronWing can select the bootloader port for autodetect/install.
            </HelperText>

            <Button
              class="mt-3"
              variant="outline"
              disabled={isSerialActive || serialInventoryBusy}
              onclick={() => void handleGrantWebSerialPort()}
            >
              {serialInventoryState.phase === "granting" ? "Opening chooser…" : "Grant/select bootloader port"}
            </Button>
          </div>
        {/if}
      </div>
    </Panel>

    <Panel padded tone={installStepStates.firmware === "complete" ? "success" : "info"}>
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Eyebrow>Step 2</Eyebrow>
          <h4 class={subtitleClass}>Choose firmware</h4>
          <HelperText class="mt-1">Official catalog releases are the normal path. Local APJ remains available as a deliberate override.</HelperText>
        </div>
        <StatusPill tone={installStepStates.firmware === "complete" ? "success" : installStepStates.firmware === "pending" ? "neutral" : "info"}>{installStepStates.firmware}</StatusPill>
      </div>

      <div class="mt-3 grid gap-3">
        {#if effectiveSourceMode === "catalog"}
          <Panel padded tone="info">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Eyebrow>Board</Eyebrow>
              <h4 class={subtitleClass}>Choose board target</h4>
            </div>
            {#if workspaceState.serial.target}
              <StatusPill tone={manualSelectionActive ? "info" : "success"}>{manualSelectionActive ? "selected" : "detected"}</StatusPill>
            {/if}
          </div>

          <HelperText class="mt-2">Search the official catalog targets and choose the exact board before selecting vehicle type and firmware version.</HelperText>

          <InfoBlock class="mt-3" title="Selected board">
            <p class="m-0 mt-1" data-testid={firmwareWorkspaceTestIds.selectedTargetState}>{selectedTargetState}</p>
          </InfoBlock>

          {#if manualTargetRequired && !workspaceState.serial.target}
            <div class="mt-3">
              <Banner severity="warning" title={targetProofMessage} testId={firmwareWorkspaceTestIds.manualTargetRequired} />
            </div>
          {:else if !manualTargetRequired}
            <div class="mt-3">
              <Banner severity="success" title={targetProofMessage} />
            </div>
          {/if}

          <label class="mt-3 flex min-w-0 flex-col">
            <span class={fieldLabelClass}>Search board</span>
            <Input
              class="mt-2"
              testId={firmwareWorkspaceTestIds.manualTargetSearch}
              oninput={(event) => (targetSearch = (event.currentTarget as HTMLInputElement).value)}
              placeholder="Cube, Matek, board ID…"
              type="search"
              value={targetSearch}
            />
          </label>

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
            <HelperText class="mt-3">Loading official targets…</HelperText>
          {:else if filteredTargets.length > 0}
            <div class="mt-3 grid max-h-72 gap-2 overflow-y-auto pr-1" data-testid={firmwareWorkspaceTestIds.manualTargetResults}>
              {#each filteredTargets as match (match.key)}
                <SelectableCard
                  ariaLabel={`${match.label} ${match.target.platform}`}
                  density="compact"
                  selected={selectedTargetKey === match.key}
                  onSelect={() => void handleSelectManualTarget(match.target)}
                >
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <span class="text-sm font-semibold text-text-primary">{match.label}</span>
                    <span class="text-xs uppercase tracking-wide text-text-muted">{match.target.platform}</span>
                  </div>
                  <p class="m-0 mt-1 text-xs text-text-secondary">{match.metadata.join(" · ")}</p>
                  <p class="m-0 mt-1 text-xs text-text-muted">{match.vehicleTypesLabel}</p>
                </SelectableCard>
              {/each}
            </div>
          {:else if catalogTargets.length === 0}
            <EmptyState class="mt-3" description="Retry the list or switch to a custom APJ file." title="No catalog targets are available right now." testId={firmwareWorkspaceTestIds.manualTargetEmpty} />
          {:else}
            <EmptyState class="mt-3" description="Clear the search text or try a board ID." title="No targets match" testId={firmwareWorkspaceTestIds.manualTargetNoMatches} />
          {/if}

          {#if manualSelectionActive && workspaceState.serial.target}
            <div class="mt-3" data-testid={firmwareWorkspaceTestIds.manualTargetSelected}>
              <Banner severity="info" title={`Manual board selected · ${targetLabel(workspaceState.serial.target)} · ${targetMeta(workspaceState.serial.target)}`} />
            </div>
          {/if}

          {#if effectiveSourceMode === "catalog" && manualSelectionActive && !selectedTargetVisible}
            <div class="mt-3">
              <Banner severity="warning" title="The selected board is hidden by the current search. Clear the search or reselect a visible board before flashing." />
            </div>
          {/if}
          </Panel>

          <Panel padded tone={usingCatalogSource ? "info" : "neutral"}>
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Eyebrow>Official catalog</Eyebrow>
              <h4 class={subtitleClass}>Choose vehicle type and firmware version</h4>
              <HelperText class="mt-1">Vehicle type and version are selected separately after the board target is chosen.</HelperText>
            </div>
            <span class={tagClass} data-testid={firmwareWorkspaceTestIds.catalogEntryState}>{catalogEntryPhase}</span>
          </div>

          {#if catalogEntryError}
            <div class="mt-3" data-testid={firmwareWorkspaceTestIds.catalogEntryError}>
              <Banner severity="danger" title={catalogEntryError} actionLabel="Retry entries" onAction={() => void retryCatalogEntries()} actionTestId={firmwareWorkspaceTestIds.catalogEntryRetry} />
            </div>
          {/if}

          {#if !workspaceState.serial.target}
            <EmptyState class="mt-3" description="Select a board target above before choosing vehicle type and firmware version." title="Choose a board first" />
          {:else if catalogEntryPhase === "loading" && catalogEntries.length === 0}
            <HelperText class="mt-3">Loading official APJ entries for the selected board…</HelperText>
          {:else if catalogEntries.length > 0}
            <div class="mt-3 grid gap-3 md:grid-cols-2">
              <label class="block min-w-0">
                <span class={fieldLabelClass}>Vehicle type</span>
                <NativeSelect
                  class="mt-2"
                  testId={firmwareWorkspaceTestIds.catalogVehicleTypeSelect}
                  disabled={isSerialActive || catalogVehicleTypes.length === 0}
                  onchange={(event) => void handleCatalogVehicleTypeChange((event.currentTarget as HTMLSelectElement).value)}
                  value={selectedCatalogVehicleType}
                >
                  <option value="" disabled>Choose vehicle type</option>
                  {#each catalogVehicleTypes as vehicleType (vehicleType)}
                    <option value={vehicleType}>{vehicleType}</option>
                  {/each}
                </NativeSelect>
              </label>

              <label class="block min-w-0">
                <span class={fieldLabelClass}>Firmware version</span>
                <NativeSelect
                  class="mt-2"
                  testId={firmwareWorkspaceTestIds.catalogEntrySelect}
                  disabled={isSerialActive || selectedCatalogVehicleType.trim().length === 0 || catalogEntriesForSelectedVehicleType.length === 0}
                  onchange={(event) => void handleCatalogEntryChange((event.currentTarget as HTMLSelectElement).value)}
                  value={selectedCatalogEntryUrl}
                >
                  <option value="" disabled>Choose firmware version</option>
                  {#each catalogEntriesForSelectedVehicleType as entry (entry.url)}
                    <option value={entry.url}>{firmwareVersionLabel(entry)}</option>
                  {/each}
                </NativeSelect>
              </label>
            </div>

            {#if selectedCatalogVehicleType && catalogEntriesForSelectedVehicleType.length === 0}
              <HelperText class="mt-2" size="xs">No APJ versions are available for the selected vehicle type.</HelperText>
            {:else if selectedCatalogEntry}
              <HelperText class="mt-2" size="xs">{entryDetail(selectedCatalogEntry)}</HelperText>
            {/if}
          {:else}
            <EmptyState class="mt-3" description="Use a custom APJ file or pick another board target." title="No official APJ entries are available for this board." />
          {/if}
          </Panel>
        {/if}

        <Panel padded tone={effectiveSourceMode === "local" ? "warning" : "neutral"}>
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Eyebrow>Firmware file</Eyebrow>
            <h4 class={subtitleClass}>{effectiveSourceMode === "local" ? "Custom APJ selected" : "Official catalog file"}</h4>
          </div>
          <StatusPill tone={effectiveSourceMode === "local" ? "warning" : sourceReady ? "success" : "neutral"}>{effectiveSourceMode === "local" ? "custom" : "standard"}</StatusPill>
        </div>

        <InfoBlock class="mt-3" title={effectiveSourceMode === "local" ? "Selected custom file" : "Selected official file"}>
          <p class="m-0 mt-1" data-testid={firmwareWorkspaceTestIds.selectedSourceState}>{selectedSourceState}</p>
        </InfoBlock>

        {#if workspaceState.serial.sourceError}
          <div class="mt-3" data-testid={firmwareWorkspaceTestIds.sourceError}>
            <Banner severity="danger" title={workspaceState.serial.sourceError} />
          </div>
        {/if}

        <div class="mt-3 flex flex-wrap gap-3">
          <Button variant="outline" testId={firmwareWorkspaceTestIds.sourceBrowse} disabled={isSerialActive} onclick={() => void handleChooseLocalApj()}>
            {effectiveSourceMode === "local" ? "Change custom file" : "Use custom file"}
          </Button>

          {#if effectiveSourceMode === "local"}
            <Button variant="ghost" tone="neutral" testId={firmwareWorkspaceTestIds.sourceRemove} disabled={isSerialActive} onclick={() => void handleRemoveLocalApj()}>
              Remove custom file
            </Button>
          {/if}
        </div>

        {#if effectiveSourceMode === "local"}
          <HelperText class="mt-3">The custom APJ overrides the official catalog choices. Remove it to return to the standard catalog firmware.</HelperText>
        {/if}
        </Panel>
      </div>
    </Panel>

    <Panel padded testId={firmwareWorkspaceTestIds.serialReadiness}>
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Eyebrow>Step 3</Eyebrow>
          <h4 class={subtitleClass}>Review and start firmware update</h4>
          <HelperText class="mt-1" size="xs" testId={firmwareWorkspaceTestIds.serialValidationPending}>Firmware compatibility will be validated after bootloader sync before erase/program begins.</HelperText>
        </div>
        <span class={tagClass} data-testid={firmwareWorkspaceTestIds.serialReadinessState}>{workspaceState.serial.readiness.phase}</span>
      </div>

      <InfoBlock class="mt-3" size="sm">
        <p data-testid={firmwareWorkspaceTestIds.serialBlockedReason}>{readinessDetail}</p>
      </InfoBlock>

      <div class="mt-3">
        <FirmwareChecklist items={installReviewChecklist} />
      </div>

      <div class="mt-3 rounded-lg border border-border bg-bg-secondary p-3">
        <div>
          <Eyebrow>Install options</Eyebrow>
          <h4 class={subtitleClass}>Erase and backup checks</h4>
        </div>

        <div class={checkboxClass}>
          <Checkbox
            checked={workspaceState.serial.fullChipErase}
            description="Use this only when you intentionally need to clear the full external flash area instead of performing a normal update."
            disabled={isSerialActive}
            label="Full-chip erase"
            onCheckedChange={(checked) => void store.setFirmwareInstallFullChipErase(checked)}
            testId={firmwareWorkspaceTestIds.fullChipErase}
          />
        </div>

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
          <InfoBlock class="mt-3" size="sm" testId={firmwareWorkspaceTestIds.paramBackupState}>No backed-up parameter set is currently reported for this controller, so install proceeds without a preflight backup reminder.</InfoBlock>
        {/if}
      </div>

      {#if isSerialActive}
        <div class="mt-3 rounded-md border border-accent/35 bg-accent/10 p-3 text-sm text-text-primary">
          <p class="m-0 font-semibold">Firmware install/update in progress</p>
          <p class="m-0 mt-1">{workspaceState.progress?.phase_label ?? workspaceState.sessionPhase ?? "working"}</p>
          {#if workspaceState.progress}
            <Progress class="mt-3" value={workspaceState.progress.pct} variant="accent" testId={firmwareWorkspaceTestIds.serialProgress} />
            <p class="m-0 mt-2 text-xs text-text-secondary">{workspaceState.progress.bytes_written} / {workspaceState.progress.bytes_total} bytes · {Math.round(workspaceState.progress.pct)}%</p>
          {/if}
        </div>
      {/if}

      <div class="mt-4 flex flex-wrap gap-3">
        {#if isSerialActive && !isSerialCancelling}
          <Button variant="outline" testId={firmwareWorkspaceTestIds.cancelSerial} onclick={() => void store.cancel()}>Cancel firmware install/update</Button>
        {/if}

        <Button variant="default" testId={firmwareWorkspaceTestIds.startSerial} disabled={!canStartSerial || isSerialActive || isSerialCancelling || replayReadonly} onclick={() => void store.startFirmwareInstallUpdate()}>
          Start firmware update
        </Button>
      </div>
    </Panel>
  </div>
</Panel>

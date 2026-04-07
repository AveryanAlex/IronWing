import { get, writable } from "svelte/store";

import type {
  CatalogTargetSummary,
  DfuDeviceInfo,
  DfuRecoveryResult,
  DfuRecoverySource,
  FirmwareOutcome,
  FirmwareProgress,
  FirmwareSessionStatus,
  PortInfo,
  SerialFlowResult,
  SerialPreflightInfo,
  SerialReadinessRequest,
  SerialReadinessResponse,
  SerialFlashOptions,
  SerialFlashSource,
} from "../../firmware";
import {
  buildDfuFailureStatus,
  buildSerialFailureStatus,
  computeSerialReadinessToken,
  createFirmwareService,
  deriveFirmwareSessionPath,
  deriveFirmwareSessionPhase,
  dfuResultToStatus,
  isFirmwareSessionActive,
  normalizeDfuRecoveryResult,
  normalizeDfuScanResult,
  normalizeFirmwareProgress,
  normalizeFirmwareSessionStatus,
  normalizeSerialFlowResult,
  normalizeSerialPreflightInfo,
  normalizeSerialReadinessResponse,
  serialResultToStatus,
  type FirmwareService,
  type FirmwareSessionPath,
} from "../platform/firmware";

export const DEFAULT_FIRMWARE_BAUD = 115200;
const READINESS_TOKEN_MISMATCH_MESSAGE = "Firmware readiness returned a mismatched request token.";
const MISSING_SERIAL_PORT_MESSAGE = "Choose a serial port before starting firmware install.";
const MISSING_SERIAL_SOURCE_MESSAGE = "Choose a firmware source before starting firmware install.";
const MISSING_DFU_DEVICE_MESSAGE = "Choose a DFU device before starting recovery.";
const MISSING_DFU_SOURCE_MESSAGE = "Choose a DFU recovery source before starting recovery.";

export type FirmwareWorkspaceAsyncPhase = "idle" | "loading" | "ready" | "failed";
export type FirmwareWorkspaceReadinessPhase = "idle" | "checking" | "ready" | "blocked" | "failed";

export type FirmwareSourceMetadata =
  | {
    kind: "catalog_url";
    label: string | null;
    detail: string | null;
    fileName: null;
    byteLength: null;
    digest: null;
  }
  | {
    kind: "local_apj_bytes" | "local_bin_bytes";
    label: string;
    detail: string | null;
    fileName: string | null;
    byteLength: number;
    digest: string | null;
  }
  | {
    kind: "official_bootloader";
    label: string;
    detail: string | null;
    fileName: null;
    byteLength: null;
    digest: null;
  };

export type FirmwareWorkspaceReadinessState = {
  phase: FirmwareWorkspaceReadinessPhase;
  requestToken: string | null;
  acceptedToken: string | null;
  response: SerialReadinessResponse | null;
  error: string | null;
  staleResponseCount: number;
};

export type FirmwareWorkspaceSerialState = {
  port: string;
  baud: number;
  fullChipErase: boolean;
  target: CatalogTargetSummary | null;
  source: SerialFlashSource;
  sourceMetadata: FirmwareSourceMetadata | null;
  sourceError: string | null;
  availablePorts: PortInfo[];
  preflightPhase: FirmwareWorkspaceAsyncPhase;
  preflight: SerialPreflightInfo | null;
  preflightError: string | null;
  readiness: FirmwareWorkspaceReadinessState;
};

export type FirmwareWorkspaceRecoveryState = {
  device: DfuDeviceInfo | null;
  target: CatalogTargetSummary | null;
  source: DfuRecoverySource | null;
  sourceMetadata: FirmwareSourceMetadata | null;
  sourceError: string | null;
  devices: DfuDeviceInfo[];
  scanPhase: FirmwareWorkspaceAsyncPhase;
  scanError: string | null;
};

export type FirmwareWorkspaceState = {
  hydrated: boolean;
  observedSessionStatus: FirmwareSessionStatus;
  sessionStatus: FirmwareSessionStatus;
  sessionPath: FirmwareSessionPath | null;
  sessionPhase: string | null;
  activePath: FirmwareSessionPath | null;
  isActive: boolean;
  lastCompletedOutcome: FirmwareOutcome | null;
  lastError: string | null;
  progress: FirmwareProgress | null;
  progressError: string | null;
  serial: FirmwareWorkspaceSerialState;
  recovery: FirmwareWorkspaceRecoveryState;
};

export type FirmwareWorkspaceStoreOptions = {
  sessionPollMs?: number;
};

const DEFAULT_SERIAL_SOURCE: SerialFlashSource = {
  kind: "catalog_url",
  url: "",
};

function createInitialState(): FirmwareWorkspaceState {
  return {
    hydrated: false,
    observedSessionStatus: { kind: "idle" },
    sessionStatus: { kind: "idle" },
    sessionPath: null,
    sessionPhase: null,
    activePath: null,
    isActive: false,
    lastCompletedOutcome: null,
    lastError: null,
    progress: null,
    progressError: null,
    serial: {
      port: "",
      baud: DEFAULT_FIRMWARE_BAUD,
      fullChipErase: false,
      target: null,
      source: DEFAULT_SERIAL_SOURCE,
      sourceMetadata: null,
      sourceError: null,
      availablePorts: [],
      preflightPhase: "idle",
      preflight: null,
      preflightError: null,
      readiness: {
        phase: "idle",
        requestToken: null,
        acceptedToken: null,
        response: null,
        error: null,
        staleResponseCount: 0,
      },
    },
    recovery: {
      device: null,
      target: null,
      source: null,
      sourceMetadata: null,
      sourceError: null,
      devices: [],
      scanPhase: "idle",
      scanError: null,
    },
  };
}

export function createFirmwareWorkspaceStore(
  service: FirmwareService = createFirmwareService(),
  options: FirmwareWorkspaceStoreOptions = {},
) {
  const store = writable<FirmwareWorkspaceState>(createInitialState());
  const sessionPollMs = options.sessionPollMs ?? 1000;
  let initializePromise: Promise<void> | null = null;
  let stopProgress: (() => void) | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let pendingStartPath: FirmwareSessionPath | null = null;
  let pendingCancelPath: FirmwareSessionPath | null = null;

  function updateState(recipe: (state: FirmwareWorkspaceState) => FirmwareWorkspaceState) {
    store.update((state) => withDerivedState(recipe(state)));
  }

  function deriveEffectiveSessionStatus(
    observedSessionStatus: FirmwareSessionStatus,
    lastCompletedOutcome: FirmwareOutcome | null,
  ): FirmwareSessionStatus {
    if (observedSessionStatus.kind === "completed") {
      return observedSessionStatus;
    }

    const observedPath = deriveFirmwareSessionPath(observedSessionStatus);
    if (pendingCancelPath !== null && (observedSessionStatus.kind === "idle" || observedPath === pendingCancelPath)) {
      return {
        kind: "cancelling",
        path: pendingCancelPath,
      };
    }

    if (pendingStartPath !== null && observedSessionStatus.kind === "idle") {
      return pendingStartPath === "serial_primary"
        ? { kind: "serial_primary", phase: "idle" }
        : { kind: "dfu_recovery", phase: "idle" };
    }

    if (observedSessionStatus.kind === "idle" && lastCompletedOutcome) {
      return {
        kind: "completed",
        outcome: lastCompletedOutcome,
      };
    }

    return observedSessionStatus;
  }

  function applyObservedSessionStatus(nextStatus: FirmwareSessionStatus, options: { clearLastError?: boolean } = {}) {
    if (nextStatus.kind !== "idle") {
      pendingStartPath = null;
    }

    if (nextStatus.kind === "completed") {
      pendingCancelPath = null;
    }

    updateState((state) => ({
      ...state,
      observedSessionStatus: nextStatus,
      lastCompletedOutcome: nextStatus.kind === "completed" ? nextStatus.outcome : state.lastCompletedOutcome,
      lastError: options.clearLastError ? null : state.lastError,
    }));
  }

  async function initialize() {
    if (initializePromise) {
      return initializePromise;
    }

    initializePromise = (async () => {
      try {
        stopProgress = await service.subscribeProgress((progress) => {
          try {
            const normalized = normalizeFirmwareProgress(progress);
            updateState((state) => ({
              ...state,
              progress: normalized,
              progressError: null,
            }));
          } catch (error) {
            updateState((state) => ({
              ...state,
              progressError: service.formatError(error),
            }));
          }
        });
      } catch (error) {
        updateState((state) => ({
          ...state,
          progressError: service.formatError(error),
        }));
      }

      await Promise.allSettled([
        refreshSessionStatus(),
        refreshSerialPreflight(),
        refreshRecoveryDevices(),
      ]);

      if (sessionPollMs > 0 && pollTimer === null) {
        pollTimer = setInterval(() => {
          void refreshSessionStatus();
        }, sessionPollMs);
      }

      updateState((state) => ({
        ...state,
        hydrated: true,
      }));
    })();

    return initializePromise;
  }

  async function refreshSessionStatus() {
    try {
      const nextStatus = normalizeFirmwareSessionStatus(await service.sessionStatus());
      applyObservedSessionStatus(nextStatus);
      return nextStatus;
    } catch (error) {
      updateState((state) => ({
        ...state,
        lastError: service.formatError(error),
      }));
      return get(store).sessionStatus;
    }
  }

  async function refreshSerialPreflight() {
    updateState((state) => ({
      ...state,
      serial: {
        ...state.serial,
        preflightPhase: "loading",
        preflightError: null,
      },
    }));

    try {
      const preflight = normalizeSerialPreflightInfo(await service.serialPreflight());
      applyObservedSessionStatus(preflight.session_status);

      const previous = get(store);
      const nextPort = resolvePreferredPort(previous.serial.port, preflight.available_ports);

      updateState((state) => ({
        ...state,
        serial: {
          ...state.serial,
          port: nextPort,
          availablePorts: [...preflight.available_ports],
          preflightPhase: "ready",
          preflight,
          preflightError: null,
        },
      }));

      if (nextPort !== previous.serial.port || previous.serial.readiness.phase === "idle") {
        await requestSerialReadiness();
      }

      return preflight;
    } catch (error) {
      const message = service.formatError(error);
      updateState((state) => ({
        ...state,
        lastError: message,
        serial: {
          ...state.serial,
          preflightPhase: "failed",
          preflightError: message,
        },
      }));
      return null;
    }
  }

  async function refreshRecoveryDevices() {
    updateState((state) => ({
      ...state,
      recovery: {
        ...state.recovery,
        scanPhase: "loading",
        scanError: null,
      },
    }));

    try {
      const scan = normalizeDfuScanResult(await service.listDfuDevices());
      const devices = scan.kind === "available" ? scan.devices : [];
      const current = get(store);
      const selectedDevice = resolvePreferredDfuDevice(current.recovery.device, devices);

      updateState((state) => ({
        ...state,
        recovery: {
          ...state.recovery,
          device: selectedDevice,
          devices,
          scanPhase: "ready",
          scanError: scan.kind === "unsupported" ? "DFU recovery is unsupported on this platform." : null,
        },
      }));

      return scan;
    } catch (error) {
      const message = service.formatError(error);
      updateState((state) => ({
        ...state,
        lastError: message,
        recovery: {
          ...state.recovery,
          scanPhase: "failed",
          scanError: message,
        },
      }));
      return null;
    }
  }

  async function requestSerialReadiness() {
    const currentState = get(store);
    const request = buildSerialReadinessRequest(currentState.serial);
    const requestToken = computeSerialReadinessToken(request);

    updateState((state) => ({
      ...state,
      serial: {
        ...state.serial,
        readiness: {
          ...state.serial.readiness,
          phase: "checking",
          requestToken,
          error: null,
        },
      },
    }));

    try {
      const response = normalizeSerialReadinessResponse(await service.serialReadiness(request));
      const latest = get(store);
      if (latest.serial.readiness.requestToken !== requestToken) {
        updateState((state) => ({
          ...state,
          serial: {
            ...state.serial,
            readiness: {
              ...state.serial.readiness,
              staleResponseCount: state.serial.readiness.staleResponseCount + 1,
            },
          },
        }));
        return null;
      }

      if (response.request_token !== requestToken) {
        updateState((state) => ({
          ...state,
          lastError: READINESS_TOKEN_MISMATCH_MESSAGE,
          serial: {
            ...state.serial,
            readiness: {
              ...state.serial.readiness,
              phase: "failed",
              error: READINESS_TOKEN_MISMATCH_MESSAGE,
            },
          },
        }));
        return null;
      }

      applyObservedSessionStatus(response.session_status);
      updateState((state) => ({
        ...state,
        serial: {
          ...state.serial,
          readiness: {
            ...state.serial.readiness,
            phase: response.readiness.kind === "advisory" ? "ready" : "blocked",
            acceptedToken: response.request_token,
            response,
            error: null,
          },
        },
      }));

      return response;
    } catch (error) {
      const latest = get(store);
      if (latest.serial.readiness.requestToken !== requestToken) {
        updateState((state) => ({
          ...state,
          serial: {
            ...state.serial,
            readiness: {
              ...state.serial.readiness,
              staleResponseCount: state.serial.readiness.staleResponseCount + 1,
            },
          },
        }));
        return null;
      }

      const message = service.formatError(error);
      updateState((state) => ({
        ...state,
        lastError: message,
        serial: {
          ...state.serial,
          readiness: {
            ...state.serial.readiness,
            phase: "failed",
            error: message,
          },
        },
      }));
      return null;
    }
  }

  async function setSerialPort(port: string) {
    const normalizedPort = typeof port === "string" ? port : "";
    const current = get(store).serial.port;
    if (normalizedPort === current) {
      return get(store).serial.readiness.response;
    }

    updateState((state) => ({
      ...state,
      serial: {
        ...state.serial,
        port: normalizedPort,
      },
    }));

    return requestSerialReadiness();
  }

  function setSerialTarget(target: CatalogTargetSummary | null) {
    updateState((state) => ({
      ...state,
      serial: {
        ...state.serial,
        target,
      },
    }));
  }

  async function setSerialSource(source: SerialFlashSource | null, metadata: FirmwareSourceMetadata | null = null) {
    updateState((state) => ({
      ...state,
      serial: {
        ...state.serial,
        source: source ?? DEFAULT_SERIAL_SOURCE,
        sourceMetadata: metadata,
        sourceError: null,
      },
    }));

    return requestSerialReadiness();
  }

  function setSerialSourceError(error: string | null) {
    updateState((state) => ({
      ...state,
      serial: {
        ...state.serial,
        sourceError: error,
      },
    }));
  }

  function setSerialBaud(baud: number) {
    if (!Number.isFinite(baud) || baud <= 0) {
      return;
    }

    updateState((state) => ({
      ...state,
      serial: {
        ...state.serial,
        baud,
      },
    }));
  }

  async function setSerialFullChipErase(fullChipErase: boolean) {
    updateState((state) => ({
      ...state,
      serial: {
        ...state.serial,
        fullChipErase,
      },
    }));

    return requestSerialReadiness();
  }

  function setRecoveryDevice(device: DfuDeviceInfo | null) {
    updateState((state) => ({
      ...state,
      recovery: {
        ...state.recovery,
        device,
      },
    }));
  }

  function setRecoveryTarget(target: CatalogTargetSummary | null) {
    updateState((state) => ({
      ...state,
      recovery: {
        ...state.recovery,
        target,
      },
    }));
  }

  function setRecoverySource(source: DfuRecoverySource | null, metadata: FirmwareSourceMetadata | null = null) {
    updateState((state) => ({
      ...state,
      recovery: {
        ...state.recovery,
        source,
        sourceMetadata: metadata,
        sourceError: null,
      },
    }));
  }

  function setRecoverySourceError(error: string | null) {
    updateState((state) => ({
      ...state,
      recovery: {
        ...state.recovery,
        sourceError: error,
      },
    }));
  }

  async function startSerial(): Promise<SerialFlowResult | null> {
    const state = get(store);
    const source = state.serial.source;

    if (state.serial.port.trim().length === 0) {
      updateState((current) => ({
        ...current,
        lastError: MISSING_SERIAL_PORT_MESSAGE,
      }));
      return null;
    }

    if (source.kind === "catalog_url" && source.url.trim().length === 0) {
      updateState((current) => ({
        ...current,
        lastError: MISSING_SERIAL_SOURCE_MESSAGE,
      }));
      return null;
    }

    pendingCancelPath = null;
    pendingStartPath = "serial_primary";

    updateState((current) => ({
      ...current,
      lastError: null,
      progress: null,
      lastCompletedOutcome: null,
      observedSessionStatus: current.observedSessionStatus.kind === "completed" ? { kind: "idle" } : current.observedSessionStatus,
    }));

    try {
      const result = normalizeSerialFlowResult(
        await service.flashSerial(
          state.serial.port,
          state.serial.baud,
          source,
          serialOptionsFromState(state.serial),
        ),
      );
      pendingStartPath = null;
      const nextStatus = serialResultToStatus(result);
      applyObservedSessionStatus(nextStatus, { clearLastError: true });
      updateState((current) => ({
        ...current,
        progress: null,
      }));
      return result;
    } catch (error) {
      pendingStartPath = null;
      const message = service.formatError(error);
      applyObservedSessionStatus(buildSerialFailureStatus(message));
      updateState((current) => ({
        ...current,
        lastError: message,
        progress: null,
      }));
      return null;
    }
  }

  async function startDfuRecovery(): Promise<DfuRecoveryResult | null> {
    const state = get(store);
    if (!state.recovery.device) {
      updateState((current) => ({
        ...current,
        lastError: MISSING_DFU_DEVICE_MESSAGE,
      }));
      return null;
    }

    if (!state.recovery.source) {
      updateState((current) => ({
        ...current,
        lastError: MISSING_DFU_SOURCE_MESSAGE,
      }));
      return null;
    }

    pendingCancelPath = null;
    pendingStartPath = "dfu_recovery";

    updateState((current) => ({
      ...current,
      lastError: null,
      progress: null,
      lastCompletedOutcome: null,
      observedSessionStatus: current.observedSessionStatus.kind === "completed" ? { kind: "idle" } : current.observedSessionStatus,
    }));

    try {
      const result = normalizeDfuRecoveryResult(
        await service.flashDfuRecovery(state.recovery.device, state.recovery.source),
      );
      pendingStartPath = null;
      const nextStatus = dfuResultToStatus(result);
      applyObservedSessionStatus(nextStatus, { clearLastError: true });
      updateState((current) => ({
        ...current,
        progress: null,
      }));
      return result;
    } catch (error) {
      pendingStartPath = null;
      const message = service.formatError(error);
      applyObservedSessionStatus(buildDfuFailureStatus(message));
      updateState((current) => ({
        ...current,
        lastError: message,
        progress: null,
      }));
      return null;
    }
  }

  async function cancel() {
    const previous = get(store);
    const previousPath = previous.activePath;
    if (!previousPath) {
      return;
    }

    pendingCancelPath = previousPath;
    updateState((state) => ({
      ...state,
      lastError: null,
    }));

    try {
      await service.sessionCancel();
      updateState((state) => ({
        ...state,
        progress: null,
      }));
    } catch (error) {
      pendingCancelPath = null;
      const message = service.formatError(error);
      updateState((state) => ({
        ...state,
        lastError: message,
      }));
    }
  }

  async function dismissOutcome() {
    const current = get(store);
    if (!current.lastCompletedOutcome) {
      return;
    }

    try {
      await service.sessionClearCompleted();
      pendingStartPath = null;
      pendingCancelPath = null;
      updateState((state) => ({
        ...state,
        lastCompletedOutcome: null,
        progress: null,
        observedSessionStatus: state.observedSessionStatus.kind === "completed" ? { kind: "idle" } : state.observedSessionStatus,
      }));
    } catch (error) {
      updateState((state) => ({
        ...state,
        lastError: service.formatError(error),
      }));
    }
  }

  function clearError() {
    updateState((state) => ({
      ...state,
      lastError: null,
      progressError: null,
      serial: {
        ...state.serial,
        sourceError: null,
        preflightError: null,
        readiness: {
          ...state.serial.readiness,
          error: null,
        },
      },
      recovery: {
        ...state.recovery,
        sourceError: null,
        scanError: null,
      },
    }));
  }

  function reset() {
    stopProgress?.();
    stopProgress = null;
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    initializePromise = null;
    pendingStartPath = null;
    pendingCancelPath = null;
    store.set(createInitialState());
  }

  function withDerivedState(state: FirmwareWorkspaceState): FirmwareWorkspaceState {
    const sessionStatus = deriveEffectiveSessionStatus(state.observedSessionStatus, state.lastCompletedOutcome);
    const sessionPath = deriveFirmwareSessionPath(sessionStatus);
    const isActive = isFirmwareSessionActive(sessionStatus);

    return {
      ...state,
      sessionStatus,
      sessionPath,
      sessionPhase: deriveFirmwareSessionPhase(sessionStatus),
      activePath: isActive ? sessionPath : null,
      isActive,
    };
  }

  return {
    subscribe: store.subscribe,
    initialize,
    refreshSessionStatus,
    refreshSerialPreflight,
    refreshRecoveryDevices,
    requestSerialReadiness,
    setSerialPort,
    setSerialTarget,
    setSerialSource,
    setSerialSourceError,
    setSerialBaud,
    setSerialFullChipErase,
    setRecoveryDevice,
    setRecoveryTarget,
    setRecoverySource,
    setRecoverySourceError,
    startSerial,
    startDfuRecovery,
    cancel,
    dismissOutcome,
    clearError,
    reset,
  };
}

export type FirmwareWorkspaceStore = ReturnType<typeof createFirmwareWorkspaceStore>;

export function createCatalogSourceMetadata(url: string, label: string | null = null, detail: string | null = null): FirmwareSourceMetadata {
  return {
    kind: "catalog_url",
    label: label ?? url,
    detail,
    fileName: null,
    byteLength: null,
    digest: null,
  };
}

export function createOfficialBootloaderSourceMetadata(boardTarget: string, detail: string | null = null): FirmwareSourceMetadata {
  return {
    kind: "official_bootloader",
    label: boardTarget,
    detail,
    fileName: null,
    byteLength: null,
    digest: null,
  };
}

export function createLocalFileSourceMetadata(input: {
  kind: "local_apj_bytes" | "local_bin_bytes";
  fileName: string | null;
  byteLength: number;
  digest?: string | null;
  detail?: string | null;
}): FirmwareSourceMetadata {
  return {
    kind: input.kind,
    label: input.fileName ?? (input.kind === "local_apj_bytes" ? "Local APJ" : "Local BIN"),
    detail: input.detail ?? null,
    fileName: input.fileName,
    byteLength: input.byteLength,
    digest: input.digest ?? null,
  };
}

function buildSerialReadinessRequest(serial: FirmwareWorkspaceSerialState): SerialReadinessRequest {
  return {
    port: serial.port,
    source: serial.source,
    options: serialOptionsFromState(serial),
  };
}

function serialOptionsFromState(serial: Pick<FirmwareWorkspaceSerialState, "fullChipErase">): SerialFlashOptions {
  return {
    full_chip_erase: serial.fullChipErase,
  };
}

function resolvePreferredPort(currentPort: string, ports: PortInfo[]): string {
  if (currentPort && ports.some((port) => port.port_name === currentPort)) {
    return currentPort;
  }

  return ports[0]?.port_name ?? currentPort;
}

function resolvePreferredDfuDevice(currentDevice: DfuDeviceInfo | null, devices: DfuDeviceInfo[]): DfuDeviceInfo | null {
  if (!currentDevice) {
    return devices.length === 1 ? devices[0] ?? null : null;
  }

  return devices.find((device) => device.unique_id === currentDevice.unique_id) ?? (devices.length === 1 ? devices[0] ?? null : null);
}

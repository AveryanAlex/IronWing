import { get, writable } from "svelte/store";

import { trackAnalytics } from "../analytics/client";
import { durationBucket } from "../analytics/properties";
import {
  bootloaderInstallationPlatformUnsupportedGuidance,
  firmwareInstallUpdateErrorGuidance,
} from "../firmware/platform-guidance";
import type {
  CatalogTargetSummary,
  DfuDeviceInfo,
  BootloaderInstallationResult,
  BootloaderInstallationSource,
  FirmwareBootloaderBoardInfo,
  FirmwareInstallResult,
  FirmwareInstallPreflightInfo,
  FirmwareInstallReadinessRequest,
  FirmwareInstallReadinessResponse,
  FirmwareInstallOptions,
  FirmwareInstallSource,
  FirmwareOutcome,
  FirmwareProgress,
  FirmwareRebootToBootloaderResult,
  FirmwareSessionStatus,
} from "../../firmware";
import {
  bootloaderInstallationResultToStatus,
  buildBootloaderInstallationFailureStatus,
  buildFirmwareInstallFailureStatus,
  computeFirmwareInstallReadinessToken,
  createFirmwareService,
  deriveFirmwareSessionPath,
  deriveFirmwareSessionPhase,
  firmwareInstallResultToStatus,
  isFirmwareSessionActive,
  normalizeBootloaderInstallationResult,
  normalizeDfuScanResult,
  normalizeFirmwareBootloaderBoardInfo,
  normalizeFirmwareInstallPreflightInfo,
  normalizeFirmwareInstallReadinessResponse,
  normalizeFirmwareInstallResult,
  normalizeFirmwareProgress,
  normalizeFirmwareRebootToBootloaderResult,
  normalizeFirmwareSessionStatus,
  type FirmwareService,
} from "../platform/firmware";
import type { FirmwareSessionPath } from "../../firmware";

export const DEFAULT_FIRMWARE_BAUD = 115200;
const READINESS_TOKEN_MISMATCH_MESSAGE = "Firmware readiness returned a mismatched request token.";
const MISSING_INSTALL_PORT_MESSAGE = "Choose a serial port before starting firmware install/update.";
const MISSING_INSTALL_SOURCE_MESSAGE = "Choose a firmware source before starting firmware install/update.";
const MISSING_BOOTLOADER_DEVICE_MESSAGE = "Choose a DFU device before starting bootloader installation.";
const MISSING_BOOTLOADER_SOURCE_MESSAGE = "Choose a bootloader source before starting bootloader installation.";
const BOOTLOADER_SYNC_REBOOT_PROMPT = "Reboot the controller into bootloader mode, then refresh and select/grant the bootloader serial port before retrying.";

export type FirmwareWorkspaceAsyncPhase = "idle" | "loading" | "ready" | "failed";
export type FirmwareWorkspaceReadinessPhase = "idle" | "checking" | "ready" | "blocked" | "failed";
export type FirmwareWorkspaceBootloaderRebootPhase = "idle" | "requesting" | "requested" | "unsupported" | "failed";
export type FirmwareWorkspaceBoardDetectionPhase = "idle" | "detecting" | "detected" | "failed";

export type FirmwareWorkspaceBootloaderRebootState = {
  phase: FirmwareWorkspaceBootloaderRebootPhase;
  message: string | null;
};

export type FirmwareWorkspaceBoardDetectionState = {
  phase: FirmwareWorkspaceBoardDetectionPhase;
  info: FirmwareBootloaderBoardInfo | null;
  error: string | null;
};

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
  response: FirmwareInstallReadinessResponse | null;
  error: string | null;
  staleResponseCount: number;
};

export type FirmwareWorkspaceSerialState = {
  port: string;
  baud: number;
  fullChipErase: boolean;
  target: CatalogTargetSummary | null;
  source: FirmwareInstallSource;
  sourceMetadata: FirmwareSourceMetadata | null;
  sourceError: string | null;
  preflightPhase: FirmwareWorkspaceAsyncPhase;
  preflight: FirmwareInstallPreflightInfo | null;
  preflightError: string | null;
  readiness: FirmwareWorkspaceReadinessState;
  bootloaderReboot: FirmwareWorkspaceBootloaderRebootState;
  boardDetection: FirmwareWorkspaceBoardDetectionState;
};

export type FirmwareWorkspaceRecoveryState = {
  device: DfuDeviceInfo | null;
  target: CatalogTargetSummary | null;
  source: BootloaderInstallationSource | null;
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

const DEFAULT_SERIAL_SOURCE: FirmwareInstallSource = {
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
      bootloaderReboot: {
        phase: "idle",
        message: null,
      },
      boardDetection: {
        phase: "idle",
        info: null,
        error: null,
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

  function shouldPromptBootloaderReboot(message: string): boolean {
    const normalized = message.toLowerCase();
    return normalized.includes("bootloader sync mismatch") || normalized.includes("no ardupilot bootloader responded");
  }

  function promptBootloaderRebootOnSyncMismatch(message: string): string {
    if (!shouldPromptBootloaderReboot(message) || message.includes(BOOTLOADER_SYNC_REBOOT_PROMPT)) {
      return message;
    }

    return `${message} ${BOOTLOADER_SYNC_REBOOT_PROMPT}`;
  }

  function promptBootloaderRebootForInstallResult(result: FirmwareInstallResult): FirmwareInstallResult {
    switch (result.result) {
      case "failed":
      case "board_detection_failed":
      case "extf_capacity_insufficient":
        return {
          ...result,
          reason: promptBootloaderRebootOnSyncMismatch(result.reason),
        };
      default:
        return result;
    }
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
      return pendingStartPath === "firmware_install_update"
        ? { kind: "firmware_install_update", phase: "idle" }
        : { kind: "bootloader_installation", phase: "idle" };
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
        refreshFirmwareInstallPreflight(),
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

  async function refreshFirmwareInstallPreflight() {
    updateState((state) => ({
      ...state,
      serial: {
        ...state.serial,
        preflightPhase: "loading",
        preflightError: null,
      },
    }));

    try {
      const preflight = normalizeFirmwareInstallPreflightInfo(await service.installPreflight());
      applyObservedSessionStatus(preflight.session_status);

      const previous = get(store);

      updateState((state) => ({
        ...state,
        serial: {
          ...state.serial,
          preflightPhase: "ready",
          preflight,
          preflightError: null,
        },
      }));

      if (previous.serial.readiness.phase === "idle") {
        await requestFirmwareInstallReadiness();
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
          scanError: scan.kind === "unsupported" ? bootloaderInstallationPlatformUnsupportedGuidance(scan.reason) : null,
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

  async function requestFirmwareInstallReadiness() {
    const currentState = get(store);
    const request = buildFirmwareInstallReadinessRequest(currentState.serial);
    const requestToken = computeFirmwareInstallReadinessToken(request);

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
      const response = normalizeFirmwareInstallReadinessResponse(await service.installReadiness(request));
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

  async function rebootFirmwareInstallToBootloader(): Promise<FirmwareRebootToBootloaderResult | null> {
    const port = get(store).serial.port;
    if (port.trim().length === 0) {
      updateState((state) => ({
        ...state,
        lastError: MISSING_INSTALL_PORT_MESSAGE,
        serial: {
          ...state.serial,
          bootloaderReboot: {
            phase: "failed",
            message: MISSING_INSTALL_PORT_MESSAGE,
          },
        },
      }));
      return null;
    }

    updateState((state) => ({
      ...state,
      serial: {
        ...state.serial,
        bootloaderReboot: {
          phase: "requesting",
          message: null,
        },
      },
    }));

    try {
      const result = normalizeFirmwareRebootToBootloaderResult(await service.rebootToBootloader(port));
      const message = result.result === "requested"
        ? "Bootloader reboot requested. If the device re-enumerates, refresh and select/grant the bootloader port, then autodetect or start install."
        : result.result === "unsupported"
          ? result.reason
          : result.error;
      updateState((state) => ({
        ...state,
        lastError: result.result === "failed" ? result.error : state.lastError,
        serial: {
          ...state.serial,
          bootloaderReboot: {
            phase: result.result,
            message,
          },
        },
      }));

      if (result.result === "requested") {
        await refreshFirmwareInstallPreflight();
      }

      return result;
    } catch (error) {
      const message = service.formatError(error);
      updateState((state) => ({
        ...state,
        lastError: message,
        serial: {
          ...state.serial,
          bootloaderReboot: {
            phase: "failed",
            message,
          },
        },
      }));
      return null;
    }
  }

  async function detectFirmwareInstallBootloaderBoard(): Promise<FirmwareBootloaderBoardInfo | null> {
    const port = get(store).serial.port;
    if (port.trim().length === 0) {
      updateState((state) => ({
        ...state,
        lastError: MISSING_INSTALL_PORT_MESSAGE,
        serial: {
          ...state.serial,
          boardDetection: {
            phase: "failed",
            info: null,
            error: MISSING_INSTALL_PORT_MESSAGE,
          },
        },
      }));
      return null;
    }

    updateState((state) => ({
      ...state,
      serial: {
        ...state.serial,
        boardDetection: {
          ...state.serial.boardDetection,
          phase: "detecting",
          error: null,
        },
      },
    }));

    try {
      const info = normalizeFirmwareBootloaderBoardInfo(await service.detectBootloaderBoard(port));
      updateState((state) => ({
        ...state,
        serial: {
          ...state.serial,
          boardDetection: {
            phase: "detected",
            info,
            error: null,
          },
        },
      }));
      return info;
    } catch (error) {
      const message = promptBootloaderRebootOnSyncMismatch(firmwareInstallUpdateErrorGuidance(service.formatError(error)));
      updateState((state) => ({
        ...state,
        lastError: message,
        serial: {
          ...state.serial,
          boardDetection: {
            phase: "failed",
            info: null,
            error: message,
          },
        },
      }));
      return null;
    }
  }

  async function setFirmwareInstallPort(port: string) {
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
        bootloaderReboot: {
          phase: "idle",
          message: null,
        },
        boardDetection: {
          phase: "idle",
          info: null,
          error: null,
        },
      },
    }));

    return requestFirmwareInstallReadiness();
  }

  function setFirmwareInstallTarget(target: CatalogTargetSummary | null) {
    updateState((state) => ({
      ...state,
      serial: {
        ...state.serial,
        target,
      },
    }));
  }

  async function setFirmwareInstallSource(source: FirmwareInstallSource | null, metadata: FirmwareSourceMetadata | null = null) {
    updateState((state) => ({
      ...state,
      serial: {
        ...state.serial,
        source: source ?? DEFAULT_SERIAL_SOURCE,
        sourceMetadata: metadata,
        sourceError: null,
      },
    }));

    return requestFirmwareInstallReadiness();
  }

  function setFirmwareInstallSourceError(error: string | null) {
    updateState((state) => ({
      ...state,
      serial: {
        ...state.serial,
        sourceError: error,
      },
    }));
  }

  function setFirmwareInstallBaud(baud: number) {
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

  async function setFirmwareInstallFullChipErase(fullChipErase: boolean) {
    updateState((state) => ({
      ...state,
      serial: {
        ...state.serial,
        fullChipErase,
      },
    }));

    return requestFirmwareInstallReadiness();
  }

  function setBootloaderDevice(device: DfuDeviceInfo | null) {
    updateState((state) => ({
      ...state,
      recovery: {
        ...state.recovery,
        device,
      },
    }));
  }

  function setBootloaderTarget(target: CatalogTargetSummary | null) {
    updateState((state) => ({
      ...state,
      recovery: {
        ...state.recovery,
        target,
      },
    }));
  }

  function setBootloaderSource(source: BootloaderInstallationSource | null, metadata: FirmwareSourceMetadata | null = null) {
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

  function setBootloaderSourceError(error: string | null) {
    updateState((state) => ({
      ...state,
      recovery: {
        ...state.recovery,
        sourceError: error,
      },
    }));
  }

  async function startFirmwareInstallUpdate(): Promise<FirmwareInstallResult | null> {
    const state = get(store);
    const source = state.serial.source;

    if (state.serial.port.trim().length === 0) {
      updateState((current) => ({
        ...current,
        lastError: MISSING_INSTALL_PORT_MESSAGE,
      }));
      return null;
    }

    if (source.kind === "catalog_url" && source.url.trim().length === 0) {
      updateState((current) => ({
        ...current,
        lastError: MISSING_INSTALL_SOURCE_MESSAGE,
      }));
      return null;
    }

    pendingCancelPath = null;
    pendingStartPath = "firmware_install_update";
    const startedAt = Date.now();
    trackAnalytics("firmware_install_started", {
      source: source.kind,
      target_kind: state.serial.target ? "catalog_target" : "unknown",
      full_chip_erase: state.serial.fullChipErase ? 1 : 0,
    });

    updateState((current) => ({
      ...current,
      lastError: null,
      progress: null,
      lastCompletedOutcome: null,
      observedSessionStatus: current.observedSessionStatus.kind === "completed" ? { kind: "idle" } : current.observedSessionStatus,
    }));

    try {
      const result = promptBootloaderRebootForInstallResult(
        normalizeFirmwareInstallResult(
          await service.startFirmwareInstallUpdate(
            state.serial.port,
            state.serial.baud,
            source,
            serialOptionsFromState(state.serial),
          ),
        ),
      );
      pendingStartPath = null;
      const nextStatus = firmwareInstallResultToStatus(result);
      applyObservedSessionStatus(nextStatus, { clearLastError: true });
      updateState((current) => ({
        ...current,
        progress: null,
      }));
      trackAnalytics("firmware_install_completed", {
        result: result.result,
        path: "firmware_install_update",
        duration_secs_bucket: durationBucket((Date.now() - startedAt) / 1000),
      });
      return result;
    } catch (error) {
      pendingStartPath = null;
      const message = promptBootloaderRebootOnSyncMismatch(firmwareInstallUpdateErrorGuidance(service.formatError(error)));
      applyObservedSessionStatus(buildFirmwareInstallFailureStatus(message));
      updateState((current) => ({
        ...current,
        lastError: message,
        progress: null,
      }));
      trackAnalytics("firmware_install_completed", {
        result: "error",
        path: "firmware_install_update",
        duration_secs_bucket: durationBucket((Date.now() - startedAt) / 1000),
      });
      return null;
    }
  }

  async function startBootloaderInstallation(): Promise<BootloaderInstallationResult | null> {
    const state = get(store);
    if (!state.recovery.device) {
      updateState((current) => ({
        ...current,
        lastError: MISSING_BOOTLOADER_DEVICE_MESSAGE,
      }));
      return null;
    }

    if (!state.recovery.source) {
      updateState((current) => ({
        ...current,
        lastError: MISSING_BOOTLOADER_SOURCE_MESSAGE,
      }));
      return null;
    }

    pendingCancelPath = null;
    pendingStartPath = "bootloader_installation";
    const startedAt = Date.now();
    trackAnalytics("bootloader_install_started", {
      source: state.recovery.source.kind,
      target_kind: state.recovery.target ? "catalog_target" : "unknown",
    });

    updateState((current) => ({
      ...current,
      lastError: null,
      progress: null,
      lastCompletedOutcome: null,
      observedSessionStatus: current.observedSessionStatus.kind === "completed" ? { kind: "idle" } : current.observedSessionStatus,
    }));

    try {
      const result = normalizeBootloaderInstallationResult(
        await service.startBootloaderInstallation(state.recovery.device, state.recovery.source),
      );
      pendingStartPath = null;
      const nextStatus = bootloaderInstallationResultToStatus(result);
      applyObservedSessionStatus(nextStatus, { clearLastError: true });
      updateState((current) => ({
        ...current,
        progress: null,
      }));
      trackAnalytics("bootloader_install_completed", {
        result: result.result,
        duration_secs_bucket: durationBucket((Date.now() - startedAt) / 1000),
      });
      return result;
    } catch (error) {
      pendingStartPath = null;
      const message = service.formatError(error);
      applyObservedSessionStatus(buildBootloaderInstallationFailureStatus(message));
      updateState((current) => ({
        ...current,
        lastError: message,
        progress: null,
      }));
      trackAnalytics("bootloader_install_completed", {
        result: "error",
        duration_secs_bucket: durationBucket((Date.now() - startedAt) / 1000),
      });
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
        bootloaderReboot: {
          ...state.serial.bootloaderReboot,
          message: null,
        },
        boardDetection: {
          ...state.serial.boardDetection,
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
    refreshFirmwareInstallPreflight,
    refreshRecoveryDevices,
    requestFirmwareInstallReadiness,
    rebootFirmwareInstallToBootloader,
    detectFirmwareInstallBootloaderBoard,
    setFirmwareInstallPort,
    setFirmwareInstallTarget,
    setFirmwareInstallSource,
    setFirmwareInstallSourceError,
    setFirmwareInstallBaud,
    setFirmwareInstallFullChipErase,
    setBootloaderDevice,
    setBootloaderTarget,
    setBootloaderSource,
    setBootloaderSourceError,
    startFirmwareInstallUpdate,
    startBootloaderInstallation,
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

function buildFirmwareInstallReadinessRequest(serial: FirmwareWorkspaceSerialState): FirmwareInstallReadinessRequest {
  return {
    port: serial.port,
    source: serial.source,
    options: serialOptionsFromState(serial),
  };
}

function serialOptionsFromState(serial: Pick<FirmwareWorkspaceSerialState, "fullChipErase">): FirmwareInstallOptions {
  return {
    full_chip_erase: serial.fullChipErase,
  };
}

function resolvePreferredDfuDevice(currentDevice: DfuDeviceInfo | null, devices: DfuDeviceInfo[]): DfuDeviceInfo | null {
  if (!currentDevice) {
    return devices.length === 1 ? devices[0] ?? null : null;
  }

  return devices.find((device) => device.unique_id === currentDevice.unique_id) ?? (devices.length === 1 ? devices[0] ?? null : null);
}

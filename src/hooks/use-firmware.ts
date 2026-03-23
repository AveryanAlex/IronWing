import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  firmwareSessionStatus,
  firmwareSessionCancel,
  firmwareSessionClearCompleted,
  firmwareFlashSerial,
  firmwareFlashDfuRecovery,
  firmwareSerialPreflight,
  firmwareSerialReadiness,
  firmwareListPorts,
  firmwareListDfuDevices,
  firmwareCatalogEntries,
  firmwareCatalogTargets,
  firmwareRecoveryCatalogTargets,
  subscribeFirmwareProgress,
  type FirmwareSessionStatus,
  type FirmwareProgress,
  type SerialFlashSource,
  type SerialFlashOptions,
  type SerialFlowResult,
  type DfuDeviceInfo,
  type DfuRecoverySource,
  type DfuRecoveryResult,
  type SerialPreflightInfo,
  type SerialReadinessRequest,
  type SerialReadinessResponse,
  type InventoryResult,
  type DfuScanResult,
  type CatalogEntry,
  type CatalogTargetSummary,
} from "../firmware";

export type FirmwareSessionPath = "serial_primary" | "dfu_recovery";

export type FirmwareState = {
  sessionStatus: FirmwareSessionStatus;
  progress: FirmwareProgress | null;
  isActive: boolean;
  activePath: FirmwareSessionPath | null;
};

export function isFirmwareActive(status: FirmwareSessionStatus): boolean {
  return status.kind === "serial_primary" || status.kind === "dfu_recovery" || status.kind === "cancelling";
}

export function deriveFirmwarePath(status: FirmwareSessionStatus): FirmwareSessionPath | null {
  if (status.kind === "serial_primary") return "serial_primary";
  if (status.kind === "dfu_recovery") return "dfu_recovery";
  if (status.kind === "cancelling") return status.path;
  return null;
}

export function serialResultToStatus(result: SerialFlowResult): FirmwareSessionStatus {
  switch (result.result) {
    case "verified":
    case "reconnect_verified":
      return {
        kind: "completed",
        outcome: {
          path: "serial_primary",
          outcome: result.result === "verified" || ("flash_verified" in result && result.flash_verified)
            ? { result: "verified" }
            : { result: "flashed_but_unverified" },
        },
      };
    case "flashed_but_unverified":
    case "reconnect_failed":
      return {
        kind: "completed",
        outcome: { path: "serial_primary", outcome: { result: "flashed_but_unverified" } },
      };
    case "cancelled":
      return {
        kind: "completed",
        outcome: { path: "serial_primary", outcome: { result: "cancelled" } },
      };
    case "failed":
      return {
        kind: "completed",
        outcome: { path: "serial_primary", outcome: { result: "failed", reason: result.reason } },
      };
    case "board_detection_failed":
      return {
        kind: "completed",
        outcome: { path: "serial_primary", outcome: { result: "recovery_needed", reason: result.reason } },
      };
    case "extf_capacity_insufficient":
      return {
        kind: "completed",
        outcome: { path: "serial_primary", outcome: { result: "failed", reason: result.reason } },
      };
  }
}

export function dfuResultToStatus(result: DfuRecoveryResult): FirmwareSessionStatus {
  switch (result.result) {
    case "verified":
      return {
        kind: "completed",
        outcome: { path: "dfu_recovery", outcome: { result: "verified" } },
      };
    case "failed":
      return {
        kind: "completed",
        outcome: { path: "dfu_recovery", outcome: { result: "failed", reason: result.reason } },
      };
    case "cancelled":
      return {
        kind: "completed",
        outcome: { path: "dfu_recovery", outcome: { result: "cancelled" } },
      };
    case "reset_unconfirmed":
      return {
        kind: "completed",
        outcome: { path: "dfu_recovery", outcome: { result: "reset_unconfirmed" } },
      };
    case "driver_guidance":
      return {
        kind: "completed",
        outcome: { path: "dfu_recovery", outcome: { result: "unsupported_recovery_path", guidance: result.guidance } },
      };
    case "platform_unsupported":
      return {
        kind: "completed",
        outcome: { path: "dfu_recovery", outcome: { result: "unsupported_recovery_path", guidance: "DFU recovery is not supported on this platform" } },
      };
  }
}

/** Build a DfuRecoverySource from raw APJ file bytes (Rust extracts the BIN internally). */
export function buildDfuApjSource(apjBytes: number[]): DfuRecoverySource {
  return { kind: "local_apj_bytes", data: apjBytes };
}

/** Build a DfuRecoverySource from an official bootloader board target. */
export function buildDfuOfficialBootloaderSource(boardTarget: string): DfuRecoverySource {
  return { kind: "official_bootloader", board_target: boardTarget };
}

export function useFirmware() {
  const [rawSessionStatus, setRawSessionStatus] = useState<FirmwareSessionStatus>({ kind: "idle" });
  const [pendingStartPath, setPendingStartPath] = useState<FirmwareSessionPath | null>(null);
  const [progress, setProgress] = useState<FirmwareProgress | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionStatusRef = useRef<FirmwareSessionStatus>({ kind: "idle" });
  const pendingStartPathRef = useRef<FirmwareSessionPath | null>(null);
  const pendingCancelPathRef = useRef<FirmwareSessionPath | null>(null);

  const sessionStatus: FirmwareSessionStatus = pendingStartPath !== null && rawSessionStatus.kind === "idle"
    ? { kind: pendingStartPath, phase: "idle" }
    : rawSessionStatus;

  const isActive = isFirmwareActive(sessionStatus);
  const activePath = deriveFirmwarePath(sessionStatus);

  useEffect(() => {
    firmwareSessionStatus().then(setRawSessionStatus).catch(() => {});
  }, []);

  useEffect(() => {
    let stop: (() => void) | null = null;
    (async () => {
      stop = await subscribeFirmwareProgress(setProgress);
    })();
    return () => { stop?.(); };
  }, []);

  useEffect(() => {
    pollRef.current = setInterval(async () => {
      try {
        const nextStatus = await firmwareSessionStatus();
        if (nextStatus.kind !== "idle") {
          setPendingStartPath(null);
        }
        setRawSessionStatus((current) => {
          const pendingCancelPath = pendingCancelPathRef.current;
          if (
            current.kind === "cancelling"
            && pendingCancelPath !== null
            && ((nextStatus.kind === "serial_primary" && pendingCancelPath === "serial_primary")
              || (nextStatus.kind === "dfu_recovery" && pendingCancelPath === "dfu_recovery"))
          ) {
            return current;
          }
          if (nextStatus.kind === "idle" && (current.kind === "completed" || current.kind === "cancelling" || pendingStartPathRef.current !== null)) {
            return current;
          }
          if (nextStatus.kind === "completed" || nextStatus.kind === "idle") {
            pendingCancelPathRef.current = null;
          }
          return nextStatus;
        });
      } catch {
        // ignore poll errors
      }
    }, 1000);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    sessionStatusRef.current = sessionStatus;
  }, [sessionStatus]);

  useEffect(() => {
    pendingStartPathRef.current = pendingStartPath;
  }, [pendingStartPath]);

  const flashSerial = useCallback(
    async (
      port: string,
      baud: number,
      source: SerialFlashSource,
      options?: SerialFlashOptions,
    ): Promise<SerialFlowResult> => {
      setProgress(null);
      setPendingStartPath("serial_primary");
      pendingCancelPathRef.current = null;
      try {
        const result = await firmwareFlashSerial(port, baud, source, options);
        setPendingStartPath(null);
        pendingCancelPathRef.current = null;
        setRawSessionStatus(serialResultToStatus(result));
        return result;
      } catch (err) {
        setPendingStartPath(null);
        pendingCancelPathRef.current = null;
        const msg = typeof err === "string" ? err : err instanceof Error ? err.message : "unexpected error";
        toast.error("Serial flash failed", { description: msg });
        setRawSessionStatus({
          kind: "completed",
          outcome: { path: "serial_primary", outcome: { result: "failed", reason: msg } },
        });
        throw err;
      }
    },
    [],
  );

  const flashDfuRecovery = useCallback(
    async (device: DfuDeviceInfo, source: DfuRecoverySource): Promise<DfuRecoveryResult> => {
      setProgress(null);
      setPendingStartPath("dfu_recovery");
      pendingCancelPathRef.current = null;
      try {
        const result = await firmwareFlashDfuRecovery(device, source);
        setPendingStartPath(null);
        pendingCancelPathRef.current = null;
        setRawSessionStatus(dfuResultToStatus(result));
        return result;
      } catch (err) {
        setPendingStartPath(null);
        pendingCancelPathRef.current = null;
        const msg = typeof err === "string" ? err : err instanceof Error ? err.message : "unexpected error";
        toast.error("DFU recovery failed", { description: msg });
        setRawSessionStatus({
          kind: "completed",
          outcome: { path: "dfu_recovery", outcome: { result: "failed", reason: msg } },
        });
        throw err;
      }
    },
    [],
  );

  const cancel = useCallback(async () => {
    const previousStatus = sessionStatusRef.current;
    const previousPath = deriveFirmwarePath(previousStatus);
    try {
      if (previousPath) {
        pendingCancelPathRef.current = previousPath;
        setRawSessionStatus({ kind: "cancelling", path: previousPath });
      }
      await firmwareSessionCancel();
      setProgress(null);
      toast.success(
        previousPath === "dfu_recovery"
          ? "DFU cancellation requested; stopping at next checkpoint"
          : "Firmware cancellation requested",
      );
    } catch (err) {
      pendingCancelPathRef.current = null;
      setRawSessionStatus(previousStatus);
      toast.error("Failed to cancel firmware session", {
        description: typeof err === "string" ? err : err instanceof Error ? err.message : "unexpected error",
      });
    }
  }, []);

  const preflight = useCallback(async (): Promise<SerialPreflightInfo> => {
    return firmwareSerialPreflight();
  }, []);

  const serialReadiness = useCallback(
    async (request: SerialReadinessRequest): Promise<SerialReadinessResponse> => {
      return firmwareSerialReadiness(request);
    },
    [],
  );

  const listPorts = useCallback(async (): Promise<InventoryResult> => {
    return firmwareListPorts();
  }, []);

  const listDfuDevices = useCallback(async (): Promise<DfuScanResult> => {
    return firmwareListDfuDevices();
  }, []);

  const catalogTargets = useCallback(async (): Promise<CatalogTargetSummary[]> => {
    return firmwareCatalogTargets();
  }, []);

  const recoveryCatalogTargets = useCallback(async (): Promise<CatalogTargetSummary[]> => {
    return firmwareRecoveryCatalogTargets();
  }, []);

  const catalogEntries = useCallback(async (boardId: number, platform?: string): Promise<CatalogEntry[]> => {
    return firmwareCatalogEntries(boardId, platform);
  }, []);

  const flashDfuFromApj = useCallback(
    async (device: DfuDeviceInfo, apjBytes: number[]): Promise<DfuRecoveryResult> => {
      return flashDfuRecovery(device, buildDfuApjSource(apjBytes));
    },
    [flashDfuRecovery],
  );

  const flashDfuFromOfficialBootloader = useCallback(
    async (device: DfuDeviceInfo, boardTarget: string): Promise<DfuRecoveryResult> => {
      return flashDfuRecovery(device, buildDfuOfficialBootloaderSource(boardTarget));
    },
    [flashDfuRecovery],
  );

  const dismiss = useCallback(() => {
    setPendingStartPath(null);
    pendingCancelPathRef.current = null;
    setProgress(null);

    void firmwareSessionClearCompleted()
      .then(() => {
        setRawSessionStatus({ kind: "idle" });
      })
      .catch(() => {
        setRawSessionStatus((current) => current);
      });
  }, []);

  return {
    sessionStatus,
    progress,
    isActive,
    activePath,
    flashSerial,
    flashDfuRecovery,
    flashDfuFromApj,
    flashDfuFromOfficialBootloader,
    cancel,
    dismiss,
    preflight,
    serialReadiness,
    listPorts,
    listDfuDevices,
    catalogTargets,
    recoveryCatalogTargets,
    catalogEntries,
  };
}

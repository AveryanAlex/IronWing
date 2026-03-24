import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  firmwareSessionStatus,
  firmwareSessionCancel,
  firmwareFlashSerial,
  firmwareFlashDfuRecovery,
  firmwareSerialPreflight,
  firmwareRebootToBootloader,
  firmwareListPorts,
  firmwareListDfuDevices,
  firmwareCatalogEntries,
  firmwareCatalogTargets,
  subscribeFirmwareProgress,
  type FirmwareSessionStatus,
  type FirmwareProgress,
  type SerialFlashSource,
  type SerialFlowResult,
  type DfuDeviceInfo,
  type DfuRecoverySource,
  type DfuRecoveryResult,
  type SerialPreflightInfo,
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

export type FirmwareController = FirmwareState & {
  flashSerial: (port: string, baud: number, source: SerialFlashSource) => Promise<SerialFlowResult>;
  flashDfuRecovery: (device: DfuDeviceInfo, source: DfuRecoverySource) => Promise<DfuRecoveryResult>;
  flashDfuFromApj: (device: DfuDeviceInfo, apjBytes: number[]) => Promise<DfuRecoveryResult>;
  flashDfuFromCatalog: (device: DfuDeviceInfo, url: string) => Promise<DfuRecoveryResult>;
  cancel: () => Promise<void>;
  dismiss: () => void;
  preflight: () => Promise<SerialPreflightInfo>;
  rebootToBootloader: () => Promise<void>;
  listPorts: () => Promise<InventoryResult>;
  listDfuDevices: () => Promise<DfuScanResult>;
  catalogTargets: () => Promise<CatalogTargetSummary[]>;
  catalogEntries: (boardId: number, platform?: string) => Promise<CatalogEntry[]>;
};

export function isFirmwareActive(status: FirmwareSessionStatus): boolean {
  return status.kind === "serial_primary" || status.kind === "dfu_recovery";
}

export function deriveFirmwarePath(status: FirmwareSessionStatus): FirmwareSessionPath | null {
  if (status.kind === "serial_primary") return "serial_primary";
  if (status.kind === "dfu_recovery") return "dfu_recovery";
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

/** Build a DfuRecoverySource from a catalog firmware URL. */
export function buildDfuCatalogSource(url: string): DfuRecoverySource {
  return { kind: "catalog_url", url };
}

export function useFirmware(): FirmwareController {
  const [sessionStatus, setSessionStatus] = useState<FirmwareSessionStatus>({ kind: "idle" });
  const [progress, setProgress] = useState<FirmwareProgress | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isActive = isFirmwareActive(sessionStatus);
  const activePath = deriveFirmwarePath(sessionStatus);

  useEffect(() => {
    firmwareSessionStatus().then(setSessionStatus).catch(() => { /* best-effort poll; errors are transient */ });
  }, []);

  useEffect(() => {
    let stop: (() => void) | null = null;
    (async () => {
      stop = await subscribeFirmwareProgress(setProgress);
    })();
    return () => { stop?.(); };
  }, []);

  useEffect(() => {
    if (isActive) {
      pollRef.current = setInterval(async () => {
        try {
          setSessionStatus(await firmwareSessionStatus());
        } catch {
          // ignore poll errors
        }
      }, 1000);
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [isActive]);

  const flashSerial = useCallback(
    async (port: string, baud: number, source: SerialFlashSource): Promise<SerialFlowResult> => {
      setProgress(null);
      setSessionStatus({ kind: "serial_primary", phase: "idle" });
      try {
        const result = await firmwareFlashSerial(port, baud, source);
        setSessionStatus(serialResultToStatus(result));
        return result;
      } catch (err) {
        const msg = typeof err === "string" ? err : err instanceof Error ? err.message : "unexpected error";
        toast.error("Serial flash failed", { description: msg });
        setSessionStatus({
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
      setSessionStatus({ kind: "dfu_recovery", phase: "idle" });
      try {
        const result = await firmwareFlashDfuRecovery(device, source);
        setSessionStatus(dfuResultToStatus(result));
        return result;
      } catch (err) {
        const msg = typeof err === "string" ? err : err instanceof Error ? err.message : "unexpected error";
        toast.error("DFU recovery failed", { description: msg });
        setSessionStatus({
          kind: "completed",
          outcome: { path: "dfu_recovery", outcome: { result: "failed", reason: msg } },
        });
        throw err;
      }
    },
    [],
  );

  const cancel = useCallback(async () => {
    try {
      await firmwareSessionCancel();
      setSessionStatus({ kind: "idle" });
      setProgress(null);
      toast.success("Firmware session cancelled");
    } catch (err) {
      toast.error("Failed to cancel firmware session", {
        description: typeof err === "string" ? err : err instanceof Error ? err.message : "unexpected error",
      });
    }
  }, []);

  const preflight = useCallback(async (): Promise<SerialPreflightInfo> => {
    return firmwareSerialPreflight();
  }, []);

  const rebootToBootloader = useCallback(async (): Promise<void> => {
    return firmwareRebootToBootloader();
  }, []);

  const listPorts = useCallback(async (): Promise<InventoryResult> => {
    return firmwareListPorts();
  }, []);

  const listDfuDevices = useCallback(async (): Promise<DfuScanResult> => {
    return firmwareListDfuDevices();
  }, []);

  const catalogTargets = useCallback(async (): Promise<CatalogTargetSummary[]> => {
    return firmwareCatalogTargets();
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

  const flashDfuFromCatalog = useCallback(
    async (device: DfuDeviceInfo, url: string): Promise<DfuRecoveryResult> => {
      return flashDfuRecovery(device, buildDfuCatalogSource(url));
    },
    [flashDfuRecovery],
  );

  const dismiss = useCallback(() => {
    setSessionStatus({ kind: "idle" });
    setProgress(null);
  }, []);

  return {
    sessionStatus,
    progress,
    isActive,
    activePath,
    flashSerial,
    flashDfuRecovery,
    flashDfuFromApj,
    flashDfuFromCatalog,
    cancel,
    dismiss,
    preflight,
    rebootToBootloader,
    listPorts,
    listDfuDevices,
    catalogTargets,
    catalogEntries,
  };
}

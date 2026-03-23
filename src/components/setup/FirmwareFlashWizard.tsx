import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  Upload,
  FolderOpen,
  AlertTriangle,
  Loader2,
  Shield,
  Usb,
  RefreshCw,
  HardDrive,
  CheckCircle2,
  XCircle,
  Info,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { toast } from "sonner";
import type { useFirmware } from "../../hooks/use-firmware";
import type {
  PortInfo,
  DfuDeviceInfo,
  CatalogEntry,
  CatalogTargetSummary,
  SerialFlashOutcome,
  SerialReadinessRequest,
  SerialReadinessResponse,
} from "../../firmware";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type FirmwareFlashWizardProps = {
  firmware: ReturnType<typeof useFirmware>;
  connected: boolean;
  onSaveParams?: () => Promise<void>;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BAUD_RATES = [115200, 57600, 230400, 460800, 921600];
const EMPTY_BYTES: number[] = [];

// ---------------------------------------------------------------------------
// Progress bar
// ---------------------------------------------------------------------------

function ProgressBar({ pct, label }: { pct: number; label: string }) {
  return (
    <div data-testid="firmware-progress-bar" className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-[10px]">
        <span className="font-medium text-text-secondary">{label}</span>
        <span className="tabular-nums text-text-muted">{Math.round(pct)}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-bg-tertiary">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Outcome banner
// ---------------------------------------------------------------------------

function OutcomeBanner({ kind, message }: { kind: "success" | "warning" | "error"; message: string }) {
  const cfg = {
    success: { bg: "bg-success/10 border-success/30", Icon: CheckCircle2, color: "text-success" },
    warning: { bg: "bg-warning/10 border-warning/30", Icon: AlertTriangle, color: "text-warning" },
    error: { bg: "bg-danger/10 border-danger/30", Icon: XCircle, color: "text-danger" },
  }[kind];

  return (
    <div className={cn("flex items-start gap-2.5 rounded-lg border p-3", cfg.bg)}>
      <cfg.Icon size={16} className={cn("mt-0.5 shrink-0", cfg.color)} />
      <span className={cn("text-xs leading-relaxed", cfg.color)}>{message}</span>
    </div>
  );
}

function serialOutcomeBanner(outcome: SerialFlashOutcome): { kind: "success" | "warning" | "error"; message: string } {
  switch (outcome.result) {
    case "verified":
      return {
        kind: "success",
        message: "Firmware flashed and verified successfully. The flight controller is ready.",
      };
    case "reconnect_verified":
      return outcome.flash_verified
        ? {
            kind: "success",
            message: "Firmware flashed and verified successfully. The board reconnected after flashing and is ready.",
          }
        : {
            kind: "warning",
            message: "Firmware was written and the board reconnected after flashing, but the flash could not be verified (bootloader does not support CRC check). Power-cycle the board to confirm.",
          };
    case "cancelled":
      return {
        kind: "warning",
        message: "Serial flash cancelled before completion.",
      };
    case "flashed_but_unverified":
      return {
        kind: "warning",
        message: "Firmware was written but could not be verified (bootloader does not support CRC check). Power-cycle the board to confirm.",
      };
    case "reconnect_failed":
      return {
        kind: "warning",
        message: `Firmware was written, but reconnect verification failed: ${outcome.reconnect_error}. Power-cycle the board to confirm.`,
      };
    case "failed":
      return {
        kind: "error",
        message: `Flash failed: ${outcome.reason}`,
      };
    case "board_detection_failed":
      return {
        kind: "error",
        message: `Board detection failed: ${outcome.reason}. If the board is unresponsive, try DFU recovery mode below.`,
      };
    case "extf_capacity_insufficient":
      return {
        kind: "error",
        message: `The selected firmware requires more external flash capacity than this board provides: ${outcome.reason}. Use a build without the external-flash payload or perform a full-chip erase only on supported hardware.`,
      };
  }
}

// ---------------------------------------------------------------------------
// Extf detection (APJ files are JSON with an optional extf_image field)
// ---------------------------------------------------------------------------

function checkApjHasExtf(apjBytes: number[]): boolean {
  try {
    const json = JSON.parse(new TextDecoder().decode(new Uint8Array(apjBytes)));
    if (typeof json.extf_image !== "string" || json.extf_image.length === 0) return false;
    const declaredSize = typeof json.extf_image_size === "number" ? json.extf_image_size : 0;
    return declaredSize > 0;
  } catch {
    return false;
  }
}

function fnv1a64(bytes: number[]): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

function serialReadinessRequestToken(request: SerialReadinessRequest): string {
  const encoder = new TextEncoder();
  const sourceIdentity = request.source.kind === "catalog_url"
    ? `${request.source.url.length}-${fnv1a64([...encoder.encode(request.source.url)])}`
    : `${request.source.data.length}-${fnv1a64(request.source.data)}`;

  return `serial-readiness:port=${request.port}:source_kind=${request.source.kind}:source_identity=${sourceIdentity}:full_chip_erase=${request.options?.full_chip_erase ? 1 : 0}`;
}

// ---------------------------------------------------------------------------
// Wizard
// ---------------------------------------------------------------------------

export function FirmwareFlashWizard({ firmware, connected, onSaveParams }: FirmwareFlashWizardProps) {
  const {
    sessionStatus,
    progress,
    isActive,
    flashSerial,
    flashDfuRecovery,
    flashDfuFromApj,
    cancel,
    dismiss,
    preflight,
    serialReadiness,
    listPorts,
    listDfuDevices,
    catalogTargets,
    recoveryCatalogTargets,
    catalogEntries,
  } = firmware;

  // ── Mode selection ────────────────────────────────────────────────────
  const [wizardMode, setWizardMode] = useState<"install" | "recover">("install");

  // ── Serial local state ────────────────────────────────────────────────
  const [ports, setPorts] = useState<PortInfo[]>([]);
  const [selectedPort, setSelectedPort] = useState("");
  const [selectedBaud, setSelectedBaud] = useState(115200);
  const [sourceMode, setSourceMode] = useState<"catalog" | "local">("catalog");
  const [fullChipErase, setFullChipErase] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogList, setCatalogList] = useState<CatalogEntry[]>([]);
  const [selectedCatalogIdx, setSelectedCatalogIdx] = useState(0);
  const [catalogTargetsList, setCatalogTargetsList] = useState<CatalogTargetSummary[]>([]);
  const [catalogTargetsLoading, setCatalogTargetsLoading] = useState(false);
  const [selectedCatalogTargetIdx, setSelectedCatalogTargetIdx] = useState<number | null>(null);
  const [detectedBoardId, setDetectedBoardId] = useState<number | null>(null);
  const [detectedBoardHintNeedsManualFallback, setDetectedBoardHintNeedsManualFallback] = useState(false);
  const [localApjData, setLocalApjData] = useState<number[] | null>(null);
  const [localApjName, setLocalApjName] = useState<string | null>(null);
  const [portsLoading, setPortsLoading] = useState(false);
  const [paramsSaved, setParamsSaved] = useState(false);
  const [serialReady, setSerialReady] = useState<boolean>(false);
  const [serialReadyLoading, setSerialReadyLoading] = useState(false);
  const [serialReadinessInfo, setSerialReadinessInfo] = useState<SerialReadinessResponse | null>(null);
  const [serialReadinessRefreshKey, setSerialReadinessRefreshKey] = useState(0);

  // ── DFU local state ───────────────────────────────────────────────────
  const [dfuConfirmed, setDfuConfirmed] = useState(false);
  const [dfuDevices, setDfuDevices] = useState<DfuDeviceInfo[]>([]);
  const [selectedDfuUniqueId, setSelectedDfuUniqueId] = useState<string | null>(null);
  const [dfuBinData, setDfuBinData] = useState<number[] | null>(null);
  const [dfuBinName, setDfuBinName] = useState<string | null>(null);
  const [dfuDevicesLoading, setDfuDevicesLoading] = useState(false);
  const [showManualRecovery, setShowManualRecovery] = useState(false);
  const [manualRecoveryMode, setManualRecoveryMode] = useState<"local_apj" | "local_bin">("local_apj");
  const [manualRecoveryConfirmed, setManualRecoveryConfirmed] = useState(false);

  // ── Recovery catalog state ────────────────────────────────────────────
  const [recoveryTargets, setRecoveryTargets] = useState<CatalogTargetSummary[]>([]);
  const [recoveryTargetsLoading, setRecoveryTargetsLoading] = useState(false);
  const [selectedRecoveryTarget, setSelectedRecoveryTarget] = useState<number | null>(null);
  const [recoveryLocalApjData, setRecoveryLocalApjData] = useState<number[] | null>(null);
  const [recoveryLocalApjName, setRecoveryLocalApjName] = useState<string | null>(null);

  // ── Extf blocking state ───────────────────────────────────────────────
  const [extfBlocked, setExtfBlocked] = useState<string | null>(null);
  const [postDfuRecoveryGuidance, setPostDfuRecoveryGuidance] = useState(false);
  const catalogRequestIdRef = useRef(0);
  const autoHandledDfuVerifiedRef = useRef(false);

  // ── Refresh helpers ───────────────────────────────────────────────────
  const refreshPorts = useCallback(async () => {
    const reconcileSelectedPort = (nextPorts: PortInfo[]) => {
      setSelectedPort((current) => {
        if (current && nextPorts.some((port) => port.port_name === current)) {
          return current;
        }

        return nextPorts[0]?.port_name ?? "";
      });
    };

    setPortsLoading(true);
    try {
      const info = await preflight();
      setPorts(info.available_ports);
      reconcileSelectedPort(info.available_ports);
    } catch {
      try {
        const result = await listPorts();
        if (result.kind === "available") {
          setPorts(result.ports);
          reconcileSelectedPort(result.ports);
        }
      } catch {}
    } finally {
      setPortsLoading(false);
      setSerialReadinessRefreshKey((current) => current + 1);
    }
  }, [preflight, listPorts]);

  const refreshDfuDevices = useCallback(async () => {
    setDfuDevicesLoading(true);
    try {
      const result = await listDfuDevices();
      if (result.kind === "available") {
        setDfuDevices(result.devices);
        setSelectedDfuUniqueId((current) => {
          if (current && result.devices.some((device) => device.unique_id === current)) {
            return current;
          }

          return result.devices[0]?.unique_id ?? null;
        });
      }
    } finally {
      setDfuDevicesLoading(false);
    }
  }, [listDfuDevices]);

  useEffect(() => {
    refreshPorts();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (detectedBoardId === null) {
      setDetectedBoardHintNeedsManualFallback(false);
      return;
    }

    if (detectedBoardId && detectedBoardId > 0) {
      fetchCatalog(detectedBoardId, undefined, "detected_hint");
    }
  }, [detectedBoardId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setDetectedBoardId(null);
    setDetectedBoardHintNeedsManualFallback(false);
    setCatalogList([]);
    setSelectedCatalogIdx(0);
    setSelectedCatalogTargetIdx(null);
  }, [selectedPort]);

  // Scan for DFU devices and fetch recovery targets when entering recovery mode
  useEffect(() => {
    if (wizardMode === "recover") {
      refreshDfuDevices();
      fetchRecoveryTargets();
    }
  }, [wizardMode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!showManualRecovery || manualRecoveryMode !== "local_apj") {
      setExtfBlocked(null);
      return;
    }

    setExtfBlocked(null);

    if (recoveryLocalApjData && checkApjHasExtf(recoveryLocalApjData)) {
      setExtfBlocked(
        "This APJ contains an external-flash payload; DFU recovery can only write internal flash.",
      );
    }
  }, [manualRecoveryMode, recoveryLocalApjData, showManualRecovery]);

  useEffect(() => {
    setManualRecoveryConfirmed(false);
  }, [manualRecoveryMode, recoveryLocalApjData, dfuBinData]);

  // ── File pickers ──────────────────────────────────────────────────────
  const pickApjFile = useCallback(async () => {
    const path = await open({
      filters: [{ name: "APJ Firmware", extensions: ["apj"] }],
      multiple: false,
    });
    if (path && typeof path === "string") {
      const bytes = await readFile(path);
      setLocalApjData(Array.from(bytes));
      setLocalApjName(path.split(/[\\/]/).pop() ?? path);
    }
  }, []);

  const pickRecoveryApjFile = useCallback(async () => {
    const path = await open({
      filters: [{ name: "APJ Firmware", extensions: ["apj"] }],
      multiple: false,
    });
    if (path && typeof path === "string") {
      const bytes = await readFile(path);
      setRecoveryLocalApjData(Array.from(bytes));
      setRecoveryLocalApjName(path.split(/[\\/]/).pop() ?? path);
      setManualRecoveryConfirmed(false);
    }
  }, []);

  const pickBinFile = useCallback(async () => {
    const path = await open({
      filters: [{ name: "BIN Firmware", extensions: ["bin"] }],
      multiple: false,
    });
    if (path && typeof path === "string") {
      const bytes = await readFile(path);
      setDfuBinData(Array.from(bytes));
      setDfuBinName(path.split(/[\\/]/).pop() ?? path);
      setManualRecoveryConfirmed(false);
    }
  }, []);

  const loadCatalogTargets = useCallback(async () => {
    setCatalogTargetsLoading(true);
    try {
      const targets = await catalogTargets();
      setCatalogTargetsList(targets);
      setSelectedCatalogTargetIdx(null);
      setCatalogList([]);
      setSelectedCatalogIdx(0);
    } catch {
      setCatalogTargetsList([]);
      setCatalogList([]);
      setSelectedCatalogIdx(0);
      setSelectedCatalogTargetIdx(null);
    } finally {
      setCatalogTargetsLoading(false);
    }
  }, [catalogTargets]);

  // ── Catalog fetch (serial path) ───────────────────────────────────────
  const fetchCatalog = useCallback(async (boardId: number, platform?: string, source: "manual" | "detected_hint" = "manual") => {
    if (boardId <= 0) return;
    const requestId = ++catalogRequestIdRef.current;
    setCatalogLoading(true);
    try {
      const entries = await catalogEntries(boardId, platform);
      if (catalogRequestIdRef.current !== requestId) return;
      setCatalogList(entries);
      setSelectedCatalogIdx(0);
      if (source === "detected_hint" && entries.length === 0) {
        setDetectedBoardHintNeedsManualFallback(true);
        await loadCatalogTargets();
      } else if (source === "detected_hint") {
        setDetectedBoardHintNeedsManualFallback(false);
      }
    } catch (err) {
      if (catalogRequestIdRef.current !== requestId) return;
      toast.error("Failed to load catalog", {
        description: typeof err === "string" ? err : err instanceof Error ? err.message : "unknown error",
      });
      setCatalogList([]);
      if (source === "detected_hint") {
        setDetectedBoardHintNeedsManualFallback(true);
        await loadCatalogTargets();
      }
    } finally {
      if (catalogRequestIdRef.current === requestId) {
        setCatalogLoading(false);
      }
    }
  }, [catalogEntries, loadCatalogTargets]);

  useEffect(() => {
    if (sourceMode !== "catalog" || detectedBoardId !== null) {
      return;
    }

    void loadCatalogTargets();
  }, [detectedBoardId, loadCatalogTargets, selectedPort, sourceMode]);

  // ── Recovery target fetch ─────────────────────────────────────────────
  const fetchRecoveryTargets = useCallback(async () => {
    setRecoveryTargetsLoading(true);
    try {
      const targets = await recoveryCatalogTargets();
      setRecoveryTargets(targets);
      setSelectedRecoveryTarget(null);
    } catch {
      setRecoveryTargets([]);
      setSelectedRecoveryTarget(null);
    } finally {
      setRecoveryTargetsLoading(false);
    }
  }, [recoveryCatalogTargets]);

  // ── Serial action ─────────────────────────────────────────────────────
  const selectedCatalogEntry = catalogList[selectedCatalogIdx] ?? null;
  const selectedCatalogUrl = selectedCatalogEntry?.url ?? "";
  const hasSerialInputs = !!selectedPort && (
    (sourceMode === "catalog" && selectedCatalogEntry !== null) ||
    (sourceMode === "local" && localApjData !== null)
  );

  const serialReadinessRequest = useMemo(() => (
    sourceMode === "catalog"
      ? { port: selectedPort, source: { kind: "catalog_url" as const, url: selectedCatalogUrl }, options: { full_chip_erase: fullChipErase } }
      : { port: selectedPort, source: { kind: "local_apj_bytes" as const, data: localApjData ?? EMPTY_BYTES }, options: { full_chip_erase: fullChipErase } }
  ), [fullChipErase, localApjData, selectedCatalogUrl, selectedPort, sourceMode]);

  const expectedSerialReadinessToken = useMemo(
    () => serialReadinessRequestToken(
      sourceMode === "catalog"
        ? { port: selectedPort, source: { kind: "catalog_url", url: selectedCatalogUrl }, options: { full_chip_erase: fullChipErase } }
        : { port: selectedPort, source: { kind: "local_apj_bytes", data: localApjData ?? EMPTY_BYTES }, options: { full_chip_erase: fullChipErase } },
    ),
    [fullChipErase, localApjData, selectedCatalogUrl, selectedPort, sourceMode],
  );
  const hasFreshSerialReadiness = serialReadinessInfo?.request_token === expectedSerialReadinessToken;

  const canStartSerial = hasSerialInputs && serialReady && hasFreshSerialReadiness;

  const handleStartSerial = useCallback(async () => {
    if (!canStartSerial) return;
    const source = sourceMode === "catalog" && selectedCatalogEntry
      ? { kind: "catalog_url" as const, url: selectedCatalogEntry.url }
      : { kind: "local_apj_bytes" as const, data: localApjData! };
    try {
      await flashSerial(selectedPort, selectedBaud, source, { full_chip_erase: fullChipErase });
    } catch {
      // error toasts handled by hook
    }
  }, [canStartSerial, sourceMode, selectedCatalogEntry, localApjData, flashSerial, selectedPort, selectedBaud, fullChipErase]);

  // ── DFU action ────────────────────────────────────────────────────────
  const selectedRecoveryBoardTarget = selectedRecoveryTarget === null
    ? null
    : recoveryTargets[selectedRecoveryTarget]?.platform ?? null;
  const isManualRecovery = showManualRecovery;
  const hasManualSource = manualRecoveryMode === "local_apj" ? recoveryLocalApjData !== null : dfuBinData !== null;
  const selectedDfuDevice = useMemo(
    () => dfuDevices.find((device) => device.unique_id === selectedDfuUniqueId) ?? null,
    [dfuDevices, selectedDfuUniqueId],
  );
  const canStartDfu = dfuConfirmed && selectedDfuDevice !== null && !extfBlocked && (
    isManualRecovery
      ? hasManualSource && manualRecoveryConfirmed
      : selectedRecoveryBoardTarget !== null
  );

  const handleStartDfu = useCallback(async () => {
    if (!canStartDfu) return;
    const device = selectedDfuDevice;
    if (!device) return;
    try {
      let result;
      if (!isManualRecovery && selectedRecoveryBoardTarget) {
        result = await flashDfuRecovery(device, {
          kind: "official_bootloader",
          board_target: selectedRecoveryBoardTarget,
        });
      } else if (manualRecoveryMode === "local_apj" && recoveryLocalApjData) {
        result = await flashDfuFromApj(device, recoveryLocalApjData);
      } else {
        result = await flashDfuRecovery(device, { kind: "local_bin_bytes", data: dfuBinData! });
      }
      // Check for extf blocking on failed results
      if (result.result === "failed" && result.reason.toLowerCase().includes("external-flash")) {
        setExtfBlocked(result.reason);
      }
    } catch {
      // error toasts handled by hook
    }
  }, [canStartDfu, selectedDfuDevice, isManualRecovery, selectedRecoveryBoardTarget, manualRecoveryMode, recoveryLocalApjData, dfuBinData, flashDfuFromApj, flashDfuRecovery]);

  // ── Derived state ─────────────────────────────────────────────────────
  const isSerialActive = sessionStatus.kind === "serial_primary";
  const isDfuActive = sessionStatus.kind === "dfu_recovery";
  const isSerialCancelling = sessionStatus.kind === "cancelling" && sessionStatus.path === "serial_primary";
  const isDfuCancelling = sessionStatus.kind === "cancelling" && sessionStatus.path === "dfu_recovery";
  const isCompleted = sessionStatus.kind === "completed";
  const serialCompleted = isCompleted && sessionStatus.outcome.path === "serial_primary";
  const dfuCompleted = isCompleted && sessionStatus.outcome.path === "dfu_recovery";

  const serialOutcome: SerialFlashOutcome | null = serialCompleted
    ? sessionStatus.outcome.outcome as SerialFlashOutcome
    : null;
  const dfuOutcome = dfuCompleted ? sessionStatus.outcome.outcome : null;
  const dfuVerifiedCompleted = dfuCompleted && dfuOutcome?.result === "verified";
  const serialOutcomeBannerConfig = serialOutcome ? serialOutcomeBanner(serialOutcome) : null;

  const driverGuidance = dfuOutcome && "guidance" in dfuOutcome
    ? dfuOutcome.guidance
    : null;

  const effectiveMode: "install" | "recover" =
    isSerialActive || isSerialCancelling || serialCompleted ? "install"
    : isDfuActive || isDfuCancelling || dfuCompleted ? "recover"
    : wizardMode;

  const modeLocked = isSerialActive || isSerialCancelling || isDfuActive || isDfuCancelling || isCompleted;

  useEffect(() => {
    let cancelled = false;
    const request = serialReadinessRequest;
    const expectedToken = expectedSerialReadinessToken;

    if (effectiveMode !== "install" || isSerialActive || isSerialCancelling || serialCompleted) {
      return;
    }

    setSerialReadyLoading(true);
    serialReadiness(request)
      .then((result) => {
        if (cancelled) return;

        if (result.request_token !== expectedToken) {
          setSerialReadinessInfo(null);
          setSerialReady(false);
          setDetectedBoardId(null);
          return;
        }

        setSerialReadinessInfo(result);
        setSerialReady(result.readiness.kind === "advisory");
        if (result.target_hint?.detected_board_id !== null && result.target_hint?.detected_board_id !== undefined) {
          setDetectedBoardId(result.target_hint.detected_board_id);
        } else {
          setDetectedBoardId(null);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setSerialReadinessInfo(null);
        setSerialReady(false);
      })
      .finally(() => {
        if (!cancelled) setSerialReadyLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [connected, effectiveMode, expectedSerialReadinessToken, isSerialActive, isSerialCancelling, ports, serialCompleted, serialReadiness, serialReadinessRefreshKey]);

  useEffect(() => {
    if (!dfuVerifiedCompleted) {
      autoHandledDfuVerifiedRef.current = false;
      return;
    }

    if (autoHandledDfuVerifiedRef.current) {
      return;
    }

    autoHandledDfuVerifiedRef.current = true;
    setPostDfuRecoveryGuidance(true);
    setWizardMode("install");
    dismiss();
    void refreshPorts();
  }, [dfuVerifiedCompleted, dismiss, refreshPorts]);

  useEffect(() => {
    if (isSerialActive || isSerialCancelling || serialCompleted) {
      setPostDfuRecoveryGuidance(false);
    }
  }, [isSerialActive, isSerialCancelling, serialCompleted]);

  const serialReadinessBlockedReason = serialReadinessInfo?.readiness.kind === "blocked"
    ? serialReadinessInfo.readiness.reason
    : null;

  const serialBlockedMessage = serialReadinessInfo?.validation_pending
    ? "Serial readiness validation is still pending."
    : serialReadinessBlockedReason === "session_busy"
      ? "Another firmware session is already active."
      : serialReadinessBlockedReason === "port_unselected"
        ? "Select a serial port to continue."
        : serialReadinessBlockedReason === "port_unavailable"
          ? "The selected serial port is not currently available."
          : serialReadinessBlockedReason === "source_missing"
            ? "Choose a firmware source before starting the flash."
            : "Serial flash is not ready yet.";

  const serialTransitionMessage = serialReadinessInfo?.bootloader_transition?.kind === "auto_reboot_supported"
    ? "This target will auto-reboot into bootloader when flashing starts because the active MAVLink serial link safely matches the selected port."
    : serialReadinessInfo?.bootloader_transition?.kind === "already_in_bootloader"
      ? "This target is already in bootloader, so flashing can begin without an extra reboot step."
      : serialReadinessInfo?.bootloader_transition?.kind === "target_mismatch"
        ? "The backend cannot safely prove the active MAVLink link matches this serial port, so it will not auto-reboot the board. Enter bootloader manually if needed, then start the flash."
        : "This target requires manual bootloader entry before flashing unless it is already rebooted there. If the port changes, refresh and keep this port selected.";

  const serialValidationMessage = serialReadinessInfo?.validation_pending
    ? "Firmware compatibility will be validated after bootloader sync before erase/program begins."
    : null;

  // =====================================================================
  // RENDER
  // =====================================================================
  return (
    <div className="flex flex-col gap-4">
      {/* ================================================================ */}
      {/* MODE SELECTOR                                                     */}
      {/* ================================================================ */}
      <div className="flex gap-1 rounded-lg border border-border bg-bg-tertiary/30 p-1">
        <button
          data-testid="firmware-mode-install"
          disabled={modeLocked}
          onClick={() => setWizardMode("install")}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-semibold transition-colors",
            effectiveMode === "install"
              ? "bg-accent/10 text-accent border border-accent/30"
              : "text-text-secondary hover:bg-bg-tertiary border border-transparent",
            modeLocked && "opacity-50 cursor-not-allowed",
          )}
        >
          <HardDrive size={14} />
          Install / Update
        </button>
        <button
          data-testid="firmware-mode-recover"
          disabled={modeLocked}
          onClick={() => setWizardMode("recover")}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-semibold transition-colors",
            effectiveMode === "recover"
              ? "bg-warning/10 text-warning border border-warning/30"
              : "text-text-secondary hover:bg-bg-tertiary border border-transparent",
            modeLocked && "opacity-50 cursor-not-allowed",
          )}
        >
          <Shield size={14} />
          Recover via DFU
        </button>
      </div>

      {/* ================================================================ */}
      {/* INSTALL / UPDATE (Serial Primary) PANEL                           */}
      {/* ================================================================ */}
      {effectiveMode === "install" && (
        <div data-testid="firmware-serial-panel" className="rounded-lg border border-border bg-bg-tertiary/30">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
            <HardDrive size={14} className="text-accent" />
            <h4 className="text-xs font-semibold text-text-primary">Serial Bootloader Flash</h4>
            <span className="ml-auto rounded-full bg-accent/10 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider text-accent">
              Recommended
            </span>
          </div>

          <div className="flex flex-col gap-3 p-3">
            {/* ── Active / progress ── */}
            {(isSerialActive || isSerialCancelling) && (
              <>
                <div className="flex items-center gap-2 text-xs text-text-secondary">
                  <Loader2 size={14} className="animate-spin text-accent" />
                  <span>{isSerialCancelling ? "Cancellation requested… waiting for serial flash to stop." : "Flashing in progress…"}</span>
                </div>
                {progress && (
                  <ProgressBar pct={progress.pct} label={progress.phase_label} />
                )}
                {!isSerialCancelling && (
                  <button
                    onClick={cancel}
                    className="self-start rounded-md border border-border bg-bg-secondary px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-tertiary"
                  >
                    Cancel
                  </button>
                )}
              </>
            )}

            {/* ── Completed outcome ── */}
            {serialCompleted && serialOutcome && (
              <>
                {serialOutcomeBannerConfig && (
                  <OutcomeBanner kind={serialOutcomeBannerConfig.kind} message={serialOutcomeBannerConfig.message} />
                )}
                <button
                  onClick={dismiss}
                  className="self-start rounded-md border border-border bg-bg-secondary px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-tertiary"
                >
                  Flash Again
                </button>
              </>
            )}

            {/* ── Idle: source + port selection ── */}
            {!isSerialActive && !isSerialCancelling && !serialCompleted && (
              <>
                {postDfuRecoveryGuidance && (
                  <OutcomeBanner
                    kind="success"
                    message="Bootloader recovery completed. Continue here with Install / Update to flash normal firmware."
                  />
                )}

                {/* Port selection */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                    Serial Port
                  </label>
                  <div className="flex items-center gap-1.5">
                    <select
                      value={selectedPort}
                      onChange={(e) => setSelectedPort(e.target.value)}
                      className="flex-1 rounded-md border border-border bg-bg-secondary px-2 py-1.5 text-xs text-text-primary"
                      disabled={isActive}
                    >
                      {ports.length === 0 && <option value="">No ports found</option>}
                      {ports.map((p) => (
                        <option key={p.port_name} value={p.port_name}>
                          {p.port_name}{p.product ? ` — ${p.product}` : ""}
                        </option>
                      ))}
                    </select>
                    <select
                      value={selectedBaud}
                      onChange={(e) => setSelectedBaud(Number(e.target.value))}
                      className="w-24 rounded-md border border-border bg-bg-secondary px-2 py-1.5 text-xs text-text-primary"
                      disabled={isActive}
                    >
                      {BAUD_RATES.map((b) => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                    <button
                      onClick={refreshPorts}
                      disabled={portsLoading}
                      className="rounded-md border border-border bg-bg-secondary p-1.5 text-text-muted transition-colors hover:text-text-primary disabled:opacity-40"
                      title="Refresh ports"
                    >
                      <RefreshCw size={12} className={portsLoading ? "animate-spin" : ""} />
                    </button>
                  </div>
                </div>

                {/* Source selection */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                    Firmware Source
                  </label>
                  <div className="flex gap-1">
                    <button
                      data-testid="firmware-source-catalog"
                      onClick={() => setSourceMode("catalog")}
                      className={cn(
                        "flex-1 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                        sourceMode === "catalog"
                          ? "border-accent/50 bg-accent/10 text-accent"
                          : "border-border bg-bg-secondary text-text-secondary hover:bg-bg-tertiary",
                      )}
                    >
                      Official Catalog
                    </button>
                    <button
                      data-testid="firmware-source-local-apj"
                      onClick={() => setSourceMode("local")}
                      className={cn(
                        "flex-1 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                        sourceMode === "local"
                          ? "border-accent/50 bg-accent/10 text-accent"
                          : "border-border bg-bg-secondary text-text-secondary hover:bg-bg-tertiary",
                      )}
                    >
                      Local File (.apj)
                    </button>
                  </div>

                  {sourceMode === "catalog" && (
                    <div className="flex flex-col gap-1.5 rounded-md border border-border/50 bg-bg-secondary/50 p-2.5">
                      {detectedBoardId !== null ? (
                        <div className="flex items-center gap-1.5 rounded-md border border-accent/30 bg-accent/5 px-2.5 py-1.5">
                          <CheckCircle2 size={10} className="text-accent" />
                          <span className="text-xs text-text-primary">
                            Board ID <span className="font-mono font-semibold">{detectedBoardId}</span> detected
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-start gap-1.5 text-[10px] text-text-muted">
                          <Info size={10} className="shrink-0" />
                          <span>
                            No USB board hint is available yet. You can still select a target manually and the backend will validate the real board after bootloader sync before erase/program begins.
                          </span>
                        </div>
                      )}
                      {(detectedBoardId === null || detectedBoardHintNeedsManualFallback) && (
                        <>
                          {detectedBoardHintNeedsManualFallback && (
                            <div className="flex items-start gap-1.5 text-[10px] text-text-muted">
                              <Info size={10} className="shrink-0" />
                              <span>
                                No usable catalog entries were found for detected board ID {detectedBoardId}. Choose a target manually below and the backend will still validate the real board after bootloader sync before erase/program begins.
                              </span>
                            </div>
                          )}
                          {catalogTargetsLoading && (
                            <div className="flex items-center gap-1.5 text-[10px] text-text-muted">
                              <Loader2 size={10} className="animate-spin" />
                              <span>Loading supported targets…</span>
                            </div>
                          )}
                          <select
                            data-testid="firmware-catalog-target-select"
                            value={selectedCatalogTargetIdx ?? ""}
                            onChange={(e) => {
                              const rawValue = e.target.value;
                              if (rawValue === "") {
                                setSelectedCatalogTargetIdx(null);
                                setCatalogList([]);
                                setSelectedCatalogIdx(0);
                                return;
                              }

                              const nextIdx = Number(rawValue);
                              setSelectedCatalogTargetIdx(nextIdx);
                              const nextTarget = catalogTargetsList[nextIdx];
                              if (nextTarget) {
                                fetchCatalog(nextTarget.board_id, nextTarget.platform, "manual");
                              }
                            }}
                            className="rounded-md border border-border bg-bg-primary px-2 py-1.5 text-xs text-text-primary"
                            disabled={isActive || catalogTargetsLoading || catalogTargetsList.length === 0}
                          >
                            <option value="">
                              {catalogTargetsLoading ? "Loading targets…" : catalogTargetsList.length > 0 ? "Choose target…" : "No targets available"}
                            </option>
                            {catalogTargetsList.map((target, i) => (
                              <option key={`${target.board_id}-${target.platform}`} value={i}>
                                {target.platform}
                                {target.brand_name ? ` — ${target.brand_name}` : ""}
                                {target.latest_version ? ` (${target.latest_version})` : ""}
                              </option>
                            ))}
                          </select>
                        </>
                      )}
                      {catalogLoading && (
                        <div className="flex items-center gap-1.5 text-[10px] text-text-muted">
                          <Loader2 size={10} className="animate-spin" />
                          <span>Loading catalog…</span>
                        </div>
                      )}
                      {catalogList.length > 0 && (
                        <select
                          data-testid="firmware-catalog-select"
                          value={selectedCatalogIdx}
                          onChange={(e) => setSelectedCatalogIdx(Number(e.target.value))}
                          className="rounded-md border border-border bg-bg-primary px-2 py-1.5 text-xs text-text-primary"
                          disabled={isActive}
                        >
                          {catalogList.map((entry, i) => (
                            <option key={i} value={i}>
                              {entry.vehicle_type} {entry.version} — {entry.platform}
                              {entry.latest ? " (latest)" : ""}
                              {entry.brand_name ? ` [${entry.brand_name}]` : ""}
                            </option>
                          ))}
                        </select>
                      )}
                      {catalogList.length === 0 && !catalogLoading && detectedBoardId !== null && !detectedBoardHintNeedsManualFallback && (
                        <div className="flex items-start gap-2 text-[10px] text-text-muted">
                          <Info size={10} className="mt-0.5 shrink-0" />
                          <span>No firmware found for board ID {detectedBoardId}</span>
                        </div>
                      )}
                      {catalogList.length === 0 && !catalogLoading && detectedBoardId === null && (
                        <div className="flex items-start gap-2 text-[10px] text-text-muted">
                          <Info size={10} className="mt-0.5 shrink-0" />
                          <span>
                            {catalogTargetsList.length > 0
                              ? "Select a target above to keep the serial install path usable without USB hinting. Catalog flashing will stay blocked until you explicitly choose one."
                              : "No USB hint is available yet. Refresh ports or choose a local APJ if you do not want to wait for a manual catalog target list."}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {sourceMode === "local" && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={pickApjFile}
                        disabled={isActive}
                        className="flex items-center gap-1.5 rounded-md border border-border bg-bg-secondary px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-tertiary disabled:opacity-40"
                      >
                        <FolderOpen size={12} />
                        Choose .apj file
                      </button>
                      {localApjName && (
                        <span className="truncate text-[10px] text-text-muted" title={localApjName}>
                          {localApjName}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <label className="flex items-start gap-2 cursor-pointer select-none rounded-md border border-border/50 bg-bg-secondary/40 px-2.5 py-2">
                  <input
                    data-testid="firmware-full-chip-erase"
                    type="checkbox"
                    checked={fullChipErase}
                    onChange={(e) => setFullChipErase(e.target.checked)}
                    className="mt-0.5 accent-accent"
                    disabled={isActive}
                  />
                  <span className="text-[10px] leading-relaxed text-text-secondary">
                    Perform full-chip erase before flashing. Use this only when you need to clear the full external flash area, not for normal updates.
                  </span>
                </label>

                <div className="flex items-start gap-2 rounded-md border border-border/50 bg-bg-secondary/40 px-2.5 py-2 text-[10px] text-text-secondary">
                  <Info size={10} className="mt-0.5 shrink-0" />
                  <div className="flex flex-col gap-1">
                    <span>{serialTransitionMessage}</span>
                    {serialValidationMessage && <span>{serialValidationMessage}</span>}
                  </div>
                </div>

                {/* Start button */}
                {!canStartSerial && hasSerialInputs && !isActive && !serialReadyLoading && (
                  <div data-testid="firmware-serial-readiness-blocked" className="flex items-start gap-2 text-[10px] text-text-muted">
                    <Info size={10} className="mt-0.5 shrink-0" />
                    <span>{serialBlockedMessage}</span>
                  </div>
                )}
                <button
                  data-testid="firmware-start-serial"
                  onClick={handleStartSerial}
                  disabled={!canStartSerial || isActive || serialReadyLoading}
                  className="flex items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-xs font-semibold text-white transition-opacity disabled:opacity-40"
                >
                  <Upload size={14} />
                  Flash Firmware
                </button>

                {connected && (
                  <div data-testid="firmware-param-backup" className="flex flex-col gap-2 rounded-md border border-warning/30 bg-warning/10 px-2.5 py-2">
                    <div className="flex items-start gap-2 text-[10px] text-warning">
                      <AlertTriangle size={10} className="mt-0.5 shrink-0" />
                      <span>Flashing will disconnect the current vehicle connection. Save your parameters first.</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {onSaveParams && (
                        <button
                          data-testid="firmware-save-params"
                          onClick={async () => {
                            await onSaveParams();
                            setParamsSaved(true);
                          }}
                          disabled={paramsSaved}
                          className="flex items-center gap-1.5 rounded-md border border-warning/50 bg-warning/10 px-3 py-1.5 text-[10px] font-medium text-warning transition-colors hover:bg-warning/20 disabled:opacity-40"
                        >
                          {paramsSaved ? (
                            <>
                              <CheckCircle2 size={10} />
                              Parameters Saved
                            </>
                          ) : (
                            <>
                              <Shield size={10} />
                              Save Parameters to File
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* RECOVER VIA DFU PANEL                                             */}
      {/* ================================================================ */}
      {effectiveMode === "recover" && (
        <div data-testid="firmware-dfu-recovery-panel" className="rounded-lg border border-border/50 bg-bg-tertiary/15">
          <div className="flex items-center gap-2 border-b border-border/50 px-3 py-2.5">
            <Shield size={14} className="text-warning/70" />
            <h4 className="text-xs font-semibold text-text-secondary">DFU Recovery Flash</h4>
          </div>

          <div className="flex flex-col gap-3 p-3">
            {/* Warning banner */}
            <div className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/10 p-3">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
              <div className="flex flex-col gap-1 text-[10px] text-warning">
                <span className="font-semibold text-[11px]">Recovery flashing — use with caution</span>
                <span className="leading-relaxed">
                  DFU mode bypasses the normal bootloader and writes directly to internal flash
                  from the STM32 flash base address. Only use this if your board is
                  unresponsive to serial flashing. Put the board in DFU mode by holding the
                  BOOT button during power-on.
                </span>
              </div>
            </div>

            {/* Driver guidance */}
            <div data-testid="firmware-driver-guidance" className="flex items-start gap-2 rounded-md border border-accent-blue/20 bg-accent-blue/5 px-2.5 py-2 text-[10px] text-text-secondary">
              <Info size={10} className="mt-0.5 shrink-0 text-accent-blue" />
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">Driver requirements</span>
                <span className="text-text-muted leading-relaxed">
                  Windows requires WinUSB driver (install via Zadig). Linux may need udev rules
                  for USB access. macOS works without additional drivers.
                </span>
              </div>
            </div>

            {driverGuidance && (
              <OutcomeBanner kind="warning" message={driverGuidance} />
            )}

            {/* ── DFU active / progress ── */}
            {(isDfuActive || isDfuCancelling) && (
              <>
                <div className="flex items-center gap-2 text-xs text-text-secondary">
                  <Loader2 size={14} className="animate-spin text-warning" />
                  <span>{isDfuCancelling ? "Cancellation requested… waiting for DFU recovery to stop." : "DFU recovery in progress…"}</span>
                </div>
                {progress && (
                  <ProgressBar pct={progress.pct} label={progress.phase_label} />
                )}
                {!isDfuCancelling && (
                  <button
                    onClick={cancel}
                    className="self-start rounded-md border border-border bg-bg-secondary px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-tertiary"
                  >
                    Cancel
                  </button>
                )}
              </>
            )}

            {/* ── DFU completed ── */}
            {dfuCompleted && dfuOutcome && (
              <>
                {dfuOutcome.result === "verified" && (
                  <OutcomeBanner kind="success" message="DFU recovery flash completed successfully." />
                )}
                {dfuOutcome.result === "cancelled" && (
                  <OutcomeBanner kind="warning" message="DFU recovery was cancelled before completion." />
                )}
                {dfuOutcome.result === "failed" && (
                  <OutcomeBanner kind="error" message={`DFU flash failed: ${dfuOutcome.reason}`} />
                )}
                {dfuOutcome.result === "unsupported_recovery_path" && (
                  <OutcomeBanner kind="warning" message={dfuOutcome.guidance} />
                )}
                {dfuOutcome.result === "reset_unconfirmed" && (
                  <OutcomeBanner kind="warning" message="DFU flash completed, but device reset could not be confirmed. Reconnect or power-cycle the board before continuing." />
                )}
                <button
                  onClick={dismiss}
                  className="self-start rounded-md border border-border bg-bg-secondary px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-tertiary"
                >
                  Try Again
                </button>
              </>
            )}

            {/* ── DFU idle: device scan + source + confirmation ── */}
            {!isDfuActive && !isDfuCancelling && !dfuCompleted && (
              <>
                {/* DFU device scan */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                    DFU Device
                  </label>
                  <div className="flex items-center gap-1.5">
                    <select
                      value={selectedDfuUniqueId ?? ""}
                      onChange={(e) => setSelectedDfuUniqueId(e.target.value || null)}
                      className="flex-1 rounded-md border border-border bg-bg-secondary px-2 py-1.5 text-xs text-text-primary"
                      disabled={isActive}
                    >
                      {dfuDevices.length === 0 && <option value="">No DFU devices found</option>}
                      {dfuDevices.map((d, i) => (
                        <option key={d.unique_id} value={d.unique_id}>
                          {d.product ?? `DFU ${d.vid.toString(16)}:${d.pid.toString(16)}`}
                          {d.serial_number ? ` (${d.serial_number})` : ""}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={refreshDfuDevices}
                      disabled={dfuDevicesLoading}
                      className="rounded-md border border-border bg-bg-secondary p-1.5 text-text-muted transition-colors hover:text-text-primary disabled:opacity-40"
                      title="Scan for DFU devices"
                    >
                      <RefreshCw size={12} className={dfuDevicesLoading ? "animate-spin" : ""} />
                    </button>
                  </div>
                </div>

                {/* Board target selector */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                    Board Target
                  </label>
                  <select
                    data-testid="firmware-recovery-board-select"
                      value={selectedRecoveryTarget ?? ""}
                      onChange={(e) => setSelectedRecoveryTarget(e.target.value === "" ? null : Number(e.target.value))}
                      className="rounded-md border border-border bg-bg-secondary px-2 py-1.5 text-xs text-text-primary"
                      disabled={isActive || recoveryTargetsLoading}
                    >
                      <option value="">
                        {recoveryTargetsLoading
                          ? "Loading targets…"
                          : recoveryTargets.length === 0
                            ? "No targets available"
                            : "Choose official bootloader target…"}
                      </option>
                      {recoveryTargets.map((t, i) => (
                        <option key={i} value={i}>
                          {t.brand_name ?? t.platform} — {t.vehicle_types.join("/")}
                        {t.manufacturer ? ` (${t.manufacturer})` : ""}
                        {t.latest_version ? ` v${t.latest_version}` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="rounded-md border border-border/50 bg-bg-secondary/50 p-2.5">
                  <div className="flex items-start gap-2 text-[10px] text-text-muted">
                    <Info size={10} className="mt-0.5 shrink-0" />
                    <span>
                      Flash official bootloader for the selected board target as the primary DFU recovery action.
                    </span>
                  </div>
                  {selectedRecoveryBoardTarget && (
                    <div className="mt-2 rounded-md border border-warning/30 bg-warning/5 px-2.5 py-1.5 text-xs text-text-primary">
                      Official bootloader target: <span className="font-semibold">{selectedRecoveryBoardTarget}</span>
                    </div>
                  )}
                  <div className="mt-2 flex items-start gap-2 text-[10px] text-text-muted">
                    <Info size={10} className="mt-0.5 shrink-0" />
                    <span>
                      After the bootloader is restored, install normal ArduPilot firmware through the serial Install / Update path.
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-2 rounded-md border border-border/50 bg-bg-secondary/30 p-2.5">
                  <button
                    type="button"
                    onClick={() => setShowManualRecovery((value) => !value)}
                    className="self-start rounded-md border border-border bg-bg-secondary px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-tertiary"
                  >
                    Manual APJ/BIN Recovery
                  </button>

                  {showManualRecovery && (
                    <>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => setManualRecoveryMode("local_apj")}
                          className={cn(
                            "flex-1 rounded-md border px-2.5 py-1.5 text-[10px] font-medium transition-colors",
                            manualRecoveryMode === "local_apj"
                              ? "border-warning/50 bg-warning/10 text-warning"
                              : "border-border bg-bg-secondary text-text-secondary hover:bg-bg-tertiary",
                          )}
                        >
                          Use Manual APJ
                        </button>
                        <button
                          type="button"
                          onClick={() => setManualRecoveryMode("local_bin")}
                          className={cn(
                            "flex-1 rounded-md border px-2.5 py-1.5 text-[10px] font-medium transition-colors",
                            manualRecoveryMode === "local_bin"
                              ? "border-warning/50 bg-warning/10 text-warning"
                              : "border-border bg-bg-secondary text-text-secondary hover:bg-bg-tertiary",
                          )}
                        >
                          Use Manual BIN
                        </button>
                      </div>

                      {manualRecoveryMode === "local_apj" ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={pickRecoveryApjFile}
                            disabled={isActive}
                            className="flex items-center gap-1.5 rounded-md border border-border bg-bg-secondary px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-tertiary disabled:opacity-40"
                          >
                            <FolderOpen size={12} />
                            Choose .apj file
                          </button>
                          {recoveryLocalApjName && (
                            <span className="truncate text-[10px] text-text-muted" title={recoveryLocalApjName}>
                              {recoveryLocalApjName}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={pickBinFile}
                              disabled={isActive}
                              className="flex items-center gap-1.5 rounded-md border border-border bg-bg-secondary px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-tertiary disabled:opacity-40"
                            >
                              <FolderOpen size={12} />
                              Choose .bin file
                            </button>
                            {dfuBinName && (
                              <span className="truncate text-[10px] text-text-muted" title={dfuBinName}>
                                {dfuBinName}
                              </span>
                            )}
                          </div>
                          <div className="flex items-start gap-1.5 text-[10px] text-text-muted">
                            <Info size={10} className="mt-0.5 shrink-0" />
                            <span>Raw .bin files bypass APJ validation. Use only as a last resort when no .apj source is available.</span>
                          </div>
                        </div>
                      )}

                      <div className="flex items-start gap-1.5 rounded-md border border-warning/20 bg-warning/5 px-2.5 py-2 text-[10px] text-warning">
                        <AlertTriangle size={10} className="mt-0.5 shrink-0" />
                        <span>
                          Manual local files may replace bootloader contents or leave the board non-bootable if the wrong image is used.
                        </span>
                      </div>

                      <label className="flex items-start gap-2 cursor-pointer select-none rounded-md border border-warning/20 bg-warning/5 px-2.5 py-2">
                        <input
                          type="checkbox"
                          checked={manualRecoveryConfirmed}
                          onChange={(e) => setManualRecoveryConfirmed(e.target.checked)}
                          className="mt-0.5 accent-warning"
                        />
                        <span className="text-[10px] leading-relaxed text-text-secondary">
                          I confirm I am manually supplying the recovery image and have verified it matches this board.
                        </span>
                      </label>
                    </>
                  )}
                </div>

                {/* External flash blocking guidance */}
                {extfBlocked && (
                  <div data-testid="firmware-extf-block" className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/10 p-3">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
                    <div className="flex flex-col gap-1 text-[10px] text-warning">
                      <span className="font-semibold text-[11px]">This firmware requires external flash</span>
                      <span className="leading-relaxed">
                        {extfBlocked} DFU recovery cannot write external flash directly.
                        Use the serial Install / Update path to flash this firmware after recovery.
                      </span>
                    </div>
                  </div>
                )}

                {/* Confirmation */}
                <label className="flex items-start gap-2 cursor-pointer select-none rounded-md border border-warning/20 bg-warning/5 px-2.5 py-2">
                  <input
                    type="checkbox"
                    checked={dfuConfirmed}
                    onChange={(e) => setDfuConfirmed(e.target.checked)}
                    className="mt-0.5 accent-warning"
                  />
                  <span className="text-[10px] leading-relaxed text-text-secondary">
                    I understand that DFU recovery bypasses normal safety checks and may require
                    specific USB drivers. I want to proceed with recovery flashing.
                  </span>
                </label>

                {/* Start DFU */}
                <button
                  data-testid="firmware-start-dfu"
                  onClick={handleStartDfu}
                  disabled={!canStartDfu || isActive}
                  className="flex items-center justify-center gap-2 rounded-md border border-warning/50 bg-warning/10 px-4 py-2 text-xs font-semibold text-warning transition-opacity disabled:opacity-40"
                >
                  <Usb size={14} />
                  {isManualRecovery ? "Start Manual Recovery Flash" : "Flash Official Bootloader"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

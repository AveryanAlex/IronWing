import { useState, useCallback, useEffect } from "react";
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
import type { PortInfo, DfuDeviceInfo, CatalogEntry, CatalogTargetSummary } from "../../firmware";
import { firmwareCheckDfuSource } from "../../firmware";

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
    flashDfuFromCatalog,
    cancel,
    dismiss,
    preflight,
    rebootToBootloader,
    listPorts,
    listDfuDevices,
    catalogTargets,
    catalogEntries,
  } = firmware;

  // ── Mode selection ────────────────────────────────────────────────────
  const [wizardMode, setWizardMode] = useState<"install" | "recover">("install");

  // ── Serial local state ────────────────────────────────────────────────
  const [ports, setPorts] = useState<PortInfo[]>([]);
  const [selectedPort, setSelectedPort] = useState("");
  const [selectedBaud, setSelectedBaud] = useState(115200);
  const [sourceMode, setSourceMode] = useState<"catalog" | "local">("catalog");
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogList, setCatalogList] = useState<CatalogEntry[]>([]);
  const [selectedCatalogIdx, setSelectedCatalogIdx] = useState(0);
  const [detectedBoardId, setDetectedBoardId] = useState<number | null>(null);
  const [localApjData, setLocalApjData] = useState<number[] | null>(null);
  const [localApjName, setLocalApjName] = useState<string | null>(null);
  const [portsLoading, setPortsLoading] = useState(false);
  const [paramsSaved, setParamsSaved] = useState(false);

  // ── DFU local state ───────────────────────────────────────────────────
  const [dfuConfirmed, setDfuConfirmed] = useState(false);
  const [dfuDevices, setDfuDevices] = useState<DfuDeviceInfo[]>([]);
  const [selectedDfuIdx, setSelectedDfuIdx] = useState(0);
  const [dfuBinData, setDfuBinData] = useState<number[] | null>(null);
  const [dfuBinName, setDfuBinName] = useState<string | null>(null);
  const [dfuDevicesLoading, setDfuDevicesLoading] = useState(false);

  // ── Recovery catalog state ────────────────────────────────────────────
  const [recoveryTargets, setRecoveryTargets] = useState<CatalogTargetSummary[]>([]);
  const [recoveryTargetsLoading, setRecoveryTargetsLoading] = useState(false);
  const [selectedRecoveryTarget, setSelectedRecoveryTarget] = useState(0);
  const [recoveryCatalogList, setRecoveryCatalogList] = useState<CatalogEntry[]>([]);
  const [recoveryCatalogLoading, setRecoveryCatalogLoading] = useState(false);
  const [selectedRecoveryCatalogIdx, setSelectedRecoveryCatalogIdx] = useState(0);
  const [recoverySourceMode, setRecoverySourceMode] = useState<"catalog" | "local_apj" | "local_bin">("catalog");
  const [recoveryLocalApjData, setRecoveryLocalApjData] = useState<number[] | null>(null);
  const [recoveryLocalApjName, setRecoveryLocalApjName] = useState<string | null>(null);

  // ── Extf blocking state ───────────────────────────────────────────────
  const [extfBlocked, setExtfBlocked] = useState<string | null>(null);

  // ── Refresh helpers ───────────────────────────────────────────────────
  const refreshPorts = useCallback(async () => {
    setPortsLoading(true);
    try {
      const info = await preflight();
      setPorts(info.available_ports);
      if (info.available_ports.length > 0 && !selectedPort) {
        setSelectedPort(info.available_ports[0].port_name);
      }
      if (info.detected_board_id !== null) {
        setDetectedBoardId(info.detected_board_id);
      }
    } catch {
      try {
        const result = await listPorts();
        if (result.kind === "available") {
          setPorts(result.ports);
          if (result.ports.length > 0 && !selectedPort) {
            setSelectedPort(result.ports[0].port_name);
          }
        }
      } catch {}
    } finally {
      setPortsLoading(false);
    }
  }, [preflight, listPorts, selectedPort]);

  const refreshDfuDevices = useCallback(async () => {
    setDfuDevicesLoading(true);
    try {
      const result = await listDfuDevices();
      if (result.kind === "available") {
        setDfuDevices(result.devices);
      }
    } finally {
      setDfuDevicesLoading(false);
    }
  }, [listDfuDevices]);

  useEffect(() => {
    refreshPorts();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (detectedBoardId && detectedBoardId > 0) {
      fetchCatalog(detectedBoardId);
    }
  }, [detectedBoardId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scan for DFU devices and fetch recovery targets when entering recovery mode
  useEffect(() => {
    if (wizardMode === "recover") {
      refreshDfuDevices();
      fetchRecoveryTargets();
    }
  }, [wizardMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch recovery catalog entries when target selection changes
  useEffect(() => {
    const target = recoveryTargets[selectedRecoveryTarget];
    if (target) {
      fetchRecoveryEntries(target.board_id, target.platform);
    }
  }, [selectedRecoveryTarget, recoveryTargets]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false;
    setExtfBlocked(null);

    if (recoverySourceMode === "local_apj" && recoveryLocalApjData) {
      if (checkApjHasExtf(recoveryLocalApjData)) {
        setExtfBlocked(
          "This APJ contains an external-flash payload; DFU recovery can only write internal flash.",
        );
      }
    } else if (recoverySourceMode === "catalog" && recoveryCatalogList[selectedRecoveryCatalogIdx]) {
      const url = recoveryCatalogList[selectedRecoveryCatalogIdx].url;
      firmwareCheckDfuSource(url)
        .then((result) => {
          if (cancelled) return;
          if (result.has_extf) {
            setExtfBlocked(
              "This firmware contains an external-flash payload; DFU recovery can only write internal flash.",
            );
          }
        })
        .catch(() => {});
    }

    return () => { cancelled = true; };
  }, [recoverySourceMode, selectedRecoveryCatalogIdx, recoveryLocalApjData, recoveryCatalogList]);

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
    }
  }, []);

  // ── Catalog fetch (serial path) ───────────────────────────────────────
  const fetchCatalog = useCallback(async (boardId: number) => {
    if (boardId <= 0) return;
    setCatalogLoading(true);
    try {
      const entries = await catalogEntries(boardId);
      setCatalogList(entries);
      setSelectedCatalogIdx(0);
    } catch (err) {
      toast.error("Failed to load catalog", {
        description: typeof err === "string" ? err : err instanceof Error ? err.message : "unknown error",
      });
      setCatalogList([]);
    } finally {
      setCatalogLoading(false);
    }
  }, [catalogEntries]);

  // ── Recovery catalog fetch ────────────────────────────────────────────
  const fetchRecoveryTargets = useCallback(async () => {
    setRecoveryTargetsLoading(true);
    try {
      const targets = await catalogTargets();
      setRecoveryTargets(targets);
    } catch {
      setRecoveryTargets([]);
    } finally {
      setRecoveryTargetsLoading(false);
    }
  }, [catalogTargets]);

  const fetchRecoveryEntries = useCallback(async (boardId: number, platform: string) => {
    setRecoveryCatalogLoading(true);
    try {
      const entries = await catalogEntries(boardId, platform);
      setRecoveryCatalogList(entries);
      setSelectedRecoveryCatalogIdx(0);
    } catch {
      setRecoveryCatalogList([]);
    } finally {
      setRecoveryCatalogLoading(false);
    }
  }, [catalogEntries]);

  // ── Serial action ─────────────────────────────────────────────────────
  const selectedCatalogEntry = catalogList[selectedCatalogIdx] ?? null;
  const canStartSerial = !!selectedPort && (
    (sourceMode === "catalog" && selectedCatalogEntry !== null) ||
    (sourceMode === "local" && localApjData !== null)
  );

  const handleStartSerial = useCallback(async () => {
    if (!canStartSerial) return;
    if (connected) {
      try {
        await rebootToBootloader();
      } catch {
        toast.error("Failed to reboot flight controller into bootloader");
        return;
      }
    }
    const source = sourceMode === "catalog" && selectedCatalogEntry
      ? { kind: "catalog_url" as const, url: selectedCatalogEntry.url }
      : { kind: "local_apj_bytes" as const, data: localApjData! };
    try {
      await flashSerial(selectedPort, selectedBaud, source);
    } catch {
      // error toasts handled by hook
    }
  }, [canStartSerial, connected, rebootToBootloader, sourceMode, selectedCatalogEntry, localApjData, flashSerial, selectedPort, selectedBaud]);

  // ── DFU action ────────────────────────────────────────────────────────
  const recoveryCatalogEntry = recoveryCatalogList[selectedRecoveryCatalogIdx] ?? null;
  const canStartDfu = dfuConfirmed && dfuDevices.length > 0 && !extfBlocked && (
    (recoverySourceMode === "catalog" && recoveryCatalogEntry !== null) ||
    (recoverySourceMode === "local_apj" && recoveryLocalApjData !== null) ||
    (recoverySourceMode === "local_bin" && dfuBinData !== null)
  );

  const handleStartDfu = useCallback(async () => {
    if (!canStartDfu) return;
    const device = dfuDevices[selectedDfuIdx];
    try {
      let result;
      if (recoverySourceMode === "catalog" && recoveryCatalogEntry) {
        result = await flashDfuFromCatalog(device, recoveryCatalogEntry.url);
      } else if (recoverySourceMode === "local_apj" && recoveryLocalApjData) {
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
  }, [canStartDfu, dfuDevices, selectedDfuIdx, recoverySourceMode, recoveryCatalogEntry, recoveryLocalApjData, dfuBinData, flashDfuFromCatalog, flashDfuFromApj, flashDfuRecovery]);

  // ── Derived state ─────────────────────────────────────────────────────
  const isSerialActive = sessionStatus.kind === "serial_primary";
  const isDfuActive = sessionStatus.kind === "dfu_recovery";
  const isCompleted = sessionStatus.kind === "completed";
  const serialCompleted = isCompleted && sessionStatus.outcome.path === "serial_primary";
  const dfuCompleted = isCompleted && sessionStatus.outcome.path === "dfu_recovery";

  const serialOutcome = serialCompleted ? sessionStatus.outcome.outcome : null;
  const dfuOutcome = dfuCompleted ? sessionStatus.outcome.outcome : null;

  const driverGuidance = dfuOutcome && "guidance" in dfuOutcome
    ? dfuOutcome.guidance
    : null;

  const effectiveMode: "install" | "recover" =
    isSerialActive || serialCompleted ? "install"
    : isDfuActive || dfuCompleted ? "recover"
    : wizardMode;

  const modeLocked = isSerialActive || isDfuActive || isCompleted;

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
            {isSerialActive && (
              <>
                <div className="flex items-center gap-2 text-xs text-text-secondary">
                  <Loader2 size={14} className="animate-spin text-accent" />
                  <span>Flashing in progress…</span>
                </div>
                {progress && (
                  <ProgressBar pct={progress.pct} label={progress.phase_label} />
                )}
                <button
                  onClick={cancel}
                  className="self-start rounded-md border border-border bg-bg-secondary px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-tertiary"
                >
                  Cancel
                </button>
              </>
            )}

            {/* ── Completed outcome ── */}
            {serialCompleted && serialOutcome && (
              <>
                {serialOutcome.result === "verified" && (
                  <OutcomeBanner kind="success" message="Firmware flashed and verified successfully. The flight controller is ready." />
                )}
                {serialOutcome.result === "flashed_but_unverified" && (
                  <OutcomeBanner kind="warning" message="Firmware was written but could not be verified (bootloader does not support CRC check). Power-cycle the board to confirm." />
                )}
                {serialOutcome.result === "failed" && (
                  <OutcomeBanner kind="error" message={`Flash failed: ${serialOutcome.reason}`} />
                )}
                {serialOutcome.result === "recovery_needed" && (
                  <OutcomeBanner kind="error" message={`Board detection failed: ${serialOutcome.reason}. If the board is unresponsive, try DFU recovery mode below.`} />
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
            {!isSerialActive && !serialCompleted && (
              <>
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
                        <div className="flex items-center gap-1.5 text-[10px] text-text-muted">
                          <Info size={10} className="shrink-0" />
                          <span>Connect a flight controller to detect board identity and load firmware catalog</span>
                        </div>
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
                      {catalogList.length === 0 && !catalogLoading && detectedBoardId !== null && (
                        <div className="flex items-start gap-2 text-[10px] text-text-muted">
                          <Info size={10} className="mt-0.5 shrink-0" />
                          <span>No firmware found for board ID {detectedBoardId}</span>
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

                {/* Start button */}
                <button
                  data-testid="firmware-start-serial"
                  onClick={handleStartSerial}
                  disabled={!canStartSerial || isActive}
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
                  DFU mode bypasses the normal bootloader. Only use this if your board is
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
            {isDfuActive && (
              <>
                <div className="flex items-center gap-2 text-xs text-text-secondary">
                  <Loader2 size={14} className="animate-spin text-warning" />
                  <span>DFU recovery in progress…</span>
                </div>
                {progress && (
                  <ProgressBar pct={progress.pct} label={progress.phase_label} />
                )}
                <button
                  onClick={cancel}
                  className="self-start rounded-md border border-border bg-bg-secondary px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-tertiary"
                >
                  Cancel
                </button>
              </>
            )}

            {/* ── DFU completed ── */}
            {dfuCompleted && dfuOutcome && (
              <>
                {dfuOutcome.result === "verified" && (
                  <OutcomeBanner kind="success" message="DFU recovery flash completed successfully." />
                )}
                {dfuOutcome.result === "failed" && (
                  <OutcomeBanner kind="error" message={`DFU flash failed: ${dfuOutcome.reason}`} />
                )}
                {dfuOutcome.result === "unsupported_recovery_path" && (
                  <OutcomeBanner kind="warning" message={dfuOutcome.guidance} />
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
            {!isDfuActive && !dfuCompleted && (
              <>
                {/* DFU device scan */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                    DFU Device
                  </label>
                  <div className="flex items-center gap-1.5">
                    <select
                      value={selectedDfuIdx}
                      onChange={(e) => setSelectedDfuIdx(Number(e.target.value))}
                      className="flex-1 rounded-md border border-border bg-bg-secondary px-2 py-1.5 text-xs text-text-primary"
                      disabled={isActive}
                    >
                      {dfuDevices.length === 0 && <option value={0}>No DFU devices found</option>}
                      {dfuDevices.map((d, i) => (
                        <option key={i} value={i}>
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
                    value={selectedRecoveryTarget}
                    onChange={(e) => setSelectedRecoveryTarget(Number(e.target.value))}
                    className="rounded-md border border-border bg-bg-secondary px-2 py-1.5 text-xs text-text-primary"
                    disabled={isActive || recoveryTargetsLoading}
                  >
                    {recoveryTargets.length === 0 && (
                      <option value={0}>{recoveryTargetsLoading ? "Loading targets…" : "No targets available"}</option>
                    )}
                    {recoveryTargets.map((t, i) => (
                      <option key={i} value={i}>
                        {t.brand_name ?? t.platform} — {t.vehicle_types.join("/")}
                        {t.manufacturer ? ` (${t.manufacturer})` : ""}
                        {t.latest_version ? ` v${t.latest_version}` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Recovery firmware source selection */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                    Firmware Source
                  </label>
                  <div className="flex gap-1">
                    <button
                      data-testid="firmware-recovery-source-catalog"
                      onClick={() => setRecoverySourceMode("catalog")}
                      className={cn(
                        "flex-1 rounded-md border px-2.5 py-1.5 text-[10px] font-medium transition-colors",
                        recoverySourceMode === "catalog"
                          ? "border-warning/50 bg-warning/10 text-warning"
                          : "border-border bg-bg-secondary text-text-secondary hover:bg-bg-tertiary",
                      )}
                    >
                      Official Catalog
                    </button>
                    <button
                      data-testid="firmware-recovery-source-local-apj"
                      onClick={() => setRecoverySourceMode("local_apj")}
                      className={cn(
                        "flex-1 rounded-md border px-2.5 py-1.5 text-[10px] font-medium transition-colors",
                        recoverySourceMode === "local_apj"
                          ? "border-warning/50 bg-warning/10 text-warning"
                          : "border-border bg-bg-secondary text-text-secondary hover:bg-bg-tertiary",
                      )}
                    >
                      Local .apj
                    </button>
                    <button
                      data-testid="firmware-recovery-source-local-bin"
                      onClick={() => setRecoverySourceMode("local_bin")}
                      className={cn(
                        "flex-1 rounded-md border px-2.5 py-1.5 text-[10px] font-medium transition-colors",
                        recoverySourceMode === "local_bin"
                          ? "border-warning/50 bg-warning/10 text-warning"
                          : "border-border bg-bg-secondary text-text-secondary hover:bg-bg-tertiary",
                      )}
                    >
                      Local .bin (Fallback)
                    </button>
                  </div>

                  {/* Catalog version selector */}
                  {recoverySourceMode === "catalog" && (
                    <div className="flex flex-col gap-1.5 rounded-md border border-border/50 bg-bg-secondary/50 p-2.5">
                      {recoveryCatalogLoading && (
                        <div className="flex items-center gap-1.5 text-[10px] text-text-muted">
                          <Loader2 size={10} className="animate-spin" />
                          <span>Loading versions…</span>
                        </div>
                      )}
                      {recoveryCatalogList.length > 0 && (
                        <select
                          data-testid="firmware-recovery-version-select"
                          value={selectedRecoveryCatalogIdx}
                          onChange={(e) => setSelectedRecoveryCatalogIdx(Number(e.target.value))}
                          className="rounded-md border border-border bg-bg-primary px-2 py-1.5 text-xs text-text-primary"
                          disabled={isActive}
                        >
                          {recoveryCatalogList.map((entry, i) => (
                            <option key={i} value={i}>
                              {entry.vehicle_type} {entry.version} — {entry.platform}
                              {entry.latest ? " (latest)" : ""}
                              {entry.brand_name ? ` [${entry.brand_name}]` : ""}
                            </option>
                          ))}
                        </select>
                      )}
                      {recoveryCatalogList.length === 0 && !recoveryCatalogLoading && recoveryTargets.length > 0 && (
                        <div className="flex items-start gap-2 text-[10px] text-text-muted">
                          <Info size={10} className="mt-0.5 shrink-0" />
                          <span>No firmware entries found for the selected board target</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Local APJ picker */}
                  {recoverySourceMode === "local_apj" && (
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
                  )}

                  {/* Local BIN picker (fallback) */}
                  {recoverySourceMode === "local_bin" && (
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
                  Start Recovery Flash
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

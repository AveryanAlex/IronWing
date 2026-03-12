import { useState, useCallback, useEffect } from "react";
import {
  Upload,
  FolderOpen,
  AlertTriangle,
  Loader2,
  ChevronDown,
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
import type { PortInfo, DfuDeviceInfo, CatalogEntry } from "../../firmware";

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
// Wizard
// ---------------------------------------------------------------------------

export function FirmwareFlashWizard({ firmware, connected, onSaveParams }: FirmwareFlashWizardProps) {
  const {
    sessionStatus,
    progress,
    isActive,
    flashSerial,
    flashDfuRecovery,
    cancel,
    dismiss,
    preflight,
    rebootToBootloader,
    listPorts,
    listDfuDevices,
    catalogEntries,
  } = firmware;

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
  const [dfuExpanded, setDfuExpanded] = useState(false);
  const [dfuConfirmed, setDfuConfirmed] = useState(false);
  const [dfuDevices, setDfuDevices] = useState<DfuDeviceInfo[]>([]);
  const [selectedDfuIdx, setSelectedDfuIdx] = useState(0);
  const [dfuBinData, setDfuBinData] = useState<number[] | null>(null);
  const [dfuBinName, setDfuBinName] = useState<string | null>(null);
  const [dfuDevicesLoading, setDfuDevicesLoading] = useState(false);

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

  useEffect(() => {
    if (dfuExpanded) refreshDfuDevices();
  }, [dfuExpanded]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── Catalog fetch ──────────────────────────────────────────────────────
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
  const canStartDfu = dfuConfirmed && dfuDevices.length > 0 && dfuBinData !== null;

  const handleStartDfu = useCallback(async () => {
    if (!canStartDfu) return;
    const device = dfuDevices[selectedDfuIdx];
    try {
      await flashDfuRecovery(device, dfuBinData!);
    } catch {
      // error toasts handled by hook
    }
  }, [canStartDfu, dfuDevices, selectedDfuIdx, dfuBinData, flashDfuRecovery]);

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

  // =====================================================================
  // RENDER
  // =====================================================================
  return (
    <div className="flex flex-col gap-4">
      {/* ================================================================ */}
      {/* SERIAL PRIMARY PANEL                                             */}
      {/* ================================================================ */}
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

      {/* ================================================================ */}
      {/* DFU RECOVERY / ADVANCED PANEL                                    */}
      {/* ================================================================ */}
      <div data-testid="firmware-dfu-recovery-panel" className="rounded-lg border border-border/50 bg-bg-tertiary/15">
        <button
          onClick={() => setDfuExpanded(!dfuExpanded)}
          className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
        >
          <Shield size={14} className="text-warning/70" />
          <h4 className="text-xs font-medium text-text-secondary">Recovery / Advanced</h4>
          <span className="ml-auto text-[10px] text-text-muted">DFU Mode</span>
          <ChevronDown
            size={12}
            className={cn(
              "shrink-0 text-text-muted transition-transform duration-200",
              dfuExpanded && "rotate-180",
            )}
          />
        </button>

        {dfuExpanded && (
          <div className="border-t border-border/50 p-3">
            <div className="flex flex-col gap-3">
              {/* Warning banner */}
              <div className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/10 p-3">
                <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
                <div className="flex flex-col gap-1 text-[10px] text-warning">
                  <span className="font-semibold text-[11px]">Recovery flashing — use with caution</span>
                  <span className="leading-relaxed">
                    DFU mode bypasses the normal bootloader. Only use this if your board is
                    unresponsive to serial flashing. Requires a raw .bin firmware file and the
                    board to be in DFU mode (usually by holding the BOOT button during power-on).
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

              {/* ── DFU idle: device scan + file + confirmation ── */}
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

                  {/* .bin file picker */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                      Firmware File (.bin)
                    </label>
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
                  </div>

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
    </div>
  );
}

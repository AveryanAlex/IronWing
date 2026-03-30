import {
  Plane, Radio, Battery, Gauge, Compass, Navigation, Satellite,
  ArrowUp, RotateCcw, CircleDot, RefreshCw, Plug, Unplug, Loader2, X,
  Bluetooth, Search,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { ArmSlider } from "./ArmSlider";
import { cn } from "../lib/utils";
import type { useGuided } from "../hooks/use-guided";
import type { useSession } from "../hooks/use-session";
import type { TransportDescriptor, TransportType } from "../transport";

type SidebarProps = {
  vehicle: ReturnType<typeof useSession>;
  guided: ReturnType<typeof useGuided>;
  isMobile: boolean;
  open: boolean;
  onClose: () => void;
  replayActive?: boolean;
  firmwareActive?: boolean;
};

function formatMaybe(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return "--";
  return value.toFixed(1);
}

const TRANSPORT_LABELS: Record<TransportType, string> = {
  udp: "UDP",
  tcp: "TCP",
  serial: "Serial",
  bluetooth_ble: "BLE",
  bluetooth_spp: "Classic BT",
};

export function Sidebar({ vehicle, guided, isMobile, open, onClose, replayActive, firmwareActive }: SidebarProps) {
  // Mobile: drawer overlay
  if (isMobile) {
    return (
      <>
        {/* Backdrop */}
        <div
          className={cn(
            "fixed inset-0 z-40 bg-black/50 transition-opacity duration-200",
            open ? "opacity-100" : "pointer-events-none opacity-0"
          )}
          onClick={onClose}
        />
        {/* Drawer panel */}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex w-72 flex-col gap-3 overflow-y-auto bg-bg-secondary px-3 pb-3 shadow-xl transition-transform duration-200",
            open ? "translate-x-0" : "-translate-x-full"
          )}
          style={{ paddingTop: "calc(var(--safe-area-top, 0px) + 0.25rem)" }}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-text-primary">Vehicle</span>
            <button onClick={onClose} className="rounded p-1 text-text-muted hover:text-text-primary">
              <X size={16} />
            </button>
          </div>
          <SidebarContent vehicle={vehicle} guided={guided} replayActive={replayActive} firmwareActive={firmwareActive} />
        </aside>
      </>
    );
  }

  // Desktop: static sidebar
  return (
    <aside className="flex w-64 shrink-0 flex-col gap-3 overflow-y-auto border-r border-border bg-bg-secondary p-3 xl:w-72">
      <SidebarContent vehicle={vehicle} guided={guided} replayActive={replayActive} firmwareActive={firmwareActive} />
    </aside>
  );
}

function SidebarContent({ vehicle, guided, replayActive, firmwareActive }: {
  vehicle: ReturnType<typeof useSession>;
  guided: ReturnType<typeof useGuided>;
  replayActive?: boolean;
  firmwareActive?: boolean;
}) {
  const {
    telemetry, linkState, vehicleState, connected, connectionError,
    isConnecting, cancelConnect,
    connectionMode, setConnectionMode, transportDescriptors, selectedTransportDescriptor, describeTransportAvailability,
    udpBind, setUdpBind,
    tcpAddress, setTcpAddress,
    serialPort, setSerialPort, baud, setBaud, serialPorts,
    btDevices, btScanning, selectedBtDevice, setSelectedBtDevice,
    scanBleDevices, refreshBondedDevices,
    takeoffAlt, setTakeoffAlt, availableModes,
    connect, disconnect, refreshSerialPorts,
    arm, disarm, setFlightMode, findModeNumber,
  } = vehicle;

  const formLocked = isConnecting || connected || !!firmwareActive;
  const connectDisabled = !selectedTransportDescriptor?.available ||
    ((connectionMode === "bluetooth_ble" || connectionMode === "bluetooth_spp") && !selectedBtDevice);

  const handleTakeoff = async () => {
    const altitudeM = Number(takeoffAlt);
    if (!Number.isFinite(altitudeM) || altitudeM <= 0) {
      toast.error("Invalid takeoff altitude");
      return;
    }

    const result = await guided.takeoff(altitudeM);
    if (result.result === "rejected") {
      toast.error("Takeoff rejected", { description: result.failure.reason.message });
    }
  };

  return (
    <>
      {/* Connection */}
      <section className="rounded-lg border border-border bg-bg-primary p-3">
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-text-muted">
          <Radio className="h-3.5 w-3.5" /> Connection
        </h3>

        <div className="space-y-2">
          <select
            data-testid="connection-transport-select"
            value={connectionMode}
            onChange={(e) => setConnectionMode(e.target.value as TransportType)}
            disabled={formLocked}
            className="w-full rounded-md border border-border bg-bg-input pl-2.5 pr-7 py-1.5 text-sm text-text-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {transportDescriptors.map((descriptor) => (
              <option key={descriptor.kind} value={descriptor.kind} disabled={!descriptor.available}>
                {TRANSPORT_LABELS[descriptor.kind]}{descriptor.available ? "" : " (unavailable)"}
              </option>
            ))}
          </select>

          {selectedTransportDescriptor && (
            <p className={cn(
              "text-[10px]",
              selectedTransportDescriptor.available ? "text-text-muted" : "text-warning",
            )}>
              {describeTransportAvailability(selectedTransportDescriptor)}
            </p>
          )}

          {connectionMode === "udp" && (
            <input
              data-testid="connection-udp-bind"
              value={udpBind}
              onChange={(e) => setUdpBind(e.target.value)}
              placeholder="0.0.0.0:14550"
              disabled={formLocked}
              className="w-full rounded-md border border-border bg-bg-input pl-2.5 pr-7 py-1.5 text-sm text-text-primary disabled:opacity-50 disabled:cursor-not-allowed"
            />
          )}

          {connectionMode === "tcp" && (
            <input
              data-testid="connection-tcp-address"
              value={tcpAddress}
              onChange={(e) => setTcpAddress(e.target.value)}
              placeholder="127.0.0.1:5760"
              disabled={formLocked}
              className="w-full rounded-md border border-border bg-bg-input pl-2.5 pr-7 py-1.5 text-sm text-text-primary disabled:opacity-50 disabled:cursor-not-allowed"
            />
          )}

          {connectionMode === "serial" && (
            <>
              <div className="flex gap-1.5">
                <select
                  value={serialPort}
                  onChange={(e) => setSerialPort(e.target.value)}
                  disabled={formLocked}
                  className="flex-1 rounded-md border border-border bg-bg-input pl-2.5 pr-7 py-1.5 text-sm text-text-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {serialPorts.length === 0 && <option value="">No ports</option>}
                  {serialPorts.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                <Button variant="ghost" size="icon" onClick={refreshSerialPorts} disabled={formLocked}>
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </div>
              <input
                type="number"
                value={baud}
                onChange={(e) => setBaud(Number(e.target.value) || 57600)}
                disabled={formLocked}
                className="w-full rounded-md border border-border bg-bg-input pl-2.5 pr-7 py-1.5 text-sm text-text-primary disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </>
          )}

          {connectionMode === "bluetooth_ble" && (
            <BleDevicePicker
              devices={btDevices.filter((d) => d.device_type === "ble")}
              selected={selectedBtDevice}
              onSelect={setSelectedBtDevice}
              onScan={scanBleDevices}
              scanning={btScanning}
              disabled={formLocked}
            />
          )}

          {connectionMode === "bluetooth_spp" && (
            <SppDevicePicker
              devices={btDevices.filter((d) => d.device_type === "classic")}
              selected={selectedBtDevice}
              onSelect={setSelectedBtDevice}
              onRefresh={refreshBondedDevices}
              disabled={formLocked}
            />
          )}

          {isConnecting ? (
            <Button data-testid="connection-cancel-btn" variant="secondary" size="sm" className="w-full" onClick={cancelConnect}>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cancel
            </Button>
          ) : connected ? (
            <Button data-testid="connection-disconnect-btn" variant="secondary" size="sm" className="w-full" onClick={disconnect}>
              <Unplug className="h-3.5 w-3.5" /> Disconnect
            </Button>
          ) : (
            <Button data-testid="connection-connect-btn" size="sm" className="w-full" onClick={connect}
              disabled={connectDisabled}>
              <Plug className="h-3.5 w-3.5" /> Connect
            </Button>
          )}

          {connectionError && (
            <p data-testid="connection-error-message" className="rounded-md bg-danger/10 px-2 py-1 text-xs text-danger">{connectionError}</p>
          )}
        </div>

        <div data-testid="connection-status-text" className="mt-2 flex items-center gap-2 text-xs text-text-secondary">
          <div className={cn(
            "h-1.5 w-1.5 rounded-full",
            isConnecting ? "bg-warning animate-pulse" :
            connected ? "bg-success" :
            connectionError ? "bg-danger" :
            "bg-text-muted"
          )} />
          {isConnecting ? "Connecting..." :
           connected ? "Connected" :
           connectionError ? "Error" :
           "Idle"}
        </div>
      </section>

      {/* Vehicle Status */}
      <section className="rounded-lg border border-border bg-bg-primary p-3">
        <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-text-muted">
          <Plane className="h-3.5 w-3.5" /> Vehicle
        </h3>

        <div className="grid grid-cols-2 gap-2">
          <StatusCard icon={<Plane className="h-3.5 w-3.5" />} label="State"
            value={!connected ? "--" : vehicleState ? (vehicleState.armed ? "ARMED" : "DISARMED") : "--"}
            valueClass={!connected ? "text-text-muted opacity-50" : vehicleState?.armed ? "text-accent" : "text-text-muted"}
            testId="telemetry-state-value"
          />
          <StatusCard icon={<Navigation className="h-3.5 w-3.5" />} label="Mode"
            value={!connected ? "--" : vehicleState?.mode_name ?? "--"}
            valueClass={!connected ? "text-text-muted opacity-50" : ""}
            testId="telemetry-mode-value"
          />
          <StatusCard icon={<ArrowUp className="h-3.5 w-3.5" />} label="Alt"
            value={!connected ? "--" : `${formatMaybe(telemetry.altitude_m)} m`}
            valueClass={!connected ? "text-text-muted opacity-50" : ""}
            testId="telemetry-alt-value"
          />
          <StatusCard icon={<Gauge className="h-3.5 w-3.5" />} label="Speed"
            value={!connected ? "--" : `${formatMaybe(telemetry.speed_mps)} m/s`}
            valueClass={!connected ? "text-text-muted opacity-50" : ""}
            testId="telemetry-speed-value"
          />
          <StatusCard icon={<Battery className="h-3.5 w-3.5" />} label="Battery"
            value={!connected ? "--" : `${formatMaybe(telemetry.battery_pct)}%`}
            valueClass={!connected ? "text-text-muted opacity-50" : (
              telemetry.battery_pct !== undefined && !Number.isNaN(telemetry.battery_pct)
                ? (telemetry.battery_pct > 50 ? "text-success" : telemetry.battery_pct >= 20 ? "text-warning" : "text-danger")
                : ""
            )}
            testId="telemetry-battery-value"
          />
          <StatusCard icon={<Compass className="h-3.5 w-3.5" />} label="Heading"
            value={!connected ? "--" : `${formatMaybe(telemetry.heading_deg)}°`}
            valueClass={!connected ? "text-text-muted opacity-50" : ""}
            testId="telemetry-heading-value"
          />
          <StatusCard icon={<Satellite className="h-3.5 w-3.5" />} label="GPS"
            value={!connected ? "--" : `${telemetry.gps_fix_type ?? "--"} · ${telemetry.gps_satellites ?? "--"} sats`}
            valueClass={!connected ? "text-text-muted opacity-50" : (
              telemetry.gps_fix_type?.toUpperCase().includes("3D") ? "text-success" :
              telemetry.gps_fix_type?.toUpperCase().includes("2D") ? "text-warning" :
              "text-danger"
            )}
            testId="telemetry-gps-text"
          />
        </div>
      </section>

      {/* Flight Controls */}
      <section className="rounded-lg border border-border bg-bg-primary p-3">
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-text-muted">
          <Navigation className="h-3.5 w-3.5" /> Controls
        </h3>

        {replayActive && (
          <p className="mb-2 rounded-md bg-warning/10 px-2 py-1 text-xs text-warning">
            Controls disabled during log replay
          </p>
        )}

        <div className="space-y-2">
          <select
            data-testid="controls-flight-mode-select"
            value={vehicleState?.custom_mode ?? ""}
            onChange={(e) => setFlightMode(Number(e.target.value))}
            disabled={!connected || !!replayActive || availableModes.length === 0}
            className="w-full rounded-md border border-border bg-bg-input pl-2.5 pr-7 py-1.5 text-sm text-text-primary disabled:opacity-50"
          >
            {availableModes.map((m) => (
              <option key={m.custom_mode} value={m.custom_mode}>{m.name}</option>
            ))}
          </select>

          <div className="flex items-center gap-1.5">
            <input
              type="number"
              value={takeoffAlt}
              onChange={(e) => setTakeoffAlt(e.target.value)}
              className="w-16 rounded-md border border-border bg-bg-input px-2 py-1.5 text-sm text-text-primary"
            />
            <span className="text-xs text-text-muted">m</span>
            <Button data-testid="controls-takeoff-btn" variant="secondary" size="sm" className="flex-1" onClick={() => { void handleTakeoff(); }}
              disabled={!connected || !!replayActive || !guided.takeoffReady}>
              Takeoff
            </Button>
          </div>
          {connected && !replayActive && guided.takeoffPrompt && (
            <p data-testid="controls-takeoff-hint" className="text-[10px] text-text-muted">
              {guided.takeoffPrompt}
            </p>
          )}

          <div className="flex gap-1.5">
            {findModeNumber("RTL") !== null && (
              <Button variant="secondary" size="sm" className="flex-1"
                onClick={() => setFlightMode(findModeNumber("RTL")!)} disabled={!connected || !!replayActive}>
                <RotateCcw className="h-3 w-3" /> RTL
              </Button>
            )}
            {findModeNumber("LAND") !== null && (
              <Button variant="secondary" size="sm" className="flex-1"
                onClick={() => setFlightMode(findModeNumber("LAND")!)} disabled={!connected || !!replayActive}>
                Land
              </Button>
            )}
            {findModeNumber("LOITER") !== null && (
              <Button variant="secondary" size="sm" className="flex-1"
                onClick={() => setFlightMode(findModeNumber("LOITER")!)} disabled={!connected || !!replayActive}>
                <CircleDot className="h-3 w-3" /> Loiter
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* Arm/Disarm */}
      <ArmSlider
        connected={connected}
        armed={vehicleState?.armed ?? false}
        onArm={(force) => arm(force)}
        onDisarm={(force) => disarm(force)}
        replayActive={replayActive}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Bluetooth device pickers
// ---------------------------------------------------------------------------

function BleDevicePicker({
  devices,
  selected,
  onSelect,
  onScan,
  scanning,
  disabled,
}: {
  devices: { name: string; address: string }[];
  selected: string;
  onSelect: (address: string) => void;
  onScan: () => void;
  scanning: boolean;
  disabled: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex gap-1.5">
        <select
          value={selected}
          onChange={(e) => onSelect(e.target.value)}
          disabled={disabled}
          className="flex-1 rounded-md border border-border bg-bg-input pl-2.5 pr-7 py-1.5 text-sm text-text-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {devices.length === 0 && <option value="">No devices</option>}
          {devices.map((d) => (
            <option key={d.address} value={d.address}>
              {d.name || d.address}
            </option>
          ))}
        </select>
        <Button
          variant="ghost"
          size="icon"
          onClick={onScan}
          disabled={disabled || scanning}
        >
          {scanning ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Search className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
      {scanning && (
        <p className="flex items-center gap-1 text-[10px] text-text-muted">
          <Bluetooth className="h-3 w-3" /> Scanning for BLE devices...
        </p>
      )}
    </div>
  );
}

function SppDevicePicker({
  devices,
  selected,
  onSelect,
  onRefresh,
  disabled,
}: {
  devices: { name: string; address: string }[];
  selected: string;
  onSelect: (address: string) => void;
  onRefresh: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex gap-1.5">
      <select
        value={selected}
        onChange={(e) => onSelect(e.target.value)}
        disabled={disabled}
        className="flex-1 rounded-md border border-border bg-bg-input pl-2.5 pr-7 py-1.5 text-sm text-text-primary disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {devices.length === 0 && <option value="">No paired devices</option>}
        {devices.map((d) => (
          <option key={d.address} value={d.address}>
            {d.name || d.address}
          </option>
        ))}
      </select>
      <Button variant="ghost" size="icon" onClick={onRefresh} disabled={disabled}>
        <RefreshCw className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function StatusCard({ icon, label, value, valueClass, className, testId }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClass?: string;
  className?: string;
  testId?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-border bg-bg-secondary p-2 transition-colors duration-300", className)} data-testid={testId}>
      <div className="flex items-center gap-1.5 text-xs text-text-muted">
        {icon} <span>{label}</span>
      </div>
      <div className={cn("mt-1 truncate text-base font-semibold tabular-nums transition-colors duration-300", valueClass || "text-text-primary")}>
        {value}
      </div>
    </div>
  );
}

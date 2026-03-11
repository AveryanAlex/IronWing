import {
  Check,
  X,
  AlertTriangle,
  Minus,
  Satellite,
  Battery,
  Radio,
  Info,
} from "lucide-react";
import type { VehicleState, Telemetry } from "../../../telemetry";
import type { SensorHealth, SensorId, SensorStatus } from "../../../sensor-health";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type InspectionStepProps = {
  vehicleState: VehicleState | null;
  telemetry: Telemetry | null;
  sensorHealth: SensorHealth | null;
};

// ---------------------------------------------------------------------------
// Sensor name map
// ---------------------------------------------------------------------------

const SENSOR_NAMES: Record<SensorId, string> = {
  gyro_3d: "Gyroscope",
  accel_3d: "Accelerometer",
  mag_3d: "Compass",
  absolute_pressure: "Barometer",
  gps: "GPS",
  optical_flow: "Optical Flow",
  range_finder: "Range Finder",
  external_ground_truth: "External Ground Truth",
  motor_outputs: "Motor Outputs",
  rc_receiver: "RC Receiver",
  prearm_check: "Pre-Arm Check",
  ahrs: "AHRS",
  terrain: "Terrain",
  reverse_motor: "Reverse Motor",
  logging: "Logging",
  battery: "Battery",
};

// Key sensors shown first in the table
const KEY_SENSORS: SensorId[] = [
  "gyro_3d",
  "accel_3d",
  "mag_3d",
  "absolute_pressure",
  "gps",
  "rc_receiver",
  "motor_outputs",
  "battery",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(value: number | undefined, decimals = 1): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "--";
  return value.toFixed(decimals);
}

function StatusIcon({ status }: { status: SensorStatus }) {
  switch (status) {
    case "healthy":
      return <Check size={14} strokeWidth={2.5} className="text-success" />;
    case "unhealthy":
      return <X size={14} strokeWidth={2.5} className="text-danger" />;
    case "disabled":
      return <AlertTriangle size={14} strokeWidth={2} className="text-warning" />;
    case "not_present":
      return <Minus size={14} strokeWidth={2} className="text-text-muted" />;
  }
}

function statusLabel(status: SensorStatus): string {
  switch (status) {
    case "healthy":
      return "Healthy";
    case "unhealthy":
      return "Unhealthy";
    case "disabled":
      return "Disabled";
    case "not_present":
      return "Not Present";
  }
}

function statusTextClass(status: SensorStatus): string {
  switch (status) {
    case "healthy":
      return "text-success";
    case "unhealthy":
      return "text-danger";
    case "disabled":
      return "text-warning";
    case "not_present":
      return "text-text-muted";
  }
}

function formatVehicleType(raw: string): string {
  return raw
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function formatSystemStatus(raw: string): string {
  return raw
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

// ---------------------------------------------------------------------------
// Sub-sections
// ---------------------------------------------------------------------------

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-text-muted">{label}</span>
      <span className="text-sm font-medium text-text-primary">{value}</span>
    </div>
  );
}

function VehicleInfoSection({ vehicleState }: { vehicleState: VehicleState | null }) {
  if (!vehicleState) {
    return (
      <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4 text-sm text-text-muted">
        Waiting for vehicle heartbeat...
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
        Vehicle Information
      </h3>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        <InfoField label="Vehicle Type" value={formatVehicleType(vehicleState.vehicle_type)} />
        <InfoField label="Autopilot" value={formatVehicleType(vehicleState.autopilot)} />
        <InfoField label="System ID" value={String(vehicleState.system_id)} />
        <InfoField label="System Status" value={formatSystemStatus(vehicleState.system_status)} />
      </div>
    </div>
  );
}

function SensorHealthTable({ sensorHealth }: { sensorHealth: SensorHealth | null }) {
  if (!sensorHealth) {
    return (
      <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4 text-sm text-text-muted">
        Waiting for sensor data...
      </div>
    );
  }

  const sensorMap = new Map(sensorHealth.sensors);

  // Show key sensors first, then remaining sensors
  const keySensors = KEY_SENSORS.filter((id) => sensorMap.has(id));
  const otherSensors = sensorHealth.sensors
    .map(([id]) => id)
    .filter((id) => !KEY_SENSORS.includes(id));
  const orderedSensors = [...keySensors, ...otherSensors];

  return (
    <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          Sensor Health
        </h3>
        <span
          className={`text-[11px] font-medium ${sensorHealth.pre_arm_good ? "text-success" : "text-warning"}`}
        >
          Pre-Arm: {sensorHealth.pre_arm_good ? "Good" : "Not Ready"}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
        {orderedSensors.map((id) => {
          const status = sensorMap.get(id);
          if (!status) return null;
          return (
            <div
              key={id}
              className="flex items-center gap-2.5 rounded px-2.5 py-1.5 transition-colors hover:bg-bg-secondary/50"
            >
              <StatusIcon status={status} />
              <span className="flex-1 text-xs font-medium text-text-primary">
                {SENSOR_NAMES[id] ?? id}
              </span>
              <span className={`text-[10px] ${statusTextClass(status)}`}>
                {statusLabel(status)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GpsStatusSection({ telemetry }: { telemetry: Telemetry | null }) {
  return (
    <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Satellite size={14} className="text-accent" />
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          GPS Status
        </h3>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wider text-text-muted">Fix Type</span>
          <span className="text-sm font-medium text-text-primary">
            {telemetry?.gps_fix_type ?? "--"}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wider text-text-muted">Satellites</span>
          <span className="text-sm font-medium text-text-primary">
            {telemetry?.gps_satellites != null ? String(telemetry.gps_satellites) : "--"}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wider text-text-muted">HDOP</span>
          <span className="text-sm font-medium text-text-primary">
            {fmt(telemetry?.gps_hdop)}
          </span>
        </div>
      </div>
    </div>
  );
}

function BatteryStatusSection({ telemetry }: { telemetry: Telemetry | null }) {
  return (
    <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Battery size={14} className="text-accent" />
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          Battery Status
        </h3>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wider text-text-muted">Voltage</span>
          <span className="text-sm font-medium text-text-primary">
            {fmt(telemetry?.battery_voltage_v, 2)}
            {telemetry?.battery_voltage_v != null && (
              <span className="ml-0.5 text-xs text-text-muted">V</span>
            )}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wider text-text-muted">Remaining</span>
          <span className="text-sm font-medium text-text-primary">
            {telemetry?.battery_pct != null ? `${Math.round(telemetry.battery_pct)}%` : "--"}
          </span>
        </div>
      </div>
    </div>
  );
}

function RcStatusSection({ telemetry }: { telemetry: Telemetry | null }) {
  const channelCount = telemetry?.rc_channels?.length ?? null;

  return (
    <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Radio size={14} className="text-accent" />
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          RC Status
        </h3>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wider text-text-muted">Channels</span>
          <span className="text-sm font-medium text-text-primary">
            {channelCount != null ? String(channelCount) : "--"}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wider text-text-muted">RSSI</span>
          <span className="text-sm font-medium text-text-primary">
            {telemetry?.rc_rssi != null ? String(telemetry.rc_rssi) : "--"}
          </span>
        </div>
      </div>
    </div>
  );
}

function PrerequisitesSection() {
  return (
    <div className="rounded-lg border border-border-light bg-accent/5 p-4">
      <div className="mb-2 flex items-center gap-2">
        <Info size={14} className="text-accent" />
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          Prerequisites
        </h3>
      </div>
      <ul className="flex flex-col gap-1.5 text-xs text-text-secondary">
        <li className="flex items-start gap-2">
          <span className="mt-0.5 h-1 w-1 shrink-0 rounded-full bg-text-muted" />
          GPS lock recommended before compass calibration
        </li>
        <li className="flex items-start gap-2">
          <span className="mt-0.5 h-1 w-1 shrink-0 rounded-full bg-text-muted" />
          Ensure battery is charged for calibration procedures
        </li>
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function InspectionStep({ vehicleState, telemetry, sensorHealth }: InspectionStepProps) {
  return (
    <div className="flex flex-col gap-3 p-4">
      <VehicleInfoSection vehicleState={vehicleState} />
      <SensorHealthTable sensorHealth={sensorHealth} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <GpsStatusSection telemetry={telemetry} />
        <BatteryStatusSection telemetry={telemetry} />
        <RcStatusSection telemetry={telemetry} />
      </div>
      <PrerequisitesSection />
    </div>
  );
}

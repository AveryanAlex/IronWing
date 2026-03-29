import { useState } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import type { useSession } from "../hooks/use-session";
import type { useMission } from "../hooks/use-mission";

type TelemetryPanelProps = {
  vehicle: ReturnType<typeof useSession>;
  mission: ReturnType<typeof useMission>;
};

function fmt(value: number | undefined, decimals = 1): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "--";
  return value.toFixed(decimals);
}

function fmtInt(value: number | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "--";
  return Math.round(value).toString();
}

function getBatteryColor(pct: number | undefined) {
  if (pct === undefined) return "text-text-primary";
  if (pct > 50) return "text-success";
  if (pct >= 20) return "text-warning";
  return "text-danger";
}

function getGpsColor(fix: string | undefined) {
  if (!fix) return "text-danger";
  const lower = fix.toLowerCase();
  if (lower.includes("3d")) return "text-success";
  if (lower.includes("2d")) return "text-warning";
  return "text-danger";
}

function getRssiColor(rssi: number | undefined) {
  if (rssi === undefined) return "text-text-primary";
  if (rssi > 70) return "text-success";
  if (rssi >= 30) return "text-warning";
  return "text-danger";
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-bg-secondary p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">{title}</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{children}</div>
    </div>
  );
}

function MetricValue<T>({
  label,
  value,
  unit,
  rawValue,
  colorFn,
}: {
  label: string;
  value: string;
  unit?: string;
  rawValue?: T;
  colorFn?: (val: T) => string;
}) {
  const colorClass = colorFn && rawValue !== undefined ? colorFn(rawValue) : "text-text-primary";
  return (
    <div className="flex flex-col">
      <div className="flex items-baseline">
        <span className={`text-lg font-mono tabular-nums ${colorClass}`}>{value}</span>
        {unit && <span className="ml-0.5 text-xs text-text-muted">{unit}</span>}
      </div>
      <span className="mt-0.5 text-xs text-text-muted">{label}</span>
    </div>
  );
}

function ChannelBars({ label, values }: { label: string; values?: number[] }) {
  if (!values || values.length === 0) return <span className="text-xs text-text-muted">No data</span>;
  return (
    <div className="col-span-full flex flex-wrap gap-x-4 gap-y-2 mt-2">
      {values.map((v, i) => {
        const pct = Math.max(0, Math.min(100, ((v - 1000) / 1000) * 100));
        return (
          <div key={i} className="flex items-center gap-2">
            <span className="w-6 text-right text-[10px] text-text-muted">
              {label}{i + 1}
            </span>
            <div className="h-2 w-16 overflow-hidden rounded-full bg-bg-tertiary">
              <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
            </div>
            <span className="w-10 text-[10px] tabular-nums text-text-secondary">{v}</span>
          </div>
        );
      })}
    </div>
  );
}

function CellBars({ cells }: { cells?: number[] }) {
  if (!cells || cells.length === 0) return null;
  return (
    <div className="col-span-full mt-2 border-t border-border-light pt-2">
      <h4 className="mb-1.5 text-[10px] uppercase text-text-muted">Cell Voltages</h4>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {cells.map((v, i) => {
          const pct = Math.max(0, Math.min(100, ((v - 3.0) / 1.2) * 100));
          return (
            <div key={i} className="flex items-center gap-1.5">
              <span className="w-4 text-right text-[10px] text-text-muted">C{i + 1}</span>
              <div className="h-1.5 w-12 overflow-hidden rounded-full bg-bg-tertiary">
                <div
                  className={`h-full rounded-full ${v < 3.5 ? "bg-danger" : "bg-success"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-8 text-[10px] tabular-nums text-text-secondary">{v.toFixed(2)}V</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TelemetryPanel({ vehicle, mission }: TelemetryPanelProps) {
  const { telemetry } = vehicle;
  const [rcOpen, setRcOpen] = useState(false);

  return (
    <div className="h-full space-y-4 overflow-y-auto p-4">
      {/* Rate controls section — filled by T9 */}
      <div data-testid="rate-controls-slot" />

      <SectionCard title="Flight">
        <MetricValue label="Altitude" value={fmt(telemetry.altitude_m)} unit="m" />
        <MetricValue label="Speed" value={fmt(telemetry.speed_mps)} unit="m/s" />
        <MetricValue label="Airspeed" value={fmt(telemetry.airspeed_mps)} unit="m/s" />
        <MetricValue label="Climb Rate" value={fmt(telemetry.climb_rate_mps)} unit="m/s" />
        <MetricValue label="Heading" value={fmt(telemetry.heading_deg, 0)} unit="°" />
        <MetricValue label="Throttle" value={fmtInt(telemetry.throttle_pct)} unit="%" />
      </SectionCard>

      <SectionCard title="Navigation">
        <MetricValue label="WP Dist" value={fmt(telemetry.wp_dist_m, 0)} unit="m" />
        <MetricValue label="Nav Brg" value={fmt(telemetry.nav_bearing_deg, 0)} unit="°" />
        <MetricValue label="Tgt Brg" value={fmt(telemetry.target_bearing_deg, 0)} unit="°" />
        <MetricValue label="XTrack" value={fmt(telemetry.xtrack_error_m)} unit="m" />
      </SectionCard>

      <SectionCard title="Attitude">
        <MetricValue label="Roll" value={fmt(telemetry.roll_deg)} unit="°" />
        <MetricValue label="Pitch" value={fmt(telemetry.pitch_deg)} unit="°" />
        <MetricValue label="Yaw" value={fmt(telemetry.yaw_deg, 0)} unit="°" />
      </SectionCard>

      <SectionCard title="Position">
        <MetricValue label="Latitude" value={fmt(telemetry.latitude_deg, 6)} />
        <MetricValue label="Longitude" value={fmt(telemetry.longitude_deg, 6)} />
      </SectionCard>

      <SectionCard title="Battery & Power">
        <MetricValue
          label="Remaining"
          value={fmtInt(telemetry.battery_pct)}
          unit="%"
          rawValue={telemetry.battery_pct}
          colorFn={getBatteryColor}
        />
        <MetricValue label="Voltage" value={fmt(telemetry.battery_voltage_v, 2)} unit="V" />
        <MetricValue label="Current" value={fmt(telemetry.battery_current_a, 1)} unit="A" />
        <MetricValue label="Energy" value={fmt(telemetry.energy_consumed_wh, 1)} unit="Wh" />
        <MetricValue
          label="Time Left"
          value={
            telemetry.battery_time_remaining_s != null
              ? `${Math.floor(telemetry.battery_time_remaining_s / 60)}m`
              : "--"
          }
        />
        <CellBars cells={telemetry.battery_voltage_cells} />
      </SectionCard>

      <SectionCard title="GPS & Terrain">
        <MetricValue
          label="Fix"
          value={telemetry.gps_fix_type ?? "--"}
          rawValue={telemetry.gps_fix_type}
          colorFn={getGpsColor}
        />
        <MetricValue label="Sats" value={telemetry.gps_satellites != null ? String(telemetry.gps_satellites) : "--"} />
        <MetricValue label="HDOP" value={fmt(telemetry.gps_hdop, 1)} />
        <MetricValue label="Terrain" value={fmt(telemetry.terrain_height_m, 0)} unit="m" />
        <MetricValue label="AGL" value={fmt(telemetry.height_above_terrain_m)} unit="m" />
      </SectionCard>

      <Collapsible.Root
        open={rcOpen}
        onOpenChange={setRcOpen}
        className="rounded-lg border border-border bg-bg-secondary p-4"
      >
        <Collapsible.Trigger className="flex w-full items-center justify-between group">
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-muted group-hover:text-text-secondary">
            <span className={`transition-transform duration-200 ${rcOpen ? "rotate-90" : ""}`}>&#9654;</span>
            RC & Servos
          </h3>
          {telemetry.rc_rssi != null && (
            <span className={`text-xs font-mono ${getRssiColor(telemetry.rc_rssi)}`}>
              RSSI {telemetry.rc_rssi}%
            </span>
          )}
        </Collapsible.Trigger>
        <Collapsible.Content className="mt-4 space-y-4 border-t border-border-light pt-4">
          <div>
            <h4 className="mb-2 text-[10px] uppercase text-text-muted">RC Channels</h4>
            <ChannelBars label="CH" values={telemetry.rc_channels} />
          </div>
          <div>
            <h4 className="mb-2 text-[10px] uppercase text-text-muted">Servo Outputs</h4>
            <ChannelBars label="S" values={telemetry.servo_outputs} />
          </div>
        </Collapsible.Content>
      </Collapsible.Root>
    </div>
  );
}

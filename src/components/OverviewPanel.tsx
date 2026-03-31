import { Group, Panel, Separator } from "react-resizable-panels";
import { MapPanel } from "./MapPanel";
import type { useSession } from "../hooks/use-session";
import type { useGuided } from "../hooks/use-guided";
import type { useMission } from "../hooks/use-mission";
import type { useDeviceLocation } from "../hooks/use-device-location";

type OverviewPanelProps = {
  vehicle: ReturnType<typeof useSession>;
  guided: ReturnType<typeof useGuided>;
  mission: ReturnType<typeof useMission>;
  deviceLocation: ReturnType<typeof useDeviceLocation>;
  flightPath?: [number, number][];
};

function MetricCard({
  label,
  value,
  unit,
  valueClass = "text-text-primary",
  className = "",
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  valueClass?: string;
  className?: string;
}) {
  return (
    <div className={`bg-bg-tertiary/50 border border-border-light rounded-lg p-3 flex flex-col justify-center min-w-0 ${className}`}>
      <div className="flex items-baseline gap-1 min-w-0">
        <span className={`text-xl font-semibold tabular-nums font-mono truncate min-w-0 ${valueClass}`}>{value}</span>
        {unit && <span className="text-xs text-text-muted shrink-0">{unit}</span>}
      </div>
      <span className="text-xs text-text-muted mt-1">{label}</span>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-2">{title}</h3>;
}

export function OverviewPanel({
  vehicle,
  guided,
  mission,
  deviceLocation,
  flightPath,
}: OverviewPanelProps) {
  const connected = vehicle.connected;
  const t = vehicle.telemetry;
  const s = vehicle.vehicleState;

  // Formatting helpers
  const fNum = (val: number | undefined, dec = 1) => (connected && val != null && !Number.isNaN(val) ? val.toFixed(dec) : "--");
  const fInt = (val: number | undefined) => (connected && val != null && !Number.isNaN(val) ? Math.round(val).toString() : "--");

  const batPct = t.battery_pct != null ? t.battery_pct : 0;
  const batColor = batPct > 50 ? "bg-success" : batPct >= 20 ? "bg-warning" : "bg-danger";
  const batText = batPct > 50 ? "text-success" : batPct >= 20 ? "text-warning" : "text-danger";

  const fixTypeStr = t.gps_fix_type || "No Fix";
  const fixColor = !connected || !t.gps_fix_type || t.gps_fix_type.toLowerCase().includes("no") 
    ? "text-danger" 
    : t.gps_fix_type.toLowerCase().includes("3d") || t.gps_fix_type.toLowerCase().includes("rtk") 
      ? "text-success" 
      : "text-warning";

  return (
    <div className="h-full w-full bg-bg-primary">
      <Group orientation="horizontal" className="h-full w-full">
        {/* Left: Map */}
        <Panel defaultSize={70} minSize={50} className="h-full relative">
          <MapPanel
            vehicle={vehicle}
            guided={guided}
            mission={mission}
            deviceLocation={deviceLocation}
            flightPath={flightPath}
          />
        </Panel>

        <Separator className="w-px bg-border hover:w-1 hover:bg-accent hover:cursor-col-resize transition-all" />

        {/* Right: Metrics Dashboard */}
        <Panel defaultSize={30} minSize={20} className="h-full">
          <div className="h-full bg-bg-secondary p-4 overflow-y-auto space-y-6">
            
            {/* Status Section */}
            <section>
              <SectionHeader title="Status" />
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-bg-tertiary/50 border border-border-light rounded-lg p-3 flex flex-col justify-center min-w-0">
                  <span className="text-xl font-semibold text-text-primary truncate">
                    {connected && s ? (s.mode_name || "Unknown") : "--"}
                  </span>
                  <span className="text-xs text-text-muted mt-1">Mode</span>
                </div>
                <div className="bg-bg-tertiary/50 border border-border-light rounded-lg p-3 flex flex-col justify-center min-w-0">
                  <span className={`text-xl font-semibold truncate ${connected && s?.armed ? "text-accent" : "text-text-muted"}`}>
                    {connected && s ? (s.armed ? "ARMED" : "DISARMED") : "--"}
                  </span>
                  <span className="text-xs text-text-muted mt-1">Arm State</span>
                </div>
              </div>
            </section>

            {/* Flight Section */}
            <section>
              <SectionHeader title="Flight" />
              <div className="grid grid-cols-2 gap-2">
                <MetricCard label="Altitude" value={fNum(t.altitude_m, 1)} unit="m" />
                <MetricCard label="Speed" value={fNum(t.speed_mps, 1)} unit="m/s" />
                <MetricCard label="Heading" value={fInt(t.heading_deg)} unit="°" />
                <MetricCard label="Climb Rate" value={fNum(t.climb_rate_mps, 1)} unit="m/s" />
              </div>
            </section>

            {/* Battery Section */}
            <section>
              <SectionHeader title="Battery" />
              <div className="bg-bg-tertiary/50 border border-border-light rounded-lg p-3">
                <div className="flex justify-between items-end mb-2">
                  <div className="flex items-baseline gap-1">
                    <span className={`text-xl font-semibold tabular-nums font-mono ${connected ? batText : "text-text-primary"}`}>
                      {fInt(t.battery_pct)}
                    </span>
                    <span className="text-xs text-text-muted">%</span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-sm font-semibold tabular-nums font-mono text-text-primary">
                      {fNum(t.battery_voltage_v, 1)}
                    </span>
                    <span className="text-xs text-text-muted">V</span>
                  </div>
                </div>
                <div className="w-full h-1.5 bg-bg-primary rounded-full overflow-hidden">
                  <div 
                    className={`h-full ${batColor} transition-all duration-500`} 
                    style={{ width: `${connected ? Math.max(0, Math.min(100, batPct)) : 0}%` }}
                  />
                </div>
              </div>
            </section>

            {/* GPS Section */}
            <section>
              <SectionHeader title="GPS" />
              <div className="grid grid-cols-2 gap-2">
                <MetricCard
                  label="Fix"
                  value={connected ? fixTypeStr : "--"}
                  valueClass={fixColor}
                  className="col-span-2"
                />
                <MetricCard
                  label="Satellites"
                  value={fInt(t.gps_satellites)}
                />
              </div>
            </section>

            <section>
              <SectionHeader title="Navigation" />
              <div className="grid grid-cols-2 gap-2">
                <MetricCard 
                  label="WP Progress" 
                  value={connected && mission?.vehicle?.activeSeq != null ? `${mission.vehicle.activeSeq + 1} / ${mission.mission.displayTotal}` : "--"}
                />
                <MetricCard 
                  label="Dist to WP" 
                  value={fInt(t.wp_dist_m)} 
                  unit="m" 
                />
                <MetricCard 
                  label="Nav Bearing" 
                  value={fInt(t.nav_bearing_deg)} 
                  unit="°" 
                />
              </div>
            </section>

          </div>
        </Panel>
      </Group>
    </div>
  );
}

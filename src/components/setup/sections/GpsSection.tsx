import { useState, useMemo } from "react";
import {
  Satellite,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  MapPin,
  Navigation,
  Info,
} from "lucide-react";
import { ParamSelect } from "../primitives/ParamSelect";
import { ParamToggle } from "../primitives/ParamToggle";
import { ParamBitmaskInput } from "../primitives/ParamBitmaskInput";
import { getStagedOrCurrent } from "../primitives/param-helpers";
import type { ParamInputParams } from "../primitives/param-helpers";
import type { Telemetry } from "../../../telemetry";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** ArduPilot serial port protocol 5 = GPS. Scan SERIAL0..SERIAL8. */
const SERIAL_INDICES = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const GPS_PROTOCOL = 5;

function findGpsSerialPorts(params: ParamInputParams): string[] {
  const ports: string[] = [];
  for (const i of SERIAL_INDICES) {
    const name = `SERIAL${i}_PROTOCOL`;
    const val = getStagedOrCurrent(name, params);
    if (val === GPS_PROTOCOL) {
      ports.push(`SERIAL${i}`);
    }
  }
  return ports;
}

/**
 * Resolve GPS1_TYPE vs GPS_TYPE.
 * Newer firmware uses GPS1_TYPE; older uses GPS_TYPE.
 * Returns whichever exists in the param store.
 */
function resolveGps1TypeParam(params: ParamInputParams): string {
  if (params.store?.params["GPS1_TYPE"] !== undefined) return "GPS1_TYPE";
  return "GPS_TYPE";
}

/** Pretty-print a GPS fix type string from telemetry. */
function formatFixType(fixType: string): string {
  switch (fixType) {
    case "no_gps":
      return "No GPS";
    case "no_fix":
      return "No Fix";
    case "fix_2d":
      return "2D Fix";
    case "fix_3d":
      return "3D Fix";
    case "dgps":
      return "DGPS";
    case "rtk_float":
      return "RTK Float";
    case "rtk_fixed":
      return "RTK Fixed";
    default:
      return fixType;
  }
}

/** Fix-type colour coding. */
function fixTypeColor(fixType: string | undefined): string {
  if (!fixType) return "text-text-muted";
  if (["fix_3d", "dgps", "rtk_float", "rtk_fixed"].includes(fixType))
    return "text-success";
  if (fixType === "fix_2d") return "text-warning";
  return "text-danger";
}

function fmtCoord(deg: number | undefined): string {
  if (deg == null) return "--";
  return deg.toFixed(7) + "\u00B0";
}

function fmtHdop(hdop: number | undefined): string {
  if (hdop == null) return "--";
  return hdop.toFixed(1);
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type GpsSectionProps = {
  params: ParamInputParams;
  telemetry: Telemetry | null;
};

// ---------------------------------------------------------------------------
// GPS 1 Panel
// ---------------------------------------------------------------------------

function Gps1Panel({ params }: { params: ParamInputParams }) {
  const gps1TypeParam = resolveGps1TypeParam(params);
  const gps1Type = getStagedOrCurrent(gps1TypeParam, params);
  const gpsEnabled = gps1Type != null && gps1Type > 0;
  const gpsPorts = useMemo(() => findGpsSerialPorts(params), [params]);

  return (
    <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Satellite size={14} className="text-accent" />
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          GPS 1
        </h3>
      </div>

      <div className="flex flex-col gap-4">
        <ParamSelect paramName={gps1TypeParam} params={params} label="GPS Type" />

        {gpsEnabled && gpsPorts.length === 0 && (
          <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2.5">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
            <p className="text-xs text-warning">
              No serial port configured for GPS &mdash; set a serial port
              protocol to <span className="font-mono">GPS (5)</span> in the
              Serial Ports section.
            </p>
          </div>
        )}

        {gpsEnabled && gpsPorts.length > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-border bg-bg-secondary/50 px-3 py-2">
            <Info size={14} className="mt-0.5 shrink-0 text-accent" />
            <p className="text-xs text-text-secondary">
              GPS on{" "}
              <span className="font-mono font-medium text-text-primary">
                {gpsPorts.join(", ")}
              </span>
            </p>
          </div>
        )}

        <ParamToggle
          paramName="GPS_AUTO_CONFIG"
          params={params}
          label="Auto Configure"
          description="Automatically send configuration to the GPS module on boot."
        />

        <ParamBitmaskInput
          paramName="GPS_GNSS_MODE"
          params={params}
          label="GNSS Constellations"
          description="Select which GNSS constellations to enable (GPS, GLONASS, Galileo, BeiDou, etc.)."
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GPS 2 Panel (collapsible, collapsed by default)
// ---------------------------------------------------------------------------

function Gps2Panel({ params }: { params: ParamInputParams }) {
  const [expanded, setExpanded] = useState(false);
  const gps2Type = getStagedOrCurrent("GPS2_TYPE", params);
  const gps2Exists = params.store?.params["GPS2_TYPE"] !== undefined;

  // Don't show GPS2 panel at all if firmware doesn't support it
  if (!gps2Exists && !params.staged.has("GPS2_TYPE")) return null;

  return (
    <div className="rounded-lg border border-border bg-bg-tertiary/50">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 rounded-lg px-4 py-3 text-left transition-colors hover:bg-bg-tertiary/80"
      >
        {expanded ? (
          <ChevronDown size={12} className="shrink-0 text-text-muted" />
        ) : (
          <ChevronRight size={12} className="shrink-0 text-text-muted" />
        )}
        <Navigation size={14} className="shrink-0 text-accent" />
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          GPS 2
        </h3>
        {gps2Type != null && gps2Type > 0 && (
          <span className="ml-auto rounded bg-accent/10 px-1.5 py-px text-[9px] font-medium text-accent">
            enabled
          </span>
        )}
      </button>

      {expanded && (
        <div className="flex flex-col gap-4 border-t border-border px-4 pb-4 pt-3">
          <ParamSelect
            paramName="GPS2_TYPE"
            params={params}
            label="GPS 2 Type"
          />

          <ParamSelect
            paramName="GPS_AUTO_SWITCH"
            params={params}
            label="GPS Auto Switch"
            description="How the autopilot chooses between GPS 1 and GPS 2."
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Live GPS Status (read-only, from telemetry)
// ---------------------------------------------------------------------------

function GpsStatusPanel({ telemetry }: { telemetry: Telemetry | null }) {
  const fixType = telemetry?.gps_fix_type;
  const hasPosition =
    telemetry?.latitude_deg != null && telemetry?.longitude_deg != null;

  return (
    <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <MapPin size={14} className="text-accent" />
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          Live GPS Status
        </h3>
        {fixType && (
          <span
            className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium ${
              ["fix_3d", "dgps", "rtk_float", "rtk_fixed"].includes(fixType)
                ? "bg-success/10 text-success"
                : fixType === "fix_2d"
                  ? "bg-warning/10 text-warning"
                  : "bg-danger/10 text-danger"
            }`}
          >
            {formatFixType(fixType)}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wider text-text-muted">
            Fix Type
          </span>
          <span className={`text-sm font-medium ${fixTypeColor(fixType)}`}>
            {fixType ? formatFixType(fixType) : "--"}
          </span>
        </div>

        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wider text-text-muted">
            Satellites
          </span>
          <span className="text-sm font-medium text-text-primary">
            {telemetry?.gps_satellites != null
              ? String(telemetry.gps_satellites)
              : "--"}
          </span>
        </div>

        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wider text-text-muted">
            HDOP
          </span>
          <span className="text-sm font-medium text-text-primary">
            {fmtHdop(telemetry?.gps_hdop)}
          </span>
        </div>

        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wider text-text-muted">
            Position
          </span>
          {hasPosition ? (
            <span className="text-xs font-mono text-text-primary">
              {fmtCoord(telemetry?.latitude_deg)},{" "}
              {fmtCoord(telemetry?.longitude_deg)}
            </span>
          ) : (
            <span className="text-sm font-medium text-text-muted">--</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section root
// ---------------------------------------------------------------------------

export function GpsSection({ params, telemetry }: GpsSectionProps) {
  return (
    <div className="flex flex-col gap-4 p-4">
      <Gps1Panel params={params} />
      <Gps2Panel params={params} />
      <GpsStatusPanel telemetry={telemetry} />
    </div>
  );
}

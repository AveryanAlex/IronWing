import { useMemo } from "react";
import { Cable, AlertTriangle, Info, RotateCw, Lightbulb } from "lucide-react";
import { ParamSelect } from "../primitives/ParamSelect";
import { getStagedOrCurrent } from "../primitives/param-helpers";
import type { ParamInputParams } from "../primitives/param-helpers";
import { SetupSectionIntro } from "../shared/SetupSectionIntro";
import { SectionCardHeader } from "../shared/SectionCardHeader";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Well-known board labels for common UART positions (ArduPilot defaults). */
const UART_LABELS: Record<number, string> = {
  0: "USB",
  1: "TELEM1",
  2: "TELEM2",
  3: "GPS1",
  4: "GPS2",
  5: "USER",
};

/**
 * Protocols that should NOT be duplicated across multiple ports.
 * Maps protocol value → human label for the conflict warning.
 */
export const EXCLUSIVE_PROTOCOLS: Record<number, string> = {
  5: "GPS",
  23: "RCInput",
  28: "Scripting",
};

// ---------------------------------------------------------------------------
// Dynamic port detection
// ---------------------------------------------------------------------------

export type SerialPort = {
  /** Numeric index, e.g. 0, 1, 2 … */
  index: number;
  /** Full param prefix, e.g. "SERIAL3" */
  prefix: string;
  /** Board-specific label, e.g. "TELEM1", or undefined for unknown */
  boardLabel: string | undefined;
};

/**
 * Detect serial ports dynamically from the param store.
 * Scans for `SERIALn_BAUD` keys (same approach as MissionPlanner's ConfigSerial.cs).
 */
export function detectSerialPorts(params: ParamInputParams): SerialPort[] {
  if (!params.store) return [];

  const ports: SerialPort[] = [];
  // ArduPilot serial indices go 0..9 (typically), but we detect dynamically
  for (let i = 0; i <= 9; i++) {
    const baudParam = `SERIAL${i}_BAUD`;
    if (params.store.params[baudParam] !== undefined) {
      ports.push({
        index: i,
        prefix: `SERIAL${i}`,
        boardLabel: UART_LABELS[i],
      });
    }
  }
  return ports;
}

// ---------------------------------------------------------------------------
// Conflict detection
// ---------------------------------------------------------------------------

type ProtocolConflict = {
  protocol: number;
  protocolLabel: string;
  ports: string[];
};

/**
 * Find exclusive protocols assigned to more than one port.
 * Uses staged-or-current values so conflicts are detected before apply.
 */
export function detectConflicts(
  ports: SerialPort[],
  params: ParamInputParams,
): ProtocolConflict[] {
  const usage = new Map<number, string[]>();

  for (const port of ports) {
    const val = getStagedOrCurrent(`${port.prefix}_PROTOCOL`, params);
    if (val == null || val === 0 || val === -1) continue;
    if (EXCLUSIVE_PROTOCOLS[val] !== undefined) {
      const list = usage.get(val) ?? [];
      list.push(port.prefix);
      usage.set(val, list);
    }
  }

  const conflicts: ProtocolConflict[] = [];
  for (const [proto, portList] of usage) {
    if (portList.length > 1) {
      conflicts.push({
        protocol: proto,
        protocolLabel: EXCLUSIVE_PROTOCOLS[proto]!,
        ports: portList,
      });
    }
  }
  return conflicts;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type SerialPortsSectionProps = {
  params: ParamInputParams;
};

// ---------------------------------------------------------------------------
// Port table (responsive)
// ---------------------------------------------------------------------------

function PortTable({
  ports,
  params,
}: {
  ports: SerialPort[];
  params: ParamInputParams;
}) {
  if (ports.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center text-text-muted">
        <Cable size={24} className="opacity-30" />
        <p className="text-xs">
          No serial ports detected. Connect a vehicle and download parameters.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto -mx-4">
      <table className="w-full min-w-[420px] text-left">
        <thead>
          <tr className="border-b border-border">
            <th className="pb-2 pl-4 pr-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              Port
            </th>
            <th className="pb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              Protocol
            </th>
            <th className="pb-2 pl-2 pr-4 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              Baud Rate
            </th>
          </tr>
        </thead>
        <tbody className="[&_tr:first-child_td]:pt-3 [&_tr:last-child_td]:pb-0">
          {ports.map((port) => (
            <tr
              key={port.index}
              className="border-b border-border/50 last:border-b-0"
            >
              {/* Port identifier */}
              <td className="py-2.5 pl-4 pr-3 align-middle">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-mono font-medium text-text-primary">
                    {port.prefix}
                  </span>
                  {port.boardLabel && (
                    <span className="text-[10px] text-text-muted">
                      {port.boardLabel}
                    </span>
                  )}
                </div>
              </td>

              {/* Protocol */}
              <td className="py-2.5 px-2 align-middle">
                <ParamSelect
                  paramName={`${port.prefix}_PROTOCOL`}
                  params={params}
                  compact
                />
              </td>

              {/* Baud Rate */}
              <td className="py-2.5 pl-2 pr-4 align-middle">
                <ParamSelect
                  paramName={`${port.prefix}_BAUD`}
                  params={params}
                  compact
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Conflict warnings
// ---------------------------------------------------------------------------

function ConflictWarnings({ conflicts }: { conflicts: ProtocolConflict[] }) {
  if (conflicts.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {conflicts.map((c) => (
        <div
          key={c.protocol}
          className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2.5"
        >
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
          <p className="text-xs text-warning">
            <span className="font-medium">{c.protocolLabel}</span> (protocol{" "}
            {c.protocol}) is assigned to multiple ports:{" "}
            <span className="font-mono font-medium">
              {c.ports.join(", ")}
            </span>
            . This protocol does not support sharing and may cause conflicts.
          </p>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reboot notice
// ---------------------------------------------------------------------------

function RebootNotice() {
  return (
    <div className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2.5">
      <RotateCw size={14} className="mt-0.5 shrink-0 text-danger" />
      <p className="text-xs text-danger">
        Serial port changes require a <span className="font-semibold">reboot</span> to take effect.
        Apply your changes, then reboot the flight controller.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Setup hints
// ---------------------------------------------------------------------------

function SetupHints() {
  return (
    <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
      <SectionCardHeader icon={Lightbulb} title="Common Configurations" />

      <div className="flex flex-col gap-2.5">
        <div className="flex items-start gap-2 rounded-md border border-border bg-bg-secondary/50 px-3 py-2">
          <Info size={14} className="mt-0.5 shrink-0 text-accent" />
          <p className="text-xs text-text-secondary">
            <span className="font-medium text-text-primary">GPS</span> &mdash; typically on
            SERIAL3 or SERIAL4. Set protocol to{" "}
            <span className="font-mono text-text-primary">GPS (5)</span> with
            baud <span className="font-mono text-text-primary">115200</span>.
          </p>
        </div>

        <div className="flex items-start gap-2 rounded-md border border-border bg-bg-secondary/50 px-3 py-2">
          <Info size={14} className="mt-0.5 shrink-0 text-accent" />
          <p className="text-xs text-text-secondary">
            <span className="font-medium text-text-primary">CRSF / ELRS receiver</span> &mdash;
            set protocol to{" "}
            <span className="font-mono text-text-primary">RCInput (23)</span> on
            the connected UART. Baud rate is auto-negotiated.
          </p>
        </div>

        <div className="flex items-start gap-2 rounded-md border border-border bg-bg-secondary/50 px-3 py-2">
          <Info size={14} className="mt-0.5 shrink-0 text-accent" />
          <p className="text-xs text-text-secondary">
            <span className="font-medium text-text-primary">Telemetry</span> &mdash;
            MAVLink2 on SERIAL1/SERIAL2 with baud{" "}
            <span className="font-mono text-text-primary">57600</span> or{" "}
            <span className="font-mono text-text-primary">921600</span> for
            high-bandwidth links.
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section root
// ---------------------------------------------------------------------------

export function SerialPortsSection({ params }: SerialPortsSectionProps) {
  const ports = useMemo(() => detectSerialPorts(params), [params.store]);
  const conflicts = useMemo(
    () => detectConflicts(ports, params),
    [ports, params.store, params.staged],
  );

  return (
    <div className="flex flex-col gap-4 p-4">
      <SetupSectionIntro
        icon={Cable}
        title="Serial Ports"
        description="Assign protocols and baud rates to each serial port. GPS, telemetry, and RC receiver connections are configured here."
      />

      {/* Reboot notice — always visible */}
      <RebootNotice />

      {/* Port table card */}
      <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
        <div className="mb-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cable size={14} className="text-accent" />
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              Serial Port Assignment
            </h3>
          </div>
          {ports.length > 0 && (
            <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
              {ports.length} ports
            </span>
          )}
        </div>

        <PortTable ports={ports} params={params} />
      </div>

      {/* Conflict warnings */}
      <ConflictWarnings conflicts={conflicts} />

      {/* Setup hints */}
      <SetupHints />
    </div>
  );
}

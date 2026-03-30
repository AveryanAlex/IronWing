import { useMemo } from "react";
import { Radio, Shuffle, Signal, Activity, Info } from "lucide-react";
import { ParamSelect } from "../primitives/ParamSelect";
import { ParamBitmaskInput } from "../primitives/ParamBitmaskInput";
import { getStagedOrCurrent } from "../primitives/param-helpers";
import type { ParamInputParams } from "../primitives/param-helpers";
import type { Telemetry } from "../../../telemetry";
import { SetupSectionIntro } from "../shared/SetupSectionIntro";
import { SectionCardHeader } from "../shared/SectionCardHeader";
import { resolveDocsUrl } from "../../../data/ardupilot-docs";
import { PwmChannelBars, type PwmChannelBarItem } from "../shared/PwmChannelBars";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_RC_CHANNELS = 18;
const RC_SERIAL_PROTOCOL = 23; // SERIALn_PROTOCOL value for RC input
const MAX_SERIAL_PORTS = 10; // SERIAL0..SERIAL9

const CHANNEL_OPTIONS = Array.from({ length: 16 }, (_, i) => ({
  value: i + 1,
  label: `Channel ${i + 1}`,
}));

const PRIMARY_CONTROL_MAPPINGS = [
  { paramName: "RCMAP_ROLL", label: "Roll" },
  { paramName: "RCMAP_PITCH", label: "Pitch" },
  { paramName: "RCMAP_THROTTLE", label: "Throttle" },
  { paramName: "RCMAP_YAW", label: "Yaw" },
] as const;

const MAPPING_PRESETS: { label: string; values: Record<string, number> }[] = [
  {
    label: "Mode 2 (AETR)",
    values: { RCMAP_ROLL: 1, RCMAP_PITCH: 2, RCMAP_THROTTLE: 3, RCMAP_YAW: 4 },
  },
  {
    label: "Mode 1 (AERT)",
    values: { RCMAP_ROLL: 1, RCMAP_PITCH: 3, RCMAP_THROTTLE: 2, RCMAP_YAW: 4 },
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Scan param store for serial ports configured as RC input (protocol 23). */
function findRcSerialPorts(params: ParamInputParams): string[] {
  if (!params.store) return [];
  const ports: string[] = [];
  for (let i = 0; i < MAX_SERIAL_PORTS; i++) {
    const name = `SERIAL${i}_PROTOCOL`;
    const value = params.store.params[name]?.value;
    if (value === RC_SERIAL_PROTOCOL) {
      ports.push(`SERIAL${i}`);
    }
  }
  return ports;
}

function isValidRcPwm(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 500 && value <= 3000;
}

function buildPrimaryControlBadges(params: ParamInputParams): Map<number, string[]> {
  const badges = new Map<number, string[]>();

  for (const mapping of PRIMARY_CONTROL_MAPPINGS) {
    const channel = getStagedOrCurrent(mapping.paramName, params);
    if (typeof channel !== "number" || !Number.isInteger(channel) || channel < 1 || channel > MAX_RC_CHANNELS) {
      continue;
    }

    const existing = badges.get(channel) ?? [];
    existing.push(mapping.label);
    badges.set(channel, existing);
  }

  return badges;
}

function buildLiveRcChannelItems(
  rcChannels: Telemetry["rc_channels"],
  mappedBadges: Map<number, string[]>,
): PwmChannelBarItem[] {
  if (!rcChannels?.length) return [];

  const items: PwmChannelBarItem[] = [];
  for (let index = 0; index < Math.min(rcChannels.length, MAX_RC_CHANNELS); index++) {
    const value = rcChannels[index];
    if (!isValidRcPwm(value)) continue;

    const channel = index + 1;
    items.push({
      channel,
      value,
      annotations: mappedBadges.get(channel),
    });
  }

  return items;
}

function getRssiColor(rssi: number | null): string {
  if (rssi == null) return "text-text-muted";
  if (rssi > 70) return "text-success";
  if (rssi >= 30) return "text-warning";
  return "text-danger";
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type RcReceiverSectionProps = {
  params: ParamInputParams;
  connected: boolean;
  telemetry: Telemetry | null;
};

// ---------------------------------------------------------------------------
// Receiver Protocol Panel
// ---------------------------------------------------------------------------

function ReceiverProtocolPanel({ params }: { params: ParamInputParams }) {
  const rcSerialPorts = useMemo(() => findRcSerialPorts(params), [params.store]);

  return (
    <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
      <SectionCardHeader icon={Radio} title="Receiver Protocol" />

      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-2 rounded-md border border-border bg-bg-secondary/50 px-3 py-2.5">
          <Info size={14} className="mt-0.5 shrink-0 text-accent" />
          <p className="text-xs text-text-secondary">
            Serial RC protocols (CRSF, ELRS, SRXL2, SBUS) require a serial port configured
            with protocol 23 (RCIn). Set <span className="font-mono text-text-primary">RC_PROTOCOLS</span> to
            auto-detect or select a specific protocol.
          </p>
        </div>

        {rcSerialPorts.length > 0 && (
          <div className="flex items-center gap-2 rounded-md bg-success/10 px-3 py-2 text-xs text-success">
            <Radio size={12} />
            RC input configured on: {rcSerialPorts.map((p) => (
              <span key={p} className="font-mono font-medium">{p}</span>
            ))}
          </div>
        )}

        {rcSerialPorts.length === 0 && params.store && (
          <div className="flex items-center gap-2 rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
            <Info size={12} />
            No serial port configured for RC input (protocol 23). Non-serial receivers (PPM/PWM) use dedicated RC input pins.
          </div>
        )}

        <ParamBitmaskInput
          paramName="RC_PROTOCOLS"
          params={params}
          description="Select which RC protocols to auto-detect. Leave all checked for auto-detect, or select specific protocols."
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Channel Mapping Panel
// ---------------------------------------------------------------------------

function ChannelMappingPanel({ params }: { params: ParamInputParams }) {
  const currentPreset = useMemo(() => {
    for (const preset of MAPPING_PRESETS) {
      const matches = Object.entries(preset.values).every(([param, val]) => {
        const current = getStagedOrCurrent(param, params);
        return current === val;
      });
      if (matches) return preset.label;
    }
    return null;
  }, [params.store, params.staged]);

  const applyPreset = (preset: (typeof MAPPING_PRESETS)[number]) => {
    for (const [param, val] of Object.entries(preset.values)) {
      params.stage(param, val);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Shuffle size={14} className="text-accent" />
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          Channel Mapping
        </h3>
        {currentPreset && (
          <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
            {currentPreset}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <ParamSelect
            paramName="RCMAP_ROLL"
            params={params}
            label="Roll"
            options={CHANNEL_OPTIONS}
          />
          <ParamSelect
            paramName="RCMAP_PITCH"
            params={params}
            label="Pitch"
            options={CHANNEL_OPTIONS}
          />
          <ParamSelect
            paramName="RCMAP_THROTTLE"
            params={params}
            label="Throttle"
            options={CHANNEL_OPTIONS}
          />
          <ParamSelect
            paramName="RCMAP_YAW"
            params={params}
            label="Yaw"
            options={CHANNEL_OPTIONS}
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-text-muted">Presets</span>
          {MAPPING_PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => applyPreset(preset)}
              className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                currentPreset === preset.label
                  ? "border-accent/40 bg-accent/10 text-accent"
                  : "border-border bg-bg-secondary text-text-secondary hover:bg-bg-tertiary/50"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RSSI Panel
// ---------------------------------------------------------------------------

function RssiPanel({ params }: { params: ParamInputParams }) {
  const rssiType = getStagedOrCurrent("RSSI_TYPE", params);
  const showChannel = rssiType === 2; // RCChannel

  return (
    <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
      <SectionCardHeader icon={Signal} title="RSSI Configuration" />

      <div className="flex flex-col gap-3">
        <ParamSelect
          paramName="RSSI_TYPE"
          params={params}
          description="Set to ReceiverProtocol (3) for CRSF/ELRS receivers that report RSSI natively."
        />

        {showChannel && (
          <ParamSelect
            paramName="RSSI_CHANNEL"
            params={params}
            description="RC channel carrying RSSI data from the receiver."
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Live RC Channel Bars
// ---------------------------------------------------------------------------

function LiveRcBars({
  connected,
  telemetry,
  params,
}: {
  connected: boolean;
  telemetry: Telemetry | null;
  params: ParamInputParams;
}) {
  const mappedBadges = useMemo(() => buildPrimaryControlBadges(params), [params.store, params.staged]);
  const channelItems = useMemo(
    () => buildLiveRcChannelItems(telemetry?.rc_channels, mappedBadges),
    [telemetry?.rc_channels, mappedBadges],
  );

  const rssi = telemetry?.rc_rssi;
  const normalizedRssi = typeof rssi === "number" && Number.isFinite(rssi) ? Math.round(rssi) : null;

  const statusLabel = !connected ? "Disconnected" : channelItems.length > 0 ? `${channelItems.length} live` : "Waiting";
  const statusTone = !connected
    ? "bg-danger/10 text-danger"
    : channelItems.length > 0
      ? "bg-success/10 text-success"
      : "bg-warning/10 text-warning";

  return (
    <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity size={14} className="text-accent" />
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Live RC Channels
          </h3>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusTone}`}>
            {statusLabel}
          </span>
        </div>
        <span className={`flex items-center gap-1 font-mono text-[10px] ${getRssiColor(normalizedRssi)}`}>
          <Signal size={10} />
          {normalizedRssi == null ? "RSSI --" : `RSSI ${normalizedRssi}%`}
        </span>
      </div>

      {!connected ? (
        <p className="text-xs text-text-muted">Connect to a vehicle to see live RC values.</p>
      ) : channelItems.length === 0 ? (
        <div className="rounded-md border border-warning/20 bg-warning/5 px-3 py-2.5 text-xs text-text-secondary">
          Waiting for live RC channel data. Move the transmitter sticks or switches, or confirm the receiver link is active.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <PwmChannelBars items={channelItems} />
          <p className="text-[10px] text-text-muted">
            Roll, Pitch, Throttle, and Yaw badges reflect the current RCMAP assignments when they point at a valid live channel.
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section Root
// ---------------------------------------------------------------------------

export function RcReceiverSection({
  params,
  connected,
  telemetry,
}: RcReceiverSectionProps) {
  const rcDocsUrl = resolveDocsUrl("radio_calibration");

  return (
    <div className="flex flex-col gap-4 p-4">
      <SetupSectionIntro
        icon={Radio}
        title="RC Receiver"
        description="Configure your RC receiver protocol, channel mapping, and RSSI source. Ensure your transmitter is bound and communicating before calibrating."
        docsUrl={rcDocsUrl}
        docsLabel="RC Calibration Docs"
      />
      <ReceiverProtocolPanel params={params} />
      <ChannelMappingPanel params={params} />
      <RssiPanel params={params} />
      <LiveRcBars connected={connected} telemetry={telemetry} params={params} />
    </div>
  );
}

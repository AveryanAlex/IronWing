import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { Settings2 } from "lucide-react";
import {
  commandDisplayName,
  commandPosition,
  commandCategory,
  geoPoint3dLatLon,
  geoPoint3dAltitude,
} from "../../lib/mavkit-types";
import type {
  MissionItem,
  MissionCommand,
  GeoPoint3d,
  HomePosition,
} from "../../lib/mavkit-types";
import {
  offsetFromHome,
  offsetFromPrevious,
  applyOffsetFromHome,
  applyOffsetFromPrevious,
  parseLatitude,
  parseLongitude,
  parseOffset,
  formatDeg,
} from "../../lib/mission-coordinates";
import { cn } from "../../lib/utils";
import type { TypedDraftItem } from "../../lib/mission-draft-typed";

export type CoordinateMode = "absolute" | "home_offset" | "previous_offset";

type MissionInspectorProps = {
  missionType: "mission" | "fence" | "rally";
  draftItem: TypedDraftItem;
  index: number;
  previousItem: TypedDraftItem | null;
  homePosition: HomePosition | null;
  readOnly?: boolean;
  isSelected: boolean;
  onUpdateCommand?: (index: number, command: MissionCommand) => void;
  onUpdateAltitude: (index: number, altitudeM: number) => void;
  onUpdateCoordinate: (index: number, field: "latitude_deg" | "longitude_deg", valueDeg: number) => void;
  onSelect: (index: number) => void;
};

const ALTITUDE_FRAME_LABELS: Record<string, string> = {
  msl: "Absolute (MSL)",
  rel_home: "Relative Alt",
  terrain: "Terrain",
};

const COORDINATE_MODES: { value: CoordinateMode; label: string }[] = [
  { value: "absolute", label: "Lat/Lon" },
  { value: "home_offset", label: "Home Offset" },
  { value: "previous_offset", label: "Prev Offset" },
];

// ---------------------------------------------------------------------------
// Typed field extraction for display
// ---------------------------------------------------------------------------

type FieldEntry = { label: string; value: string };

/** Extract human-readable fields from the inner variant of a MissionCommand. */
function extractCommandFields(cmd: MissionCommand): FieldEntry[] {
  const entries: FieldEntry[] = [];

  function walk(obj: Record<string, unknown>) {
    for (const [key, val] of Object.entries(obj)) {
      // Skip position — handled separately by coordinate fields
      if (key === "position") continue;
      if (typeof val === "number") {
        entries.push({ label: fieldLabel(key), value: formatFieldValue(key, val) });
      } else if (typeof val === "boolean") {
        entries.push({ label: fieldLabel(key), value: val ? "Yes" : "No" });
      } else if (typeof val === "string") {
        entries.push({ label: fieldLabel(key), value: val });
      }
    }
  }

  // Dig into the externally-tagged enum layers to find the inner struct
  if ("Nav" in cmd) {
    const nav = cmd.Nav;
    if (typeof nav === "string") return entries; // unit variant like "ReturnToLaunch"
    const key = Object.keys(nav)[0];
    const inner = (nav as Record<string, Record<string, unknown>>)[key];
    if (inner) walk(inner);
  } else if ("Do" in cmd) {
    const d = cmd.Do;
    if (typeof d === "string") return entries;
    const key = Object.keys(d)[0];
    const inner = (d as Record<string, Record<string, unknown>>)[key];
    if (inner) walk(inner);
  } else if ("Condition" in cmd) {
    const c = cmd.Condition;
    if (typeof c === "string") return entries;
    const key = Object.keys(c)[0];
    const inner = (c as Record<string, Record<string, unknown>>)[key];
    if (inner) walk(inner);
  } else if ("Other" in cmd) {
    const raw = cmd.Other;
    entries.push({ label: "Command #", value: String(raw.command) });
    entries.push({ label: "Frame", value: String(raw.frame) });
    for (let i = 1; i <= 4; i++) {
      const val = raw[`param${i}` as keyof typeof raw] as number;
      if (val !== 0) entries.push({ label: `Param ${i}`, value: String(val) });
    }
    if (raw.x !== 0) entries.push({ label: "X", value: String(raw.x) });
    if (raw.y !== 0) entries.push({ label: "Y", value: String(raw.y) });
    if (raw.z !== 0) entries.push({ label: "Z", value: String(raw.z) });
  }

  return entries;
}

function fieldLabel(key: string): string {
  // Convert snake_case to Title Case and strip unit suffixes for display
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatFieldValue(key: string, val: number): string {
  // Show integers as integers, floats with reasonable precision
  if (Number.isInteger(val)) return String(val);
  // Degrees get 7 decimals, everything else 2
  if (key.includes("deg")) return val.toFixed(7);
  return val.toFixed(2);
}

// ---------------------------------------------------------------------------
// Position extraction helpers
// ---------------------------------------------------------------------------

function positionFromDraftItem(
  item: TypedDraftItem,
): GeoPoint3d | null {
  const doc = item.document;
  // MissionItem has a command field
  if ("command" in doc) {
    return commandPosition((doc as MissionItem).command);
  }
  // GeoPoint3d variants
  if ("Msl" in doc || "RelHome" in doc || "Terrain" in doc) {
    return doc as GeoPoint3d;
  }
  // FenceRegion — no position
  return null;
}

function previousPosition(
  previousItem: TypedDraftItem | null,
): { latitude_deg: number; longitude_deg: number } | null {
  if (!previousItem) return null;
  const pos = positionFromDraftItem(previousItem);
  if (!pos) return null;
  return geoPoint3dLatLon(pos);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function AbsoluteCoordInputs({
  lat,
  lon,
  onCommitCoordinate,
  onFocusCapture,
  disabled = false,
}: {
  lat: number;
  lon: number;
  onCommitCoordinate: (field: "latitude_deg" | "longitude_deg", valueDeg: number) => void;
  onFocusCapture: () => void;
  disabled?: boolean;
}) {
  const [localLat, setLocalLat] = useState(formatDeg(lat));
  const [localLon, setLocalLon] = useState(formatDeg(lon));
  const prevLatRef = useRef(lat);
  const prevLonRef = useRef(lon);

  useEffect(() => {
    if (prevLatRef.current !== lat) {
      setLocalLat(formatDeg(lat));
      prevLatRef.current = lat;
    }
  }, [lat]);

  useEffect(() => {
    if (prevLonRef.current !== lon) {
      setLocalLon(formatDeg(lon));
      prevLonRef.current = lon;
    }
  }, [lon]);

  const commitLat = () => {
    const result = parseLatitude(localLat);
    if (result.ok) {
      onCommitCoordinate("latitude_deg", result.value);
    } else {
      setLocalLat(formatDeg(lat));
    }
  };

  const commitLon = () => {
    const result = parseLongitude(localLon);
    if (result.ok) {
      onCommitCoordinate("longitude_deg", result.value);
    } else {
      setLocalLon(formatDeg(lon));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
  };

  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="space-y-0.5">
        <label className="text-[10px] text-text-muted">
          Latitude <span className="text-text-muted/50">(deg)</span>
        </label>
        <input
          data-coord-field="latitude"
          type="text"
          inputMode="decimal"
          value={localLat}
          onChange={(e) => setLocalLat(e.target.value)}
          onBlur={commitLat}
          onKeyDown={handleKeyDown}
          onFocus={onFocusCapture}
          disabled={disabled}
          className="w-full rounded border border-border bg-bg-input px-1.5 py-1 text-xs tabular-nums text-text-primary"
        />
      </div>
      <div className="space-y-0.5">
        <label className="text-[10px] text-text-muted">
          Longitude <span className="text-text-muted/50">(deg)</span>
        </label>
        <input
          data-coord-field="longitude"
          type="text"
          inputMode="decimal"
          value={localLon}
          onChange={(e) => setLocalLon(e.target.value)}
          onBlur={commitLon}
          onKeyDown={handleKeyDown}
          onFocus={onFocusCapture}
          disabled={disabled}
          className="w-full rounded border border-border bg-bg-input px-1.5 py-1 text-xs tabular-nums text-text-primary"
        />
      </div>
    </div>
  );
}

function OffsetCoordInputs({
  offset,
  label,
  applyFn,
  onCommitCoordinate,
  onFocusCapture,
  disabled = false,
}: {
  offset: { x_m: number; y_m: number } | null;
  label: string;
  applyFn: (x_m: number, y_m: number) => { latitude_deg: number; longitude_deg: number } | null;
  onCommitCoordinate: (field: "latitude_deg" | "longitude_deg", valueDeg: number) => void;
  onFocusCapture: () => void;
  disabled?: boolean;
}) {
  const eastM = offset?.x_m ?? 0;
  const northM = offset?.y_m ?? 0;

  const [localEast, setLocalEast] = useState(eastM.toFixed(1));
  const [localNorth, setLocalNorth] = useState(northM.toFixed(1));
  const prevEastRef = useRef(eastM);
  const prevNorthRef = useRef(northM);

  useEffect(() => {
    if (Math.abs(prevEastRef.current - eastM) > 0.01) {
      setLocalEast(eastM.toFixed(1));
      prevEastRef.current = eastM;
    }
  }, [eastM]);

  useEffect(() => {
    if (Math.abs(prevNorthRef.current - northM) > 0.01) {
      setLocalNorth(northM.toFixed(1));
      prevNorthRef.current = northM;
    }
  }, [northM]);

  const commitOffset = () => {
    const eastResult = parseOffset(localEast);
    const northResult = parseOffset(localNorth);
    if (!eastResult.ok || !northResult.ok) {
      setLocalEast(eastM.toFixed(1));
      setLocalNorth(northM.toFixed(1));
      return;
    }
    const applied = applyFn(eastResult.value, northResult.value);
    if (applied) {
      onCommitCoordinate("latitude_deg", applied.latitude_deg);
      onCommitCoordinate("longitude_deg", applied.longitude_deg);
    } else {
      setLocalEast(eastM.toFixed(1));
      setLocalNorth(northM.toFixed(1));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
  };

  if (!offset) {
    return (
      <p className="text-[10px] text-warning/70">
        {label} position unavailable for offset calculation.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="space-y-0.5">
        <label className="text-[10px] text-text-muted">
          East <span className="text-text-muted/50">(m from {label.toLowerCase()})</span>
        </label>
        <input
          data-coord-field="east-offset"
          type="text"
          inputMode="decimal"
          value={localEast}
          onChange={(e) => setLocalEast(e.target.value)}
          onBlur={commitOffset}
          onKeyDown={handleKeyDown}
          onFocus={onFocusCapture}
          disabled={disabled}
          className="w-full rounded border border-border bg-bg-input px-1.5 py-1 text-xs tabular-nums text-text-primary"
        />
      </div>
      <div className="space-y-0.5">
        <label className="text-[10px] text-text-muted">
          North <span className="text-text-muted/50">(m from {label.toLowerCase()})</span>
        </label>
        <input
          data-coord-field="north-offset"
          type="text"
          inputMode="decimal"
          value={localNorth}
          onChange={(e) => setLocalNorth(e.target.value)}
          onBlur={commitOffset}
          onKeyDown={handleKeyDown}
          onFocus={onFocusCapture}
          disabled={disabled}
          className="w-full rounded border border-border bg-bg-input px-1.5 py-1 text-xs tabular-nums text-text-primary"
        />
      </div>
    </div>
  );
}

function CoordinateFields({
  position,
  mode,
  homePosition,
  prevPos,
  onCommitCoordinate,
  onFocusCapture,
  disabled = false,
}: {
  position: GeoPoint3d;
  mode: CoordinateMode;
  homePosition: HomePosition | null;
  prevPos: { latitude_deg: number; longitude_deg: number } | null;
  onCommitCoordinate: (field: "latitude_deg" | "longitude_deg", valueDeg: number) => void;
  onFocusCapture: () => void;
  disabled?: boolean;
}) {
  const { latitude_deg, longitude_deg } = geoPoint3dLatLon(position);

  if (mode === "absolute") {
    return (
      <AbsoluteCoordInputs
        lat={latitude_deg}
        lon={longitude_deg}
        onCommitCoordinate={onCommitCoordinate}
        onFocusCapture={onFocusCapture}
        disabled={disabled}
      />
    );
  }

  if (mode === "home_offset") {
    const offset = offsetFromHome({ latitude_deg, longitude_deg }, homePosition);
    return (
      <OffsetCoordInputs
        offset={offset}
        label="Home"
        applyFn={(x, y) => applyOffsetFromHome(homePosition, x, y)}
        onCommitCoordinate={onCommitCoordinate}
        onFocusCapture={onFocusCapture}
        disabled={disabled}
      />
    );
  }

  const offset = offsetFromPrevious({ latitude_deg, longitude_deg }, prevPos);
  return (
    <OffsetCoordInputs
      offset={offset}
      label="Previous"
      applyFn={(x, y) => applyOffsetFromPrevious(prevPos, x, y)}
      onCommitCoordinate={onCommitCoordinate}
      onFocusCapture={onFocusCapture}
      disabled={disabled}
    />
  );
}

function AltitudeField({
  position,
  index,
  onUpdateAltitude,
  onFocusCapture,
  disabled = false,
}: {
  position: GeoPoint3d;
  index: number;
  onUpdateAltitude: (index: number, altitudeM: number) => void;
  onFocusCapture: () => void;
  disabled?: boolean;
}) {
  const { value: altitude, frame } = geoPoint3dAltitude(position);
  const [local, setLocal] = useState(String(altitude));
  const prevRef = useRef(altitude);

  useEffect(() => {
    if (prevRef.current !== altitude) {
      setLocal(String(altitude));
      prevRef.current = altitude;
    }
  }, [altitude]);

  const handleBlur = () => {
    const n = Number(local);
    if (Number.isFinite(n) && n !== altitude) {
      onUpdateAltitude(index, n);
    } else {
      setLocal(String(altitude));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
  };

  return (
    <div className="space-y-0.5">
      <label className="flex items-center gap-1 text-[10px] text-text-muted">
        Altitude
        <span className="text-text-muted/50">(m)</span>
        <span className="ml-auto text-[9px] text-text-muted/50">
          {ALTITUDE_FRAME_LABELS[frame] ?? frame}
        </span>
      </label>
      <input
        data-param-slot="altitude"
        type="number"
        step="any"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onFocus={onFocusCapture}
        disabled={disabled}
        className="w-full rounded border border-border bg-bg-input px-1.5 py-1 text-xs tabular-nums text-text-primary"
      />
    </div>
  );
}

function TypedFieldsDisplay({ fields }: { fields: FieldEntry[] }) {
  if (fields.length === 0) return null;

  return (
    <div className="space-y-1">
      <span className="text-[10px] font-medium text-text-muted">Parameters</span>
      <div className="space-y-0.5">
        {fields.map((f, i) => (
          <div key={i} className="flex items-center justify-between text-[10px]">
            <span className="text-text-muted">{f.label}</span>
            <span className="tabular-nums text-text-primary">{f.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function MissionInspector({
  missionType,
  draftItem,
  index,
  previousItem,
  homePosition,
  readOnly = false,
  isSelected,
  onUpdateCommand: _onUpdateCommand,
  onUpdateAltitude,
  onUpdateCoordinate,
  onSelect,
}: MissionInspectorProps) {
  const controlReadOnly = readOnly || draftItem.readOnly;
  const [coordMode, setCoordMode] = useState<CoordinateMode>("absolute");

  const position = useMemo(() => positionFromDraftItem(draftItem), [draftItem]);
  const prevPos = useMemo(() => previousPosition(previousItem), [previousItem]);

  const isMissionItem = "command" in draftItem.document;
  const missionItem = isMissionItem ? (draftItem.document as MissionItem) : null;
  const category = missionItem ? commandCategory(missionItem.command) : null;
  const displayName = missionItem
    ? commandDisplayName(missionItem.command)
    : missionType === "fence"
      ? "Fence Region"
      : "Rally Point";

  const typedFields = useMemo(
    () => (missionItem ? extractCommandFields(missionItem.command) : []),
    [missionItem],
  );

  const ensureSelected = useCallback(() => {
    if (!isSelected) {
      onSelect(index);
    }
  }, [index, isSelected, onSelect]);

  const handleCoordCommit = useCallback(
    (field: "latitude_deg" | "longitude_deg", valueDeg: number) => {
      onUpdateCoordinate(index, field, valueDeg);
    },
    [index, onUpdateCoordinate],
  );

  return (
    <div
      data-mission-inspector
      data-mission-coordinate-mode={coordMode}
      className="space-y-2.5 rounded-lg border border-border bg-bg-secondary p-3"
    >
      <div className="flex items-center gap-2">
        <Settings2 className="h-3.5 w-3.5 text-accent" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          Inspector
        </span>
        <span className="ml-auto text-[10px] tabular-nums text-text-muted">
          #{index + 1}
        </span>
      </div>

      <div className="space-y-0.5">
        <label className="text-[10px] text-text-muted">Command</label>
        <div className="rounded border border-border bg-bg-input px-1.5 py-1 text-xs text-text-primary">
          {displayName}
          {category && (
            <span className="ml-1.5 text-[9px] uppercase text-text-muted/60">
              {category}
            </span>
          )}
        </div>
      </div>

      {draftItem.readOnly && (
        <p className="rounded border border-warning/30 bg-warning/5 px-2 py-1 text-[10px] text-warning/80">
          Raw/unsupported item preserved read-only.
        </p>
      )}

      <TypedFieldsDisplay fields={typedFields} />

      {position && (
        <>
          <div className="flex items-center gap-1.5 border-t border-border/50 pt-2">
            <span className="text-[10px] font-medium text-text-muted">Coordinates</span>
            <div className="ml-auto flex rounded border border-border text-[9px]">
              {COORDINATE_MODES.map((m) => (
                <button
                  key={m.value}
                  data-mission-coordinate-mode={m.value}
                  aria-pressed={coordMode === m.value}
                  onClick={() => setCoordMode(m.value)}
                  className={cn(
                    "px-1.5 py-0.5 transition-colors",
                    coordMode === m.value
                      ? "bg-accent/20 text-accent"
                      : "text-text-muted hover:text-text-secondary",
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <CoordinateFields
            position={position}
            mode={coordMode}
            homePosition={homePosition}
            prevPos={prevPos}
            onCommitCoordinate={handleCoordCommit}
            onFocusCapture={ensureSelected}
            disabled={controlReadOnly}
          />

          <AltitudeField
            position={position}
            index={index}
            onUpdateAltitude={onUpdateAltitude}
            onFocusCapture={ensureSelected}
            disabled={controlReadOnly}
          />
        </>
      )}
    </div>
  );
}

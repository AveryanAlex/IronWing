import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { Mountain } from "lucide-react";
import {
  geoPoint3dLatLon,
  geoPoint3dAltitude,
} from "../../lib/mavkit-types";
import type { GeoPoint3d, HomePosition } from "../../lib/mavkit-types";
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

type CoordinateMode = "absolute" | "home_offset" | "previous_offset";

type RallyInspectorProps = {
  draftItem: TypedDraftItem;
  index: number;
  previousItem: TypedDraftItem | null;
  homePosition: HomePosition | null;
  readOnly?: boolean;
  onUpdateAltitude: (index: number, altitudeM: number) => void;
  onUpdateCoordinate: (index: number, field: "latitude_deg" | "longitude_deg", valueDeg: number) => void;
  onUpdateAltitudeFrame: (index: number, frame: "msl" | "rel_home" | "terrain") => void;
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

const ALTITUDE_FRAMES: { value: "msl" | "rel_home" | "terrain"; label: string }[] = [
  { value: "msl", label: "MSL" },
  { value: "rel_home", label: "Rel Home" },
  { value: "terrain", label: "Terrain" },
];

// ---------------------------------------------------------------------------
// Position extraction
// ---------------------------------------------------------------------------

function positionFromDraftItem(item: TypedDraftItem): GeoPoint3d | null {
  const doc = item.document;
  if ("Msl" in doc || "RelHome" in doc || "Terrain" in doc) {
    return doc as GeoPoint3d;
  }
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
// Coordinate sub-components (same patterns as MissionInspector)
// ---------------------------------------------------------------------------

function AbsoluteCoordInputs({
  lat,
  lon,
  onCommitCoordinate,
  disabled = false,
}: {
  lat: number;
  lon: number;
  onCommitCoordinate: (field: "latitude_deg" | "longitude_deg", valueDeg: number) => void;
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
          type="text"
          inputMode="decimal"
          value={localLat}
          onChange={(e) => setLocalLat(e.target.value)}
          onBlur={commitLat}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          className="w-full rounded border border-border bg-bg-input px-1.5 py-1 text-xs tabular-nums text-text-primary"
        />
      </div>
      <div className="space-y-0.5">
        <label className="text-[10px] text-text-muted">
          Longitude <span className="text-text-muted/50">(deg)</span>
        </label>
        <input
          type="text"
          inputMode="decimal"
          value={localLon}
          onChange={(e) => setLocalLon(e.target.value)}
          onBlur={commitLon}
          onKeyDown={handleKeyDown}
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
  disabled = false,
}: {
  offset: { x_m: number; y_m: number } | null;
  label: string;
  applyFn: (x_m: number, y_m: number) => { latitude_deg: number; longitude_deg: number } | null;
  onCommitCoordinate: (field: "latitude_deg" | "longitude_deg", valueDeg: number) => void;
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
          type="text"
          inputMode="decimal"
          value={localEast}
          onChange={(e) => setLocalEast(e.target.value)}
          onBlur={commitOffset}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          className="w-full rounded border border-border bg-bg-input px-1.5 py-1 text-xs tabular-nums text-text-primary"
        />
      </div>
      <div className="space-y-0.5">
        <label className="text-[10px] text-text-muted">
          North <span className="text-text-muted/50">(m from {label.toLowerCase()})</span>
        </label>
        <input
          type="text"
          inputMode="decimal"
          value={localNorth}
          onChange={(e) => setLocalNorth(e.target.value)}
          onBlur={commitOffset}
          onKeyDown={handleKeyDown}
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
  disabled = false,
}: {
  position: GeoPoint3d;
  mode: CoordinateMode;
  homePosition: HomePosition | null;
  prevPos: { latitude_deg: number; longitude_deg: number } | null;
  onCommitCoordinate: (field: "latitude_deg" | "longitude_deg", valueDeg: number) => void;
  disabled?: boolean;
}) {
  const { latitude_deg, longitude_deg } = geoPoint3dLatLon(position);

  if (mode === "absolute") {
    return (
      <AbsoluteCoordInputs
        lat={latitude_deg}
        lon={longitude_deg}
        onCommitCoordinate={onCommitCoordinate}
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
      disabled={disabled}
    />
  );
}

function AltitudeField({
  position,
  index,
  onUpdateAltitude,
  disabled = false,
}: {
  position: GeoPoint3d;
  index: number;
  onUpdateAltitude: (index: number, altitudeM: number) => void;
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
        type="number"
        step="any"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className="w-full rounded border border-border bg-bg-input px-1.5 py-1 text-xs tabular-nums text-text-primary"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function RallyInspector({
  draftItem,
  index,
  previousItem,
  homePosition,
  readOnly = false,
  onUpdateAltitude,
  onUpdateCoordinate,
  onUpdateAltitudeFrame,
}: RallyInspectorProps) {
  const controlReadOnly = readOnly || draftItem.readOnly;
  const [coordMode, setCoordMode] = useState<CoordinateMode>("absolute");
  const [frameChanged, setFrameChanged] = useState(false);

  const position = useMemo(() => positionFromDraftItem(draftItem), [draftItem]);
  const prevPos = useMemo(() => previousPosition(previousItem), [previousItem]);
  const currentFrame = position ? geoPoint3dAltitude(position).frame : null;

  const handleCoordCommit = useCallback(
    (field: "latitude_deg" | "longitude_deg", valueDeg: number) => {
      onUpdateCoordinate(index, field, valueDeg);
    },
    [index, onUpdateCoordinate],
  );

  const handleFrameChange = useCallback(
    (frame: "msl" | "rel_home" | "terrain") => {
      if (frame === currentFrame) return;
      onUpdateAltitudeFrame(index, frame);
      setFrameChanged(true);
    },
    [index, currentFrame, onUpdateAltitudeFrame],
  );

  // Clear frame-change warning after a delay
  useEffect(() => {
    if (!frameChanged) return;
    const timer = setTimeout(() => setFrameChanged(false), 4000);
    return () => clearTimeout(timer);
  }, [frameChanged]);

  return (
    <div
      data-rally-inspector
      className="space-y-2.5 rounded-lg border border-border bg-bg-secondary p-3"
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <Mountain className="h-3.5 w-3.5 text-amber-500" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          Rally Inspector
        </span>
        <span className="ml-auto text-[10px] tabular-nums text-text-muted">
          #{index + 1}
        </span>
      </div>

      {/* Rally badge */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-text-muted">Rally Point</span>
        <span className="ml-auto rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase bg-amber-500/15 text-amber-500">
          RALLY
        </span>
      </div>

      {position && (
        <>
          {/* Coordinate mode toggle */}
          <div className="flex items-center gap-1.5 border-t border-border/50 pt-2">
            <span className="text-[10px] font-medium text-text-muted">Coordinates</span>
            <div className="ml-auto flex rounded border border-border text-[9px]">
              {COORDINATE_MODES.map((m) => (
                <button
                  key={m.value}
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
            disabled={controlReadOnly}
          />

          {/* Altitude */}
          <AltitudeField
            position={position}
            index={index}
            onUpdateAltitude={onUpdateAltitude}
            disabled={controlReadOnly}
          />

          {/* Altitude frame selector */}
          <div className="space-y-1.5 border-t border-border/50 pt-2">
            <span className="text-[10px] font-medium text-text-muted">Altitude Frame</span>
            <div className="flex rounded border border-border text-[9px]">
              {ALTITUDE_FRAMES.map((f) => (
                <button
                  key={f.value}
                  aria-pressed={currentFrame === f.value}
                  onClick={() => handleFrameChange(f.value)}
                  disabled={controlReadOnly}
                  className={cn(
                    "flex-1 px-1.5 py-1 transition-colors text-center",
                    currentFrame === f.value
                      ? "bg-amber-500/20 text-amber-500"
                      : "text-text-muted hover:text-text-secondary",
                    controlReadOnly && "opacity-50 cursor-not-allowed",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {frameChanged && (
              <p className="text-[9px] text-warning/70">
                Altitude reset to 0 — frame conversion requires terrain data
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

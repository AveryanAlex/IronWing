import { useState, useRef, useEffect } from "react";
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

export type CoordinateMode = "absolute" | "home_offset" | "previous_offset";

export const ALTITUDE_FRAME_LABELS: Record<string, string> = {
  msl: "Absolute (MSL)",
  rel_home: "Relative Alt",
  terrain: "Terrain",
};

export const COORDINATE_MODES: { value: CoordinateMode; label: string }[] = [
  { value: "absolute", label: "Lat/Lon" },
  { value: "home_offset", label: "Home Offset" },
  { value: "previous_offset", label: "Prev Offset" },
];

export function AbsoluteCoordInputs({
  lat,
  lon,
  onCommitCoordinate,
  onFocusCapture,
  disabled = false,
}: {
  lat: number;
  lon: number;
  onCommitCoordinate: (field: "latitude_deg" | "longitude_deg", valueDeg: number) => void;
  onFocusCapture?: () => void;
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

export function OffsetCoordInputs({
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
  onFocusCapture?: () => void;
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

export function CoordinateFields({
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
  onFocusCapture?: () => void;
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

export function AltitudeField({
  position,
  index,
  onUpdateAltitude,
  onFocusCapture,
  disabled = false,
}: {
  position: GeoPoint3d;
  index: number;
  onUpdateAltitude: (index: number, altitudeM: number) => void;
  onFocusCapture?: () => void;
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

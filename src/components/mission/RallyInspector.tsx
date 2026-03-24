import { useState, useCallback, useMemo, useEffect } from "react";
import { Mountain } from "lucide-react";
import {
  geoPoint3dLatLon,
  geoPoint3dAltitude,
} from "../../lib/mavkit-types";
import type { GeoPoint3d, HomePosition } from "../../lib/mavkit-types";
import { cn } from "../../lib/utils";
import type { TypedDraftItem } from "../../lib/mission-draft-typed";
import {
  CoordinateFields,
  AltitudeField,
  COORDINATE_MODES,
  type CoordinateMode,
} from "./coordinate-inputs";

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

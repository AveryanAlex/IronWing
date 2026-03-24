import { useState, useCallback, useMemo } from "react";
import { Settings2 } from "lucide-react";
import {
  commandDisplayName,
  commandPosition,
  commandCategory,
  defaultCommand,
  geoPoint3dLatLon,
} from "../../lib/mavkit-types";
import type {
  MissionItem,
  MissionCommand,
  GeoPoint3d,
  HomePosition,
} from "../../lib/mavkit-types";
import { CommandPicker } from "./CommandPicker";
import { cn } from "../../lib/utils";
import type { TypedDraftItem } from "../../lib/mission-draft-typed";
import {
  CoordinateFields,
  AltitudeField,
  COORDINATE_MODES,
  type CoordinateMode,
} from "./coordinate-inputs";

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
  onUpdateCommand,
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
        {isMissionItem && !controlReadOnly && onUpdateCommand ? (
          <CommandPicker
            currentName={displayName}
            onSelect={(cat, variant) => {
              const newCmd = defaultCommand(cat, variant, position ?? undefined);
              onUpdateCommand(index, newCmd);
            }}
          />
        ) : (
          <div className="rounded border border-border bg-bg-input px-1.5 py-1 text-xs text-text-primary">
            {displayName}
            {category && (
              <span className="ml-1.5 text-[9px] uppercase text-text-muted/60">
                {category}
              </span>
            )}
          </div>
        )}
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

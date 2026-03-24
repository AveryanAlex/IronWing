import { useState, useCallback, useMemo } from "react";
import { Settings2 } from "lucide-react";
import {
  commandDisplayName,
  commandPosition,
  commandCategory,
  defaultCommand,
  geoPoint3dLatLon,
  withCommandField,
  COMMAND_ENUM_OPTIONS,
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
// Typed field extraction
// ---------------------------------------------------------------------------

type EditableField = {
  key: string;
  label: string;
  type: "number" | "boolean" | "enum";
  value: number | boolean | string;
  enumOptions?: string[];
  /** Offset added for display and subtracted on commit (e.g. +1 for 0-based indices). */
  displayOffset?: number;
};

/** Fields that are 0-based item indices internally but shown 1-based in the UI. */
const ONE_INDEXED_FIELDS = new Set(["target_index"]);

/** Extract editable fields from the inner variant of a MissionCommand. */
function extractEditableFields(cmd: MissionCommand): EditableField[] {
  const fields: EditableField[] = [];

  function walk(obj: Record<string, unknown>) {
    for (const [key, val] of Object.entries(obj)) {
      if (key === "position") continue;
      if (typeof val === "number") {
        fields.push({ key, label: fieldLabel(key), type: "number", value: val, displayOffset: ONE_INDEXED_FIELDS.has(key) ? 1 : undefined });
      } else if (typeof val === "boolean") {
        fields.push({ key, label: fieldLabel(key), type: "boolean", value: val });
      } else if (typeof val === "string") {
        const options = COMMAND_ENUM_OPTIONS[key];
        fields.push({
          key,
          label: fieldLabel(key),
          type: "enum",
          value: val,
          enumOptions: options ?? [val],
        });
      }
    }
  }

  if ("Nav" in cmd) {
    const nav = cmd.Nav;
    if (typeof nav === "string") return fields;
    const key = Object.keys(nav)[0];
    const inner = (nav as Record<string, Record<string, unknown>>)[key];
    if (inner) walk(inner);
  } else if ("Do" in cmd) {
    const d = cmd.Do;
    if (typeof d === "string") return fields;
    const key = Object.keys(d)[0];
    const inner = (d as Record<string, Record<string, unknown>>)[key];
    if (inner) walk(inner);
  } else if ("Condition" in cmd) {
    const c = cmd.Condition;
    if (typeof c === "string") return fields;
    const key = Object.keys(c)[0];
    const inner = (c as Record<string, Record<string, unknown>>)[key];
    if (inner) walk(inner);
  }

  return fields;
}

function fieldLabel(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
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

function EditableCommandFields({
  fields,
  command,
  disabled,
  onUpdateCommand,
}: {
  fields: EditableField[];
  command: MissionCommand;
  disabled: boolean;
  onUpdateCommand: (cmd: MissionCommand) => void;
}) {
  if (fields.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <span className="text-[10px] font-medium text-text-muted">Parameters</span>
      {fields.map((f) => (
        <div key={f.key} className="space-y-0.5">
          <label className="text-[10px] text-text-muted">{f.label}</label>
          {f.type === "number" && (
            <NumberFieldInput
              fieldKey={f.key}
              value={f.value as number}
              command={command}
              disabled={disabled}
              onUpdateCommand={onUpdateCommand}
              displayOffset={f.displayOffset}
            />
          )}
          {f.type === "boolean" && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onUpdateCommand(withCommandField(command, f.key, !(f.value as boolean)))}
              className={cn(
                "rounded border px-1.5 py-1 text-xs",
                f.value
                  ? "border-accent/40 bg-accent/10 text-accent"
                  : "border-border bg-bg-input text-text-muted",
                disabled && "opacity-50",
              )}
            >
              {f.value ? "Yes" : "No"}
            </button>
          )}
          {f.type === "enum" && (
            <select
              disabled={disabled}
              value={f.value as string}
              onChange={(e) => onUpdateCommand(withCommandField(command, f.key, e.target.value))}
              className="w-full rounded border border-border bg-bg-input px-1.5 py-1 text-xs text-text-primary"
            >
              {f.enumOptions?.map((opt) => (
                <option key={opt} value={opt}>
                  {fieldLabel(opt)}
                </option>
              ))}
            </select>
          )}
        </div>
      ))}
    </div>
  );
}

/** Number input that commits on blur or Enter, avoiding per-keystroke updates. */
function NumberFieldInput({
  fieldKey,
  value,
  command,
  disabled,
  onUpdateCommand,
  displayOffset = 0,
}: {
  fieldKey: string;
  value: number;
  command: MissionCommand;
  disabled: boolean;
  onUpdateCommand: (cmd: MissionCommand) => void;
  /** Offset added for display and subtracted on commit (e.g. 1 for 0→1 based indices). */
  displayOffset?: number;
}) {
  const shown = value + displayOffset;
  const [draft, setDraft] = useState(String(shown));
  const [focused, setFocused] = useState(false);

  const displayValue = focused ? draft : String(shown);

  const commit = useCallback(() => {
    const parsed = parseFloat(draft);
    if (!Number.isNaN(parsed) && parsed !== shown) {
      onUpdateCommand(withCommandField(command, fieldKey, parsed - displayOffset));
    } else {
      setDraft(String(shown));
    }
  }, [draft, shown, command, fieldKey, displayOffset, onUpdateCommand]);

  return (
    <input
      type="text"
      inputMode="decimal"
      disabled={disabled}
      value={displayValue}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => { setDraft(String(shown)); setFocused(true); }}
      onBlur={() => { setFocused(false); commit(); }}
      onKeyDown={(e) => { if (e.key === "Enter") { e.currentTarget.blur(); } }}
      className="w-full rounded border border-border bg-bg-input px-1.5 py-1 text-xs tabular-nums text-text-primary"
    />
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

  const editableFields = useMemo(
    () => (missionItem ? extractEditableFields(missionItem.command) : []),
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

      {missionItem && onUpdateCommand && (
        <EditableCommandFields
          fields={editableFields}
          command={missionItem.command}
          disabled={controlReadOnly}
          onUpdateCommand={(cmd) => onUpdateCommand(index, cmd)}
        />
      )}

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

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { Settings2, ChevronRight } from "lucide-react";
import { commandName, MAV_CMD } from "../../lib/mav-commands";
import {
  resolveCommandMetadata,
  type ParamDescriptor,
  type ParamSlot,
  type CommandMetadata,
} from "../../lib/mission-command-metadata";
import {
  itemLatDeg,
  itemLonDeg,
  itemOffsetFromHome,
  itemOffsetFromPrevious,
  applyOffsetFromHome,
  applyOffsetFromPrevious,
  parseLatitude,
  parseLongitude,
  parseOffset,
  formatDeg,
} from "../../lib/mission-coordinates";
import { MissionCommandHelp } from "./MissionCommandHelp";
import { cn } from "../../lib/utils";
import type { MissionItem, MissionFrame, HomePosition } from "../../mission";
import type { DraftItem } from "../../lib/mission-draft";
import type { NumericItemField } from "../../lib/mission-draft";

export type CoordinateMode = "absolute" | "home_offset" | "previous_offset";

type MissionInspectorProps = {
  draftItem: DraftItem;
  index: number;
  previousItem: MissionItem | null;
  homePosition: HomePosition | null;
  isSelected: boolean;
  onUpdateField: (index: number, field: NumericItemField, value: number) => void;
  onUpdateFrame: (index: number, frame: MissionFrame) => void;
  onUpdateCoordinate: (index: number, field: "x" | "y", valueDeg: number) => void;
  onSelect: (seq: number) => void;
};

const FRAME_OPTIONS: { value: MissionFrame; label: string }[] = [
  { value: "global_relative_alt_int", label: "Relative Alt" },
  { value: "global_int", label: "Absolute (MSL)" },
  { value: "global_terrain_alt_int", label: "Terrain" },
];

const COORDINATE_MODES: { value: CoordinateMode; label: string }[] = [
  { value: "absolute", label: "Lat/Lon" },
  { value: "home_offset", label: "Home Offset" },
  { value: "previous_offset", label: "Prev Offset" },
];

type ParamFieldProps = {
  slot: ParamSlot;
  descriptor: ParamDescriptor;
  value: number;
  onCommit: (value: number) => void;
  onFocusCapture: () => void;
};

function ParamField({ slot, descriptor, value, onCommit, onFocusCapture }: ParamFieldProps) {
  const [local, setLocal] = useState(String(value));
  const prevValueRef = useRef(value);

  useEffect(() => {
    if (prevValueRef.current !== value) {
      setLocal(String(value));
      prevValueRef.current = value;
    }
  }, [value]);

  const isUnsupported = descriptor.supported === false;
  const isHidden = descriptor.hidden === true;

  if (isHidden) return null;

  const handleBlur = () => {
    const n = Number(local);
    if (Number.isFinite(n) && n !== value) {
      onCommit(n);
    } else {
      setLocal(String(value));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      (e.target as HTMLInputElement).blur();
    }
  };

  if (descriptor.enumValues) {
    return (
      <div className="space-y-0.5">
        <label className="flex items-center gap-1 text-[10px] text-text-muted">
          {descriptor.label}
          {descriptor.units && <span className="text-text-muted/50">({descriptor.units})</span>}
          {descriptor.required && <span className="text-accent">*</span>}
        </label>
        <select
          data-param-slot={slot}
          value={value}
          onChange={(e) => onCommit(Number(e.target.value))}
          onFocus={onFocusCapture}
          disabled={isUnsupported}
          className={cn(
            "w-full rounded border border-border bg-bg-input px-1.5 py-1 text-xs text-text-primary",
            isUnsupported && "cursor-not-allowed opacity-40",
          )}
        >
          {descriptor.enumValues.map((ev) => (
            <option key={ev.value} value={ev.value}>{ev.label}</option>
          ))}
        </select>
        {isUnsupported && descriptor.description && (
          <p className="text-[9px] text-warning/70">{descriptor.description}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      <label className="flex items-center gap-1 text-[10px] text-text-muted">
        {descriptor.label}
        {descriptor.units && <span className="text-text-muted/50">({descriptor.units})</span>}
        {descriptor.required && <span className="text-accent">*</span>}
      </label>
      <input
        data-param-slot={slot}
        type="number"
        step="any"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onFocus={onFocusCapture}
        disabled={isUnsupported}
        className={cn(
          "w-full rounded border border-border bg-bg-input px-1.5 py-1 text-xs tabular-nums text-text-primary",
          isUnsupported && "cursor-not-allowed opacity-40",
        )}
      />
      {isUnsupported && descriptor.description && (
        <p className="text-[9px] text-warning/70">{descriptor.description}</p>
      )}
      {!isUnsupported && descriptor.description && (
        <p className="text-[9px] text-text-muted/70">{descriptor.description}</p>
      )}
    </div>
  );
}

function UnsupportedParamGroup({
  slots,
  item,
}: {
  slots: { slot: ParamSlot; descriptor: ParamDescriptor }[];
  item: MissionItem;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-md border border-border/50 bg-bg-primary/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-[10px] text-text-muted/70 transition-colors hover:text-text-muted"
      >
        <ChevronRight
          className={cn(
            "h-3 w-3 shrink-0 transition-transform",
            open && "rotate-90",
          )}
        />
        <span>
          {slots.length} unsupported field{slots.length !== 1 ? "s" : ""}
        </span>
        <span className="ml-auto text-[9px] text-text-muted/50">
          {slots.map((s) => s.descriptor.label).join(", ")}
        </span>
      </button>
      {open && (
        <div className="space-y-1.5 border-t border-border/30 px-2 pb-2 pt-1.5">
          {slots.map(({ slot, descriptor }) => (
            <div key={slot} className="text-[10px]">
              <span className="font-medium text-text-muted/60">{descriptor.label}</span>
              {descriptor.units && (
                <span className="text-text-muted/40"> ({descriptor.units})</span>
              )}
              <span className="ml-1 tabular-nums text-text-muted/40">= {item[slot] as number}</span>
              {descriptor.description && (
                <p className="mt-0.5 text-[9px] leading-relaxed text-text-muted/50">
                  {descriptor.description}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CoordinateFields({
  item,
  mode,
  homePosition,
  previousItem,
  metadata,
  onCommitCoordinate,
  onFocusCapture,
}: {
  item: MissionItem;
  mode: CoordinateMode;
  homePosition: HomePosition | null;
  previousItem: MissionItem | null;
  metadata: CommandMetadata;
  onCommitCoordinate: (field: "x" | "y", valueDeg: number) => void;
  onFocusCapture: () => void;
}) {
  const xDesc = metadata.params.x;
  const yDesc = metadata.params.y;

  if (!xDesc && !yDesc) return null;
  if (xDesc?.hidden && yDesc?.hidden) return null;

  const lat = itemLatDeg(item);
  const lon = itemLonDeg(item);

  if (mode === "absolute") {
    return (
      <AbsoluteCoordInputs
        lat={lat}
        lon={lon}
        xDesc={xDesc}
        yDesc={yDesc}
        onCommitCoordinate={onCommitCoordinate}
        onFocusCapture={onFocusCapture}
      />
    );
  }

  if (mode === "home_offset") {
    const offset = itemOffsetFromHome(item, homePosition);
    return (
      <OffsetCoordInputs
        offset={offset}
        label="Home"
        applyFn={(x, y) => applyOffsetFromHome(homePosition, x, y)}
        onCommitCoordinate={onCommitCoordinate}
        onFocusCapture={onFocusCapture}
      />
    );
  }

  const offset = itemOffsetFromPrevious(item, previousItem);
  return (
    <OffsetCoordInputs
      offset={offset}
      label="Previous"
      applyFn={(x, y) => applyOffsetFromPrevious(previousItem, x, y)}
      onCommitCoordinate={onCommitCoordinate}
      onFocusCapture={onFocusCapture}
    />
  );
}

function AbsoluteCoordInputs({
  lat,
  lon,
  xDesc,
  yDesc,
  onCommitCoordinate,
  onFocusCapture,
}: {
  lat: number;
  lon: number;
  xDesc: ParamDescriptor | undefined;
  yDesc: ParamDescriptor | undefined;
  onCommitCoordinate: (field: "x" | "y", valueDeg: number) => void;
  onFocusCapture: () => void;
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
      onCommitCoordinate("x", result.value);
    } else {
      setLocalLat(formatDeg(lat));
    }
  };

  const commitLon = () => {
    const result = parseLongitude(localLon);
    if (result.ok) {
      onCommitCoordinate("y", result.value);
    } else {
      setLocalLon(formatDeg(lon));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
  };

  if (xDesc?.hidden && yDesc?.hidden) return null;

  return (
    <div className="grid grid-cols-2 gap-2">
      {xDesc && !xDesc.hidden && (
        <div className="space-y-0.5">
          <label className="text-[10px] text-text-muted">
            {xDesc.label} <span className="text-text-muted/50">(deg)</span>
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
            className="w-full rounded border border-border bg-bg-input px-1.5 py-1 text-xs tabular-nums text-text-primary"
          />
        </div>
      )}
      {yDesc && !yDesc.hidden && (
        <div className="space-y-0.5">
          <label className="text-[10px] text-text-muted">
            {yDesc.label} <span className="text-text-muted/50">(deg)</span>
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
            className="w-full rounded border border-border bg-bg-input px-1.5 py-1 text-xs tabular-nums text-text-primary"
          />
        </div>
      )}
    </div>
  );
}

function OffsetCoordInputs({
  offset,
  label,
  applyFn,
  onCommitCoordinate,
  onFocusCapture,
}: {
  offset: { x_m: number; y_m: number } | null;
  label: string;
  applyFn: (x_m: number, y_m: number) => { x: number; y: number } | null;
  onCommitCoordinate: (field: "x" | "y", valueDeg: number) => void;
  onFocusCapture: () => void;
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
      onCommitCoordinate("x", applied.x / 1e7);
      onCommitCoordinate("y", applied.y / 1e7);
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
          className="w-full rounded border border-border bg-bg-input px-1.5 py-1 text-xs tabular-nums text-text-primary"
        />
      </div>
    </div>
  );
}

export function MissionInspector({
  draftItem,
  index,
  previousItem,
  homePosition,
  isSelected,
  onUpdateField,
  onUpdateFrame,
  onUpdateCoordinate,
  onSelect,
}: MissionInspectorProps) {
  const { item } = draftItem;
  const [coordMode, setCoordMode] = useState<CoordinateMode>("absolute");

  const metadata = useMemo(() => resolveCommandMetadata(item.command), [item.command]);

  const ensureSelected = useCallback(() => {
    if (!isSelected) {
      onSelect(item.seq);
    }
  }, [isSelected, onSelect, item.seq]);

  const handleCommandChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onUpdateField(index, "command", Number(e.target.value) || 16);
    },
    [index, onUpdateField],
  );

  const handleFrameChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onUpdateFrame(index, e.target.value as MissionFrame);
    },
    [index, onUpdateFrame],
  );

  const handleParamCommit = useCallback(
    (slot: ParamSlot, value: number) => {
      if (slot === "x" || slot === "y") {
        onUpdateCoordinate(index, slot, value / 1e7);
      } else {
        onUpdateField(index, slot as NumericItemField, value);
      }
    },
    [index, onUpdateField, onUpdateCoordinate],
  );

  const handleCoordCommit = useCallback(
    (field: "x" | "y", valueDeg: number) => {
      onUpdateCoordinate(index, field, valueDeg);
    },
    [index, onUpdateCoordinate],
  );

  const { supportedSlots, unsupportedSlots } = useMemo(() => {
    const slots: ParamSlot[] = ["param1", "param2", "param3", "param4"];
    const all = slots
      .filter((s) => metadata.params[s] !== undefined)
      .map((s) => ({ slot: s, descriptor: metadata.params[s]! }));
    return {
      supportedSlots: all.filter((s) => s.descriptor.supported !== false),
      unsupportedSlots: all.filter((s) => s.descriptor.supported === false),
    };
  }, [metadata]);

  const zDescriptor = metadata.params.z;
  // Show frame selector when:
  // - Mapped command explicitly marks frame visible (!hidden) — currently none do for Copter
  // - No frame metadata at all (raw/unmapped commands — user needs raw control)
  const showFrame = !metadata.frame?.hidden;
  const hasCoordinates = metadata.params.x || metadata.params.y;
  const showCoordinates = hasCoordinates && !(metadata.params.x?.hidden && metadata.params.y?.hidden);

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
        <select
          data-mission-command-select
          value={item.command}
          onChange={handleCommandChange}
          onFocus={ensureSelected}
          className="w-full rounded border border-border bg-bg-input px-1.5 py-1 pr-6 text-xs text-text-primary"
        >
          <option value={item.command}>{commandName(item.command)}</option>
          {Object.entries(MAV_CMD)
            .filter(([k]) => Number(k) !== item.command)
            .map(([k, v]) => (
              <option key={k} value={k}>{v.short}</option>
            ))}
        </select>
      </div>

      <MissionCommandHelp metadata={metadata} />

      {showFrame && (
        <div className="space-y-0.5">
          <label className="text-[10px] text-text-muted">{metadata.frame?.label ?? "Frame"}</label>
          <select
            data-param-slot="frame"
            value={item.frame}
            onChange={handleFrameChange}
            onFocus={ensureSelected}
            className="w-full rounded border border-border bg-bg-input px-1.5 py-1 text-xs text-text-primary"
          >
            {FRAME_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      )}

      {supportedSlots.map(({ slot, descriptor }) => (
        <ParamField
          key={slot}
          slot={slot}
          descriptor={descriptor}
          value={item[slot] as number}
          onCommit={(v) => handleParamCommit(slot, v)}
          onFocusCapture={ensureSelected}
        />
      ))}

      {unsupportedSlots.length > 0 && (
        <UnsupportedParamGroup
          slots={unsupportedSlots}
          item={item}
        />
      )}

      {showCoordinates && (
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
            item={item}
            mode={coordMode}
            homePosition={homePosition}
            previousItem={previousItem}
            metadata={metadata}
            onCommitCoordinate={handleCoordCommit}
            onFocusCapture={ensureSelected}
          />
        </>
      )}

      {zDescriptor && !zDescriptor.hidden && (
        <ParamField
          slot="z"
          descriptor={zDescriptor}
          value={item.z}
          onCommit={(v) => onUpdateField(index, "z", v)}
          onFocusCapture={ensureSelected}
        />
      )}
    </div>
  );
}

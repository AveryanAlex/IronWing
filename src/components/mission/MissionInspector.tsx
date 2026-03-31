import { useState, useCallback, useMemo } from "react";
import { Settings2 } from "lucide-react";
import {
    commandDisplayName,
    commandPosition,
    commandCategory,
    defaultCommand,
    geoPoint3dLatLon,
    withCommandField,
} from "../../lib/mavkit-types";
import type {
    MissionItem,
    MissionCommand,
    GeoPoint3d,
    HomePosition,
    RawMissionCommand,
} from "../../lib/mavkit-types";
import {
    rawFallbackParams,
    resolveCommandMetadata,
    variantToCommandId,
    type ParamSlot,
} from "../../lib/mission-command-metadata";
import { CommandPicker } from "./CommandPicker";
import { MissionCommandHelp } from "./MissionCommandHelp";
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
    onSetWaypointFromVehicle?: (index: number) => void;
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
    enumOptions?: { value: string; label: string }[];
    units?: string;
    required?: boolean;
    supported?: boolean;
    description?: string;
    /** Offset added for display and subtracted on commit (e.g. +1 for 0-based indices). */
    displayOffset?: number;
};

type CommandVariantInfo = {
    category: "Nav" | "Do" | "Condition";
    variant: string;
};

/** Fields that are 0-based item indices internally but shown 1-based in the UI. */
const ONE_INDEXED_FIELDS = new Set(["target_index"]);

function commandVariantName(cmd: MissionCommand): CommandVariantInfo | null {
    if ("Nav" in cmd) {
        const nav = cmd.Nav;
        return {
            category: "Nav",
            variant: typeof nav === "string" ? nav : Object.keys(nav)[0],
        };
    }

    if ("Do" in cmd) {
        const d = cmd.Do;
        return {
            category: "Do",
            variant: typeof d === "string" ? d : Object.keys(d)[0],
        };
    }

    if ("Condition" in cmd) {
        const c = cmd.Condition;
        return {
            category: "Condition",
            variant: typeof c === "string" ? c : Object.keys(c)[0],
        };
    }

    return null;
}

function commandVariantData(cmd: MissionCommand): Record<string, unknown> | null {
    if ("Nav" in cmd) {
        const nav = cmd.Nav;
        if (typeof nav === "string") return null;
        const variant = Object.keys(nav)[0];
        return (nav as Record<string, Record<string, unknown>>)[variant] ?? null;
    }

    if ("Do" in cmd) {
        const d = cmd.Do;
        if (typeof d === "string") return null;
        const variant = Object.keys(d)[0];
        return (d as Record<string, Record<string, unknown>>)[variant] ?? null;
    }

    if ("Condition" in cmd) {
        const c = cmd.Condition;
        if (typeof c === "string") return null;
        const variant = Object.keys(c)[0];
        return (c as Record<string, Record<string, unknown>>)[variant] ?? null;
    }

    return null;
}

function rawCommandData(cmd: MissionCommand): RawMissionCommand | null {
    if ("Other" in cmd) {
        return cmd.Other;
    }

    return null;
}

function resolveInspectorMetadata(cmd: MissionCommand) {
    const raw = rawCommandData(cmd);
    if (raw) {
        return rawFallbackParams(raw.command);
    }

    const variantInfo = commandVariantName(cmd);
    if (!variantInfo) return null;

    const commandId = variantToCommandId(variantInfo.category, variantInfo.variant);
    if (commandId === undefined) return null;

    return resolveCommandMetadata(commandId);
}

function normalizeEnumOptions(
    value: string,
    enumOptions?: { value: string; label: string }[],
): { value: string; label: string }[] {
    if (!enumOptions || enumOptions.length === 0) {
        return [{ value, label: fieldLabel(value) }];
    }

    if (enumOptions.some((option) => option.value === value)) {
        return enumOptions;
    }

    return [...enumOptions, { value, label: fieldLabel(value) }];
}

const RAW_FIELD_ORDER: ParamSlot[] = ["param1", "param2", "param3", "param4", "x", "y", "z"];

function withUpdatedCommandField(cmd: MissionCommand, fieldKey: string, value: unknown): MissionCommand {
    const raw = rawCommandData(cmd);
    if (raw && fieldKey in raw) {
        return {
            Other: {
                ...raw,
                [fieldKey]: typeof value === "number" ? value : Number(value),
            },
        };
    }

    return withCommandField(cmd, fieldKey, value);
}

function extractRawFields(cmd: MissionCommand): EditableField[] {
    const raw = rawCommandData(cmd);
    if (!raw) return [];

    const metadata = rawFallbackParams(raw.command);

    return RAW_FIELD_ORDER.map((fieldKey) => {
        const descriptor = metadata.params[fieldKey];
        return {
            key: fieldKey,
            label: descriptor?.label ?? fieldLabel(fieldKey),
            type: "number",
            value: raw[fieldKey],
            units: descriptor?.units,
            required: descriptor?.required,
            supported: descriptor?.supported ?? true,
            description: descriptor?.description,
        } satisfies EditableField;
    });
}

/** Extract editable fields from the inner variant of a MissionCommand using rich metadata. */
function extractMetadataFields(cmd: MissionCommand): EditableField[] {
    const raw = rawCommandData(cmd);
    if (raw) {
        return extractRawFields(cmd);
    }

    const inner = commandVariantData(cmd);
    if (!inner) return [];

    const metadata = resolveInspectorMetadata(cmd);
    const typedFields = metadata?.typedFields ?? {};
    const fields: EditableField[] = [];

    for (const [key, val] of Object.entries(inner)) {
        if (key === "position") continue;

        const descriptor = typedFields[key];
        if (descriptor?.hidden) continue;

        const common = {
            key,
            label: descriptor?.label ?? fieldLabel(key),
            units: descriptor?.units,
            required: descriptor?.required,
            supported: descriptor?.supported ?? true,
            description: descriptor?.description,
            displayOffset: ONE_INDEXED_FIELDS.has(key) ? 1 : undefined,
        } satisfies Omit<EditableField, "type" | "value" | "enumOptions">;

        if (typeof val === "number") {
            fields.push({
                ...common,
                type: "number",
                value: val,
            });
            continue;
        }

        if (typeof val === "boolean") {
            fields.push({
                ...common,
                type: "boolean",
                value: val,
            });
            continue;
        }

        if (typeof val === "string") {
            fields.push({
                ...common,
                type: "enum",
                value: val,
                enumOptions: normalizeEnumOptions(val, descriptor?.enumValues),
            });
        }
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
            {fields.map((f) => {
                const fieldDisabled = disabled || f.supported === false;

                return (
                    <div
                        key={f.key}
                        data-command-field={f.key}
                        data-supported={f.supported === false ? "false" : "true"}
                        data-required={f.required ? "true" : "false"}
                        className={cn("space-y-0.5", f.supported === false && "opacity-60")}
                    >
                        <label
                            className="flex items-center gap-1 text-[10px] text-text-muted"
                            title={f.description}
                        >
                            <span>{f.label}</span>
                            {f.required && (
                                <span className="text-warning" aria-label="required">
                                    *
                                </span>
                            )}
                            {f.required && (
                                <span className="text-[9px] text-warning/80">required</span>
                            )}
                        </label>

                        {f.type === "number" && (
                            <div className="relative">
                                <NumberFieldInput
                                    fieldKey={f.key}
                                    value={f.value as number}
                                    command={command}
                                    disabled={fieldDisabled}
                                    onUpdateCommand={onUpdateCommand}
                                    displayOffset={f.displayOffset}
                                    ariaLabel={f.label}
                                    className={f.units ? "pr-12" : undefined}
                                />
                                {f.units && (
                                    <span
                                        data-command-field-unit={f.key}
                                        className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10px] text-text-muted/70"
                                    >
                                        {f.units}
                                    </span>
                                )}
                            </div>
                        )}

                        {f.type === "boolean" && (
                            <button
                                type="button"
                                aria-label={f.label}
                                disabled={fieldDisabled}
                                title={f.description}
                                onClick={() => onUpdateCommand(withUpdatedCommandField(command, f.key, !(f.value as boolean)))}
                                className={cn(
                                    "rounded border px-1.5 py-1 text-xs",
                                    f.value
                                        ? "border-accent/40 bg-accent/10 text-accent"
                                        : "border-border bg-bg-input text-text-muted",
                                    fieldDisabled && "cursor-not-allowed opacity-50",
                                )}
                            >
                                {f.value ? "Yes" : "No"}
                            </button>
                        )}

                        {f.type === "enum" && (
                            <select
                                aria-label={f.label}
                                disabled={fieldDisabled}
                                title={f.description}
                                value={f.value as string}
                                onChange={(e) => onUpdateCommand(withUpdatedCommandField(command, f.key, e.target.value))}
                                className={cn(
                                    "w-full rounded border border-border bg-bg-input px-1.5 py-1 text-xs text-text-primary",
                                    fieldDisabled && "cursor-not-allowed opacity-70",
                                )}
                            >
                                {f.enumOptions?.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                        )}

                        {f.supported === false && (
                            <p data-command-field-note={f.key} className="text-[9px] text-warning/80">
                                {f.description ?? "Not supported by ArduPilot for this command."}
                            </p>
                        )}
                    </div>
                );
            })}
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
    ariaLabel,
    className,
}: {
    fieldKey: string;
    value: number;
    command: MissionCommand;
    disabled: boolean;
    onUpdateCommand: (cmd: MissionCommand) => void;
    /** Offset added for display and subtracted on commit (e.g. 1 for 0→1 based indices). */
    displayOffset?: number;
    ariaLabel?: string;
    className?: string;
}) {
    const shown = value + displayOffset;
    const [draft, setDraft] = useState(String(shown));
    const [focused, setFocused] = useState(false);

    const displayValue = focused ? draft : String(shown);

    const commit = useCallback(() => {
        const parsed = parseFloat(draft);
        if (!Number.isNaN(parsed) && parsed !== shown) {
            onUpdateCommand(withUpdatedCommandField(command, fieldKey, parsed - displayOffset));
        } else {
            setDraft(String(shown));
        }
    }, [draft, shown, command, fieldKey, displayOffset, onUpdateCommand]);

    return (
        <input
            type="text"
            inputMode="decimal"
            aria-label={ariaLabel}
            disabled={disabled}
            value={displayValue}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => { setDraft(String(shown)); setFocused(true); }}
            onBlur={() => { setFocused(false); commit(); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.currentTarget.blur(); } }}
            className={cn(
                "w-full rounded border border-border bg-bg-input px-1.5 py-1 text-xs tabular-nums text-text-primary",
                className,
            )}
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
    onSetWaypointFromVehicle,
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
        () => (missionItem ? extractMetadataFields(missionItem.command) : []),
        [missionItem],
    );

    const currentCommandMetadata = useMemo(
        () => (missionItem ? resolveInspectorMetadata(missionItem.command) : null),
        [missionItem],
    );

    const showCoordinateInputs = Boolean(
        position && !(currentCommandMetadata?.params.x?.hidden || currentCommandMetadata?.params.y?.hidden),
    );
    const showSetFromVehicle = showCoordinateInputs && missionType === "mission" && !controlReadOnly && Boolean(onSetWaypointFromVehicle);

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

            {currentCommandMetadata && (
                <MissionCommandHelp metadata={currentCommandMetadata} />
            )}

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
                    {showCoordinateInputs && (
                        <>
                            <div className="flex items-center gap-1.5 border-t border-border/50 pt-2">
                                <span className="text-[10px] font-medium text-text-muted">Coordinates</span>
                                <div className="ml-auto flex items-center gap-1.5">
                                    {showSetFromVehicle && (
                                        <button
                                            type="button"
                                            data-mission-set-from-vehicle
                                            onClick={() => {
                                                ensureSelected();
                                                onSetWaypointFromVehicle?.(index);
                                            }}
                                            className="rounded border border-accent/30 bg-accent/10 px-2 py-0.5 text-[9px] font-medium text-accent transition-colors hover:bg-accent/15"
                                        >
                                            Set from Vehicle
                                        </button>
                                    )}
                                    <div className="flex rounded border border-border text-[9px]">
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
                        </>
                    )}

                    <div className={cn(showCoordinateInputs ? "" : "border-t border-border/50 pt-2")}>
                        <AltitudeField
                            position={position}
                            index={index}
                            onUpdateAltitude={onUpdateAltitude}
                            onFocusCapture={ensureSelected}
                            disabled={controlReadOnly}
                        />
                    </div>
                </>
            )}
        </div>
    );
}

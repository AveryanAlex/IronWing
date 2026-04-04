/** Which MissionItem field a parameter descriptor maps to. */
export type ParamSlot = "param1" | "param2" | "param3" | "param4" | "x" | "y" | "z";

/**
 * Descriptor for a single parameter/field of a mission command.
 *
 * Used by the inspector to render labelled, typed inputs with
 * contextual help and validation hints.
 */
export type ParamDescriptor = {
    /** Human-readable label shown next to the input, e.g. "Hold (s)". */
    label: string;
    /** Unit suffix for display, e.g. "s", "m", "deg". */
    units?: string;
    /** Short help text shown as tooltip or inline hint. */
    description?: string;
    /** Whether this field is supported by ArduPilot for this command. */
    supported?: boolean;
    /** Whether this field should be hidden in the inspector. */
    hidden?: boolean;
    /** Whether this field must have a meaningful value for the command to be valid. */
    required?: boolean;
    /** Optional enumeration of valid discrete raw numeric values. */
    enumValues?: { value: number; label: string }[];
};

/**
 * Descriptor for a strongly-typed command struct field.
 *
 * Mirrors ParamDescriptor, but enum values are the string discriminants used by
 * the typed mavkit command structs rather than the raw numeric wire encoding.
 */
export type TypedFieldDescriptor = Omit<ParamDescriptor, "enumValues"> & {
    enumValues?: { value: string; label: string }[];
};

/**
 * Metadata for the `frame` field of a MissionItem.
 *
 * Most commands use `global_relative_alt_int` and the frame selector
 * should be hidden. Commands that support terrain-relative altitude
 * (Plane) or have no position component expose different defaults.
 */
export type FrameDescriptor = {
    label: string;
    hidden?: boolean;
    description?: string;
};

export type CatalogEntry = {
    variant: string;
    category: "Nav" | "Do" | "Condition";
    id: number;
    label: string;
};

/**
 * Full metadata for a single MAV_CMD used in mission planning.
 *
 * The `params` map is keyed by `ParamSlot` — only slots that are
 * meaningful for this command are included. Missing slots should not
 * be rendered in the inspector.
 */
export type CommandMetadata = {
    id: number;
    category: "navigation" | "condition" | "do";
    summary: string;
    docsUrl?: string;
    params: Partial<Record<ParamSlot, ParamDescriptor>>;
    typedFields?: Record<string, TypedFieldDescriptor>;
    frame?: FrameDescriptor;
    notes?: string[];
};

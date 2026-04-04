import { pascalToDisplay } from "../mission-command-names";
import type { CatalogEntry } from "./types";

function catalogEntry(category: CatalogEntry["category"], variant: string, id: number): CatalogEntry {
    return { category, variant, id, label: pascalToDisplay(variant) };
}

export const COMMAND_CATALOG: CatalogEntry[] = [
    // Nav (20)
    catalogEntry("Nav", "Waypoint", 16),
    catalogEntry("Nav", "SplineWaypoint", 82),
    catalogEntry("Nav", "ArcWaypoint", 36),
    catalogEntry("Nav", "Takeoff", 22),
    catalogEntry("Nav", "Land", 21),
    catalogEntry("Nav", "LoiterUnlimited", 17),
    catalogEntry("Nav", "LoiterTurns", 18),
    catalogEntry("Nav", "LoiterTime", 19),
    catalogEntry("Nav", "LoiterToAlt", 31),
    catalogEntry("Nav", "ContinueAndChangeAlt", 30),
    catalogEntry("Nav", "VtolTakeoff", 84),
    catalogEntry("Nav", "VtolLand", 85),
    catalogEntry("Nav", "PayloadPlace", 94),
    catalogEntry("Nav", "ReturnToLaunch", 20),
    catalogEntry("Nav", "Delay", 93),
    catalogEntry("Nav", "GuidedEnable", 92),
    catalogEntry("Nav", "AltitudeWait", 83),
    catalogEntry("Nav", "SetYawSpeed", 213),
    catalogEntry("Nav", "ScriptTime", 42702),
    catalogEntry("Nav", "AttitudeTime", 42703),

    // Do (42)
    catalogEntry("Do", "Jump", 177),
    catalogEntry("Do", "JumpTag", 601),
    catalogEntry("Do", "Tag", 600),
    catalogEntry("Do", "PauseContinue", 193),
    catalogEntry("Do", "ChangeSpeed", 178),
    catalogEntry("Do", "SetReverse", 194),
    catalogEntry("Do", "SetHome", 179),
    catalogEntry("Do", "LandStart", 189),
    catalogEntry("Do", "ReturnPathStart", 188),
    catalogEntry("Do", "GoAround", 191),
    catalogEntry("Do", "SetRoiLocation", 195),
    catalogEntry("Do", "SetRoi", 201),
    catalogEntry("Do", "SetRoiNone", 197),
    catalogEntry("Do", "MountControl", 205),
    catalogEntry("Do", "GimbalManagerPitchYaw", 1000),
    catalogEntry("Do", "CamTriggerDistance", 206),
    catalogEntry("Do", "ImageStartCapture", 2000),
    catalogEntry("Do", "ImageStopCapture", 2001),
    catalogEntry("Do", "VideoStartCapture", 2500),
    catalogEntry("Do", "VideoStopCapture", 2501),
    catalogEntry("Do", "SetCameraZoom", 531),
    catalogEntry("Do", "SetCameraFocus", 532),
    catalogEntry("Do", "SetCameraSource", 534),
    catalogEntry("Do", "DigicamConfigure", 202),
    catalogEntry("Do", "DigicamControl", 203),
    catalogEntry("Do", "SetServo", 183),
    catalogEntry("Do", "SetRelay", 181),
    catalogEntry("Do", "RepeatServo", 184),
    catalogEntry("Do", "RepeatRelay", 182),
    catalogEntry("Do", "FenceEnable", 207),
    catalogEntry("Do", "Parachute", 208),
    catalogEntry("Do", "Gripper", 211),
    catalogEntry("Do", "Sprayer", 216),
    catalogEntry("Do", "Winch", 42600),
    catalogEntry("Do", "EngineControl", 223),
    catalogEntry("Do", "InvertedFlight", 210),
    catalogEntry("Do", "AutotuneEnable", 212),
    catalogEntry("Do", "VtolTransition", 3000),
    catalogEntry("Do", "GuidedLimits", 222),
    catalogEntry("Do", "SetResumeRepeatDist", 215),
    catalogEntry("Do", "AuxFunction", 218),
    catalogEntry("Do", "SendScriptMessage", 217),

    // Condition (3)
    catalogEntry("Condition", "Delay", 112),
    catalogEntry("Condition", "Distance", 114),
    catalogEntry("Condition", "Yaw", 115),
];

const CATALOG_BY_VARIANT = new Map(
    COMMAND_CATALOG.map((entry) => [`${entry.category}:${entry.variant}`, entry] as const),
);
const CATALOG_BY_ID = new Map(COMMAND_CATALOG.map((entry) => [entry.id, entry] as const));

export function variantToCommandId(
    category: CatalogEntry["category"],
    variant: string,
): number | undefined {
    return CATALOG_BY_VARIANT.get(`${category}:${variant}`)?.id;
}

export function commandIdToVariant(id: number): CatalogEntry | undefined {
    const entry = CATALOG_BY_ID.get(id);
    return entry ? { ...entry } : undefined;
}

export function getCommandCatalog(): CatalogEntry[] {
    return COMMAND_CATALOG.map((entry) => ({ ...entry }));
}

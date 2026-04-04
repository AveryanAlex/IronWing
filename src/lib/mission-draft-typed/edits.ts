import type { DoCommand, FenceRegion, GeoPoint3d, MissionCommand, MissionItem, NavCommand } from "../mavkit-types";
import { commandPosition, geoPoint3dLatLon, withGeoPoint3dAltitude, withGeoPoint3dPosition } from "../mavkit-types";

import { withActiveItems } from "./core";
import { previewFromFenceRegion, typedPreviewCoordinates } from "./draft-items";
import type { MissionDomain, TypedDraftState } from "./types";

/** Replace a fence region at the given index with a new FenceRegion and recompute its preview. */
export function updateFenceRegion(state: TypedDraftState, index: number, region: FenceRegion): TypedDraftState {
    return withActiveItems(state, "fence", (items, selection) => ({
        items: items.map((entry, i) => {
            if (i !== index) return entry;
            return { ...entry, document: region, preview: previewFromFenceRegion(region) };
        }),
        selection,
    }));
}

/** Replace the command on a mission-domain item at the given index. */
export function updateTypedCommand(state: TypedDraftState, domain: MissionDomain, index: number, command: MissionCommand): TypedDraftState {
    if (domain !== "mission") return state;
    return withActiveItems(state, domain, (items, selection) => ({
        items: items.map((entry, i) => {
            if (i !== index || entry.readOnly) return entry;
            const item = entry.document as MissionItem;
            return { ...entry, document: { ...item, command } };
        }),
        selection,
    }));
}

/** Update the altitude on a mission or rally item's GeoPoint3d. */
export function updateTypedAltitude(state: TypedDraftState, domain: MissionDomain, index: number, altitudeM: number): TypedDraftState {
    if (domain === "fence") return state;
    return withActiveItems(state, domain, (items, selection) => ({
        items: items.map((entry, i) => {
            if (i !== index || entry.readOnly) return entry;
            if (domain === "rally") {
                return { ...entry, document: withGeoPoint3dAltitude(entry.document as GeoPoint3d, altitudeM) };
            }
            const item = entry.document as MissionItem;
            const pos = commandPosition(item.command);
            if (!pos) return entry;
            return {
                ...entry,
                document: { ...item, command: withCommandPosition(item.command, withGeoPoint3dAltitude(pos, altitudeM)) },
            };
        }),
        selection,
    }));
}

export function bulkUpdateAltitude(state: TypedDraftState, domain: MissionDomain, uiIds: Iterable<number>, altitudeM: number): TypedDraftState {
    if (domain === "fence") return state;
    const targetUiIds = new Set(uiIds);
    if (targetUiIds.size === 0) return state;
    return withActiveItems(state, domain, (items, selection) => ({
        items: items.map((entry) => {
            if (!targetUiIds.has(entry.uiId) || entry.readOnly) return entry;
            if (domain === "rally") {
                return { ...entry, document: withGeoPoint3dAltitude(entry.document as GeoPoint3d, altitudeM) };
            }
            const item = entry.document as MissionItem;
            const pos = commandPosition(item.command);
            if (!pos) return entry;
            return {
                ...entry,
                document: { ...item, command: withCommandPosition(item.command, withGeoPoint3dAltitude(pos, altitudeM)) },
            };
        }),
        selection,
    }));
}

/** Update the latitude on a mission or rally item. */
export function updateTypedLatitude(state: TypedDraftState, domain: MissionDomain, index: number, latitudeDeg: number): TypedDraftState {
    if (domain === "fence") return state;
    return withActiveItems(state, domain, (items, selection) => ({
        items: items.map((entry, i) => {
            if (i !== index || entry.readOnly) return entry;
            if (domain === "rally") {
                const pt = entry.document as GeoPoint3d;
                const { longitude_deg } = geoPoint3dLatLon(pt);
                return { ...entry, document: withGeoPoint3dPosition(pt, latitudeDeg, longitude_deg) };
            }
            const item = entry.document as MissionItem;
            const pos = commandPosition(item.command);
            if (!pos) return entry;
            const { longitude_deg } = geoPoint3dLatLon(pos);
            return {
                ...entry,
                document: { ...item, command: withCommandPosition(item.command, withGeoPoint3dPosition(pos, latitudeDeg, longitude_deg)) },
            };
        }),
        selection,
    }));
}

/** Update the longitude on a mission or rally item. */
export function updateTypedLongitude(state: TypedDraftState, domain: MissionDomain, index: number, longitudeDeg: number): TypedDraftState {
    if (domain === "fence") return state;
    return withActiveItems(state, domain, (items, selection) => ({
        items: items.map((entry, i) => {
            if (i !== index || entry.readOnly) return entry;
            if (domain === "rally") {
                const pt = entry.document as GeoPoint3d;
                const { latitude_deg } = geoPoint3dLatLon(pt);
                return { ...entry, document: withGeoPoint3dPosition(pt, latitude_deg, longitudeDeg) };
            }
            const item = entry.document as MissionItem;
            const pos = commandPosition(item.command);
            if (!pos) return entry;
            const { latitude_deg } = geoPoint3dLatLon(pos);
            return {
                ...entry,
                document: { ...item, command: withCommandPosition(item.command, withGeoPoint3dPosition(pos, latitude_deg, longitudeDeg)) },
            };
        }),
        selection,
    }));
}

/** Move a waypoint to a new lat/lon (e.g., map drag). */
export function moveTypedWaypointOnMap(
    state: TypedDraftState,
    domain: MissionDomain,
    index: number,
    latDeg: number,
    lonDeg: number,
): TypedDraftState {
    if (domain === "fence") return state;
    return withActiveItems(state, domain, (items, selection) => ({
        items: items.map((entry, i) => {
            if (i !== index || entry.readOnly) return entry;
            if (domain === "rally") {
                return { ...entry, document: withGeoPoint3dPosition(entry.document as GeoPoint3d, latDeg, lonDeg) };
            }
            const item = entry.document as MissionItem;
            const pos = commandPosition(item.command);
            if (!pos) return entry;
            return {
                ...entry,
                document: { ...item, command: withCommandPosition(item.command, withGeoPoint3dPosition(pos, latDeg, lonDeg)) },
            };
        }),
        selection,
    }));
}

/** Change the altitude frame on a rally point, preserving lat/lon and resetting altitude to 0. */
export function updateRallyAltitudeFrame(
    state: TypedDraftState,
    index: number,
    frame: "msl" | "rel_home" | "terrain",
): TypedDraftState {
    return withActiveItems(state, "rally", (items, selection) => ({
        items: items.map((entry, i) => {
            if (i !== index || entry.readOnly) return entry;
            const pt = entry.document as GeoPoint3d;
            const { latitude_deg, longitude_deg } = geoPoint3dLatLon(pt);
            let newPt: GeoPoint3d;
            if (frame === "msl") {
                newPt = { Msl: { latitude_deg, longitude_deg, altitude_msl_m: 0 } };
            } else if (frame === "rel_home") {
                newPt = { RelHome: { latitude_deg, longitude_deg, relative_alt_m: 0 } };
            } else {
                newPt = { Terrain: { latitude_deg, longitude_deg, altitude_terrain_m: 0 } };
            }
            return { ...entry, document: newPt };
        }),
        selection,
    }));
}

function withCommandPosition(cmd: MissionCommand, newPos: GeoPoint3d): MissionCommand {
    if ("Nav" in cmd) {
        const nav = cmd.Nav;
        if (typeof nav === "string") return cmd;
        const key = Object.keys(nav)[0] as string;
        const inner = (nav as Record<string, Record<string, unknown>>)[key];
        if (inner && "position" in inner) {
            return { Nav: { [key]: { ...inner, position: newPos } } as NavCommand };
        }
        return cmd;
    }
    if ("Do" in cmd) {
        const d = cmd.Do;
        if (typeof d === "string") return cmd;
        const key = Object.keys(d)[0] as string;
        const inner = (d as Record<string, Record<string, unknown>>)[key];
        if (inner && "position" in inner) {
            return { Do: { [key]: { ...inner, position: newPos } } as DoCommand };
        }
        return cmd;
    }
    return cmd;
}

export { typedPreviewCoordinates };

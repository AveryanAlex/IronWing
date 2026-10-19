import type { FenceRegion, GeoPoint3d, MissionCommand } from "../mavkit-types";
import { geoPoint3dLatLon, withGeoPoint3dAltitude, withGeoPoint3dPosition } from "../mavkit-types";
import { withActiveItems } from "./core";
import { DOMAIN_ADAPTERS, typedPreviewCoordinates } from "./draft-items";
import type { MissionDomain, TypedDraftItem, TypedDraftState } from "./types";

export function updateFenceRegion(state: TypedDraftState, index: number, region: FenceRegion): TypedDraftState {
    return withActiveItems(state, "fence", (items, selection) => ({
        items: items.map((entry) => entry.index === index ? { ...entry, document: region } : entry), selection,
    }));
}

export function updateTypedCommand(state: TypedDraftState, domain: MissionDomain, index: number, command: MissionCommand): TypedDraftState {
    if (domain !== "mission") return state;
    return withActiveItems(state, domain, (items, selection) => ({
        items: items.map((entry) => entry.index === index && !entry.readOnly
            ? { ...entry, document: { ...entry.document, command } } : entry), selection,
    }));
}

function updatePositions<D extends MissionDomain>(
    state: TypedDraftState, domain: D, matches: (entry: TypedDraftItem<D>) => boolean,
    transform: (position: GeoPoint3d) => GeoPoint3d,
): TypedDraftState {
    if (domain === "fence") return state;
    return withActiveItems(state, domain, (items, selection) => ({
        items: items.map((entry) => matches(entry) && !entry.readOnly
            ? { ...entry, document: DOMAIN_ADAPTERS[domain].updatePosition(entry.document, transform) } : entry), selection,
    }));
}

export function updateTypedAltitude(state: TypedDraftState, domain: MissionDomain, index: number, altitudeM: number): TypedDraftState {
    return updatePositions(state, domain, (entry) => entry.index === index, (position) => withGeoPoint3dAltitude(position, altitudeM));
}

export function bulkUpdateAltitude(state: TypedDraftState, domain: MissionDomain, uiIds: Iterable<number>, altitudeM: number): TypedDraftState {
    const targets = new Set(uiIds);
    if (targets.size === 0) return state;
    return updatePositions(state, domain, (entry) => targets.has(entry.uiId), (position) => withGeoPoint3dAltitude(position, altitudeM));
}

export function updateTypedLatitude(state: TypedDraftState, domain: MissionDomain, index: number, latitudeDeg: number): TypedDraftState {
    return updatePositions(state, domain, (entry) => entry.index === index, (position) =>
        withGeoPoint3dPosition(position, latitudeDeg, geoPoint3dLatLon(position).longitude_deg));
}

export function updateTypedLongitude(state: TypedDraftState, domain: MissionDomain, index: number, longitudeDeg: number): TypedDraftState {
    return updatePositions(state, domain, (entry) => entry.index === index, (position) =>
        withGeoPoint3dPosition(position, geoPoint3dLatLon(position).latitude_deg, longitudeDeg));
}

export function moveTypedWaypointOnMap(state: TypedDraftState, domain: MissionDomain, index: number, latDeg: number, lonDeg: number): TypedDraftState {
    return updatePositions(state, domain, (entry) => entry.index === index, (position) => withGeoPoint3dPosition(position, latDeg, lonDeg));
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
            const pt = entry.document;
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

export { typedPreviewCoordinates };

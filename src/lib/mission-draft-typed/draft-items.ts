import type { FencePlan, FenceRegion, GeoPoint3d, MissionItem, MissionPlan, RallyPlan } from "../mavkit-types";
import { commandPosition, defaultGeoPoint3d, geoPoint3dAltitude, geoPoint3dLatLon } from "../mavkit-types";

import type { DomainPlanMap, MissionDomain, TypedDraftItem, TypedDraftPreview } from "./types";

let nextUiId = 1;

export function allocateUiId(): number {
    return nextUiId++;
}

export function emptyPlan<T extends MissionDomain>(_domain: T): DomainPlanMap[T] {
    if (_domain === "fence") {
        return { return_point: null, regions: [] } as unknown as DomainPlanMap[T];
    }
    if (_domain === "rally") {
        return { points: [] } as unknown as DomainPlanMap[T];
    }
    return { items: [] } as unknown as DomainPlanMap[T];
}

export function sameDocument<T>(left: T, right: T): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
}

export function createDefaultMissionItem(lat: number, lon: number, alt: number): MissionItem {
    return {
        command: {
            Nav: {
                Waypoint: {
                    position: defaultGeoPoint3d(lat, lon, alt),
                    hold_time_s: 0,
                    acceptance_radius_m: 1,
                    pass_radius_m: 0,
                    yaw_deg: 0,
                },
            },
        },
        current: false,
        autocontinue: true,
    };
}

export function createDefaultFenceRegion(lat: number, lon: number): FenceRegion {
    return {
        inclusion_polygon: {
            vertices: [
                { latitude_deg: lat - 0.001, longitude_deg: lon - 0.001 },
                { latitude_deg: lat + 0.001, longitude_deg: lon - 0.001 },
                { latitude_deg: lat + 0.001, longitude_deg: lon + 0.001 },
                { latitude_deg: lat - 0.001, longitude_deg: lon + 0.001 },
            ],
            inclusion_group: 0,
        },
    };
}

export function createDefaultRallyPoint(lat: number, lon: number, alt: number): GeoPoint3d {
    return defaultGeoPoint3d(lat, lon, alt);
}

export function defaultItemForDomain(domain: MissionDomain, lat: number, lon: number, alt: number): MissionItem | FenceRegion | GeoPoint3d {
    if (domain === "mission") return createDefaultMissionItem(lat, lon, alt);
    if (domain === "fence") return createDefaultFenceRegion(lat, lon);
    return createDefaultRallyPoint(lat, lon, alt);
}

export function previewFromMissionItem(item: MissionItem): TypedDraftPreview {
    const pos = commandPosition(item.command);
    if (!pos) return { latitude_deg: null, longitude_deg: null, altitude_m: null };
    const { latitude_deg, longitude_deg } = geoPoint3dLatLon(pos);
    const { value: altitude_m } = geoPoint3dAltitude(pos);
    return { latitude_deg, longitude_deg, altitude_m };
}

export function previewFromFenceRegion(region: FenceRegion): TypedDraftPreview {
    if ("inclusion_polygon" in region) {
        const verts = region.inclusion_polygon.vertices;
        if (verts.length === 0) return { latitude_deg: null, longitude_deg: null, altitude_m: null };
        const lat = verts.reduce((s, v) => s + v.latitude_deg, 0) / verts.length;
        const lon = verts.reduce((s, v) => s + v.longitude_deg, 0) / verts.length;
        return { latitude_deg: lat, longitude_deg: lon, altitude_m: null };
    }
    if ("exclusion_polygon" in region) {
        const verts = region.exclusion_polygon.vertices;
        if (verts.length === 0) return { latitude_deg: null, longitude_deg: null, altitude_m: null };
        const lat = verts.reduce((s, v) => s + v.latitude_deg, 0) / verts.length;
        const lon = verts.reduce((s, v) => s + v.longitude_deg, 0) / verts.length;
        return { latitude_deg: lat, longitude_deg: lon, altitude_m: null };
    }
    if ("inclusion_circle" in region) {
        return {
            latitude_deg: region.inclusion_circle.center.latitude_deg,
            longitude_deg: region.inclusion_circle.center.longitude_deg,
            altitude_m: null,
        };
    }
    const circle = (region as { exclusion_circle: { center: { latitude_deg: number; longitude_deg: number }; radius_m: number } }).exclusion_circle;
    return {
        latitude_deg: circle.center.latitude_deg,
        longitude_deg: circle.center.longitude_deg,
        altitude_m: null,
    };
}

export function previewFromRallyPoint(pt: GeoPoint3d): TypedDraftPreview {
    const { latitude_deg, longitude_deg } = geoPoint3dLatLon(pt);
    const { value: altitude_m } = geoPoint3dAltitude(pt);
    return { latitude_deg, longitude_deg, altitude_m };
}

export function previewForDomain(domain: MissionDomain, doc: MissionItem | FenceRegion | GeoPoint3d): TypedDraftPreview {
    if (domain === "mission") return previewFromMissionItem(doc as MissionItem);
    if (domain === "fence") return previewFromFenceRegion(doc as FenceRegion);
    return previewFromRallyPoint(doc as GeoPoint3d);
}

export function typedPreviewCoordinates(item: TypedDraftItem): { latitude_deg: number; longitude_deg: number } | null {
    if (item.preview.latitude_deg === null || item.preview.longitude_deg === null) {
        return null;
    }
    return {
        latitude_deg: item.preview.latitude_deg,
        longitude_deg: item.preview.longitude_deg,
    };
}

export function isReadOnly(domain: MissionDomain, doc: MissionItem | FenceRegion | GeoPoint3d): boolean {
    if (domain !== "mission") return false;
    const item = doc as MissionItem;
    return "Other" in item.command;
}

export function withCurrent(domain: MissionDomain, doc: MissionItem | FenceRegion | GeoPoint3d, current: boolean): MissionItem | FenceRegion | GeoPoint3d {
    if (domain !== "mission") return doc;
    return { ...(doc as MissionItem), current };
}

export function planItems(domain: MissionDomain, plan: DomainPlanMap[MissionDomain]): (MissionItem | FenceRegion | GeoPoint3d)[] {
    if (domain === "mission") return (plan as MissionPlan).items;
    if (domain === "fence") return (plan as FencePlan).regions;
    return (plan as RallyPlan).points;
}

export function planFromItems(
    domain: MissionDomain,
    items: (MissionItem | FenceRegion | GeoPoint3d)[],
    existingPlan: DomainPlanMap[MissionDomain],
): DomainPlanMap[MissionDomain] {
    if (domain === "mission") {
        return { items: items as MissionItem[] } as DomainPlanMap[typeof domain];
    }
    if (domain === "fence") {
        return { return_point: (existingPlan as FencePlan).return_point, regions: items as FenceRegion[] } as DomainPlanMap[typeof domain];
    }
    return { points: items as GeoPoint3d[] } as DomainPlanMap[typeof domain];
}

export function createDraftItem(domain: MissionDomain, document: MissionItem | FenceRegion | GeoPoint3d, index = 0): TypedDraftItem {
    return {
        uiId: allocateUiId(),
        index,
        document: withCurrent(domain, document, index === 0),
        readOnly: isReadOnly(domain, document),
        preview: previewForDomain(domain, document),
    };
}

export function toDraftItems(domain: MissionDomain, items: (MissionItem | FenceRegion | GeoPoint3d)[]): TypedDraftItem[] {
    return items.map((doc, index) => createDraftItem(domain, doc, index));
}

export function documentFromDraftItems(
    domain: MissionDomain,
    draftItems: TypedDraftItem[],
    existingPlan: DomainPlanMap[MissionDomain],
): DomainPlanMap[MissionDomain] {
    const docs = draftItems.map((entry, index) => withCurrent(domain, entry.document, index === 0));
    return planFromItems(domain, docs, existingPlan);
}

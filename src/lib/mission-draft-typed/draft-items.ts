import type { FenceRegion, GeoPoint3d, MissionItem } from "../mavkit-types";
import { commandPosition, withDynamicCommandField, defaultGeoPoint3d, geoPoint3dAltitude, geoPoint3dLatLon } from "../mavkit-types";

import type { DomainPlanMap, DomainItemMap, MissionDomain, TypedDraftItem, TypedDraftPreview } from "./types";

let nextUiId = 1;

export function allocateUiId(): number {
    return nextUiId++;
}

export function emptyPlan<D extends MissionDomain>(domain: D): DomainPlanMap[D] {
    return DOMAIN_ADAPTERS[domain].emptyPlan();
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

export function defaultItemForDomain<D extends MissionDomain>(domain: D, lat: number, lon: number, alt: number): DomainItemMap[D] {
    return DOMAIN_ADAPTERS[domain].defaultItem(lat, lon, alt);
}

export function previewFromMissionItem(item: MissionItem): TypedDraftPreview {
    const pos = commandPosition(item.command);
    if (!pos) return { latitude_deg: null, longitude_deg: null, altitude_m: null };
    const { latitude_deg, longitude_deg } = geoPoint3dLatLon(pos);
    const { value: altitude_m } = geoPoint3dAltitude(pos);
    return { latitude_deg, longitude_deg, altitude_m };
}

export function previewFromFenceRegion(region: FenceRegion): TypedDraftPreview {
    if ("inclusion_polygon" in region || "exclusion_polygon" in region) {
        const vertices = "inclusion_polygon" in region ? region.inclusion_polygon.vertices : region.exclusion_polygon.vertices;
        if (vertices.length === 0) return { latitude_deg: null, longitude_deg: null, altitude_m: null };
        return {
            latitude_deg: vertices.reduce((sum, vertex) => sum + vertex.latitude_deg, 0) / vertices.length,
            longitude_deg: vertices.reduce((sum, vertex) => sum + vertex.longitude_deg, 0) / vertices.length,
            altitude_m: null,
        };
    }
    if ("inclusion_circle" in region) {
        return {
            latitude_deg: region.inclusion_circle.center.latitude_deg,
            longitude_deg: region.inclusion_circle.center.longitude_deg,
            altitude_m: null,
        };
    }
    const circle = region.exclusion_circle;
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

export function previewForDomain<D extends MissionDomain>(domain: D, doc: DomainItemMap[NoInfer<D>]): TypedDraftPreview {
    return DOMAIN_ADAPTERS[domain].preview(doc);
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

export function isReadOnly<D extends MissionDomain>(domain: D, doc: DomainItemMap[NoInfer<D>]): boolean {
    return DOMAIN_ADAPTERS[domain].isReadOnly(doc);
}

export function withCurrent<D extends MissionDomain>(domain: D, doc: DomainItemMap[NoInfer<D>], current: boolean): DomainItemMap[D] {
    return DOMAIN_ADAPTERS[domain].withCurrent(doc, current);
}

export function planItems<D extends MissionDomain>(domain: D, plan: DomainPlanMap[NoInfer<D>]): DomainItemMap[D][] {
    return DOMAIN_ADAPTERS[domain].items(plan);
}

export function planFromItems<D extends MissionDomain>(domain: D, items: DomainItemMap[NoInfer<D>][], existingPlan: DomainPlanMap[NoInfer<D>]): DomainPlanMap[D] {
    return DOMAIN_ADAPTERS[domain].planFromItems(items, existingPlan);
}

export function createDraftItem<D extends MissionDomain>(domain: D, document: DomainItemMap[NoInfer<D>], index = 0): TypedDraftItem<D> {
    return {
        uiId: allocateUiId(), index,
        document: withCurrent(domain, document, index === 0),
        readOnly: isReadOnly(domain, document), preview: previewForDomain(domain, document),
    };
}

export function toDraftItems<D extends MissionDomain>(domain: D, items: DomainItemMap[NoInfer<D>][]): TypedDraftItem<D>[] {
    return items.map((doc, index) => createDraftItem(domain, doc, index));
}

export function documentFromDraftItems<D extends MissionDomain>(domain: D, draftItems: TypedDraftItem<NoInfer<D>>[], existingPlan: DomainPlanMap[NoInfer<D>]): DomainPlanMap[D] {
    return planFromItems(domain, draftItems.map((entry, index) => withCurrent(domain, entry.document, index === 0)), existingPlan);
}

type DomainAdapter<D extends MissionDomain> = {
    emptyPlan: () => DomainPlanMap[D];
    defaultItem: (lat: number, lon: number, alt: number) => DomainItemMap[D];
    preview: (item: DomainItemMap[D]) => TypedDraftPreview;
    isReadOnly: (item: DomainItemMap[D]) => boolean;
    withCurrent: (item: DomainItemMap[D], current: boolean) => DomainItemMap[D];
    items: (plan: DomainPlanMap[D]) => DomainItemMap[D][];
    planFromItems: (items: DomainItemMap[D][], existing: DomainPlanMap[D]) => DomainPlanMap[D];
    updatePosition: (item: DomainItemMap[D], transform: (position: GeoPoint3d) => GeoPoint3d) => DomainItemMap[D];
};

export const DOMAIN_ADAPTERS: Readonly<{ [D in MissionDomain]: DomainAdapter<D> }> = {
    mission: {
        emptyPlan: () => ({ items: [] }), defaultItem: createDefaultMissionItem, preview: previewFromMissionItem,
        isReadOnly: (item) => "Other" in item.command,
        withCurrent: (item, current) => ({ ...item, current }),
        items: (plan) => plan.items, planFromItems: (items) => ({ items }),
        updatePosition: (item, transform) => {
            const position = commandPosition(item.command);
            return position ? { ...item, command: withDynamicCommandField(item.command, "position", transform(position)) } : item;
        },
    },
    fence: {
        emptyPlan: () => ({ return_point: null, regions: [] }), defaultItem: createDefaultFenceRegion, preview: previewFromFenceRegion,
        isReadOnly: () => false, withCurrent: (item) => item,
        items: (plan) => plan.regions, planFromItems: (regions, existing) => ({ ...existing, regions }),
        updatePosition: (item) => item,
    },
    rally: {
        emptyPlan: () => ({ points: [] }), defaultItem: createDefaultRallyPoint, preview: previewFromRallyPoint,
        isReadOnly: () => false, withCurrent: (item) => item,
        items: (plan) => plan.points, planFromItems: (points) => ({ points }),
        updatePosition: (item, transform) => transform(item),
    },
};

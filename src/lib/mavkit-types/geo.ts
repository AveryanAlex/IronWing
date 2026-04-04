import type { GeoPoint3d, GeoPoint3dTerrain } from "./mission-types";

export function geoPoint3dLatLon(
    pt: GeoPoint3d,
): { latitude_deg: number; longitude_deg: number } {
    if ("Msl" in pt) {
        return { latitude_deg: pt.Msl.latitude_deg, longitude_deg: pt.Msl.longitude_deg };
    }
    if ("RelHome" in pt) {
        return {
            latitude_deg: pt.RelHome.latitude_deg,
            longitude_deg: pt.RelHome.longitude_deg,
        };
    }
    const t = (pt as { Terrain: GeoPoint3dTerrain }).Terrain;
    return { latitude_deg: t.latitude_deg, longitude_deg: t.longitude_deg };
}

export function geoPoint3dAltitude(
    pt: GeoPoint3d,
): { value: number; frame: "msl" | "rel_home" | "terrain" } {
    if ("Msl" in pt) return { value: pt.Msl.altitude_msl_m, frame: "msl" };
    if ("RelHome" in pt) return { value: pt.RelHome.relative_alt_m, frame: "rel_home" };
    const t = (pt as { Terrain: GeoPoint3dTerrain }).Terrain;
    return { value: t.altitude_terrain_m, frame: "terrain" };
}

export function withGeoPoint3dPosition(
    pt: GeoPoint3d,
    lat: number,
    lon: number,
): GeoPoint3d {
    if ("Msl" in pt) {
        return { Msl: { latitude_deg: lat, longitude_deg: lon, altitude_msl_m: pt.Msl.altitude_msl_m } };
    }
    if ("RelHome" in pt) {
        return {
            RelHome: { latitude_deg: lat, longitude_deg: lon, relative_alt_m: pt.RelHome.relative_alt_m },
        };
    }
    const t = (pt as { Terrain: GeoPoint3dTerrain }).Terrain;
    return {
        Terrain: { latitude_deg: lat, longitude_deg: lon, altitude_terrain_m: t.altitude_terrain_m },
    };
}

export function withGeoPoint3dAltitude(pt: GeoPoint3d, alt: number): GeoPoint3d {
    if ("Msl" in pt) {
        return {
            Msl: {
                latitude_deg: pt.Msl.latitude_deg,
                longitude_deg: pt.Msl.longitude_deg,
                altitude_msl_m: alt,
            },
        };
    }
    if ("RelHome" in pt) {
        return {
            RelHome: {
                latitude_deg: pt.RelHome.latitude_deg,
                longitude_deg: pt.RelHome.longitude_deg,
                relative_alt_m: alt,
            },
        };
    }
    const t = (pt as { Terrain: GeoPoint3dTerrain }).Terrain;
    return {
        Terrain: {
            latitude_deg: t.latitude_deg,
            longitude_deg: t.longitude_deg,
            altitude_terrain_m: alt,
        },
    };
}

export function defaultGeoPoint3d(
    lat: number,
    lon: number,
    alt: number,
): GeoPoint3d {
    return { RelHome: { latitude_deg: lat, longitude_deg: lon, relative_alt_m: alt } };
}

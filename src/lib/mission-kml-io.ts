import { unzipSync } from "fflate";

import type { FenceRegion, GeoPoint2d, MissionItem } from "./mavkit-types";

export type KmlParseOptions = {
    defaultRelativeAltitudeM?: number;
};

export type KmlParseResult = {
    fenceRegions: FenceRegion[];
    missionItems: MissionItem[];
    warnings: string[];
};

const DEFAULT_RELATIVE_ALTITUDE_M = 50;

export function parseKml(kmlText: string, options: KmlParseOptions = {}): KmlParseResult {
    const warnings: string[] = [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(kmlText, "text/xml");

    if (hasXmlParseError(doc)) {
        return {
            fenceRegions: [],
            missionItems: [],
            warnings: ["KML XML could not be parsed; no mission or fence data was imported."],
        };
    }

    const fenceRegions: FenceRegion[] = [];
    const missionItems: MissionItem[] = [];
    const placemarks = findElementsByLocalName(doc.documentElement, "Placemark");

    for (const placemark of placemarks) {
        parsePlacemark(placemark, fenceRegions, missionItems, warnings, options);
    }

    if (placemarks.length === 0) {
        warnings.push("KML contained no Placemark elements; nothing was imported.");
    }

    return { fenceRegions, missionItems, warnings };
}

export function parseKmz(
    kmzBytes: Uint8Array | ArrayBuffer,
    options: KmlParseOptions = {},
): KmlParseResult {
    let archive: Record<string, Uint8Array>;
    try {
        archive = unzipSync(new Uint8Array(kmzBytes));
    } catch {
        return {
            fenceRegions: [],
            missionItems: [],
            warnings: ["KMZ archive could not be read; no mission or fence data was imported."],
        };
    }

    const kmlEntry = Object.entries(archive).find(([filename]) => filename.toLowerCase().endsWith(".kml"));
    if (!kmlEntry) {
        return {
            fenceRegions: [],
            missionItems: [],
            warnings: ["KMZ archive contained no .kml file; nothing was imported."],
        };
    }

    const [filename, bytes] = kmlEntry;
    const kmlText = new TextDecoder().decode(bytes);
    const result = parseKml(kmlText, options);

    if (result.fenceRegions.length === 0 && result.missionItems.length === 0 && result.warnings.length === 0) {
        result.warnings.push(`KMZ entry ${filename} parsed successfully but contained no supported Polygon or LineString geometry.`);
    }

    return result;
}

function parsePlacemark(
    placemark: Element,
    fenceRegions: FenceRegion[],
    missionItems: MissionItem[],
    warnings: string[],
    options: KmlParseOptions,
): void {
    const context = placemarkContext(placemark);
    const foundSupportedGeometry = walkPlacemarkGeometry(
        placemark,
        (polygon) => {
            const region = parsePolygon(polygon, context, warnings);
            if (region) {
                fenceRegions.push(region);
            }
        },
        (lineString) => {
            const items = parseLineString(lineString, missionItems.length === 0, context, warnings, options);
            missionItems.push(...items);
        },
        (unsupportedName) => {
            warnings.push(`${context} contains unsupported ${unsupportedName} geometry and it was ignored.`);
        },
    );

    if (!foundSupportedGeometry) {
        const hasAnyGeometry = walkForAnyGeometry(placemark);
        if (!hasAnyGeometry) {
            warnings.push(`${context} contained no Polygon or LineString geometry and was ignored.`);
        }
    }
}

function parsePolygon(polygon: Element, context: string, warnings: string[]): FenceRegion | null {
    const outerBoundary = firstDescendantByLocalName(polygon, "outerBoundaryIs");
    const linearRing = outerBoundary ? firstDescendantByLocalName(outerBoundary, "LinearRing") : null;
    const coordinatesElement = linearRing ? firstDescendantByLocalName(linearRing, "coordinates") : null;

    if (findDirectChildrenByLocalName(polygon, "innerBoundaryIs").length > 0
        || findElementsByLocalName(polygon, "innerBoundaryIs").length > 0) {
        warnings.push(`${context} contains Polygon innerBoundaryIs holes; IronWing ignores interior holes during KML import.`);
    }

    if (!coordinatesElement) {
        warnings.push(`${context} Polygon was missing outer boundary coordinates and was skipped.`);
        return null;
    }

    const vertices = parseCoordinateText(coordinatesElement.textContent ?? "", context, warnings);
    if (vertices.length === 0) {
        warnings.push(`${context} Polygon had empty coordinates and was skipped.`);
        return null;
    }

    const normalizedVertices = stripClosingVertex(vertices);
    if (normalizedVertices.length < 3) {
        warnings.push(`${context} Polygon needs at least three coordinate pairs and was skipped.`);
        return null;
    }

    return {
        inclusion_polygon: {
            vertices: normalizedVertices,
            inclusion_group: 0,
        },
    };
}

function parseLineString(
    lineString: Element,
    markFirstCurrent: boolean,
    context: string,
    warnings: string[],
    options: KmlParseOptions,
): MissionItem[] {
    const coordinatesElement = firstDescendantByLocalName(lineString, "coordinates");
    if (!coordinatesElement) {
        warnings.push(`${context} LineString was missing coordinates and was skipped.`);
        return [];
    }

    const points = parseCoordinateText(coordinatesElement.textContent ?? "", context, warnings);
    if (points.length === 0) {
        warnings.push(`${context} LineString had empty coordinates and was skipped.`);
        return [];
    }

    const altitude = options.defaultRelativeAltitudeM ?? DEFAULT_RELATIVE_ALTITUDE_M;

    return points.map((point, index) => ({
        command: {
            Nav: {
                Waypoint: {
                    position: {
                        RelHome: {
                            latitude_deg: point.latitude_deg,
                            longitude_deg: point.longitude_deg,
                            relative_alt_m: altitude,
                        },
                    },
                    hold_time_s: 0,
                    acceptance_radius_m: 0,
                    pass_radius_m: 0,
                    yaw_deg: 0,
                },
            },
        },
        current: markFirstCurrent && index === 0,
        autocontinue: true,
    }));
}

function walkPlacemarkGeometry(
    root: Element,
    onPolygon: (polygon: Element) => void,
    onLineString: (lineString: Element) => void,
    onUnsupportedGeometry: (geometryName: string) => void,
): boolean {
    let foundSupportedGeometry = false;

    const visit = (node: Element): void => {
        for (const child of elementChildren(node)) {
            const localName = child.localName;
            if (!localName) {
                continue;
            }

            if (localName === "MultiGeometry" || localName === "Document" || localName === "Folder") {
                visit(child);
                continue;
            }

            if (localName === "Polygon") {
                foundSupportedGeometry = true;
                onPolygon(child);
                continue;
            }

            if (localName === "LineString") {
                foundSupportedGeometry = true;
                onLineString(child);
                continue;
            }

            if (localName === "Point" || localName === "Track" || localName === "MultiTrack" || localName === "Model") {
                onUnsupportedGeometry(localName);
                continue;
            }

            visit(child);
        }
    };

    visit(root);
    return foundSupportedGeometry;
}

function walkForAnyGeometry(root: Element): boolean {
    for (const element of findElementsByLocalName(root, "Polygon")) {
        if (element) return true;
    }
    for (const element of findElementsByLocalName(root, "LineString")) {
        if (element) return true;
    }
    for (const element of findElementsByLocalName(root, "Point")) {
        if (element) return true;
    }
    for (const element of findElementsByLocalName(root, "Track")) {
        if (element) return true;
    }
    for (const element of findElementsByLocalName(root, "MultiTrack")) {
        if (element) return true;
    }
    for (const element of findElementsByLocalName(root, "Model")) {
        if (element) return true;
    }
    return false;
}

function parseCoordinateText(text: string, context: string, warnings: string[]): GeoPoint2d[] {
    const coordinates: GeoPoint2d[] = [];
    const tuples = text
        .trim()
        .split(/\s+/)
        .map((tuple) => tuple.trim())
        .filter((tuple) => tuple.length > 0);

    for (const tuple of tuples) {
        const parts = tuple.split(",").map((part) => part.trim());
        if (parts.length < 2) {
            warnings.push(`${context} contained an invalid coordinate tuple (${tuple}) that was ignored.`);
            continue;
        }

        const longitude = Number(parts[0]);
        const latitude = Number(parts[1]);
        if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
            warnings.push(`${context} contained a non-numeric coordinate tuple (${tuple}) that was ignored.`);
            continue;
        }

        coordinates.push({
            latitude_deg: latitude,
            longitude_deg: longitude,
        });
    }

    return coordinates;
}

function stripClosingVertex(vertices: GeoPoint2d[]): GeoPoint2d[] {
    if (vertices.length < 2) {
        return vertices;
    }

    const first = vertices[0];
    const last = vertices[vertices.length - 1];
    if (first.latitude_deg === last.latitude_deg && first.longitude_deg === last.longitude_deg) {
        return vertices.slice(0, -1);
    }

    return vertices;
}

function placemarkContext(placemark: Element): string {
    const name = firstDirectChildByLocalName(placemark, "name")?.textContent?.trim();
    return name ? `Placemark \"${name}\"` : "Unnamed Placemark";
}

function hasXmlParseError(doc: Document): boolean {
    return Array.from(doc.getElementsByTagName("*")).some(
        (element) => element.localName?.toLowerCase() === "parsererror",
    );
}

function firstDescendantByLocalName(root: Element, localName: string): Element | null {
    return findElementsByLocalName(root, localName)[0] ?? null;
}

function firstDirectChildByLocalName(root: Element, localName: string): Element | null {
    return findDirectChildrenByLocalName(root, localName)[0] ?? null;
}

function findDirectChildrenByLocalName(root: Element, localName: string): Element[] {
    return elementChildren(root).filter((child) => child.localName === localName);
}

function findElementsByLocalName(root: Element | null, localName: string): Element[] {
    if (!root) {
        return [];
    }

    const matches: Element[] = [];
    const visit = (node: Element): void => {
        for (const child of elementChildren(node)) {
            if (child.localName === localName) {
                matches.push(child);
            }
            visit(child);
        }
    };

    if (root.localName === localName) {
        matches.push(root);
    }
    visit(root);
    return matches;
}

function elementChildren(node: Element): Element[] {
    return Array.from(node.children);
}

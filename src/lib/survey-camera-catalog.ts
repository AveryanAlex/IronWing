import rawData from "../data/camera-metadata.json";

import type { CameraSpec } from "./survey-camera";

const CUSTOM_CAMERA_STORAGE_KEY = "ironwing_custom_cameras";
const RECENT_CAMERA_STORAGE_KEY = "ironwing_recent_cameras";
const MAX_RECENT_CAMERAS = 6;

type RawCatalogCamera = {
    canonicalName?: unknown;
    brand?: unknown;
    model?: unknown;
    sensorWidth?: unknown;
    sensorHeight?: unknown;
    imageWidth?: unknown;
    imageHeight?: unknown;
    focalLength?: unknown;
    landscape?: unknown;
    fixedOrientation?: unknown;
    minTriggerInterval?: unknown;
};

type RawCatalogFile = {
    cameraMetaData?: unknown;
};

export type CatalogCamera = CameraSpec & {
    canonicalName: string;
    brand: string;
    model: string;
    landscape: boolean;
    fixedOrientation: boolean;
};

function compareCameras(left: CatalogCamera, right: CatalogCamera): number {
    return (
        left.brand.localeCompare(right.brand, undefined, { sensitivity: "base" }) ||
        left.model.localeCompare(right.model, undefined, { sensitivity: "base" }) ||
        left.canonicalName.localeCompare(right.canonicalName, undefined, { sensitivity: "base" })
    );
}

function cloneCamera(camera: CatalogCamera): CatalogCamera {
    return { ...camera };
}

function expectNonEmptyString(value: unknown, field: string, context: string): string {
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new TypeError(`${context}: ${field} must be a non-empty string.`);
    }

    return value.trim();
}

function expectFinitePositive(value: unknown, field: string, context: string): number {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
        throw new RangeError(`${context}: ${field} must be a finite number greater than zero.`);
    }

    return value;
}

function expectFiniteNonNegative(value: unknown, field: string, context: string): number {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        throw new RangeError(`${context}: ${field} must be a finite number greater than or equal to zero.`);
    }

    return value;
}

function normalizeRawCatalogCamera(raw: unknown, context: string): CatalogCamera {
    if (!raw || typeof raw !== "object") {
        throw new TypeError(`${context}: camera entry must be an object.`);
    }

    const camera = raw as RawCatalogCamera;
    const normalized: CatalogCamera = {
        canonicalName: expectNonEmptyString(camera.canonicalName, "canonicalName", context),
        brand: expectNonEmptyString(camera.brand, "brand", context),
        model: expectNonEmptyString(camera.model, "model", context),
        sensorWidth_mm: expectFinitePositive(camera.sensorWidth, "sensorWidth", context),
        sensorHeight_mm: expectFinitePositive(camera.sensorHeight, "sensorHeight", context),
        imageWidth_px: expectFinitePositive(camera.imageWidth, "imageWidth", context),
        imageHeight_px: expectFinitePositive(camera.imageHeight, "imageHeight", context),
        focalLength_mm: expectFinitePositive(camera.focalLength, "focalLength", context),
        landscape: typeof camera.landscape === "boolean" ? camera.landscape : true,
        fixedOrientation: typeof camera.fixedOrientation === "boolean" ? camera.fixedOrientation : false,
    };

    if (camera.minTriggerInterval !== undefined) {
        normalized.minTriggerInterval_s = expectFiniteNonNegative(
            camera.minTriggerInterval,
            "minTriggerInterval",
            context,
        );
    }

    return normalized;
}

function toRawCatalogCamera(camera: CatalogCamera): RawCatalogCamera {
    const rawCamera: RawCatalogCamera = {
        canonicalName: camera.canonicalName,
        brand: camera.brand,
        model: camera.model,
        sensorWidth: camera.sensorWidth_mm,
        sensorHeight: camera.sensorHeight_mm,
        imageWidth: camera.imageWidth_px,
        imageHeight: camera.imageHeight_px,
        focalLength: camera.focalLength_mm,
        landscape: camera.landscape,
        fixedOrientation: camera.fixedOrientation,
    };

    if (camera.minTriggerInterval_s !== undefined) {
        rawCamera.minTriggerInterval = camera.minTriggerInterval_s;
    }

    return rawCamera;
}

function normalizeCatalogCamera(camera: CatalogCamera, context: string): CatalogCamera {
    return normalizeRawCatalogCamera(toRawCatalogCamera(camera), context);
}

function parseCatalogFile(raw: unknown): CatalogCamera[] {
    if (!raw || typeof raw !== "object") {
        throw new TypeError("camera-metadata.json: top-level document must be an object.");
    }

    const file = raw as RawCatalogFile;
    if (!Array.isArray(file.cameraMetaData)) {
        throw new TypeError("camera-metadata.json: cameraMetaData must be an array.");
    }

    return file.cameraMetaData
        .map((camera, index) => normalizeRawCatalogCamera(camera, `camera-metadata.json[${index}]`))
        .sort(compareCameras);
}

function readStoredCustomCameraEntries(): unknown[] {
    if (typeof localStorage === "undefined") {
        return [];
    }

    try {
        const raw = localStorage.getItem(CUSTOM_CAMERA_STORAGE_KEY);
        if (!raw) {
            return [];
        }

        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
            return parsed;
        }

        if (
            parsed &&
            typeof parsed === "object" &&
            Array.isArray((parsed as RawCatalogFile).cameraMetaData)
        ) {
            return (parsed as RawCatalogFile).cameraMetaData as unknown[];
        }

        return [];
    } catch {
        return [];
    }
}

function writeStoredCustomCameras(cameras: CatalogCamera[]): void {
    if (typeof localStorage === "undefined") {
        return;
    }

    try {
        localStorage.setItem(
            CUSTOM_CAMERA_STORAGE_KEY,
            JSON.stringify(cameras.map((camera) => toRawCatalogCamera(camera))),
        );
    } catch {
        // Ignore storage unavailability or quota errors.
    }
}

function readStoredRecentCameraNames(): string[] {
    if (typeof localStorage === "undefined") {
        return [];
    }

    try {
        const raw = localStorage.getItem(RECENT_CAMERA_STORAGE_KEY);
        if (!raw) {
            return [];
        }

        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed.filter((value): value is string => typeof value === "string");
    } catch {
        return [];
    }
}

function writeStoredRecentCameraNames(canonicalNames: string[]): void {
    if (typeof localStorage === "undefined") {
        return;
    }

    try {
        localStorage.setItem(
            RECENT_CAMERA_STORAGE_KEY,
            JSON.stringify(canonicalNames.slice(0, MAX_RECENT_CAMERAS)),
        );
    } catch {
        // Ignore storage unavailability or quota errors.
    }
}

const builtinCameras = parseCatalogFile(rawData);

export function getBuiltinCameras(): CatalogCamera[] {
    return builtinCameras.map(cloneCamera);
}

export function getCustomCameras(): CatalogCamera[] {
    try {
        return readStoredCustomCameraEntries()
            .map((camera, index) => normalizeRawCatalogCamera(camera, `customCamera[${index}]`))
            .sort(compareCameras)
            .map(cloneCamera);
    } catch {
        return [];
    }
}

export function saveCustomCamera(camera: CatalogCamera): void {
    const normalizedCamera = normalizeCatalogCamera(camera, "saveCustomCamera");
    const cameras = getCustomCameras();
    const existingIndex = cameras.findIndex(
        (entry) => entry.canonicalName === normalizedCamera.canonicalName,
    );

    if (existingIndex >= 0) {
        cameras[existingIndex] = normalizedCamera;
    } else {
        cameras.push(normalizedCamera);
    }

    cameras.sort(compareCameras);
    writeStoredCustomCameras(cameras);
}

export function deleteCustomCamera(canonicalName: string): void {
    const normalizedName = canonicalName.trim();
    if (normalizedName.length === 0) {
        return;
    }

    const next = getCustomCameras().filter((camera) => camera.canonicalName !== normalizedName);
    writeStoredCustomCameras(next);
}

export function getRecentCameras(): CatalogCamera[] {
    const allCameras = getAllCameras();
    const byCanonicalName = new Map(allCameras.map((camera) => [camera.canonicalName, camera]));
    const seen = new Set<string>();

    return readStoredRecentCameraNames()
        .map((canonicalName) => byCanonicalName.get(canonicalName))
        .filter((camera): camera is CatalogCamera => Boolean(camera))
        .filter((camera) => {
            if (seen.has(camera.canonicalName)) {
                return false;
            }
            seen.add(camera.canonicalName);
            return true;
        })
        .map(cloneCamera);
}

export function addRecentCamera(canonicalName: string): void {
    const normalizedName = canonicalName.trim();
    if (normalizedName.length === 0 || !findCamera(normalizedName)) {
        return;
    }

    const next = [
        normalizedName,
        ...readStoredRecentCameraNames().filter((value) => value !== normalizedName),
    ];
    writeStoredRecentCameraNames(next);
}

export function getAllCameras(): CatalogCamera[] {
    const merged = new Map<string, CatalogCamera>();

    for (const camera of getBuiltinCameras()) {
        merged.set(camera.canonicalName, camera);
    }

    for (const camera of getCustomCameras()) {
        merged.set(camera.canonicalName, camera);
    }

    return Array.from(merged.values()).sort(compareCameras).map(cloneCamera);
}

export function findCamera(canonicalName: string): CatalogCamera | undefined {
    const normalizedName = canonicalName.trim();
    if (normalizedName.length === 0) {
        return undefined;
    }

    const camera = getAllCameras().find((entry) => entry.canonicalName === normalizedName);
    return camera ? cloneCamera(camera) : undefined;
}

export function searchCameras(query: string): CatalogCamera[] {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const cameras = getAllCameras();

    if (normalizedQuery.length === 0) {
        return cameras;
    }

    return cameras.filter((camera) => {
        const haystack = [camera.brand, camera.model, camera.canonicalName]
            .join("\n")
            .toLocaleLowerCase();
        return haystack.includes(normalizedQuery);
    });
}

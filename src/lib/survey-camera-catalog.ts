import rawData from "../data/camera-metadata.json";

import type { CameraSpec } from "./survey-camera";
import { getBrowserStorage, readStorageJson, writeStorageJson } from "./local-storage";

const CUSTOM_CAMERA_STORAGE_KEY = "ironwing.cameras.custom";
const RECENT_CAMERA_STORAGE_KEY = "ironwing.cameras.recent";
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

type StorageJsonReadResult = {
  value: unknown | null;
  status: "ok" | "unavailable" | "malformed";
};

export type CatalogCamera = CameraSpec & {
  canonicalName: string;
  brand: string;
  model: string;
  landscape: boolean;
  fixedOrientation: boolean;
};

export type CameraCatalogState = {
  builtin: CatalogCamera[];
  custom: CatalogCamera[];
  recent: CatalogCamera[];
  all: CatalogCamera[];
  warnings: string[];
};

export type CameraCatalogActionResult = {
  ok: boolean;
  message: string | null;
};

function compareCameras(left: CatalogCamera, right: CatalogCamera): number {
  return (
    left.brand.localeCompare(right.brand, undefined, { sensitivity: "base" })
    || left.model.localeCompare(right.model, undefined, { sensitivity: "base" })
    || left.canonicalName.localeCompare(right.canonicalName, undefined, { sensitivity: "base" })
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

function readStorageJsonWithStatus(key: string): StorageJsonReadResult {
  const storage = getBrowserStorage();
  if (!storage) {
    return {
      value: null,
      status: "ok",
    };
  }

  let raw: string | null = null;
  try {
    raw = storage.getItem(key);
  } catch {
    return {
      value: null,
      status: "unavailable",
    };
  }

  if (!raw) {
    return {
      value: null,
      status: "ok",
    };
  }

  try {
    return {
      value: JSON.parse(raw),
      status: "ok",
    };
  } catch {
    return {
      value: null,
      status: "malformed",
    };
  }
}

function parseCustomCameraEntries(raw: unknown): CatalogCamera[] {
  if (raw === null) {
    return [];
  }

  const entries = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as RawCatalogFile).cameraMetaData)
      ? (raw as RawCatalogFile).cameraMetaData as unknown[]
      : null;

  if (!entries) {
    throw new TypeError("custom camera storage must contain an array of cameras.");
  }

  return entries
    .map((camera, index) => normalizeRawCatalogCamera(camera, `customCamera[${index}]`))
    .sort(compareCameras);
}

function parseRecentCameraNames(raw: unknown): string[] {
  if (raw === null) {
    return [];
  }

  if (!Array.isArray(raw)) {
    throw new TypeError("recent camera storage must contain an array of canonical names.");
  }

  return raw.filter((value): value is string => typeof value === "string");
}

function writeStoredCustomCameras(cameras: CatalogCamera[]): void {
  writeStorageJson(
    CUSTOM_CAMERA_STORAGE_KEY,
    cameras.map((camera) => toRawCatalogCamera(camera)),
  );
}

function writeStoredRecentCameraNames(canonicalNames: string[]): void {
  writeStorageJson(RECENT_CAMERA_STORAGE_KEY, canonicalNames.slice(0, MAX_RECENT_CAMERAS));
}

function persistJson(key: string, value: unknown): CameraCatalogActionResult {
  const storage = getBrowserStorage();
  if (!storage) {
    return {
      ok: false,
      message: "Local camera storage is unavailable in this browser context. Builtin cameras stay usable.",
    };
  }

  try {
    storage.setItem(key, JSON.stringify(value));
    return {
      ok: true,
      message: null,
    };
  } catch {
    return {
      ok: false,
      message: "Local camera storage is unavailable right now. Builtin cameras stay usable, but recent/custom changes were not saved.",
    };
  }
}

function mergeCameraMaps(...cameraLists: CatalogCamera[][]): Map<string, CatalogCamera> {
  const merged = new Map<string, CatalogCamera>();

  for (const cameras of cameraLists) {
    for (const camera of cameras) {
      merged.set(camera.canonicalName, cloneCamera(camera));
    }
  }

  return merged;
}

function recentCamerasFromNames(canonicalNames: string[], byCanonicalName: Map<string, CatalogCamera>): CatalogCamera[] {
  const seen = new Set<string>();

  return canonicalNames
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

function customCameraWarning(status: StorageJsonReadResult["status"]): string | null {
  switch (status) {
    case "malformed":
      return "Saved custom camera data was malformed and was ignored. Builtin cameras stay usable.";
    case "unavailable":
      return "Saved custom camera data is unavailable in this browser context. Builtin cameras stay usable.";
    default:
      return null;
  }
}

function recentCameraWarning(status: StorageJsonReadResult["status"]): string | null {
  switch (status) {
    case "malformed":
      return "Saved recent-camera history was malformed and was ignored. Builtin cameras stay usable.";
    case "unavailable":
      return "Saved recent-camera history is unavailable in this browser context. Builtin cameras stay usable.";
    default:
      return null;
  }
}

const builtinCameras = parseCatalogFile(rawData);

export function getBuiltinCameras(): CatalogCamera[] {
  return builtinCameras.map(cloneCamera);
}

export function getCustomCameras(): CatalogCamera[] {
  try {
    return parseCustomCameraEntries(readStorageJson(CUSTOM_CAMERA_STORAGE_KEY)).map(cloneCamera);
  } catch {
    // Ignore malformed persisted data and fall back to an empty custom-camera list.
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

  try {
    return recentCamerasFromNames(parseRecentCameraNames(readStorageJson(RECENT_CAMERA_STORAGE_KEY)), byCanonicalName);
  } catch {
    return [];
  }
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

function readStoredRecentCameraNames(): string[] {
  const parsed = readStorageJson(RECENT_CAMERA_STORAGE_KEY);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter((value): value is string => typeof value === "string");
}

export function getAllCameras(): CatalogCamera[] {
  const merged = mergeCameraMaps(getBuiltinCameras(), getCustomCameras());
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

export function getCameraCatalogState(): CameraCatalogState {
  const customRead = readStorageJsonWithStatus(CUSTOM_CAMERA_STORAGE_KEY);
  const recentRead = readStorageJsonWithStatus(RECENT_CAMERA_STORAGE_KEY);
  const warnings = [
    customCameraWarning(customRead.status),
    recentCameraWarning(recentRead.status),
  ].filter((warning): warning is string => Boolean(warning));

  let custom: CatalogCamera[] = [];
  if (customRead.status === "ok") {
    try {
      custom = parseCustomCameraEntries(customRead.value).map(cloneCamera);
    } catch {
      warnings.push("Saved custom camera data was malformed and was ignored. Builtin cameras stay usable.");
    }
  }

  const builtin = getBuiltinCameras();
  const all = Array.from(mergeCameraMaps(builtin, custom).values()).sort(compareCameras).map(cloneCamera);
  const byCanonicalName = new Map(all.map((camera) => [camera.canonicalName, camera]));

  let recent: CatalogCamera[] = [];
  if (recentRead.status === "ok") {
    try {
      recent = recentCamerasFromNames(parseRecentCameraNames(recentRead.value), byCanonicalName);
    } catch {
      warnings.push("Saved recent-camera history was malformed and was ignored. Builtin cameras stay usable.");
    }
  }

  return {
    builtin,
    custom,
    recent,
    all,
    warnings,
  };
}

export function saveCustomCameraWithStatus(camera: CatalogCamera): CameraCatalogActionResult {
  const normalizedCamera = normalizeCatalogCamera(camera, "saveCustomCameraWithStatus");
  const state = getCameraCatalogState();
  const next = [...state.custom];
  const existingIndex = next.findIndex((entry) => entry.canonicalName === normalizedCamera.canonicalName);

  if (existingIndex >= 0) {
    next[existingIndex] = normalizedCamera;
  } else {
    next.push(normalizedCamera);
  }

  next.sort(compareCameras);
  return persistJson(
    CUSTOM_CAMERA_STORAGE_KEY,
    next.map((entry) => toRawCatalogCamera(entry)),
  );
}

export function deleteCustomCameraWithStatus(canonicalName: string): CameraCatalogActionResult {
  const normalizedName = canonicalName.trim();
  if (normalizedName.length === 0) {
    return {
      ok: true,
      message: null,
    };
  }

  const state = getCameraCatalogState();
  const next = state.custom.filter((camera) => camera.canonicalName !== normalizedName);
  return persistJson(
    CUSTOM_CAMERA_STORAGE_KEY,
    next.map((entry) => toRawCatalogCamera(entry)),
  );
}

export function addRecentCameraWithStatus(canonicalName: string): CameraCatalogActionResult {
  const normalizedName = canonicalName.trim();
  if (normalizedName.length === 0 || !findCamera(normalizedName)) {
    return {
      ok: true,
      message: null,
    };
  }

  const recentRead = readStorageJsonWithStatus(RECENT_CAMERA_STORAGE_KEY);
  let existingNames: string[] = [];
  if (recentRead.status === "ok") {
    try {
      existingNames = parseRecentCameraNames(recentRead.value);
    } catch {
      existingNames = [];
    }
  }

  const next = [
    normalizedName,
    ...existingNames.filter((value) => value !== normalizedName),
  ].slice(0, MAX_RECENT_CAMERAS);

  return persistJson(RECENT_CAMERA_STORAGE_KEY, next);
}

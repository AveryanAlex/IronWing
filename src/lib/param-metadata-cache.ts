import { fetch } from "@platform/http";

import { readStorageRaw, writeStorageRaw } from "./local-storage";

const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const REPOSITORY_RAW_URL = "https://raw.githubusercontent.com/ArduPilot/ParameterRepository/main";
const REPOSITORY_INDEX_URL = "https://api.github.com/repos/ArduPilot/ParameterRepository/git/trees/main";
const INDEX_CACHE_KEY = "param_meta_github_folders";
const FOLDER_PATTERN = /^(AP_Periph|Blimp|Copter|Plane|Rover|Sub|Tracker)-\d+\.\d+$/;

const REPOSITORY_VEHICLE_BY_SLUG: Record<string, string> = {
  ArduCopter: "Copter",
  Heli: "Copter",
  SITL: "Copter",
  ArduPlane: "Plane",
  Rover: "Rover",
  ArduSub: "Sub",
  AntennaTracker: "Tracker",
  AP_Periph: "AP_Periph",
  Blimp: "Blimp",
};

type CacheEntry = {
  value: string;
  fresh: boolean;
};

function readCachedValue(cacheKey: string, nowMs: number): CacheEntry | null {
  const value = readStorageRaw(cacheKey);
  const cachedTs = readStorageRaw(`${cacheKey}_ts`);
  if (!value || !cachedTs) {
    return null;
  }

  const timestampMs = Number.parseInt(cachedTs, 10);
  if (!Number.isFinite(timestampMs)) {
    return null;
  }

  const ageMs = nowMs - timestampMs;
  const fresh = ageMs >= 0 && ageMs < CACHE_MAX_AGE_MS;

  return { value, fresh };
}

function writeCachedValue(cacheKey: string, value: string): void {
  writeStorageRaw(cacheKey, value);
  writeStorageRaw(`${cacheKey}_ts`, String(Date.now()));
}

function firmwareSeries(firmwareVersion: string | null | undefined): string | null {
  return /^(\d+\.\d+)\.\d+$/.exec(firmwareVersion?.trim() ?? "")?.[1] ?? null;
}

async function fetchPlainText(url: string): Promise<string | null> {
  const response = await fetch(url);
  if (!response.ok) {
    console.warn(`[param-metadata] fetch failed: ${response.status} (${url})`);
    return null;
  }

  return response.text();
}

async function fetchWithCache(
  cacheKey: string,
  fetchRemoteValue: () => Promise<string | null>,
): Promise<string | null> {
  const cached = readCachedValue(cacheKey, Date.now());
  if (cached?.fresh) {
    return cached.value;
  }

  try {
    const value = await fetchRemoteValue();
    if (value) {
      writeCachedValue(cacheKey, value);
      return value;
    }
  } catch (error) {
    console.warn("[param-metadata] fetch error:", error);
  }

  return cached?.value ?? null;
}

async function fetchRepositoryFolders(): Promise<string[]> {
  const foldersJson = await fetchWithCache(INDEX_CACHE_KEY, async () => {
    const text = await fetchPlainText(REPOSITORY_INDEX_URL);
    if (!text) return null;

    const index = JSON.parse(text);
    if (!Array.isArray(index.tree) || index.truncated) {
      throw new Error("Invalid parameter metadata repository index");
    }

    const folders = index.tree.flatMap((entry: { type?: string; path?: string } | null) =>
      entry?.type === "tree" && typeof entry.path === "string" && FOLDER_PATTERN.test(entry.path)
        ? [entry.path]
        : [],
    );
    if (folders.length === 0) {
      throw new Error("Parameter metadata repository index has no vehicle folders");
    }
    return JSON.stringify(folders);
  });

  if (!foldersJson) return [];
  try {
    const folders: unknown = JSON.parse(foldersJson);
    if (Array.isArray(folders) && folders.every((folder) => typeof folder === "string" && FOLDER_PATTERN.test(folder))) {
      return folders;
    }
  } catch (error) {
    console.warn("[param-metadata] invalid cached repository index:", error);
  }
  return [];
}

function latestFolder(folders: string[], vehicle: string): string | undefined {
  return folders.filter((folder) => folder.startsWith(`${vehicle}-`)).sort((a, b) => {
    const [aMajor, aMinor] = a.slice(vehicle.length + 1).split(".").map(Number);
    const [bMajor, bMinor] = b.slice(vehicle.length + 1).split(".").map(Number);
    return bMajor - aMajor || bMinor - aMinor;
  })[0];
}

async function fetchFolderXml(folder: string): Promise<string | null> {
  return fetchWithCache(`param_meta_github_${folder}`, () =>
    fetchPlainText(`${REPOSITORY_RAW_URL}/${folder}/apm.pdef.xml`),
  );
}

function paramfileInnerXml(xml: string): string {
  return xml
    .replace(/^\s*<\?xml[^>]*>\s*/i, "")
    .replace(/^(?:\s*<!--[\s\S]*?-->)+\s*/, "")
    .replace(/^\s*<paramfile\b[^>]*>/i, "")
    .replace(/<\/paramfile>\s*$/i, "")
    .trim();
}

function mergeMetadataXmlDocuments(xmls: string[]): string | null {
  if (xmls.length === 0) {
    return null;
  }
  if (xmls.length === 1) {
    return xmls[0];
  }

  return `<paramfile>\n${xmls.map(paramfileInnerXml).filter(Boolean).join("\n")}\n</paramfile>`;
}

export async function fetchParamMetadataXml(
  slug: string,
  firmwareVersion?: string | null,
): Promise<string | null> {
  const vehicle = Object.prototype.hasOwnProperty.call(REPOSITORY_VEHICLE_BY_SLUG, slug)
    ? REPOSITORY_VEHICLE_BY_SLUG[slug]
    : null;
  if (!vehicle) return null;

  const xmls: string[] = [];
  const requestedSeries = firmwareSeries(firmwareVersion);
  const requestedFolder = requestedSeries ? `${vehicle}-${requestedSeries}` : null;
  if (requestedFolder) {
    const xml = await fetchFolderXml(requestedFolder);
    if (xml) xmls.push(xml);
  }

  const folders = await fetchRepositoryFolders();
  // Vehicle XML includes SITL and helicopter definitions. AP_Periph supplements shared parameters.
  const genericFolders = new Set([latestFolder(folders, vehicle), latestFolder(folders, "AP_Periph")]);
  for (const folder of genericFolders) {
    if (!folder || folder === requestedFolder) continue;
    const xml = await fetchFolderXml(folder);
    if (xml) xmls.push(xml);
  }

  return mergeMetadataXmlDocuments(xmls);
}

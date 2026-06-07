import type { CatalogEntry, CatalogTargetSummary } from "../../firmware";
import { ardupilotFirmwareUrl } from "../ardupilot-urls";
import {
  buildCatalogTargets,
  filterCatalogEntriesByBoardAndPlatform,
  filterCatalogTargetsToSupportedOfficialBootloaders,
  parseFirmwareManifestGz,
  parseSupportedOfficialBootloaderTargets,
} from "./catalog";

let manifestEntriesCache: Promise<CatalogEntry[]> | null = null;
let bootloaderIndexCache: Promise<string> | null = null;

async function fetchChecked(url: string, label: string): Promise<Response> {
  let response: Response;
  try {
    response = await globalThis.fetch(url);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} fetch failed. Browser fetch may be blocked by network or CORS: ${detail}`);
  }

  if (!response.ok) {
    throw new Error(`${label} fetch failed: HTTP ${response.status}`);
  }
  return response;
}

async function fetchFirmwareManifestEntries(): Promise<CatalogEntry[]> {
  const response = await fetchChecked(ardupilotFirmwareUrl("manifest.json.gz"), "firmware catalog manifest");
  return parseFirmwareManifestGz(new Uint8Array(await response.arrayBuffer()));
}

async function fetchBootloaderIndex(): Promise<string> {
  const response = await fetchChecked(ardupilotFirmwareUrl("Tools/Bootloaders/"), "firmware bootloader index");
  return response.text();
}

export function resetFirmwareCatalogCacheForTests(): void {
  manifestEntriesCache = null;
  bootloaderIndexCache = null;
}

export async function firmwareCatalogEntriesFromRemote(boardId: number, platform?: string | null): Promise<CatalogEntry[]> {
  manifestEntriesCache ??= fetchFirmwareManifestEntries();
  return filterCatalogEntriesByBoardAndPlatform(await manifestEntriesCache, boardId, platform);
}

export async function firmwareCatalogTargetsFromRemote(): Promise<CatalogTargetSummary[]> {
  manifestEntriesCache ??= fetchFirmwareManifestEntries();
  return buildCatalogTargets(await manifestEntriesCache);
}

export async function firmwareBootloaderCatalogTargetsFromRemote(): Promise<CatalogTargetSummary[]> {
  manifestEntriesCache ??= fetchFirmwareManifestEntries();
  bootloaderIndexCache ??= fetchBootloaderIndex();
  const [targets, bootloaderIndex] = await Promise.all([
    firmwareCatalogTargetsFromRemote(),
    bootloaderIndexCache,
  ]);
  return filterCatalogTargetsToSupportedOfficialBootloaders(
    targets,
    parseSupportedOfficialBootloaderTargets(bootloaderIndex),
  );
}

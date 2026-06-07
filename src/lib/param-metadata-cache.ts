import { fetch } from "@platform/http";
import { gunzipSync, strFromU8 } from "fflate";

import { readStorageRaw, writeStorageRaw } from "./local-storage";
import { ardupilotAutotestUrl } from "./ardupilot-urls";

const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const KNOWN_GENERIC_SLUGS = [
  "SITL",
  "AP_Periph",
  "ArduSub",
  "Rover",
  "ArduCopter",
  "ArduPlane",
  "AntennaTracker",
  "Blimp",
  "Heli",
] as const;
const GENERIC_FALLBACK_SLUGS = ["SITL", "AP_Periph"] as const;

const VERSIONED_SHORT_BY_SLUG: Record<string, string> = {
  ArduCopter: "Copter",
  ArduPlane: "Plane",
  Rover: "Rover",
  ArduSub: "Sub",
  AntennaTracker: "Tracker",
};

type CacheEntry = {
  xml: string;
  fresh: boolean;
};

function genericMetadataCacheKey(slug: string): string {
  return `param_meta_${slug}`;
}

function genericMetadataTimestampKey(slug: string): string {
  return `param_meta_${slug}_ts`;
}

function versionedMetadataCacheKey(short: string, version: string): string {
  return `param_meta_versioned_${short}_${version}`;
}

function versionedMetadataTimestampKey(short: string, version: string): string {
  return `param_meta_versioned_${short}_${version}_ts`;
}

function readCachedMetadataXml(cacheKey: string, tsKey: string, nowMs: number): CacheEntry | null {
  const cachedXml = readStorageRaw(cacheKey);
  const cachedTs = readStorageRaw(tsKey);
  if (!cachedXml || !cachedTs) {
    return null;
  }

  const timestampMs = Number.parseInt(cachedTs, 10);
  if (!Number.isFinite(timestampMs)) {
    return null;
  }

  const ageMs = nowMs - timestampMs;
  const fresh = ageMs >= 0 && ageMs < CACHE_MAX_AGE_MS;

  return { xml: cachedXml, fresh };
}

function writeCachedMetadataXml(cacheKey: string, tsKey: string, xml: string, nowMs: number): void {
  writeStorageRaw(cacheKey, xml);
  writeStorageRaw(tsKey, String(nowMs));
}

function normalizeFirmwareVersion(firmwareVersion: string | null | undefined): string | null {
  const trimmed = firmwareVersion?.trim();
  return trimmed && /^\d+\.\d+\.\d+$/.test(trimmed) ? trimmed : null;
}

function versionedShortForSlug(slug: string): string | null {
  return VERSIONED_SHORT_BY_SLUG[slug] ?? null;
}

function isKnownGenericSlug(slug: string): boolean {
  return KNOWN_GENERIC_SLUGS.includes(slug as (typeof KNOWN_GENERIC_SLUGS)[number]);
}

function genericUrl(slug: string): string {
  return ardupilotAutotestUrl(`Parameters/${slug}/apm.pdef.xml.gz`);
}

function versionedUrl(short: string, version: string): string {
  return ardupilotAutotestUrl(`Parameters/versioned/${short}/stable-${version}/apm.pdef.xml`);
}

async function fetchDecompressedXml(url: string): Promise<string | null> {
  const response = await fetch(url);
  if (!response.ok) {
    console.warn(`[param-metadata] fetch failed: ${response.status}`);
    return null;
  }

  const compressedBytes = new Uint8Array(await response.arrayBuffer());
  return strFromU8(gunzipSync(compressedBytes));
}

async function fetchPlainXml(url: string): Promise<string | null> {
  const response = await fetch(url);
  if (!response.ok) {
    console.warn(`[param-metadata] fetch failed: ${response.status}`);
    return null;
  }

  return response.text();
}

async function fetchWithCache(
  cacheKey: string,
  tsKey: string,
  fetchRemoteXml: () => Promise<string | null>,
): Promise<string | null> {
  const nowMs = Date.now();
  const cached = readCachedMetadataXml(cacheKey, tsKey, nowMs);
  if (cached?.fresh) {
    return cached.xml;
  }

  try {
    const xml = await fetchRemoteXml();
    if (xml) {
      writeCachedMetadataXml(cacheKey, tsKey, xml, Date.now());
      return xml;
    }
  } catch (error) {
    console.warn("[param-metadata] fetch error:", error);
  }

  return cached?.xml ?? null;
}

async function fetchGenericParamMetadataXml(slug: string): Promise<string | null> {
  const cacheKey = genericMetadataCacheKey(slug);
  const tsKey = genericMetadataTimestampKey(slug);
  return fetchWithCache(cacheKey, tsKey, () => fetchDecompressedXml(genericUrl(slug)));
}

async function fetchVersionedParamMetadataXml(short: string, version: string): Promise<string | null> {
  const cacheKey = versionedMetadataCacheKey(short, version);
  const tsKey = versionedMetadataTimestampKey(short, version);
  return fetchWithCache(cacheKey, tsKey, () => fetchPlainXml(versionedUrl(short, version)));
}

function genericSlugOrder(slug: string): string[] {
  if (!isKnownGenericSlug(slug)) {
    return [];
  }

  return [slug, ...GENERIC_FALLBACK_SLUGS].filter(
    (candidate, index, candidates) => candidates.indexOf(candidate) === index,
  );
}

function paramfileInnerXml(xml: string): string {
  return xml
    .replace(/^\s*<\?xml[^>]*>\s*/i, "")
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
  if (!isKnownGenericSlug(slug)) {
    return null;
  }

  const xmls: string[] = [];
  const version = normalizeFirmwareVersion(firmwareVersion);
  const versionedShort = version ? versionedShortForSlug(slug) : null;
  if (version && versionedShort) {
    const versionedXml = await fetchVersionedParamMetadataXml(versionedShort, version);
    if (versionedXml) {
      xmls.push(versionedXml);
    }
  }

  for (const genericSlug of genericSlugOrder(slug)) {
    const xml = await fetchGenericParamMetadataXml(genericSlug);
    if (xml) {
      xmls.push(xml);
    }
  }

  return mergeMetadataXmlDocuments(xmls);
}

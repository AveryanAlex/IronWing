import { fetch } from "@platform/http";

import { readStorageRaw, writeStorageRaw } from "./local-storage";

const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function metadataCacheKey(slug: string): string {
  return `param_meta_${slug}`;
}

function metadataTimestampKey(slug: string): string {
  return `param_meta_${slug}_ts`;
}

function readCachedMetadataXml(slug: string, nowMs: number): string | null {
  const cacheKey = metadataCacheKey(slug);
  const tsKey = metadataTimestampKey(slug);
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
  if (ageMs >= CACHE_MAX_AGE_MS) {
    return null;
  }

  return cachedXml;
}

function writeCachedMetadataXml(slug: string, xml: string, nowMs: number): void {
  writeStorageRaw(metadataCacheKey(slug), xml);
  writeStorageRaw(metadataTimestampKey(slug), String(nowMs));
}

export async function fetchParamMetadataXml(slug: string): Promise<string | null> {
  const cachedXml = readCachedMetadataXml(slug, Date.now());
  if (cachedXml) {
    return cachedXml;
  }

  try {
    const url = `https://autotest.ardupilot.org/Parameters/${slug}/apm.pdef.xml`;
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`[param-metadata] fetch failed: ${response.status}`);
      return null;
    }

    const xml = await response.text();
    writeCachedMetadataXml(slug, xml, Date.now());
    return xml;
  } catch (error) {
    console.warn("[param-metadata] fetch error:", error);
    return null;
  }
}

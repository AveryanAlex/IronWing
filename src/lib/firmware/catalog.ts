import type { CatalogEntry, CatalogTargetSummary } from "../../firmware";
import { rewriteArdupilotFirmwareUrl } from "../ardupilot-urls";

type RawManifest = {
  firmware?: unknown;
};

type RawEntry = Record<string, unknown>;

function rawString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function rawNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function rawNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeCatalogEntry(raw: RawEntry): CatalogEntry | null {
  const boardId = rawNumber(raw.board_id);
  const format = rawString(raw.format);
  if (boardId === null || format !== "apj") {
    return null;
  }

  return {
    board_id: boardId,
    platform: rawString(raw.platform),
    vehicle_type: rawString(raw["mav-type"]),
    version: rawString(raw["mav-firmware-version"]),
    version_type: rawString(raw["mav-firmware-version-type"]),
    format,
    url: rewriteArdupilotFirmwareUrl(rawString(raw.url)),
    image_size: rawNumber(raw.image_size) ?? 0,
    latest: raw.latest === 1,
    git_sha: rawString(raw["git-sha"]),
    brand_name: rawNullableString(raw.brand_name),
    manufacturer: rawNullableString(raw.manufacturer),
  };
}

export function parseFirmwareManifestJson(jsonText: string): CatalogEntry[] {
  const manifest = JSON.parse(jsonText) as RawManifest;
  if (!Array.isArray(manifest.firmware)) {
    throw new Error("firmware manifest is missing a firmware array");
  }

  return manifest.firmware
    .filter((entry): entry is RawEntry => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
    .map(normalizeCatalogEntry)
    .filter((entry): entry is CatalogEntry => entry !== null);
}

export async function decompressGzipText(bytes: Uint8Array): Promise<string> {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

export async function parseFirmwareManifestGz(bytes: Uint8Array): Promise<CatalogEntry[]> {
  return parseFirmwareManifestJson(await decompressGzipText(bytes));
}

export function filterCatalogEntriesByBoardAndPlatform(
  entries: CatalogEntry[],
  boardId: number,
  platform?: string | null,
): CatalogEntry[] {
  return entries.filter((entry) => entry.board_id === boardId && (platform == null || entry.platform === platform));
}

function parseVersion(value: string): number[] {
  return value.split(".").map((segment) => Number.parseInt(segment, 10) || 0);
}

function versionGt(left: string, right: string): boolean {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;
    if (leftPart !== rightPart) {
      return leftPart > rightPart;
    }
  }
  return false;
}

export function buildCatalogTargets(entries: CatalogEntry[]): CatalogTargetSummary[] {
  const groups = new Map<string, CatalogTargetSummary>();

  for (const entry of entries) {
    const key = `${entry.board_id}:${entry.platform}`;
    const target = groups.get(key) ?? {
      board_id: entry.board_id,
      platform: entry.platform,
      brand_name: null,
      manufacturer: null,
      vehicle_types: [],
      latest_version: null,
    };

    target.brand_name ??= entry.brand_name;
    target.manufacturer ??= entry.manufacturer;
    if (entry.vehicle_type.length > 0 && !target.vehicle_types.includes(entry.vehicle_type)) {
      target.vehicle_types.push(entry.vehicle_type);
    }
    if (entry.version_type === "OFFICIAL" && (target.latest_version === null || versionGt(entry.version, target.latest_version))) {
      target.latest_version = entry.version;
    }

    groups.set(key, target);
  }

  return Array.from(groups.values())
    .map((target) => ({
      ...target,
      vehicle_types: [...target.vehicle_types].sort((left, right) => left.localeCompare(right)),
    }))
    .sort((left, right) => left.platform.localeCompare(right.platform) || left.board_id - right.board_id);
}

export function parseSupportedOfficialBootloaderTargets(indexHtml: string): Set<string> {
  const targets = new Set<string>();
  for (const fragment of indexHtml.split("href=").slice(1)) {
    const quote = fragment[0];
    if (quote !== '"' && quote !== "'") {
      continue;
    }
    const href = fragment.slice(1).split(quote)[0] ?? "";
    const segments = href.split("/");
    const filename = segments[segments.length - 1] ?? "";
    const target = filename.endsWith("_bl.bin") ? filename.slice(0, -"_bl.bin".length) : "";
    if (target.length > 0) {
      targets.add(target);
    }
  }
  return targets;
}

export function filterCatalogTargetsToSupportedOfficialBootloaders(
  targets: CatalogTargetSummary[],
  supportedTargets: Set<string>,
): CatalogTargetSummary[] {
  return targets.filter((target) => supportedTargets.has(target.platform));
}

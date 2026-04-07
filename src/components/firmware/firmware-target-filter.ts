import type { CatalogTargetSummary } from "../../firmware";

export const ALL_TARGET_VEHICLE_TYPES = "all";

export type CatalogTargetVehicleTypeFilter = typeof ALL_TARGET_VEHICLE_TYPES | string;

export type CatalogTargetMatch = {
  key: string;
  target: CatalogTargetSummary;
  label: string;
  metadata: string[];
  vehicleTypesLabel: string;
  score: number;
};

export type FilterCatalogTargetsOptions = {
  searchText?: string;
  vehicleType?: CatalogTargetVehicleTypeFilter | null;
};

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeOptionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeVehicleTypes(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const item of value) {
    if (typeof item !== "string") {
      continue;
    }

    const trimmed = item.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push(trimmed);
  }

  return normalized;
}

export function catalogTargetKey(target: Pick<CatalogTargetSummary, "board_id" | "platform">): string {
  return `${target.board_id}:${target.platform}`;
}

export function sanitizeCatalogTargetSummary(value: unknown): CatalogTargetSummary | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const boardId = typeof candidate.board_id === "number" && Number.isFinite(candidate.board_id)
    ? candidate.board_id
    : null;
  const platform = normalizeOptionalText(candidate.platform);

  if (boardId === null || boardId <= 0 || platform === null) {
    return null;
  }

  return {
    board_id: boardId,
    platform,
    brand_name: normalizeOptionalText(candidate.brand_name),
    manufacturer: normalizeOptionalText(candidate.manufacturer),
    vehicle_types: normalizeVehicleTypes(candidate.vehicle_types),
    latest_version: normalizeOptionalText(candidate.latest_version),
  };
}

export function sanitizeCatalogTargetSummaries(targets: readonly unknown[]): CatalogTargetSummary[] {
  const sanitized = new Map<string, CatalogTargetSummary>();

  for (const value of targets) {
    const target = sanitizeCatalogTargetSummary(value);
    if (!target) {
      continue;
    }

    const key = catalogTargetKey(target);
    const existing = sanitized.get(key);
    sanitized.set(key, existing ? mergeCatalogTargetSummary(existing, target) : target);
  }

  return Array.from(sanitized.values()).sort((left, right) => {
    const labelA = left.brand_name ?? left.platform;
    const labelB = right.brand_name ?? right.platform;
    return labelA.localeCompare(labelB) || left.platform.localeCompare(right.platform) || left.board_id - right.board_id;
  });
}

export function listCatalogTargetVehicleTypes(targets: readonly unknown[]): string[] {
  const unique = new Map<string, string>();

  for (const target of sanitizeCatalogTargetSummaries(targets)) {
    for (const vehicleType of target.vehicle_types) {
      const key = vehicleType.toLowerCase();
      if (!unique.has(key)) {
        unique.set(key, vehicleType);
      }
    }
  }

  return Array.from(unique.values()).sort((left, right) => left.localeCompare(right));
}

export function filterCatalogTargets(
  targets: readonly unknown[],
  { searchText = "", vehicleType = ALL_TARGET_VEHICLE_TYPES }: FilterCatalogTargetsOptions = {},
): CatalogTargetMatch[] {
  const normalizedQuery = normalizeText(searchText);
  const tokens = normalizedQuery ? normalizedQuery.split(/\s+/).filter(Boolean) : [];
  const normalizedVehicleTypeFilter = vehicleType && vehicleType !== ALL_TARGET_VEHICLE_TYPES
    ? normalizeText(vehicleType)
    : null;

  const matches: CatalogTargetMatch[] = [];

  for (const value of targets) {
    const target = sanitizeCatalogTargetSummary(value);
    if (!target) {
      continue;
    }

    if (
      normalizedVehicleTypeFilter
      && !target.vehicle_types.some((item) => normalizeText(item) === normalizedVehicleTypeFilter)
    ) {
      continue;
    }

    const searchableParts = [
      target.platform,
      target.brand_name,
      target.manufacturer,
      target.latest_version,
      ...target.vehicle_types,
      String(target.board_id),
    ].filter((item): item is string => typeof item === "string" && item.trim().length > 0);

    const searchableText = normalizeText(searchableParts.join(" "));
    if (tokens.some((token) => !searchableText.includes(token))) {
      continue;
    }

    const label = target.brand_name ?? target.platform;
    const metadata = [
      target.brand_name && target.brand_name !== target.platform ? target.platform : null,
      target.manufacturer,
      target.latest_version ? `v${target.latest_version}` : null,
      `Board ID ${target.board_id}`,
    ].filter((item): item is string => Boolean(item));

    matches.push({
      key: catalogTargetKey(target),
      target,
      label,
      metadata,
      vehicleTypesLabel: target.vehicle_types.length > 0 ? target.vehicle_types.join(" / ") : "Vehicle type unknown",
      score: buildScore(target, normalizedQuery),
    });
  }

  return matches.sort(compareMatches);
}

function mergeCatalogTargetSummary(
  left: CatalogTargetSummary,
  right: CatalogTargetSummary,
): CatalogTargetSummary {
  const vehicleTypes = [...left.vehicle_types];
  const seenVehicleTypes = new Set(left.vehicle_types.map((item) => item.toLowerCase()));

  for (const vehicleType of right.vehicle_types) {
    const key = vehicleType.toLowerCase();
    if (seenVehicleTypes.has(key)) {
      continue;
    }

    seenVehicleTypes.add(key);
    vehicleTypes.push(vehicleType);
  }

  return {
    ...left,
    brand_name: left.brand_name ?? right.brand_name,
    manufacturer: left.manufacturer ?? right.manufacturer,
    latest_version: left.latest_version ?? right.latest_version,
    vehicle_types: vehicleTypes,
  };
}

function buildScore(target: CatalogTargetSummary, normalizedQuery: string): number {
  const platform = normalizeText(target.platform);
  const brand = normalizeText(target.brand_name ?? "");
  const manufacturer = normalizeText(target.manufacturer ?? "");
  const version = normalizeText(target.latest_version ?? "");
  const boardId = String(target.board_id);

  if (!normalizedQuery) {
    return 0;
  }

  let score = 0;

  if (platform === normalizedQuery) score += 700;
  else if (platform.startsWith(normalizedQuery)) score += 500;
  else if (platform.includes(normalizedQuery)) score += 250;

  if (brand === normalizedQuery) score += 600;
  else if (brand.startsWith(normalizedQuery)) score += 420;
  else if (brand.includes(normalizedQuery)) score += 220;

  if (manufacturer === normalizedQuery) score += 460;
  else if (manufacturer.startsWith(normalizedQuery)) score += 320;
  else if (manufacturer.includes(normalizedQuery)) score += 160;

  if (boardId === normalizedQuery) score += 520;
  else if (boardId.includes(normalizedQuery)) score += 180;

  if (version === normalizedQuery) score += 160;
  else if (version.startsWith(normalizedQuery)) score += 110;

  for (const vehicleType of target.vehicle_types) {
    const normalizedVehicleType = normalizeText(vehicleType);
    if (normalizedVehicleType === normalizedQuery) score += 260;
    else if (normalizedVehicleType.startsWith(normalizedQuery)) score += 150;
    else if (normalizedVehicleType.includes(normalizedQuery)) score += 90;
  }

  return score;
}

function compareMatches(left: CatalogTargetMatch, right: CatalogTargetMatch): number {
  return right.score - left.score
    || left.label.localeCompare(right.label)
    || (left.target.manufacturer ?? "").localeCompare(right.target.manufacturer ?? "")
    || left.target.board_id - right.target.board_id;
}

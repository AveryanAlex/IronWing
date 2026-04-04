export type LocalStorageReader = Pick<Storage, "getItem">;
export type LocalStorageWriter = Pick<Storage, "setItem">;
export type LocalStorageLike = Pick<Storage, "getItem" | "setItem">;

export function getBrowserStorage(): Storage | null {
  if (typeof localStorage === "undefined") {
    return null;
  }

  return localStorage;
}

export function readStorageRaw(
  key: string,
  storage: LocalStorageReader | null = getBrowserStorage(),
): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    // Ignore storage access errors in restricted contexts; callers treat missing data as a cache miss.
    return null;
  }
}

export function writeStorageRaw(
  key: string,
  value: string,
  storage: LocalStorageWriter | null = getBrowserStorage(),
): void {
  try {
    storage?.setItem(key, value);
  } catch {
    // Ignore restricted browser contexts and quota limits.
  }
}

export function readStorageJson(
  key: string,
  storage: LocalStorageReader | null = getBrowserStorage(),
): unknown | null {
  const raw = readStorageRaw(key, storage);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    // Ignore malformed cache entries and fall back to null so callers can rebuild state.
    return null;
  }
}

export function writeStorageJson(
  key: string,
  value: unknown,
  storage: LocalStorageWriter | null = getBrowserStorage(),
): void {
  try {
    writeStorageRaw(key, JSON.stringify(value), storage);
  } catch {
    // Ignore non-serializable payloads; callers keep runtime state authoritative.
  }
}

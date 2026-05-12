import { readStorageJson, writeStorageJson, type LocalStorageLike } from "../local-storage";

export function ironwingKey(...segments: string[]): string {
  return `ironwing.${segments.filter(Boolean).join(".")}`;
}

export function readIronwingJson<T>(suffix: string, storage?: LocalStorageLike | null): T | null {
  return readStorageJson(`ironwing.${suffix}`, storage) as T | null;
}

export function writeIronwingJson(suffix: string, value: unknown, storage?: LocalStorageLike | null): void {
  writeStorageJson(`ironwing.${suffix}`, value, storage);
}

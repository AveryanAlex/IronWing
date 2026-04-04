import type { ParamMeta, ParamMetadataMap } from "../../param-metadata";
import type { ParamProgress, ParamStore } from "../../params";

type ParamStoreShape = {
  params: Record<string, unknown>;
  expected_count: number;
};

export function normalizeParamStore(value: unknown): ParamStore | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const maybeStore = value as Partial<ParamStoreShape>;
  if (typeof maybeStore.expected_count !== "number" || !Number.isFinite(maybeStore.expected_count)) {
    return null;
  }

  if (!maybeStore.params || typeof maybeStore.params !== "object") {
    return null;
  }

  const params: Record<string, ParamStore["params"][string]> = {};
  for (const [name, entry] of Object.entries(maybeStore.params)) {
    const normalized = normalizeParamEntry(name, entry);
    if (normalized) {
      params[name] = normalized;
    }
  }

  return {
    expected_count: maybeStore.expected_count,
    params,
  };
}

function normalizeParamEntry(name: string, value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const entry = value as Partial<ParamStore["params"][string]>;
  if (entry.name !== name) {
    return null;
  }

  if (typeof entry.value !== "number" || !Number.isFinite(entry.value)) {
    return null;
  }

  if (typeof entry.index !== "number" || !Number.isInteger(entry.index)) {
    return null;
  }

  if (
    entry.param_type !== "uint8"
    && entry.param_type !== "int8"
    && entry.param_type !== "uint16"
    && entry.param_type !== "int16"
    && entry.param_type !== "uint32"
    && entry.param_type !== "int32"
    && entry.param_type !== "real32"
  ) {
    return null;
  }

  return {
    name: entry.name,
    value: entry.value,
    index: entry.index,
    param_type: entry.param_type,
  };
}

export function normalizeParamProgress(value: unknown): ParamProgress | null {
  if (value === "completed" || value === "failed" || value === "cancelled") {
    return value;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  if ("downloading" in value) {
    const downloading = (value as { downloading?: { received?: unknown; expected?: unknown } }).downloading;
    if (!downloading || typeof downloading.received !== "number" || !Number.isFinite(downloading.received)) {
      return null;
    }

    if (downloading.expected !== null && (typeof downloading.expected !== "number" || !Number.isFinite(downloading.expected))) {
      return null;
    }

    return {
      downloading: {
        received: downloading.received,
        expected: downloading.expected ?? null,
      },
    };
  }

  if ("writing" in value) {
    const writing = (value as { writing?: { index?: unknown; total?: unknown; name?: unknown } }).writing;
    if (
      !writing
      || typeof writing.index !== "number"
      || !Number.isFinite(writing.index)
      || typeof writing.total !== "number"
      || !Number.isFinite(writing.total)
      || typeof writing.name !== "string"
      || writing.name.trim().length === 0
    ) {
      return null;
    }

    return {
      writing: {
        index: writing.index,
        total: writing.total,
        name: writing.name,
      },
    };
  }

  return null;
}

export function normalizeMetadataMap(map: ParamMetadataMap | null): ParamMetadataMap | null {
  if (!map) {
    return null;
  }

  const normalized = new Map<string, ParamMeta>();
  for (const [name, meta] of map.entries()) {
    if (!name || !meta || typeof meta !== "object") {
      continue;
    }

    normalized.set(name, {
      ...meta,
      humanName: typeof meta.humanName === "string" ? meta.humanName : name,
      description: typeof meta.description === "string" ? meta.description : "",
      rebootRequired: meta.rebootRequired === true,
    });
  }

  return normalized.size > 0 ? normalized : null;
}

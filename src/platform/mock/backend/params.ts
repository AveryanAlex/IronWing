import { mockState, requireLiveEnvelope } from "./runtime";
import type {
  CommandArgs,
  MockParamProgressState,
  MockParamStoreState,
  MockPlatformEvent,
} from "./types";

const VALID_PARAM_TYPES = new Set([
  "uint8",
  "int8",
  "uint16",
  "int16",
  "uint32",
  "int32",
  "real32",
]);

export function normalizedParamStore(mockParamStore?: MockParamStoreState | null): MockParamStoreState {
  return structuredClone(mockParamStore ?? {
    params: {},
    expected_count: 0,
  });
}

export function normalizedParamProgress(mockParamProgress?: MockParamProgressState | null): MockParamProgressState | null {
  return mockParamProgress ?? null;
}

export function applyMockParamState(
  mockParamStore?: MockParamStoreState | null,
  mockParamProgress?: MockParamProgressState | null,
) {
  mockState.liveParamStore = normalizedParamStore(mockParamStore);
  mockState.liveParamProgress = normalizedParamProgress(mockParamProgress);
}

export function validateParamWriteBatchArgs(args: CommandArgs): [string, number][] {
  if (!Array.isArray(args?.params)) {
    throw new Error("missing or invalid param_write_batch.params");
  }

  return args.params.map((entry, index) => {
    if (!Array.isArray(entry) || entry.length !== 2) {
      throw new Error(`missing or invalid param_write_batch.params[${index}]`);
    }

    const [name, value] = entry;
    if (typeof name !== "string" || name.trim().length === 0) {
      throw new Error(`missing or invalid param_write_batch.params[${index}][0]`);
    }
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`missing or invalid param_write_batch.params[${index}][1]`);
    }

    return [name, value];
  });
}

export function validateParamParseFileArgs(args: CommandArgs): string {
  if (typeof args?.contents !== "string") {
    throw new Error("missing or invalid param_parse_file.contents");
  }

  return args.contents;
}

export function parseParamFile(args: CommandArgs): Record<string, number> {
  const contents = validateParamParseFileArgs(args);
  const result: Record<string, number> = {};

  for (const [lineIndex, line] of contents.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }

    const parts = trimmed.split(",", 2);
    if (parts.length !== 2) {
      throw new Error(`line ${lineIndex + 1}: expected NAME,VALUE`);
    }

    const name = parts[0].trim();
    const rawValue = parts[1].trim();
    const value = Number(rawValue);
    if (!Number.isFinite(value)) {
      throw new Error(`line ${lineIndex + 1}: invalid value '${rawValue}'`);
    }

    result[name] = value;
  }

  return result;
}

export function validateParamFormatFileArgs(args: CommandArgs): MockParamStoreState {
  if (!args?.store || typeof args.store !== "object" || Array.isArray(args.store)) {
    throw new Error("missing or invalid param_format_file.store");
  }

  const store = args.store as Partial<MockParamStoreState>;
  if (typeof store.expected_count !== "number" || !Number.isFinite(store.expected_count)) {
    throw new Error("missing or invalid param_format_file.store.expected_count");
  }
  if (!store.params || typeof store.params !== "object" || Array.isArray(store.params)) {
    throw new Error("missing or invalid param_format_file.store.params");
  }

  const params: MockParamStoreState["params"] = {};
  for (const [name, entry] of Object.entries(store.params)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`missing or invalid param_format_file.store.params.${name}`);
    }

    const param = entry as MockParamStoreState["params"][string];
    if (typeof param.name !== "string" || param.name.trim().length === 0) {
      throw new Error(`missing or invalid param_format_file.store.params.${name}.name`);
    }
    if (typeof param.value !== "number" || !Number.isFinite(param.value)) {
      throw new Error(`missing or invalid param_format_file.store.params.${name}.value`);
    }
    if (typeof param.param_type !== "string" || !VALID_PARAM_TYPES.has(param.param_type)) {
      throw new Error(`missing or invalid param_format_file.store.params.${name}.param_type`);
    }
    if (typeof param.index !== "number" || !Number.isInteger(param.index)) {
      throw new Error(`missing or invalid param_format_file.store.params.${name}.index`);
    }

    params[name] = {
      name: param.name,
      value: param.value,
      param_type: param.param_type,
      index: param.index,
    };
  }

  return {
    expected_count: store.expected_count,
    params,
  };
}

export function formatParamFile(args: CommandArgs): string {
  const store = validateParamFormatFileArgs(args);
  const names = Object.keys(store.params).sort();
  let output = "";

  for (const name of names) {
    const param = store.params[name];
    if (!param) {
      continue;
    }

    output += `${param.name},${param.value}\n`;
  }

  return output;
}

export function applyParamWriteBatch(params: [string, number][]) {
  if (mockState.liveParamStore) {
    const nextIndex = Object.keys(mockState.liveParamStore.params).length;
    params.forEach(([name, value], index) => {
      const existing = mockState.liveParamStore?.params[name];
      mockState.liveParamStore!.params[name] = existing
        ? { ...existing, value }
        : { name, value, param_type: "real32", index: nextIndex + index };
    });
  }

  return params.map(([name, value]) => ({
    name,
    requested_value: value,
    confirmed_value: value,
    success: true,
  }));
}

export function writeParamBatch(args: CommandArgs, emitEvent: (event: string, payload: unknown) => void) {
  const params = validateParamWriteBatchArgs(args);
  const result = applyParamWriteBatch(params);
  if (mockState.liveEnvelope) {
    for (const [index, [name]] of params.entries()) {
      emitEvent("param://progress", liveParamProgressStreamEvent({
        writing: {
          index: index + 1,
          total: params.length,
          name,
        },
      }).payload);
    }

    if (mockState.liveParamStore) {
      emitEvent("param://store", liveParamStoreStreamEvent(mockState.liveParamStore).payload);
    }

    emitEvent("param://progress", liveParamProgressStreamEvent("completed").payload);
  }

  return result;
}

export function liveParamStoreStreamEvent(paramStore: MockParamStoreState): MockPlatformEvent {
  return {
    event: "param://store",
    payload: {
      envelope: requireLiveEnvelope(),
      value: paramStore,
    },
  };
}

export function liveParamProgressStreamEvent(paramProgress: MockParamProgressState): MockPlatformEvent {
  return {
    event: "param://progress",
    payload: {
      envelope: requireLiveEnvelope(),
      value: paramProgress,
    },
  };
}

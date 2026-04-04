import { mockState, requireLiveEnvelope } from "./runtime";
import type { CommandArgs, MockParamProgressState, MockParamStoreState, MockPlatformEvent } from "./types";

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

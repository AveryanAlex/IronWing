import { mockProfileTiming, mockState, requireLiveEnvelope } from "./runtime";
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

class ParamOperationCancelledError extends Error {}

type PendingParamOperation = {
  kind: "download" | "write";
  cancel: () => void;
  cancelPromise: Promise<never>;
};

let pendingParamOperation: PendingParamOperation | null = null;

function cloneParamStore(paramStore: MockParamStoreState): MockParamStoreState {
  return structuredClone(paramStore);
}

function currentParamStore(): MockParamStoreState {
  return normalizedParamStore(mockState.liveParamStore);
}

function publishParamProgress(
  emitEvent: (event: string, payload: unknown) => void,
  progress: MockParamProgressState,
) {
  mockState.liveParamProgress = progress;
  if (!mockState.liveEnvelope) {
    return;
  }

  emitEvent("param://progress", liveParamProgressStreamEvent(progress).payload);
}

function publishParamStore(
  emitEvent: (event: string, payload: unknown) => void,
  paramStore: MockParamStoreState,
) {
  mockState.liveParamStore = cloneParamStore(paramStore);
  if (!mockState.liveEnvelope) {
    return;
  }

  emitEvent("param://store", liveParamStoreStreamEvent(paramStore).payload);
}

function beginParamOperation(kind: PendingParamOperation["kind"]): PendingParamOperation {
  if (pendingParamOperation) {
    throw new Error("another param transfer is already active");
  }

  let cancel!: () => void;
  const cancelPromise = new Promise<never>((_, reject) => {
    cancel = () => reject(new ParamOperationCancelledError(`Param ${kind} cancelled.`));
  });

  const operation: PendingParamOperation = {
    kind,
    cancel,
    cancelPromise,
  };
  pendingParamOperation = operation;
  return operation;
}

function finalizeParamOperation(operation: PendingParamOperation) {
  if (pendingParamOperation === operation) {
    pendingParamOperation = null;
  }
}

async function waitForParamStep(operation: PendingParamOperation) {
  await Promise.race([
    new Promise((resolve) => window.setTimeout(resolve, mockProfileTiming().paramStepDelayMs)),
    operation.cancelPromise,
  ]);
}

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

export function validateParamWriteArgs(args: CommandArgs): [string, number] {
  if (typeof args?.name !== "string" || args.name.trim().length === 0) {
    throw new Error("missing or invalid param_write.name");
  }
  if (typeof args.value !== "number" || !Number.isFinite(args.value)) {
    throw new Error("missing or invalid param_write.value");
  }

  return [args.name, args.value];
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
  const nextStore = currentParamStore();
  const nextIndex = Object.keys(nextStore.params).length;
  params.forEach(([name, value], index) => {
    const existing = nextStore.params[name];
    nextStore.params[name] = existing
      ? { ...existing, value }
      : { name, value, param_type: "real32", index: nextIndex + index };
  });
  nextStore.expected_count = Math.max(nextStore.expected_count, Object.keys(nextStore.params).length);
  mockState.liveParamStore = nextStore;

  return params.map(([name, value]) => ({
    name,
    requested_value: value,
    confirmed_value: value,
    success: true,
  }));
}

export function cancelParamOperation() {
  if (!pendingParamOperation) {
    return false;
  }

  const operation = pendingParamOperation;
  pendingParamOperation = null;
  operation.cancel();
  return true;
}

export async function downloadAllParams(emitEvent: (event: string, payload: unknown) => void) {
  const operation = beginParamOperation("download");
  const paramStore = currentParamStore();
  const total = Math.max(paramStore.expected_count, Object.keys(paramStore.params).length);

  try {
    for (let received = 0; received < total; received += 1) {
      await waitForParamStep(operation);
      publishParamProgress(emitEvent, {
        downloading: {
          received: received + 1,
          expected: total,
        },
      });
    }

    publishParamStore(emitEvent, paramStore);
    publishParamProgress(emitEvent, "completed");
  } catch (error) {
    if (error instanceof ParamOperationCancelledError) {
      publishParamProgress(emitEvent, "cancelled");
      throw error;
    }

    publishParamProgress(emitEvent, "failed");
    throw error;
  } finally {
    finalizeParamOperation(operation);
  }
}

async function runParamWriteBatch(
  params: [string, number][],
  emitEvent: (event: string, payload: unknown) => void,
) {
  const operation = beginParamOperation("write");

  try {
    for (const [index, [name]] of params.entries()) {
      await waitForParamStep(operation);
      publishParamProgress(emitEvent, {
        writing: {
          index: index + 1,
          total: params.length,
          name,
        },
      });
    }

    const result = applyParamWriteBatch(params);
    publishParamStore(emitEvent, currentParamStore());
    publishParamProgress(emitEvent, "completed");
    return result;
  } catch (error) {
    if (error instanceof ParamOperationCancelledError) {
      publishParamProgress(emitEvent, "cancelled");
      throw error;
    }

    publishParamProgress(emitEvent, "failed");
    throw error;
  } finally {
    finalizeParamOperation(operation);
  }
}

export async function writeParamBatch(args: CommandArgs, emitEvent: (event: string, payload: unknown) => void) {
  const params = validateParamWriteBatchArgs(args);
  return runParamWriteBatch(params, emitEvent);
}

export async function writeParam(args: CommandArgs, emitEvent: (event: string, payload: unknown) => void) {
  const [name, value] = validateParamWriteArgs(args);
  const [result] = await runParamWriteBatch([[name, value]], emitEvent);
  if (!result || !mockState.liveParamStore) {
    throw new Error("param_write did not persist the requested value");
  }

  return cloneParamStore(mockState.liveParamStore).params[name];
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

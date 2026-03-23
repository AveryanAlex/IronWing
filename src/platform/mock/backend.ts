type CommandArgs = Record<string, unknown> | undefined;

export type MockPlatformEvent = {
  event: string;
  payload: unknown;
};

export type MockCommandBehavior =
  | {
      type: "resolve";
      result?: unknown;
      emit?: MockPlatformEvent[];
      delayMs?: number;
    }
  | {
      type: "reject";
      error: string;
      emit?: MockPlatformEvent[];
      delayMs?: number;
    }
  | {
      type: "defer";
    };

export type MockInvocation = {
  cmd: string;
  args: CommandArgs;
};

type DeferredInvocation = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
};

export type MockPlatformController = {
  reset: () => void;
  setCommandBehavior: (cmd: string, behavior: MockCommandBehavior) => void;
  clearCommandBehavior: (cmd: string) => void;
  resolveDeferred: (cmd: string, result?: unknown, emit?: MockPlatformEvent[]) => boolean;
  rejectDeferred: (cmd: string, error: string, emit?: MockPlatformEvent[]) => boolean;
  emit: (event: string, payload: unknown) => void;
  getInvocations: () => MockInvocation[];
};

declare global {
  interface Window {
    __IRONWING_MOCK_PLATFORM__?: MockPlatformController;
  }
}

const eventTarget = new EventTarget();
const commandBehaviors = new Map<string, MockCommandBehavior>();
const deferredInvocations = new Map<string, DeferredInvocation[]>();
const invocations: MockInvocation[] = [];

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function emitEvent(event: string, payload: unknown) {
  eventTarget.dispatchEvent(new CustomEvent(event, { detail: payload }));
}

function emitMany(events?: MockPlatformEvent[]) {
  for (const entry of events ?? []) {
    emitEvent(entry.event, entry.payload);
  }
}

function rejectAllDeferred(error: string) {
  for (const pending of deferredInvocations.values()) {
    for (const invocation of pending) {
      invocation.reject(error);
    }
  }
  deferredInvocations.clear();
}

function defaultCommandResult(cmd: string, _args: CommandArgs): unknown {
  switch (cmd) {
    case "available_transports":
      return ["udp", "tcp"];
    case "get_vehicle_snapshot":
      return null;
    case "recording_status":
      return "idle";
    case "firmware_session_status":
      return { kind: "idle" };
    case "firmware_serial_readiness":
      return {
        request_token: "mock:firmware_serial_readiness",
        session_status: { kind: "idle" },
        readiness: { kind: "advisory" },
        target_hint: null,
        validation_pending: false,
        bootloader_transition: { kind: "manual_bootloader_entry_required" },
      };
    case "set_telemetry_rate":
    case "disconnect_link":
    case "firmware_session_cancel":
      return undefined;
    default:
      throw new Error(`Unmocked command: ${cmd}`);
  }
}

async function runBehavior<T>(cmd: string, behavior: MockCommandBehavior): Promise<T> {
  if (behavior.type === "defer") {
    return new Promise<T>((resolve, reject) => {
      const pending = deferredInvocations.get(cmd) ?? [];
      pending.push({
        resolve: (value) => resolve(value as T),
        reject,
      });
      deferredInvocations.set(cmd, pending);
    });
  }

  if (behavior.delayMs) {
    await delay(behavior.delayMs);
  }

  emitMany(behavior.emit);

  if (behavior.type === "reject") {
    throw behavior.error;
  }

  return behavior.result as T;
}

export async function invokeMockCommand<T>(cmd: string, args?: CommandArgs): Promise<T> {
  invocations.push({ cmd, args });

  const behavior = commandBehaviors.get(cmd);
  if (behavior) {
    return runBehavior<T>(cmd, behavior);
  }

  return defaultCommandResult(cmd, args) as T;
}

export function listenMockEvent<T>(event: string, handler: (payload: T) => void): () => void {
  const listener: EventListener = ((customEvent: CustomEvent<T>) => {
    handler(customEvent.detail);
  }) as EventListener;

  eventTarget.addEventListener(event, listener);
  return () => eventTarget.removeEventListener(event, listener);
}

function createController(): MockPlatformController {
  return {
    reset() {
      commandBehaviors.clear();
      invocations.length = 0;
      rejectAllDeferred("Mock platform reset");
    },
    setCommandBehavior(cmd, behavior) {
      commandBehaviors.set(cmd, behavior);
    },
    clearCommandBehavior(cmd) {
      commandBehaviors.delete(cmd);
    },
    resolveDeferred(cmd, result, emit = []) {
      const pending = deferredInvocations.get(cmd);
      if (!pending || pending.length === 0) {
        return false;
      }

      const invocation = pending.shift();
      if (!pending.length) {
        deferredInvocations.delete(cmd);
      }

      emitMany(emit);
      invocation?.resolve(result);
      return true;
    },
    rejectDeferred(cmd, error, emit = []) {
      const pending = deferredInvocations.get(cmd);
      if (!pending || pending.length === 0) {
        return false;
      }

      const invocation = pending.shift();
      if (!pending.length) {
        deferredInvocations.delete(cmd);
      }

      emitMany(emit);
      invocation?.reject(error);
      return true;
    },
    emit(event, payload) {
      emitEvent(event, payload);
    },
    getInvocations() {
      return invocations.slice();
    },
  };
}

export function getMockPlatformController(): MockPlatformController {
  if (!window.__IRONWING_MOCK_PLATFORM__) {
    window.__IRONWING_MOCK_PLATFORM__ = createController();
  }

  return window.__IRONWING_MOCK_PLATFORM__;
}

getMockPlatformController();

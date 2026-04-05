// @vitest-environment jsdom

import { get, writable } from "svelte/store";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MessageRateInfo } from "../../telemetry";
import type { SessionEnvelope, SessionState } from "../../session";
import { availableDomainValue, missingDomainValue } from "../domain-status";
import type { LiveSettingsService } from "../platform/live-settings";
import type { SessionConnectionFormState } from "../platform/session";
import type { SessionStoreState } from "./session-state";
import { createLiveSettingsStore } from "./live-settings";
import { loadSettings, SETTINGS_STORAGE_KEY, settingsDefaults } from "./settings";

function deferred<T>() {
  let resolve: (value: T) => void;
  let reject: (reason?: unknown) => void;

  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return {
    promise,
    resolve: resolve!,
    reject: reject!,
  };
}

function createEnvelope(
  sessionId: string,
  overrides: Partial<SessionEnvelope> = {},
): SessionEnvelope {
  return {
    session_id: sessionId,
    source_kind: "live",
    seek_epoch: 0,
    reset_revision: 0,
    ...overrides,
  };
}

function createConnectionForm(): SessionConnectionFormState {
  return {
    mode: "udp",
    udpBind: "0.0.0.0:14550",
    tcpAddress: "127.0.0.1:5760",
    serialPort: "",
    baud: 57600,
    selectedBtDevice: "",
    takeoffAlt: "10",
    followVehicle: true,
  };
}

function createSessionStoreState(overrides: Partial<SessionStoreState> = {}): SessionStoreState {
  return {
    hydrated: true,
    lastPhase: "ready",
    lastError: null,
    activeEnvelope: null,
    activeSource: null,
    sessionDomain: missingDomainValue<SessionState>("bootstrap"),
    telemetryDomain: missingDomainValue("bootstrap"),
    support: missingDomainValue("bootstrap"),
    sensorHealth: missingDomainValue("bootstrap"),
    configurationFacts: missingDomainValue("bootstrap"),
    calibration: missingDomainValue("bootstrap"),
    guided: missingDomainValue("bootstrap"),
    statusText: missingDomainValue("bootstrap"),
    bootstrap: {
      missionState: null,
      paramStore: null,
      paramProgress: null,
      playbackCursorUsec: null,
    },
    connectionForm: createConnectionForm(),
    transportDescriptors: [],
    serialPorts: [],
    availableModes: [],
    btDevices: [],
    btScanning: false,
    optimisticConnection: null,
    ...overrides,
  };
}

function createScopedSessionState({
  envelope = createEnvelope("session-1"),
  connectionKind = "connected",
}: {
  envelope?: SessionEnvelope;
  connectionKind?: SessionState["connection"]["kind"];
} = {}): SessionStoreState {
  return createSessionStoreState({
    activeEnvelope: envelope,
    activeSource: envelope.source_kind,
    sessionDomain: availableDomainValue(
      {
        status: "active",
        connection: connectionKind === "error"
          ? { kind: "error", error: "boom" }
          : { kind: connectionKind },
        vehicle_state: null,
        home_position: null,
      },
      envelope.source_kind === "playback" ? "playback" : "stream",
    ),
  });
}

function createMemoryStorage(rawValue?: string) {
  const values = new Map<string, string>();
  if (rawValue !== undefined) {
    values.set(SETTINGS_STORAGE_KEY, rawValue);
  }

  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
    read(key: string) {
      return values.get(key) ?? null;
    },
  };
}

function createSettingsStorage(settings?: unknown) {
  return createMemoryStorage(settings === undefined ? undefined : JSON.stringify(settings));
}

const DEFAULT_CATALOG: MessageRateInfo[] = [
  { id: 30, name: "Attitude", default_rate_hz: 4 },
  { id: 33, name: "Global Position", default_rate_hz: 2 },
];

function createMockService(overrides: Partial<LiveSettingsService> = {}) {
  return {
    loadMessageRateCatalog: vi.fn(async () => DEFAULT_CATALOG),
    applyTelemetryRate: vi.fn(async () => undefined),
    applyMessageRate: vi.fn(async () => undefined),
    formatError: vi.fn((error: unknown) => (error instanceof Error ? error.message : String(error))),
    ...overrides,
  } satisfies LiveSettingsService;
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("live settings store", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("applies telemetry cadence while disconnected and persists only the confirmed success", async () => {
    const sessionStore = writable(createScopedSessionState({ connectionKind: "disconnected" }));
    const storage = createSettingsStorage();
    const service = createMockService();
    const store = createLiveSettingsStore(sessionStore, service, storage);

    await store.initialize();
    store.stageTelemetryRate(8);
    await store.applyDrafts();

    const state = get(store);
    expect(service.applyTelemetryRate).toHaveBeenCalledWith(8);
    expect(service.applyMessageRate).not.toHaveBeenCalled();
    expect(state.confirmedSettings.telemetryRateHz).toBe(8);
    expect(state.draft.telemetryRateHz).toBe(8);
    expect(state.applyPhase).toBe("idle");
    expect(state.lastApplyError).toBeNull();
    expect(loadSettings(storage).telemetryRateHz).toBe(8);
  });

  it("blocks message-rate apply outside a live connected session and keeps the row unsaved", async () => {
    const playbackSession = writable(
      createScopedSessionState({
        envelope: createEnvelope("playback-1", { source_kind: "playback" }),
      }),
    );
    const storage = createSettingsStorage();
    const service = createMockService();
    const store = createLiveSettingsStore(playbackSession, service, storage);

    await store.initialize();
    store.stageMessageRate(33, 5);
    await store.applyDrafts();

    const state = get(store);
    expect(service.applyMessageRate).not.toHaveBeenCalled();
    expect(state.confirmedSettings.messageRates).toEqual({});
    expect(state.draft.messageRates).toEqual({ 33: 5 });
    expect(state.applyPhase).toBe("failed");
    expect(state.messageRateErrors[33]?.message).toContain("unavailable during playback");
  });

  it("fails closed on invalid telemetry and message-rate drafts without mutating the confirmed snapshot", async () => {
    const sessionStore = writable(createScopedSessionState());
    const storage = createSettingsStorage();
    const service = createMockService();
    const store = createLiveSettingsStore(sessionStore, service, storage);

    await store.initialize();
    store.stageTelemetryRate(0);
    store.stageMessageRate(33, 80);
    await store.applyDrafts();

    const state = get(store);
    expect(service.applyTelemetryRate).not.toHaveBeenCalled();
    expect(service.applyMessageRate).not.toHaveBeenCalled();
    expect(state.confirmedSettings).toMatchObject({
      telemetryRateHz: settingsDefaults.telemetryRateHz,
      messageRates: {},
    });
    expect(state.telemetryRateError).toContain("Telemetry cadence must be an integer");
    expect(state.messageRateErrors[33]?.message).toContain("between 0.1 and 50 Hz");
    expect(state.applyPhase).toBe("failed");
  });

  it("does nothing when no draft values changed", async () => {
    const sessionStore = writable(createScopedSessionState());
    const storage = createSettingsStorage();
    const service = createMockService();
    const store = createLiveSettingsStore(sessionStore, service, storage);

    await store.initialize();
    await store.applyDrafts();

    const state = get(store);
    expect(service.applyTelemetryRate).not.toHaveBeenCalled();
    expect(service.applyMessageRate).not.toHaveBeenCalled();
    expect(state.applyPhase).toBe("idle");
    expect(state.lastApplyError).toBeNull();
  });

  it("retains only failed message-rate rows as unsaved after a partial success", async () => {
    const sessionStore = writable(createScopedSessionState());
    const storage = createSettingsStorage();
    const service = createMockService({
      applyMessageRate: vi.fn(async (messageId: number) => {
        if (messageId === 30) {
          throw new Error("row rejected");
        }
      }),
    });
    const store = createLiveSettingsStore(sessionStore, service, storage);

    await store.initialize();
    store.stageMessageRate(33, 5);
    store.stageMessageRate(30, 3);
    await store.applyDrafts();

    const state = get(store);
    expect(service.applyMessageRate).toHaveBeenCalledTimes(2);
    expect(state.confirmedSettings.messageRates).toEqual({ 33: 5 });
    expect(state.draft.messageRates).toEqual({ 30: 3, 33: 5 });
    expect(state.messageRateErrors).toEqual({
      30: {
        messageId: 30,
        requestedRateHz: 3,
        message: "row rejected",
      },
    });
    expect(state.applyPhase).toBe("partial-failure");
    expect(loadSettings(storage).messageRates).toEqual({ 33: 5 });
  });

  it("reapplies confirmed message-rate overrides when a new live session becomes active", async () => {
    const sessionStore = writable(createScopedSessionState({ connectionKind: "disconnected" }));
    const storage = createSettingsStorage({
      ...settingsDefaults,
      messageRates: { 30: 4, 33: 2 },
    });
    const service = createMockService();
    const store = createLiveSettingsStore(sessionStore, service, storage);

    await store.initialize();
    expect(get(store).reconnectPhase).toBe("pending");
    expect(service.applyMessageRate).not.toHaveBeenCalled();

    sessionStore.set(
      createScopedSessionState({
        envelope: createEnvelope("session-2", { reset_revision: 1 }),
      }),
    );
    await flush();

    const state = get(store);
    expect(service.applyMessageRate).toHaveBeenNthCalledWith(1, 30, 4);
    expect(service.applyMessageRate).toHaveBeenNthCalledWith(2, 33, 2);
    expect(state.reconnectPhase).toBe("idle");
    expect(state.applyPhase).toBe("idle");
  });

  it("keeps interrupted message-rate applies unsaved and reapplies the last confirmed values after reconnect", async () => {
    const sessionStore = writable(createScopedSessionState({ connectionKind: "disconnected" }));
    const storage = createSettingsStorage({
      ...settingsDefaults,
      messageRates: { 33: 2 },
    });
    const pendingDraftApply = deferred<void>();
    const service = createMockService({
      applyMessageRate: vi.fn((messageId: number, rateHz: number) => {
        if (messageId === 33 && rateHz === 5) {
          return pendingDraftApply.promise;
        }
        return Promise.resolve();
      }),
    });
    const store = createLiveSettingsStore(sessionStore, service, storage);

    await store.initialize();

    sessionStore.set(createScopedSessionState({ envelope: createEnvelope("session-1", { reset_revision: 1 }) }));
    await flush();
    vi.mocked(service.applyMessageRate).mockClear();

    store.stageMessageRate(33, 5);
    const applyPromise = store.applyDrafts();
    await flush();
    expect(service.applyMessageRate).toHaveBeenCalledWith(33, 5);

    sessionStore.set(createScopedSessionState({ envelope: createEnvelope("session-2", { reset_revision: 2 }) }));
    pendingDraftApply.resolve();
    await applyPromise;
    await flush();

    const state = get(store);
    expect(service.applyMessageRate).toHaveBeenNthCalledWith(1, 33, 5);
    expect(service.applyMessageRate).toHaveBeenNthCalledWith(2, 33, 2);
    expect(state.confirmedSettings.messageRates).toEqual({ 33: 2 });
    expect(state.draft.messageRates).toEqual({ 33: 5 });
    expect(state.messageRateErrors[33]?.message).toContain("Live session changed while applying message rates");
    expect(state.reconnectPhase).toBe("idle");
  });

  it("normalizes corrupt persisted live settings before any apply logic runs", async () => {
    const sessionStore = writable(createScopedSessionState({ connectionKind: "disconnected" }));
    const storage = createMemoryStorage(JSON.stringify({
      telemetryRateHz: 0,
      messageRates: {
        30: 70,
        33: "bad",
      },
    }));
    const service = createMockService();
    const store = createLiveSettingsStore(sessionStore, service, storage);

    await store.initialize();

    const state = get(store);
    expect(state.confirmedSettings.telemetryRateHz).toBe(settingsDefaults.telemetryRateHz);
    expect(state.confirmedSettings.messageRates).toEqual({});
    expect(state.draft).toEqual({
      telemetryRateHz: settingsDefaults.telemetryRateHz,
      messageRates: {},
    });
    expect(state.reconnectPhase).toBe("idle");
    expect(service.applyTelemetryRate).not.toHaveBeenCalled();
    expect(service.applyMessageRate).not.toHaveBeenCalled();
  });
});

// @vitest-environment jsdom

import { get } from "svelte/store";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  CatalogTargetSummary,
  DfuDeviceInfo,
  DfuRecoverySource,
  FirmwareSessionStatus,
  PortInfo,
  SerialFlashSource,
  SerialReadinessBlockedReason,
  SerialReadinessRequest,
  SerialReadinessResponse,
} from "../../firmware";
import {
  computeSerialReadinessToken,
  type FirmwareService,
} from "../platform/firmware";
import {
  createCatalogSourceMetadata,
  createFirmwareWorkspaceStore,
} from "./firmware-workspace";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, resolve, reject };
}

const DEFAULT_PORTS: PortInfo[] = [
  {
    port_name: "/dev/ttyACM0",
    vid: null,
    pid: null,
    serial_number: null,
    manufacturer: "Hex",
    product: "CubeOrange Bootloader",
    location: null,
  },
];

const DEFAULT_TARGET: CatalogTargetSummary = {
  board_id: 140,
  platform: "CubeOrange",
  brand_name: "Cube Orange",
  manufacturer: "Hex",
  vehicle_types: ["Copter"],
  latest_version: "4.5.0",
};

const DEFAULT_DFU_DEVICES: DfuDeviceInfo[] = [
  {
    vid: 0x0483,
    pid: 0xdf11,
    unique_id: "dfu-1",
    serial_number: "DFU1",
    manufacturer: "ST",
    product: "STM32 DFU",
  },
];

function defaultReadiness(request: SerialReadinessRequest): SerialReadinessResponse {
  const blockedReason = resolveBlockedReason(request);

  return {
    request_token: computeSerialReadinessToken(request),
    session_status: { kind: "idle" },
    readiness: blockedReason ? { kind: "blocked", reason: blockedReason } : { kind: "advisory" },
    target_hint: null,
    validation_pending: blockedReason === null,
    bootloader_transition: { kind: "manual_bootloader_entry_required" },
  };
}

function resolveBlockedReason(request: SerialReadinessRequest): SerialReadinessBlockedReason | null {
  if (request.port.trim().length === 0) {
    return "port_unselected";
  }

  if (!DEFAULT_PORTS.some((port) => port.port_name === request.port)) {
    return "port_unavailable";
  }

  if (request.source.kind === "catalog_url" && request.source.url.trim().length === 0) {
    return "source_missing";
  }

  if (request.source.kind === "local_apj_bytes" && request.source.data.length === 0) {
    return "source_missing";
  }

  return null;
}

function createService(overrides: Partial<FirmwareService> = {}) {
  const service = {
    sessionStatus: vi.fn(async () => ({ kind: "idle" } satisfies FirmwareSessionStatus)),
    sessionCancel: vi.fn(async () => undefined),
    sessionClearCompleted: vi.fn(async () => undefined),
    serialPreflight: vi.fn(async () => ({
      vehicle_connected: false,
      param_count: 12,
      has_params_to_backup: true,
      available_ports: DEFAULT_PORTS,
      detected_board_id: null,
      session_ready: true,
      session_status: { kind: "idle" },
    })),
    listPorts: vi.fn(async () => ({ kind: "available", ports: DEFAULT_PORTS })),
    listDfuDevices: vi.fn(async () => ({ kind: "available", devices: DEFAULT_DFU_DEVICES })),
    catalogTargets: vi.fn(async () => [DEFAULT_TARGET]),
    recoveryCatalogTargets: vi.fn(async () => [DEFAULT_TARGET]),
    catalogEntries: vi.fn(async () => []),
    serialReadiness: vi.fn(async (request: SerialReadinessRequest) => defaultReadiness(request)),
    flashSerial: vi.fn(async () => ({ result: "verified", board_id: 140, bootloader_rev: 5, port: "/dev/ttyACM0" })),
    flashDfuRecovery: vi.fn(async () => ({ result: "verified" })),
    subscribeProgress: vi.fn(async () => () => undefined),
    formatError: vi.fn((error: unknown) => (error instanceof Error ? error.message : String(error))),
    ...overrides,
  } satisfies FirmwareService;

  return service;
}

describe("createFirmwareWorkspaceStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes rejected serial starts into a retained completed failure without clearing retry selections", async () => {
    const service = createService({
      flashSerial: vi.fn(async () => {
        throw new Error("serial bootloader handshake failed");
      }),
    });
    const store = createFirmwareWorkspaceStore(service, { sessionPollMs: 0 });

    store.setSerialTarget(DEFAULT_TARGET);
    await store.setSerialPort("/dev/ttyACM0");
    await store.setSerialSource(
      { kind: "catalog_url", url: "https://example.com/cubeorange.apj" } satisfies SerialFlashSource,
      createCatalogSourceMetadata("https://example.com/cubeorange.apj", "Cube Orange stable"),
    );

    await store.startSerial();

    const state = get(store);
    expect(state.sessionStatus).toEqual({
      kind: "completed",
      outcome: {
        path: "serial_primary",
        outcome: {
          result: "failed",
          reason: "serial bootloader handshake failed",
        },
      },
    });
    expect(state.lastCompletedOutcome).toEqual(state.sessionStatus.kind === "completed" ? state.sessionStatus.outcome : null);
    expect(state.lastError).toBe("serial bootloader handshake failed");
    expect(state.serial.port).toBe("/dev/ttyACM0");
    expect(state.serial.target).toEqual(DEFAULT_TARGET);
    expect(state.serial.source).toEqual({ kind: "catalog_url", url: "https://example.com/cubeorange.apj" });
    expect(state.serial.sourceMetadata).toMatchObject({
      kind: "catalog_url",
      label: "Cube Orange stable",
    });
  });

  it("ignores stale readiness responses when a newer port/source token is already active", async () => {
    const serialReadiness = vi.fn();
    const service = createService({ serialReadiness });
    const store = createFirmwareWorkspaceStore(service, { sessionPollMs: 0 });

    await store.setSerialPort("/dev/ttyACM0");
    await store.setSerialSource(
      { kind: "catalog_url", url: "https://example.com/initial.apj" },
      createCatalogSourceMetadata("https://example.com/initial.apj", "Initial"),
    );

    const first = deferred<unknown>();
    const second = deferred<unknown>();
    serialReadiness.mockReset();
    serialReadiness
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);

    const firstRequest: SerialReadinessRequest = {
      port: "/dev/ttyACM0",
      source: { kind: "catalog_url", url: "https://example.com/first.apj" },
      options: { full_chip_erase: false },
    };
    const secondRequest: SerialReadinessRequest = {
      port: "/dev/ttyACM0",
      source: { kind: "catalog_url", url: "https://example.com/second.apj" },
      options: { full_chip_erase: false },
    };

    const firstChange = store.setSerialSource(
      firstRequest.source,
      createCatalogSourceMetadata("https://example.com/first.apj", "First"),
    );
    const secondChange = store.setSerialSource(
      secondRequest.source,
      createCatalogSourceMetadata("https://example.com/second.apj", "Second"),
    );

    second.resolve(defaultReadiness(secondRequest));
    await secondChange;

    first.resolve(defaultReadiness(firstRequest));
    await firstChange;

    const state = get(store);
    expect(state.serial.source).toEqual(secondRequest.source);
    expect(state.serial.readiness.phase).toBe("ready");
    expect(state.serial.readiness.response?.request_token).toBe(computeSerialReadinessToken(secondRequest));
    expect(state.serial.readiness.staleResponseCount).toBe(1);
  });

  it("applies an optimistic cancelling overlay while the backend cancel request is still pending", async () => {
    const cancelRequest = deferred<void>();
    const sessionStatus = vi.fn(async () => ({ kind: "serial_primary", phase: "programming" } satisfies FirmwareSessionStatus));
    const service = createService({
      sessionStatus,
      sessionCancel: vi.fn(() => cancelRequest.promise),
    });
    const store = createFirmwareWorkspaceStore(service, { sessionPollMs: 0 });

    await store.setSerialPort("/dev/ttyACM0");
    await store.setSerialSource(
      { kind: "catalog_url", url: "https://example.com/fw.apj" },
      createCatalogSourceMetadata("https://example.com/fw.apj", "Stable"),
    );
    await store.refreshSessionStatus();

    const pendingCancel = store.cancel();

    expect(get(store).sessionStatus).toEqual({
      kind: "cancelling",
      path: "serial_primary",
    });
    expect(get(store).activePath).toBe("serial_primary");
    expect(get(store).serial.port).toBe("/dev/ttyACM0");
    expect(get(store).serial.source).toEqual({ kind: "catalog_url", url: "https://example.com/fw.apj" });

    cancelRequest.resolve();
    await pendingCancel;

    expect(get(store).sessionStatus).toEqual({
      kind: "cancelling",
      path: "serial_primary",
    });
  });

  it("retains the last completed outcome after backend status settles back to idle", async () => {
    const service = createService({
      sessionStatus: vi.fn()
        .mockResolvedValueOnce({
          kind: "completed",
          outcome: {
            path: "serial_primary",
            outcome: { result: "cancelled" },
          },
        } satisfies FirmwareSessionStatus)
        .mockResolvedValueOnce({ kind: "idle" } satisfies FirmwareSessionStatus),
    });
    const store = createFirmwareWorkspaceStore(service, { sessionPollMs: 0 });

    await store.refreshSessionStatus();
    await store.refreshSessionStatus();

    const state = get(store);
    expect(state.observedSessionStatus).toEqual({ kind: "idle" });
    expect(state.sessionStatus).toEqual({
      kind: "completed",
      outcome: {
        path: "serial_primary",
        outcome: { result: "cancelled" },
      },
    });
    expect(state.lastCompletedOutcome).toEqual({
      path: "serial_primary",
      outcome: { result: "cancelled" },
    });
  });

  it("keeps the store hydrated even when the progress subscription drops out during initialize", async () => {
    const service = createService({
      subscribeProgress: vi.fn(async () => {
        throw new Error("firmware progress subscription dropped");
      }),
    });
    const store = createFirmwareWorkspaceStore(service, { sessionPollMs: 0 });

    await store.initialize();

    const state = get(store);
    expect(state.hydrated).toBe(true);
    expect(state.progressError).toBe("firmware progress subscription dropped");
  });

  it("normalizes rejected DFU starts into a retained completed failure without clearing selected recovery context", async () => {
    const recoverySource: DfuRecoverySource = { kind: "official_bootloader", board_target: "CubeOrange" };
    const service = createService({
      flashDfuRecovery: vi.fn(async () => {
        throw new Error("dfu reset verification timed out");
      }),
    });
    const store = createFirmwareWorkspaceStore(service, { sessionPollMs: 0 });

    await store.refreshRecoveryDevices();
    store.setRecoveryTarget(DEFAULT_TARGET);
    store.setRecoverySource(recoverySource, {
      kind: "official_bootloader",
      label: "CubeOrange",
      detail: "Official bootloader",
      fileName: null,
      byteLength: null,
      digest: null,
    });

    await store.startDfuRecovery();

    const state = get(store);
    expect(state.sessionStatus).toEqual({
      kind: "completed",
      outcome: {
        path: "dfu_recovery",
        outcome: {
          result: "failed",
          reason: "dfu reset verification timed out",
        },
      },
    });
    expect(state.recovery.device).toEqual(DEFAULT_DFU_DEVICES[0]);
    expect(state.recovery.target).toEqual(DEFAULT_TARGET);
    expect(state.recovery.source).toEqual(recoverySource);
  });
});

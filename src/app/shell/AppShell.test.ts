// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("svelte-sonner", () => ({
  Toaster: () => null,
  toast: {
    error: vi.fn(),
  },
}));

import AppShell from "./AppShell.svelte";
import {
  appShellTestIds,
  createShellChromeState,
  resolveShellTier,
} from "./chrome-state";
import { parameterWorkspaceTestIds } from "../../components/params/parameter-workspace-sections";
import { createParamsStore } from "../../lib/stores/params";
import { markRuntimeReady, resetRuntimeState } from "../../lib/stores/runtime";
import {
  createSessionStore,
  type SessionStore,
} from "../../lib/stores/session";
import type { ParamsService, ParamsServiceEventHandlers } from "../../lib/platform/params";
import type {
  SessionConnectionFormState,
  SessionService,
  SessionServiceEventHandlers,
} from "../../lib/platform/session";
import type { OpenSessionSnapshot } from "../../session";
import type { ParamMetadataMap } from "../../param-metadata";
import type { TransportDescriptor } from "../../transport";

function createSnapshot(overrides: Partial<OpenSessionSnapshot> = {}): OpenSessionSnapshot {
  return {
    envelope: {
      session_id: "session-1",
      source_kind: "live",
      seek_epoch: 0,
      reset_revision: 0,
    },
    session: {
      available: true,
      complete: true,
      provenance: "bootstrap",
      value: {
        status: "pending",
        connection: { kind: "disconnected" },
        vehicle_state: {
          armed: false,
          custom_mode: 0,
          mode_name: "Stabilize",
          system_status: "standby",
          vehicle_type: "quadrotor",
          autopilot: "ardu_pilot_mega",
          system_id: 1,
          component_id: 1,
          heartbeat_received: true,
        },
        home_position: null,
      },
    },
    telemetry: {
      available: false,
      complete: false,
      provenance: "bootstrap",
      value: null,
    },
    mission_state: null,
    param_store: null,
    param_progress: null,
    support: {
      available: false,
      complete: false,
      provenance: "bootstrap",
      value: null,
    },
    sensor_health: {
      available: false,
      complete: false,
      provenance: "bootstrap",
      value: null,
    },
    configuration_facts: {
      available: false,
      complete: false,
      provenance: "bootstrap",
      value: null,
    },
    calibration: {
      available: false,
      complete: false,
      provenance: "bootstrap",
      value: null,
    },
    guided: {
      available: false,
      complete: false,
      provenance: "bootstrap",
      value: null,
    },
    status_text: {
      available: true,
      complete: true,
      provenance: "bootstrap",
      value: { entries: [] },
    },
    playback: { cursor_usec: null },
    ...overrides,
  };
}

function createTransportDescriptors(): TransportDescriptor[] {
  return [
    {
      kind: "udp",
      label: "UDP",
      available: true,
      validation: { bind_addr_required: true },
    },
    {
      kind: "tcp",
      label: "TCP",
      available: true,
      validation: { address_required: true },
    },
  ];
}

function createMockService(overrides: Partial<SessionService> = {}) {
  let handlers: SessionServiceEventHandlers | null = null;
  const defaultConnectionForm: SessionConnectionFormState = {
    mode: "udp",
    udpBind: "0.0.0.0:14550",
    tcpAddress: "127.0.0.1:5760",
    serialPort: "",
    baud: 57600,
    selectedBtDevice: "",
    takeoffAlt: "10",
    followVehicle: true,
  };

  const service = {
    loadConnectionForm: vi.fn(() => ({ ...defaultConnectionForm })),
    persistConnectionForm: vi.fn(),
    openSessionSnapshot: vi.fn(async () => createSnapshot()),
    ackSessionSnapshot: vi.fn(async () => ({ result: "accepted" as const })),
    subscribeAll: vi.fn(async (nextHandlers: SessionServiceEventHandlers) => {
      handlers = nextHandlers;
      return () => {
        handlers = null;
      };
    }),
    availableTransportDescriptors: vi.fn(async () => createTransportDescriptors()),
    describeTransportAvailability: vi.fn((descriptor: TransportDescriptor) =>
      descriptor.available ? `${descriptor.label} available` : `${descriptor.label} unavailable`,
    ),
    validateTransportDescriptor: vi.fn((descriptor: TransportDescriptor, value) => {
      if (descriptor.kind === "tcp" && !value.address) {
        return ["address is required"];
      }
      if (descriptor.kind === "udp" && !value.bind_addr) {
        return ["bind_addr is required"];
      }
      return [];
    }),
    buildConnectRequest: vi.fn((descriptor: TransportDescriptor, value) => ({
      transport:
        descriptor.kind === "udp"
          ? { kind: "udp" as const, bind_addr: value.bind_addr ?? "" }
          : { kind: "tcp" as const, address: value.address ?? "" },
    })),
    connectSession: vi.fn(async () => undefined),
    disconnectSession: vi.fn(async () => undefined),
    listSerialPorts: vi.fn(async () => []),
    btRequestPermissions: vi.fn(async () => undefined),
    btScanBle: vi.fn(async () => []),
    btGetBondedDevices: vi.fn(async () => []),
    getAvailableModes: vi.fn(async () => []),
    formatError: vi.fn((error: unknown) => (error instanceof Error ? error.message : String(error))),
    ...overrides,
  } satisfies SessionService;

  return {
    service,
    emit<K extends keyof SessionServiceEventHandlers>(
      event: K,
      payload: Parameters<SessionServiceEventHandlers[K]>[0],
    ) {
      if (!handlers) {
        throw new Error("session handlers are not registered");
      }

      handlers[event](payload as never);
    },
  };
}

function createMockParamsService(
  metadata: ParamMetadataMap | null = null,
  overrides: Partial<ParamsService> = {},
) {
  let handlers: ParamsServiceEventHandlers | null = null;

  const service = {
    subscribeAll: vi.fn(async (nextHandlers: ParamsServiceEventHandlers) => {
      handlers = nextHandlers;
      return () => {
        handlers = null;
      };
    }),
    fetchMetadata: vi.fn(async () => metadata),
    formatError: vi.fn((error: unknown) => (error instanceof Error ? error.message : String(error))),
    ...overrides,
  } satisfies ParamsService;

  return {
    service,
    hasHandlers() {
      return handlers !== null;
    },
  };
}

function installViewportController(initialWidth: number, initialHeight = 720) {
  let width = initialWidth;
  let height = initialHeight;
  const listeners = new Map<string, Set<() => void>>();

  const readMinWidth = (query: string) => {
    const match = /min-width:\s*(\d+)px/.exec(query);
    return match ? Number.parseInt(match[1], 10) : 0;
  };

  const matches = (query: string) => width >= readMinWidth(query);

  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    get: () => width,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    get: () => height,
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      get matches() {
        return matches(query);
      },
      media: query,
      onchange: null,
      addListener: (listener: () => void) => {
        const bucket = listeners.get(query) ?? new Set<() => void>();
        bucket.add(listener);
        listeners.set(query, bucket);
      },
      removeListener: (listener: () => void) => {
        listeners.get(query)?.delete(listener);
      },
      addEventListener: (_type: string, listener: () => void) => {
        const bucket = listeners.get(query) ?? new Set<() => void>();
        bucket.add(listener);
        listeners.set(query, bucket);
      },
      removeEventListener: (_type: string, listener: () => void) => {
        listeners.get(query)?.delete(listener);
      },
      dispatchEvent: vi.fn(),
    })),
  });

  return {
    setSize(nextWidth: number, nextHeight = height) {
      const prior = new Map<string, boolean>();
      for (const query of listeners.keys()) {
        prior.set(query, matches(query));
      }

      width = nextWidth;
      height = nextHeight;
      window.dispatchEvent(new Event("resize"));

      for (const [query, bucket] of listeners.entries()) {
        if (prior.get(query) === matches(query)) {
          continue;
        }

        for (const listener of bucket) {
          listener();
        }
      }
    },
  };
}

async function renderShellAt(
  width: number,
  options: {
    snapshot?: OpenSessionSnapshot;
    metadata?: ParamMetadataMap | null;
  } = {},
) {
  const viewport = installViewportController(width);
  const { service } = createMockService({
    openSessionSnapshot: vi.fn(async () => options.snapshot ?? createSnapshot()),
  });
  const paramsHarness = createMockParamsService(options.metadata ?? null);
  const store = createSessionStore(service);
  const parameterStore = createParamsStore(store, paramsHarness.service);
  await store.initialize();
  await parameterStore.initialize();
  markRuntimeReady("2026-04-03T12:34:56.000Z");

  render(AppShell, { props: { store, parameterStore } });

  await waitFor(() => {
    expect(screen.getByTestId(appShellTestIds.tier)).toBeTruthy();
  });

  return {
    viewport,
    store,
    parameterStore,
  } satisfies {
    viewport: ReturnType<typeof installViewportController>;
    store: SessionStore;
    parameterStore: ReturnType<typeof createParamsStore>;
  };
}

describe("AppShell", () => {
  beforeEach(() => {
    resetRuntimeState();
    if (typeof localStorage.clear === "function") {
      localStorage.clear();
    }
  });

  afterEach(() => {
    cleanup();
    resetRuntimeState();
  });

  it("keeps runtime markers and the live vehicle panel docked on wide layouts", async () => {
    await renderShellAt(1440);

    expect(screen.getByTestId(appShellTestIds.tier).textContent?.trim()).toBe("wide");
    expect(screen.getByTestId(appShellTestIds.drawerState).textContent?.trim()).toBe("docked");
    expect(screen.getByTestId(appShellTestIds.activeWorkspace).textContent?.trim()).toBe("overview");
    expect(screen.queryByTestId(appShellTestIds.vehiclePanelButton)).toBeNull();
    expect(screen.getByTestId("connection-connect-btn")).toBeTruthy();
    expect(screen.getByTestId("telemetry-state-value")).toBeTruthy();
    expect(screen.getByTestId("telemetry-alt-value")).toBeTruthy();
    expect(screen.getByTestId(appShellTestIds.sessionEnvelope).textContent).toContain("session-1");
  });

  it("switches to the scoped parameter workspace from the active shell", async () => {
    await renderShellAt(1440, {
      snapshot: createSnapshot({
        param_store: {
          expected_count: 2,
          params: {
            ARMING_CHECK: { name: "ARMING_CHECK", value: 1, param_type: "uint8", index: 0 },
            FS_THR_ENABLE: { name: "FS_THR_ENABLE", value: 2, param_type: "uint8", index: 1 },
          },
        },
        param_progress: "completed",
      }),
    });

    await fireEvent.click(screen.getByTestId(appShellTestIds.parameterWorkspaceButton));

    await waitFor(() => {
      expect(screen.getByTestId(appShellTestIds.activeWorkspace).textContent?.trim()).toBe("params");
    });

    expect(screen.queryByTestId("telemetry-state-value")).toBeNull();
    expect(screen.getByTestId(parameterWorkspaceTestIds.root)).toBeTruthy();
    expect(screen.getByTestId(parameterWorkspaceTestIds.state).textContent?.trim()).toBe("ready");
    expect(screen.getByTestId(parameterWorkspaceTestIds.scope).textContent).toContain("session-1");
  });

  it("shows an explicit unavailable parameter workspace state when the active scope has no bootstrap data", async () => {
    await renderShellAt(1440);

    await fireEvent.click(screen.getByTestId(appShellTestIds.parameterWorkspaceButton));

    await waitFor(() => {
      expect(screen.getByTestId(appShellTestIds.activeWorkspace).textContent?.trim()).toBe("params");
    });

    expect(screen.getByTestId(parameterWorkspaceTestIds.state).textContent?.trim()).toBe("unavailable");
    expect(screen.getByTestId(parameterWorkspaceTestIds.empty).textContent).toContain(
      "No scoped parameter snapshot is available",
    );
  });

  it("mounts one shared review tray, keeps staged edits across workspace toggles, and preserves the queue across shell tiers", async () => {
    const { viewport } = await renderShellAt(1440, {
      snapshot: createSnapshot({
        param_store: {
          expected_count: 2,
          params: {
            ARMING_CHECK: { name: "ARMING_CHECK", value: 1, param_type: "uint8", index: 0 },
            FS_THR_ENABLE: { name: "FS_THR_ENABLE", value: 2, param_type: "uint8", index: 1 },
          },
        },
        param_progress: "completed",
      }),
      metadata: new Map([
        [
          "ARMING_CHECK",
          {
            humanName: "Arming checks",
            description: "Controls pre-arm validation.",
            rebootRequired: true,
          },
        ],
        [
          "FS_THR_ENABLE",
          {
            humanName: "Throttle failsafe",
            description: "Select the throttle failsafe behavior.",
          },
        ],
      ]),
    });

    expect(screen.queryByTestId(appShellTestIds.parameterReviewTray)).toBeNull();

    await fireEvent.click(screen.getByTestId(appShellTestIds.parameterWorkspaceButton));
    await waitFor(() => {
      expect(screen.getByTestId(appShellTestIds.activeWorkspace).textContent?.trim()).toBe("params");
    });

    await fireEvent.input(screen.getByTestId(`${parameterWorkspaceTestIds.inputPrefix}-ARMING_CHECK`), {
      target: { value: "3" },
    });
    await fireEvent.click(screen.getByTestId(`${parameterWorkspaceTestIds.stageButtonPrefix}-ARMING_CHECK`));
    await fireEvent.input(screen.getByTestId(`${parameterWorkspaceTestIds.inputPrefix}-FS_THR_ENABLE`), {
      target: { value: "4" },
    });
    await fireEvent.click(screen.getByTestId(`${parameterWorkspaceTestIds.stageButtonPrefix}-FS_THR_ENABLE`));

    expect(screen.getByTestId(appShellTestIds.parameterReviewTray)).toBeTruthy();
    expect(screen.getByTestId(appShellTestIds.parameterReviewState).textContent?.trim()).toBe("closed");
    expect(screen.getByTestId(appShellTestIds.parameterReviewCount).textContent).toContain("2 pending");
    expect(screen.getByTestId(appShellTestIds.parameterWorkspacePendingCount).textContent?.trim()).toBe("2");

    await fireEvent.click(screen.getByTestId(appShellTestIds.parameterReviewToggle));
    await waitFor(() => {
      expect(screen.getByTestId(appShellTestIds.parameterReviewState).textContent?.trim()).toBe("open");
    });

    expect(screen.getByTestId(`${appShellTestIds.parameterReviewRowPrefix}-ARMING_CHECK`).textContent).toContain("reboot required");
    expect(screen.getByTestId(`${appShellTestIds.parameterReviewRowPrefix}-FS_THR_ENABLE`).textContent).toContain("4");

    await fireEvent.click(screen.getByTestId(appShellTestIds.overviewWorkspaceButton));
    await waitFor(() => {
      expect(screen.getByTestId(appShellTestIds.activeWorkspace).textContent?.trim()).toBe("overview");
    });

    expect(screen.getByTestId(appShellTestIds.parameterReviewCount).textContent).toContain("2 pending");
    expect(screen.queryByTestId(parameterWorkspaceTestIds.root)).toBeNull();

    await fireEvent.click(screen.getByTestId(appShellTestIds.parameterWorkspaceButton));
    await waitFor(() => {
      expect(screen.getByTestId(appShellTestIds.activeWorkspace).textContent?.trim()).toBe("params");
    });

    expect(screen.getByTestId(`${parameterWorkspaceTestIds.diffPrefix}-ARMING_CHECK`).textContent).toContain("3");
    expect(screen.getByTestId(`${parameterWorkspaceTestIds.diffPrefix}-FS_THR_ENABLE`).textContent).toContain("4");

    viewport.setSize(390, 720);

    await waitFor(() => {
      expect(screen.getByTestId(appShellTestIds.tier).textContent?.trim()).toBe("phone");
    });

    expect(screen.getAllByTestId(appShellTestIds.parameterReviewTray)).toHaveLength(1);
    expect(screen.getByTestId(appShellTestIds.parameterReviewTray).getAttribute("data-surface-kind")).toBe("sheet");
    expect(screen.getByTestId(appShellTestIds.parameterReviewState).textContent?.trim()).toBe("open");
    expect(screen.getByTestId(appShellTestIds.parameterReviewCount).textContent).toContain("2 pending");
  });

  it("exposes a phone-only Vehicle panel drawer while keeping the live status cards visible", async () => {
    await renderShellAt(390);

    const toggle = screen.getByRole("button", { name: "Vehicle panel" });
    expect(screen.getByTestId(appShellTestIds.tier).textContent?.trim()).toBe("phone");
    expect(screen.getByTestId(appShellTestIds.drawerState).textContent?.trim()).toBe("closed");
    expect(screen.queryByTestId("connection-connect-btn")).toBeNull();
    expect(screen.getByTestId("telemetry-state-value")).toBeTruthy();
    expect(screen.getByTestId("telemetry-alt-value")).toBeTruthy();

    await fireEvent.click(toggle);
    await waitFor(() => {
      expect(screen.getByTestId(appShellTestIds.drawerState).textContent?.trim()).toBe("open");
    });

    expect(screen.getByTestId(appShellTestIds.vehiclePanelDrawer).getAttribute("data-state")).toBe("open");
    expect(screen.getByTestId("connection-connect-btn")).toBeTruthy();

    await fireEvent.click(screen.getByTestId(appShellTestIds.vehiclePanelClose));
    await waitFor(() => {
      expect(screen.getByTestId(appShellTestIds.drawerState).textContent?.trim()).toBe("closed");
    });
  });

  it("promotes the vehicle panel back to a docked layout at Radiomaster width and closes the phone drawer", async () => {
    const { viewport } = await renderShellAt(390);

    await fireEvent.click(screen.getByRole("button", { name: "Vehicle panel" }));
    await waitFor(() => {
      expect(screen.getByTestId(appShellTestIds.drawerState).textContent?.trim()).toBe("open");
    });

    viewport.setSize(1280, 720);

    await waitFor(() => {
      expect(screen.getByTestId(appShellTestIds.tier).textContent?.trim()).toBe("wide");
    });

    expect(screen.getByTestId(appShellTestIds.drawerState).textContent?.trim()).toBe("docked");
    expect(screen.queryByTestId(appShellTestIds.vehiclePanelButton)).toBeNull();
    expect(screen.getByTestId("connection-connect-btn")).toBeTruthy();
    expect(screen.getByTestId(appShellTestIds.vehiclePanelDrawer).getAttribute("data-state")).toBe("closed");
  });

  it("falls back to a desktop-safe docked layout when matchMedia is unavailable", async () => {
    const { service } = createMockService();
    const paramsHarness = createMockParamsService();
    const store = createSessionStore(service);
    const parameterStore = createParamsStore(store, paramsHarness.service);
    await store.initialize();
    await parameterStore.initialize();
    markRuntimeReady("2026-04-03T12:34:56.000Z");

    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1024,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 720,
    });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: undefined,
    });

    render(AppShell, { props: { store, parameterStore } });

    await waitFor(() => {
      expect(screen.getByTestId(appShellTestIds.tier).textContent?.trim()).toBe("desktop");
    });

    expect(screen.getByTestId(appShellTestIds.drawerState).textContent?.trim()).toBe("docked");
    expect(screen.getByTestId("connection-connect-btn")).toBeTruthy();
  });

  it("falls back to canonical tiers when an unsupported tier override is provided", () => {
    expect(resolveShellTier("unsupported", "desktop")).toBe("desktop");
    expect(
      createShellChromeState({ sm: true, md: true, lg: true, xl: false }, { width: 1180, height: 720 }, "bogus").tier,
    ).toBe("desktop");
  });
});

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
import { markRuntimeReady, resetRuntimeState } from "../../lib/stores/runtime";
import {
  createSessionStore,
  type SessionStore,
} from "../../lib/stores/session";
import type {
  SessionConnectionFormState,
  SessionService,
  SessionServiceEventHandlers,
} from "../../lib/platform/session";
import type { OpenSessionSnapshot } from "../../session";
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
        vehicle_state: null,
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

async function renderShellAt(width: number) {
  const viewport = installViewportController(width);
  const { service } = createMockService();
  const store = createSessionStore(service);
  await store.initialize();
  markRuntimeReady("2026-04-03T12:34:56.000Z");

  render(AppShell, { props: { store } });

  await waitFor(() => {
    expect(screen.getByTestId(appShellTestIds.tier)).toBeTruthy();
  });

  return { viewport, store } satisfies { viewport: ReturnType<typeof installViewportController>; store: SessionStore };
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
    expect(screen.queryByTestId(appShellTestIds.vehiclePanelButton)).toBeNull();
    expect(screen.getByTestId("connection-connect-btn")).toBeTruthy();
    expect(screen.getByTestId("telemetry-state-value")).toBeTruthy();
    expect(screen.getByTestId("telemetry-alt-value")).toBeTruthy();
    expect(screen.getByTestId(appShellTestIds.sessionEnvelope).textContent).toContain("session-1");
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
    const store = createSessionStore(service);
    await store.initialize();
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

    render(AppShell, { props: { store } });

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

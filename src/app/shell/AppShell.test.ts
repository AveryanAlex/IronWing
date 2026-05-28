// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import type { Snippet } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as typeof ResizeObserver;
  }
});

const analyticsMocks = vi.hoisted(() => ({
  trackAnalytics: vi.fn(),
}));

vi.mock("../../lib/analytics/client", () => ({
  trackAnalytics: analyticsMocks.trackAnalytics,
}));

vi.mock("svelte-sonner", () => ({
  Toaster: () => null,
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

import AppShellContent from "./AppShellContent.svelte";
import {
  appShellTestIds,
  createShellChromeState,
  resolveShellTier,
} from "./chrome-state";
import type { AppShellWorkspace } from "./workspace-routes";
import { createParamsStore } from "../../lib/stores/params";
import { markRuntimeReady, resetRuntimeState } from "../../lib/stores/runtime";
import { createSessionStore, type SessionStore } from "../../lib/stores/session";
import type { ParamsService, ParamsServiceEventHandlers } from "../../lib/platform/params";
import type {
  SessionConnectionFormState,
  SessionService,
  SessionServiceEventHandlers,
} from "../../lib/platform/session";
import type { OpenSessionSnapshot } from "../../session";
import { withShellContexts } from "../../test/context-harnesses";
import type { TransportDescriptor } from "../../transport";

type AppShellContentProps = {
  activeWorkspace: AppShellWorkspace;
  navigateWorkspace: (workspace: AppShellWorkspace) => Promise<void>;
  children: Snippet;
};

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

function createMockService(overrides: Partial<SessionService> = {}): SessionService {
  const defaultConnectionForm: SessionConnectionFormState = {
    mode: "udp",
    udpBind: "0.0.0.0:14550",
    tcpAddress: "127.0.0.1:5760",
    websocketUrl: "ws://127.0.0.1:14560",
    serialPort: "",
    webSerialPortId: "",
    webBluetoothDeviceId: "",
    baud: 57600,
    selectedBtDevice: "",
    takeoffAlt: "10",
    followVehicle: true,
  };

  return {
    loadConnectionForm: vi.fn(() => ({ ...defaultConnectionForm })),
    persistConnectionForm: vi.fn(),
    openSessionSnapshot: vi.fn(async () => createSnapshot()),
    ackSessionSnapshot: vi.fn(async () => ({ result: "accepted" as const })),
    subscribeAll: vi.fn(async (_handlers: SessionServiceEventHandlers) => () => undefined),
    availableTransportDescriptors: vi.fn(async () => createTransportDescriptors()),
    describeTransportAvailability: vi.fn((descriptor: TransportDescriptor) =>
      descriptor.available ? `${descriptor.label} available` : `${descriptor.label} unavailable`,
    ),
    validateTransportDescriptor: vi.fn(() => []),
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
}

function createMockParamsService(): ParamsService {
  return {
    subscribeAll: vi.fn(async (_handlers: ParamsServiceEventHandlers) => () => undefined),
    fetchMetadata: vi.fn(async () => null),
    downloadAll: vi.fn(async () => undefined),
    cancelDownload: vi.fn(async () => undefined),
    writeBatch: vi.fn(async () => []),
    parseFile: vi.fn(async () => ({})),
    formatFile: vi.fn(async () => ""),
    formatError: vi.fn((error: unknown) => (error instanceof Error ? error.message : String(error))),
  } satisfies ParamsService;
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

function shellSmokeSnippet() {
  return createRawSnippet(() => ({
    render: () => `<section data-testid="mock-shell-route">Shell route content</section>`,
  }));
}

async function renderShellAt(
  width: number,
  options: {
    snapshot?: OpenSessionSnapshot;
    activeWorkspace?: AppShellWorkspace;
  } = {},
) {
  const viewport = installViewportController(width);
  const service = createMockService({
    openSessionSnapshot: vi.fn(async () => options.snapshot ?? createSnapshot()),
  });
  const store = createSessionStore(service);
  const parameterStore = createParamsStore(store, createMockParamsService());
  await store.initialize();
  await parameterStore.initialize();
  markRuntimeReady("2026-04-03T12:34:56.000Z");

  let shellProps: AppShellContentProps = {
    activeWorkspace: options.activeWorkspace ?? "overview",
    navigateWorkspace: vi.fn(async () => undefined),
    children: shellSmokeSnippet(),
  };
  const rendered = render(withShellContexts(store, parameterStore, AppShellContent), {
    props: shellProps,
  });

  await waitFor(() => {
    expect(screen.getByTestId(appShellTestIds.tier)).toBeTruthy();
  });

  return {
    viewport,
    store,
    async rerenderShell(nextProps: Partial<Pick<AppShellContentProps, "activeWorkspace">>) {
      shellProps = {
        ...shellProps,
        ...nextProps,
      };
      await rendered.rerender(shellProps);
    },
  } satisfies {
    viewport: ReturnType<typeof installViewportController>;
    store: SessionStore;
    rerenderShell(nextProps: Partial<Pick<AppShellContentProps, "activeWorkspace">>): Promise<void>;
  };
}

describe("AppShell", () => {
  beforeEach(() => {
    analyticsMocks.trackAnalytics.mockClear();
    resetRuntimeState();
    if (typeof localStorage.clear === "function") {
      localStorage.clear();
    }
  });

  afterEach(() => {
    cleanup();
    resetRuntimeState();
  });

  it("renders the shell frame, runtime markers, and docked vehicle panel on wide layouts", async () => {
    await renderShellAt(1440);

    expect(screen.getByTestId(appShellTestIds.tier).textContent?.trim()).toBe("wide");
    expect(screen.getByTestId(appShellTestIds.drawerState).textContent?.trim()).toBe("docked");
    expect(screen.getByTestId(appShellTestIds.activeWorkspace).textContent?.trim()).toBe("overview");
    expect(screen.getByTestId(appShellTestIds.mainViewport)).toBeTruthy();
    expect(screen.getByTestId("mock-shell-route")).toBeTruthy();
    expect(screen.getByTestId(appShellTestIds.vehiclePanelRail).getAttribute("data-panel-state")).toBe("docked");
    expect(screen.queryByTestId(appShellTestIds.vehiclePanelButton)).toBeNull();
    expect(screen.getByTestId(appShellTestIds.connectionIndicator)).toBeTruthy();
    expect(analyticsMocks.trackAnalytics).toHaveBeenCalledWith("workspace_viewed", { workspace: "overview" });
  });

  it("tracks shell workspace changes without mounting route workflows", async () => {
    const { rerenderShell } = await renderShellAt(1440);

    await rerenderShell({ activeWorkspace: "telemetry" });

    await waitFor(() => {
      expect(screen.getByTestId(appShellTestIds.activeWorkspace).textContent?.trim()).toBe("telemetry");
    });
    expect(screen.getByTestId("mock-shell-route")).toBeTruthy();
    expect(analyticsMocks.trackAnalytics).toHaveBeenCalledWith("workspace_viewed", { workspace: "telemetry" });
  });

  it("shows the global replay read-only banner for playback sources", async () => {
    await renderShellAt(1440, {
      snapshot: createSnapshot({
        envelope: {
          session_id: "playback-1",
          source_kind: "playback",
          seek_epoch: 1,
          reset_revision: 1,
        },
      }),
    });

    expect(screen.getByTestId(appShellTestIds.replayReadonlyBanner).textContent).toContain("Replay is read-only");
  });

  it("uses a phone-only vehicle drawer while keeping the route viewport mounted", async () => {
    await renderShellAt(390);

    expect(screen.getByTestId(appShellTestIds.tier).textContent?.trim()).toBe("phone");
    expect(screen.getByTestId(appShellTestIds.drawerState).textContent?.trim()).toBe("closed");
    expect(screen.queryByTestId(appShellTestIds.vehiclePanelRail)).toBeNull();
    expect(screen.getByTestId("mock-shell-route")).toBeTruthy();

    await fireEvent.click(screen.getByRole("button", { name: "Vehicle panel" }));
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

  it("keeps one shell-scoped telemetry settings surface responsive across chrome tiers", async () => {
    const { viewport } = await renderShellAt(1440);

    await fireEvent.click(screen.getByTestId(appShellTestIds.telemetrySettingsLauncher));
    await waitFor(() => {
      expect(screen.getByTestId(appShellTestIds.telemetrySettingsDialog)).toBeTruthy();
    });
    expect(screen.getByTestId(appShellTestIds.telemetrySettingsDialog).getAttribute("data-surface-kind")).toBe("dialog");

    viewport.setSize(390, 720);

    await waitFor(() => {
      expect(screen.getByTestId(appShellTestIds.tier).textContent?.trim()).toBe("phone");
    });
    expect(screen.getByTestId(appShellTestIds.telemetrySettingsDialog).getAttribute("data-surface-kind")).toBe("sheet");

    await fireEvent.click(screen.getByTestId(appShellTestIds.telemetrySettingsClose));
    await waitFor(() => {
      expect(screen.queryByTestId(appShellTestIds.telemetrySettingsDialog)).toBeNull();
    });
  });

  it("keeps chrome helper tier fallback canonical", () => {
    expect(resolveShellTier("unsupported", "desktop")).toBe("desktop");
    expect(
      createShellChromeState({ sm: true, md: true, lg: true, xl: false }, { width: 1180, height: 720 }, "bogus").tier,
    ).toBe("desktop");
  });
});

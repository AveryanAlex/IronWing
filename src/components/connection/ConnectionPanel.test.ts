// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ConnectionPanel from "./ConnectionPanel.svelte";
import VehicleStatusCard from "../status/VehicleStatusCard.svelte";
import TelemetrySummary from "../telemetry/TelemetrySummary.svelte";
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
import { withSessionContext } from "../../test/context-harnesses";
import type { TransportDescriptor } from "../../transport";

const { toastError } = vi.hoisted(() => ({
  toastError: vi.fn(),
}));

vi.mock("svelte-sonner", () => ({
  toast: { error: toastError },
  Toaster: () => null,
}));

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
    {
      kind: "serial",
      label: "Serial",
      available: true,
      validation: { port_required: true, baud_required: true },
      default_baud: 57600,
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
      if (descriptor.kind === "serial") {
        const errors: string[] = [];
        if (!value.port) errors.push("port is required");
        if (value.baud == null) errors.push("baud is required");
        return errors;
      }
      return [];
    }),
    buildConnectRequest: vi.fn((descriptor: TransportDescriptor, value) => {
      if (descriptor.kind === "tcp") {
        return { transport: { kind: "tcp" as const, address: value.address ?? "" } };
      }
      if (descriptor.kind === "serial") {
        return {
          transport: {
            kind: "serial" as const,
            port: value.port ?? "",
            baud: value.baud ?? descriptor.default_baud,
          },
        };
      }
      return { transport: { kind: "udp" as const, bind_addr: value.bind_addr ?? "" } };
    }),
    connectSession: vi.fn(async () => undefined),
    disconnectSession: vi.fn(async () => undefined),
    listSerialPorts: vi.fn(async () => ["/dev/ttyUSB0"]),
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

function renderSeedSurface(store: SessionStore) {
  render(withSessionContext(store, ConnectionPanel));
  render(withSessionContext(store, VehicleStatusCard));
  render(withSessionContext(store, TelemetrySummary));
}

describe("ConnectionPanel", () => {
  beforeEach(() => {
    toastError.mockReset();
    if (typeof localStorage.clear === "function") {
      localStorage.clear();
    }
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the rewritten idle shell and updates the seed telemetry/status cards when live events arrive", async () => {
    const { service, emit } = createMockService();
    const store = createSessionStore(service);

    await store.initialize();
    renderSeedSurface(store);

    expect(screen.getByTestId("connection-status-text").textContent).toContain("Idle");
    expect(screen.getByTestId("telemetry-state-value").textContent).toContain("--");
    expect(screen.getByTestId("telemetry-alt-value").textContent).toContain("-- m");

    emit("onSession", {
      envelope: { session_id: "session-1", source_kind: "live", seek_epoch: 0, reset_revision: 0 },
      value: {
        available: true,
        complete: true,
        provenance: "stream",
        value: {
          status: "active",
          connection: { kind: "connected" },
          vehicle_state: {
            armed: false,
            custom_mode: 5,
            mode_name: "LOITER",
            system_status: "STANDBY",
            vehicle_type: "copter",
            autopilot: "ardupilot",
            system_id: 1,
            component_id: 1,
            heartbeat_received: true,
          },
          home_position: null,
        },
      },
    });

    emit("onTelemetry", {
      envelope: { session_id: "session-1", source_kind: "live", seek_epoch: 0, reset_revision: 0 },
      value: {
        available: true,
        complete: true,
        provenance: "stream",
        value: {
          flight: { altitude_m: 12.4, speed_mps: 4.8 },
          navigation: { heading_deg: 182.1 },
          power: { battery_pct: 87.2 },
          gps: { fix_type: "fix_3d", satellites: 14 },
        },
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId("connection-status-text").textContent).toContain("Connected");
    });

    expect(screen.getByTestId("telemetry-state-value").textContent).toContain("DISARMED");
    expect(screen.getByTestId("telemetry-mode-value").textContent).toContain("LOITER");
    expect(screen.getByTestId("telemetry-alt-value").textContent).toContain("12.4 m");
    expect(screen.getByTestId("telemetry-speed-value").textContent).toContain("4.8 m/s");
    expect(screen.getByTestId("telemetry-battery-value").textContent).toContain("87.2%");
    expect(screen.getByTestId("telemetry-heading-value").textContent).toContain("182°");
    expect(screen.getByTestId("telemetry-gps-text").textContent).toContain("GPS: 3D fix · 14 sats");
  });

  it("submits the rewritten form through the session store connect action", async () => {
    const { service } = createMockService();
    const store = createSessionStore(service);

    await store.initialize();
    render(withSessionContext(store, ConnectionPanel));

    const transportSelect = screen.getByTestId("connection-transport-select") as HTMLSelectElement;
    await fireEvent.change(transportSelect, { target: { value: "tcp" } });

    const addressInput = screen.getByTestId("connection-tcp-address") as HTMLInputElement;
    await fireEvent.input(addressInput, { target: { value: "127.0.0.1:5770" } });
    await fireEvent.click(screen.getByTestId("connection-connect-btn"));

    await waitFor(() => {
      expect(service.connectSession).toHaveBeenCalledWith({
        transport: { kind: "tcp", address: "127.0.0.1:5770" },
      });
    });

    expect(service.persistConnectionForm).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "tcp", tcpAddress: "127.0.0.1:5770" }),
    );
  });

  it("keeps transport helper copy out of the compact form and tucks serial baud under advanced", async () => {
    const { service } = createMockService();
    const store = createSessionStore(service);

    await store.initialize();
    render(withSessionContext(store, ConnectionPanel));

    const transportSelect = screen.getByTestId("connection-transport-select") as HTMLSelectElement;
    await fireEvent.change(transportSelect, { target: { value: "tcp" } });

    expect(screen.queryByText("TCP available")).toBeNull();

    await fireEvent.change(transportSelect, { target: { value: "serial" } });

    expect(screen.queryByText("Serial available")).toBeNull();
    const advancedSummary = screen.getByText("Advanced");
    const advancedDetails = advancedSummary.closest("details") as HTMLDetailsElement | null;
    expect(advancedDetails?.open).toBe(false);
    expect(screen.getByTestId("connection-serial-baud")).toBeTruthy();
  });

  it("shows local validation failures inline without raising connection failure toasts", async () => {
    const { service } = createMockService();
    const store = createSessionStore(service);

    await store.initialize();
    render(withSessionContext(store, ConnectionPanel));

    const transportSelect = screen.getByTestId("connection-transport-select") as HTMLSelectElement;
    await fireEvent.change(transportSelect, { target: { value: "tcp" } });

    const addressInput = screen.getByTestId("connection-tcp-address") as HTMLInputElement;
    await fireEvent.input(addressInput, { target: { value: "" } });
    await fireEvent.click(screen.getByTestId("connection-connect-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("connection-error-message").textContent).toContain("address is required");
    });
    expect(screen.getByTestId("connection-status-text").textContent).toContain("Error");

    expect(service.connectSession).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });

  it("recomputes inline validation from current store form updates", async () => {
    const { service } = createMockService();
    const store = createSessionStore(service);

    await store.initialize();
    render(withSessionContext(store, ConnectionPanel));

    const transportSelect = screen.getByTestId("connection-transport-select") as HTMLSelectElement;
    await fireEvent.change(transportSelect, { target: { value: "tcp" } });
    await fireEvent.input(screen.getByTestId("connection-tcp-address"), { target: { value: "" } });
    await fireEvent.click(screen.getByTestId("connection-connect-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("connection-error-message").textContent).toContain("address is required");
    });

    store.updateConnectionForm({ tcpAddress: "10.0.0.12:5770" });

    await waitFor(() => {
      expect(screen.queryByTestId("connection-error-message")).toBeNull();
    });
  });

  it("reflects store-driven form updates after render without re-persist sync loops", async () => {
    const { service } = createMockService();
    const store = createSessionStore(service);

    await store.initialize();
    render(withSessionContext(store, ConnectionPanel));
    vi.mocked(service.persistConnectionForm).mockClear();

    store.updateConnectionForm({ mode: "tcp", tcpAddress: "10.0.0.25:5770" });

    await waitFor(() => {
      const transportSelect = screen.getByTestId("connection-transport-select") as HTMLSelectElement;
      expect(transportSelect.value).toBe("tcp");
      const addressInput = screen.getByTestId("connection-tcp-address") as HTMLInputElement;
      expect(addressInput.value).toBe("10.0.0.25:5770");
    });

    expect(service.persistConnectionForm).toHaveBeenCalledTimes(1);

    store.updateConnectionForm({ tcpAddress: "10.0.0.25:5780" });
    await waitFor(() => {
      const addressInput = screen.getByTestId("connection-tcp-address") as HTMLInputElement;
      expect(addressInput.value).toBe("10.0.0.25:5780");
    });
    expect(service.persistConnectionForm).toHaveBeenCalledTimes(2);
  });

  it("refreshes serial ports automatically on mount and when transport changes to serial", async () => {
    const loadConnectionForm = vi
      .fn<() => SessionConnectionFormState>()
      .mockReturnValueOnce({
        mode: "serial",
        udpBind: "0.0.0.0:14550",
        tcpAddress: "127.0.0.1:5760",
        serialPort: "",
        baud: 57600,
        selectedBtDevice: "",
        takeoffAlt: "10",
        followVehicle: true,
      })
      .mockReturnValue({
        mode: "udp",
        udpBind: "0.0.0.0:14550",
        tcpAddress: "127.0.0.1:5760",
        serialPort: "",
        baud: 57600,
        selectedBtDevice: "",
        takeoffAlt: "10",
        followVehicle: true,
      });

    const listSerialPorts = vi.fn(async () => ["/dev/ttyUSB0"]);
    const { service } = createMockService({
      loadConnectionForm,
      listSerialPorts,
    });
    const store = createSessionStore(service);

    await store.initialize();
    render(withSessionContext(store, ConnectionPanel));

    await waitFor(() => {
      expect(listSerialPorts).toHaveBeenCalledTimes(1);
    });

    store.updateConnectionForm({ mode: "udp" });
    await waitFor(() => {
      const transportSelect = screen.getByTestId("connection-transport-select") as HTMLSelectElement;
      expect(transportSelect.value).toBe("udp");
    });

    await fireEvent.change(screen.getByTestId("connection-transport-select"), { target: { value: "serial" } });

    await waitFor(() => {
      expect(listSerialPorts).toHaveBeenCalledTimes(2);
    });
  });
});

// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  SessionConnectionFormState,
  SessionService,
  SessionServiceEventHandlers,
} from "../../../lib/platform/session";
import { createSessionStore } from "../../../lib/stores/session";
import { createSerialPortInventoryStore } from "../../../lib/stores/serial-port-inventory";

import ConnectionPanel from "./ConnectionPanel.svelte";
import type { OpenSessionSnapshot } from "../../../session";
import { withSessionContext } from "../../../test/context-harnesses";
import type { TransportDescriptor } from "../../../transport";

const { toastError } = vi.hoisted(() => {
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as typeof ResizeObserver;
  }

  return { toastError: vi.fn() };
});

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
    {
      kind: "web_serial",
      label: "Web Serial",
      available: true,
      validation: { chooser_required: true, baud_required: true },
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
    websocketUrl: "ws://127.0.0.1:14560",
    serialPort: "",
    webSerialPortId: "",
    webBluetoothDeviceId: "",
    baud: 57600,
    selectedBtDevice: "",
    demoVehiclePreset: "quadcopter",
    takeoffAlt: "10",
    followVehicle: true,
  };

  const service = {
    loadConnectionForm: vi.fn(() => ({ ...defaultConnectionForm })),
    persistConnectionForm: vi.fn(),
    openSessionSnapshot: vi.fn(async () => createSnapshot()),
    ackSessionSnapshot: vi.fn(async (envelope) => ({ result: "accepted" as const, envelope })),
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
      if (descriptor.kind === "web_serial") {
        const errors: string[] = [];
        if (!value.port_id) errors.push("port_id is required");
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
      if (descriptor.kind === "web_serial") {
        return {
          transport: {
            kind: "web_serial" as const,
            baud: value.baud ?? descriptor.default_baud,
            port_id: value.port_id ?? "",
          },
        };
      }
      if (descriptor.kind === "demo") {
        return {
          transport: {
            kind: "demo" as const,
            vehicle_preset: value.demo_vehicle_preset ?? "quadcopter",
          },
        };
      }
      return { transport: { kind: "udp" as const, bind_addr: value.bind_addr ?? "" } };
    }),
    connectSession: vi.fn(async () => undefined),
    disconnectSession: vi.fn(async () => undefined),
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

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
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

  it("renders an actionable demo transport form and submits a demo connect request", async () => {
    const { service } = createMockService({
      loadConnectionForm: vi.fn<() => SessionConnectionFormState>(() => ({
        mode: "demo",
        udpBind: "0.0.0.0:14550",
        tcpAddress: "127.0.0.1:5760",
        websocketUrl: "ws://127.0.0.1:14560",
        serialPort: "",
        webSerialPortId: "",
        webBluetoothDeviceId: "",
        baud: 57600,
        selectedBtDevice: "",
        demoVehiclePreset: "quadcopter",
        takeoffAlt: "10",
        followVehicle: true,
      })),
      availableTransportDescriptors: vi.fn(async (): Promise<TransportDescriptor[]> => [
        {
          kind: "demo",
          label: "Demo vehicle",
          available: true,
          validation: {},
        },
      ]),
    });
    const store = createSessionStore(service);

    await store.initialize();
    render(withSessionContext(store, ConnectionPanel));

    expect(screen.getByTestId("connection-transport-select")).toBeTruthy();
    const demoPresetSelect = screen.getByTestId("connection-demo-preset") as HTMLSelectElement;
    const connectButton = screen.getByTestId("connection-connect-btn");

    expect(demoPresetSelect.value).toBe("quadcopter");
    expect(connectButton).toBeTruthy();

    await fireEvent.change(demoPresetSelect, { target: { value: "airplane" } });
    await fireEvent.click(connectButton);

    expect(service.persistConnectionForm).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "demo", demoVehiclePreset: "airplane" }),
    );

    await waitFor(() => {
      expect(service.connectSession).toHaveBeenCalledWith({
        transport: { kind: "demo", vehicle_preset: "airplane" },
      });
    });
  });

  it("swaps the connect affordance to a cancellable spinner while a connect request is in flight", async () => {
    const pendingConnect = createDeferred<void>();
    const disconnectSession = vi.fn(async () => undefined);
    const { service, emit } = createMockService({
      connectSession: vi.fn(() => pendingConnect.promise),
      disconnectSession,
      loadConnectionForm: vi.fn<() => SessionConnectionFormState>(() => ({
        mode: "demo",
        udpBind: "0.0.0.0:14550",
        tcpAddress: "127.0.0.1:5760",
        websocketUrl: "ws://127.0.0.1:14560",
        serialPort: "",
        webSerialPortId: "",
        webBluetoothDeviceId: "",
        baud: 57600,
        selectedBtDevice: "",
        demoVehiclePreset: "quadcopter",
        takeoffAlt: "10",
        followVehicle: true,
      })),
      availableTransportDescriptors: vi.fn(async (): Promise<TransportDescriptor[]> => [
        {
          kind: "demo",
          label: "Demo vehicle",
          available: true,
          validation: {},
        },
      ]),
    });
    const store = createSessionStore(service);

    await store.initialize();
    render(withSessionContext(store, ConnectionPanel));

    await fireEvent.click(screen.getByTestId("connection-connect-btn"));

    await waitFor(() => {
      expect(service.connectSession).toHaveBeenCalledTimes(1);
    });

    const snapshot = createSnapshot();
    emit("onSession", {
      envelope: snapshot.envelope,
      value: snapshot.session,
    });

    await waitFor(() => {
      expect(screen.getByTestId("connection-cancel-btn")).toBeTruthy();
    });
    const cancelButton = screen.getByTestId("connection-cancel-btn");
    expect(screen.queryByTestId("connection-connect-btn")).toBeNull();

    await fireEvent.click(cancelButton);

    await waitFor(() => {
      expect(disconnectSession).toHaveBeenCalledTimes(1);
    });

    pendingConnect.resolve();
  });

  it("shows and clears local validation failures without raising connection failure toasts", async () => {
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

    expect(service.connectSession).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();

    store.updateConnectionForm({ tcpAddress: "10.0.0.12:5770" });

    await waitFor(() => {
      expect(screen.queryByTestId("connection-error-message")).toBeNull();
    });
  });

  it("refreshes serial ports automatically on mount and when transport changes to serial", async () => {
    const loadConnectionForm = vi
      .fn<() => SessionConnectionFormState>()
      .mockReturnValueOnce({
        mode: "serial",
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
      })
      .mockReturnValue({
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
      });

    const listPorts = vi.fn(async () => ({
      kind: "available",
      ports: [
        {
          port_name: "/dev/ttyUSB0",
          vid: null,
          pid: null,
          serial_number: null,
          manufacturer: null,
          product: null,
          location: null,
        },
      ],
      can_request_web_serial: false,
    }));
    const serialInventory = createSerialPortInventoryStore({
      listPorts,
      requestWebSerialPort: vi.fn(async () => null),
      formatError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
    });
    const { service } = createMockService({
      loadConnectionForm,
    });
    const store = createSessionStore(service);

    await store.initialize();
    render(withSessionContext(store, ConnectionPanel, { serialInventory }));

    await waitFor(() => {
      expect(listPorts).toHaveBeenCalledTimes(1);
      expect((screen.getByTestId("connection-serial-port") as HTMLSelectElement).value).toBe("/dev/ttyUSB0");
      expect(screen.getByTestId("connection-serial-refresh-btn")).toBeTruthy();
    });

    store.updateConnectionForm({ mode: "udp" });
    await waitFor(() => {
      const transportSelect = screen.getByTestId("connection-transport-select") as HTMLSelectElement;
      expect(transportSelect.value).toBe("udp");
    });

    await fireEvent.change(screen.getByTestId("connection-transport-select"), { target: { value: "serial" } });

    await waitFor(() => {
      expect(listPorts).toHaveBeenCalledTimes(2);
    });
  });

  it("opens the browser chooser for WebSerial and connects with the returned internal port id", async () => {
    const staleGrantedPort = {
      port_name: "webserial:1",
      vid: null,
      pid: null,
      serial_number: null,
      manufacturer: null,
      product: "Previously granted device",
      location: "webserial:1",
    };
    const selectedPort = {
      port_name: "webserial:2",
      vid: null,
      pid: null,
      serial_number: null,
      manufacturer: null,
      product: "Selected device",
      location: "webserial:2",
    };
    let inventoryPorts = [staleGrantedPort];
    const listPorts = vi.fn(async () => ({
      kind: "available",
      ports: inventoryPorts,
      can_request_web_serial: true,
    }));
    const requestWebSerialPort = vi.fn(async () => {
      inventoryPorts = [selectedPort];
      return selectedPort;
    });
    const serialInventory = createSerialPortInventoryStore({
      listPorts,
      requestWebSerialPort,
      formatError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
    });
    const { service } = createMockService({
      loadConnectionForm: vi.fn<() => SessionConnectionFormState>(() => ({
        mode: "web_serial",
        udpBind: "0.0.0.0:14550",
        tcpAddress: "127.0.0.1:5760",
        websocketUrl: "ws://127.0.0.1:14560",
        serialPort: "",
        webSerialPortId: "",
        webBluetoothDeviceId: "",
        baud: 115200,
        selectedBtDevice: "",
        demoVehiclePreset: "quadcopter",
        takeoffAlt: "10",
        followVehicle: true,
      })),
    });
    const store = createSessionStore(service);

    await store.initialize();
    render(withSessionContext(store, ConnectionPanel, { serialInventory }));

    let chooserButton: HTMLButtonElement;
    await waitFor(() => {
      chooserButton = screen.getByTestId("connection-web-serial-connect-btn") as HTMLButtonElement;
      expect(chooserButton.disabled).toBe(false);
    });

    expect(screen.queryByTestId("connection-web-serial-port")).toBeNull();
    expect(screen.queryByTestId("connection-web-serial-grant-btn")).toBeNull();
    expect(document.body.textContent).not.toContain("webserial:1");

    await fireEvent.click(chooserButton!);

    await waitFor(() => {
      expect(requestWebSerialPort).toHaveBeenCalledTimes(1);
      expect(service.connectSession).toHaveBeenCalledWith({
        transport: { kind: "web_serial", baud: 115200, port_id: "webserial:2" },
      });
    });

    expect(document.body.textContent).not.toContain("webserial:2");
    expect(service.persistConnectionForm).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "web_serial", webSerialPortId: "webserial:2" }),
    );
  });

  it("leaves WebSerial unconnected without local port validation when the browser chooser is cancelled", async () => {
    const listPorts = vi.fn(async () => ({
      kind: "available",
      ports: [],
      can_request_web_serial: true,
    }));
    const requestWebSerialPort = vi.fn(async () => null);
    const serialInventory = createSerialPortInventoryStore({
      listPorts,
      requestWebSerialPort,
      formatError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
    });
    const { service } = createMockService({
      loadConnectionForm: vi.fn<() => SessionConnectionFormState>(() => ({
        mode: "web_serial",
        udpBind: "0.0.0.0:14550",
        tcpAddress: "127.0.0.1:5760",
        websocketUrl: "ws://127.0.0.1:14560",
        serialPort: "",
        webSerialPortId: "",
        webBluetoothDeviceId: "",
        baud: 57600,
        selectedBtDevice: "",
        demoVehiclePreset: "quadcopter",
        takeoffAlt: "10",
        followVehicle: true,
      })),
    });
    const store = createSessionStore(service);

    await store.initialize();
    render(withSessionContext(store, ConnectionPanel, { serialInventory }));

    let chooserButton: HTMLButtonElement;
    await waitFor(() => {
      chooserButton = screen.getByTestId("connection-web-serial-connect-btn") as HTMLButtonElement;
      expect(chooserButton.disabled).toBe(false);
    });

    await fireEvent.click(chooserButton!);

    await waitFor(() => {
      expect(requestWebSerialPort).toHaveBeenCalledTimes(1);
    });

    expect(service.connectSession).not.toHaveBeenCalled();
    expect(screen.queryByTestId("connection-error-message")?.textContent ?? "").not.toContain("port_id is required");
    expect(toastError).not.toHaveBeenCalled();
  });
});

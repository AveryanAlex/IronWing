import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const wasmRuntimeMock = vi.hoisted(() => ({
  beginConnect: vi.fn(() => ({ close: vi.fn(), isClosed: () => false })),
  waitConnect: vi.fn(async () => undefined),
  disconnectLink: vi.fn(async () => undefined),
  getAvailableModes: vi.fn(() => [{ custom_mode: 4, name: "GUIDED" }]),
  setTelemetryRate: vi.fn(() => undefined),
  openSessionSnapshot: vi.fn(() => ({ envelope: { session_id: "session-1", source_kind: "live", seek_epoch: 0, reset_revision: 0 } })),
  ackSessionSnapshot: vi.fn(() => ({ result: "accepted", envelope: { session_id: "session-1", source_kind: "live", seek_epoch: 0, reset_revision: 0 } })),
}));

const wasmContractMock = vi.hoisted(() => ({
  availableMessageRates: vi.fn(async () => [
    { id: 33, name: "Core Global Position", default_rate_hz: 4 },
  ]),
  webTransportDescriptors: vi.fn(async (options: {
    websocketAvailable: boolean;
    webSerialAvailable: boolean;
    webBluetoothAvailable: boolean;
  }) => [
    {
      kind: "websocket",
      label: "Core WebSocket",
      available: options.websocketAvailable,
      validation: { url_required: true },
    },
    {
      kind: "web_serial",
      label: "Core Web Serial",
      available: options.webSerialAvailable,
      validation: { chooser_required: true, baud_required: true },
      default_baud: 57600,
    },
    {
      kind: "web_bluetooth",
      label: "Core Web Bluetooth",
      available: options.webBluetoothAvailable,
      validation: { chooser_required: true },
      profile: "nordic_uart",
    },
  ]),
}));

vi.mock("../wasm", () => ({
  ensureWasmRuntime: vi.fn(async () => wasmRuntimeMock),
  wasmAvailableMessageRates: wasmContractMock.availableMessageRates,
  wasmWebTransportDescriptors: wasmContractMock.webTransportDescriptors,
}));

vi.mock("../transports/websocket", () => ({
  createWebSocketTransport: vi.fn(() => ({
    kind: "websocket",
    start: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  })),
}));

vi.mock("../transports/web-serial", () => ({
  isWebSerialAvailable: vi.fn(() => false),
  createWebSerialTransport: vi.fn(() => ({
    kind: "web_serial",
    start: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  })),
}));

vi.mock("../transports/web-bluetooth", () => ({
  isWebBluetoothAvailable: vi.fn(() => false),
  createWebBluetoothTransport: vi.fn(() => ({
    kind: "web_bluetooth",
    start: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  })),
}));

import { createWebBluetoothTransport, isWebBluetoothAvailable } from "../transports/web-bluetooth";
import { createWebSerialTransport, isWebSerialAvailable } from "../transports/web-serial";
import { invokeWebCommand } from "./commands";

describe("web backend commands", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "WebSocket",
      class {
        static CONNECTING = 0;
        static OPEN = 1;
        static CLOSING = 2;
        static CLOSED = 3;
      } as unknown as typeof WebSocket,
    );
    vi.mocked(isWebSerialAvailable).mockReturnValue(false);
    vi.mocked(isWebBluetoothAvailable).mockReturnValue(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("reports browser transport availability", async () => {
    vi.mocked(isWebSerialAvailable).mockReturnValue(true);

    await expect(invokeWebCommand("available_transports")).resolves.toEqual([
      expect.objectContaining({ kind: "websocket", validation: { url_required: true } }),
      expect.objectContaining({ kind: "web_serial", available: true, validation: { chooser_required: true, baud_required: true } }),
      expect.objectContaining({ kind: "web_bluetooth", available: false, profile: "nordic_uart" }),
    ]);
    expect(wasmContractMock.webTransportDescriptors).toHaveBeenCalledWith({
      websocketAvailable: true,
      webSerialAvailable: true,
      webBluetoothAvailable: false,
    });
  });

  it("reports typed pure-web runtime capabilities", async () => {
    const capabilities = await invokeWebCommand<Record<string, unknown>>("runtime_capabilities");

    expect(capabilities.firmware_flash).toEqual(expect.objectContaining({ kind: "unsupported" }));
    expect(capabilities.log_library_filesystem).toEqual(expect.objectContaining({ kind: "unsupported" }));
    expect(capabilities.recording_filesystem).toEqual(expect.objectContaining({ kind: "unsupported" }));
    expect(capabilities.mission_transfer).toEqual(expect.objectContaining({ kind: "maybe" }));
    expect(capabilities.parameter_transfer).toEqual(expect.objectContaining({ kind: "maybe" }));
    expect(capabilities.transports).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "websocket" }),
    ]));
  });

  it("reports available message rates from the shared wasm contract", async () => {
    await expect(invokeWebCommand("get_available_message_rates")).resolves.toEqual([
      { id: 33, name: "Core Global Position", default_rate_hz: 4 },
    ]);

    expect(wasmContractMock.availableMessageRates).toHaveBeenCalledTimes(1);
  });

  it("starts Web Serial and Web Bluetooth transports from connect requests", async () => {
    await invokeWebCommand("connect_link", { request: { transport: { kind: "web_serial", baud: 115200 } } });
    expect(createWebSerialTransport).toHaveBeenCalledWith(
      { kind: "web_serial", baud: 115200 },
      expect.anything(),
      expect.any(AbortSignal),
    );

    await invokeWebCommand("connect_link", { request: { transport: { kind: "web_bluetooth", profile: "nordic_uart" } } });
    expect(createWebBluetoothTransport).toHaveBeenCalledWith(
      { kind: "web_bluetooth", profile: "nordic_uart" },
      expect.anything(),
      expect.any(AbortSignal),
    );
  });

  it("available modes command delegates to the shared wasm runtime after connect", async () => {
    await expect(invokeWebCommand("get_available_modes")).resolves.toEqual([
      { custom_mode: 4, name: "GUIDED" },
    ]);
  });

  it("telemetry rate command delegates to the shared wasm runtime", async () => {
    await expect(invokeWebCommand("set_telemetry_rate", { rateHz: 5 })).resolves.toBeUndefined();

    expect(wasmRuntimeMock.setTelemetryRate).toHaveBeenCalledWith(5);
  });

  it("returns graceful empty browser state for out-of-scope filesystem flows", async () => {
    await expect(invokeWebCommand("log_library_list")).resolves.toEqual(expect.objectContaining({ entries: [] }));
    await expect(invokeWebCommand("log_library_register_open_file")).resolves.toBeNull();
    await expect(invokeWebCommand("log_library_cancel")).resolves.toBe(false);
    await expect(invokeWebCommand("recording_settings_read")).resolves.toEqual(expect.objectContaining({
      operation_id: "recording_settings_read",
    }));
    await expect(invokeWebCommand("firmware_session_status")).resolves.toEqual({ kind: "idle" });
    await expect(invokeWebCommand("firmware_serial_preflight")).resolves.toEqual(expect.objectContaining({
      session_ready: false,
      available_ports: [],
    }));
    await expect(invokeWebCommand("firmware_serial_readiness", {
      request: {
        port: "",
        source: { kind: "local_apj_bytes", data: [] },
        options: { full_chip_erase: false },
      },
    })).resolves.toEqual(expect.objectContaining({
      request_token: "serial-readiness:port=:source_kind=local_apj_bytes:source_identity=0-cbf29ce484222325:full_chip_erase=0",
    }));
    await expect(invokeWebCommand("firmware_flash_serial")).resolves.toEqual({
      result: "failed",
      reason: "Firmware flashing is not available in the browser-only web runtime.",
    });
    await expect(invokeWebCommand("firmware_flash_dfu_recovery")).resolves.toEqual({ result: "platform_unsupported" });
  });

  it("returns benign empty results for browser transport probes", async () => {
    await expect(invokeWebCommand("list_serial_ports_cmd")).resolves.toEqual([]);
    await expect(invokeWebCommand("bt_scan_ble")).resolves.toEqual([]);
    await expect(invokeWebCommand("bt_get_bonded_devices")).resolves.toEqual([]);
    await expect(invokeWebCommand("bt_request_permissions")).resolves.toBeUndefined();
    await expect(invokeWebCommand("bt_stop_scan_ble")).resolves.toBeUndefined();
  });

  it("rejects unsupported commands clearly", async () => {
    await expect(invokeWebCommand("mission_upload")).rejects.toThrow(
      "mission_upload is not available in the browser-only web runtime",
    );
    await expect(invokeWebCommand("mission_upload")).rejects.not.toThrow("not wired");
  });
});

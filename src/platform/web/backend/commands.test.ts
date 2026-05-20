import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const wasmRuntimeMock = vi.hoisted(() => ({
  beginConnect: vi.fn(() => ({
    close: vi.fn(),
    free: vi.fn(),
    [Symbol.dispose]: vi.fn(),
    isClosed: () => false,
    nextOutbound: vi.fn(async () => null),
    pushInbound: vi.fn(async () => undefined),
  })),
  connectDemo: vi.fn(async () => undefined),
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
      kind: "demo",
      label: "Core Demo Vehicle",
      available: true,
      validation: {},
    },
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
  webSerialFirmwareInstallUpdate: vi.fn(async ({ onProgress }: { onProgress: (phase: string, written: number, total: number) => void }) => {
    onProgress("programming", 4, 4);
    return { result: "verified", board_id: 140, bootloader_rev: 5, port: "webserial:1" };
  }),
  firmwareCatalogEntriesFromManifest: vi.fn(async () => [{
    board_id: 140,
    platform: "CubeOrange",
    vehicle_type: "Copter",
    version: "4.5.0",
    version_type: "OFFICIAL",
    format: "apj",
    url: "https://firmware.example/CubeOrange.apj",
    image_size: 10,
    latest: true,
    git_sha: "abc",
    brand_name: "Cube Orange",
    manufacturer: "Hex",
  }]),
  firmwareCatalogTargetsFromManifest: vi.fn(async () => [{
    board_id: 140,
    platform: "CubeOrange",
    brand_name: "Cube Orange",
    manufacturer: "Hex",
    vehicle_types: ["Copter"],
    latest_version: "4.5.0",
  }]),
  firmwareBootloaderCatalogTargetsFromManifest: vi.fn(async () => [{
    board_id: 140,
    platform: "CubeOrange",
    brand_name: "Cube Orange",
    manufacturer: "Hex",
    vehicle_types: ["Copter"],
    latest_version: "4.5.0",
  }]),
  paramDownloadAll: vi.fn(async () => undefined),
  paramCancel: vi.fn(async () => undefined),
  paramWrite: vi.fn(async (name: string, value: number) => ({
    name,
    requested_value: value,
    confirmed_value: value,
    success: true,
  })),
  paramWriteBatch: vi.fn(async (params: [string, number][]) => params.map(([name, value]) => ({
    name,
    requested_value: value,
    confirmed_value: value,
    success: true,
  }))),
  missionValidate: vi.fn(async () => []),
  missionUpload: vi.fn(async () => undefined),
  missionDownload: vi.fn(async () => ({ plan: { items: [] }, home: null })),
  missionClear: vi.fn(async () => undefined),
  missionSetCurrent: vi.fn(async () => undefined),
  missionCancel: vi.fn(async () => undefined),
  fenceUpload: vi.fn(async () => undefined),
  fenceDownload: vi.fn(async () => ({ return_point: null, regions: [] })),
  fenceClear: vi.fn(async () => undefined),
  rallyUpload: vi.fn(async () => undefined),
  rallyDownload: vi.fn(async () => ({ points: [] })),
  rallyClear: vi.fn(async () => undefined),
  startGuidedSession: vi.fn(async () => ({
    result: "accepted",
    state: {
      value: {
        status: "active",
        session: { kind: "goto", latitude_deg: 47.1, longitude_deg: 8.2, altitude_m: 120 },
        entered_at_unix_msec: 1,
        blocking_reason: null,
        termination: null,
        last_command: { operation_id: "start_guided_session", session_kind: "goto", at_unix_msec: 1 },
        actions: {
          start: { allowed: false, blocking_reason: "operation_in_progress" },
          update: { allowed: true, blocking_reason: null },
          stop: { allowed: true, blocking_reason: null },
        },
      },
      provenance: { source: "live", scope: { kind: "latest" } },
    },
  })),
  updateGuidedSession: vi.fn(async () => ({
    result: "accepted",
    state: {
      value: {
        status: "active",
        session: { kind: "goto", latitude_deg: 47.3, longitude_deg: 8.4, altitude_m: 130 },
        entered_at_unix_msec: 1,
        blocking_reason: null,
        termination: null,
        last_command: { operation_id: "update_guided_session", session_kind: "goto", at_unix_msec: 2 },
        actions: {
          start: { allowed: false, blocking_reason: "operation_in_progress" },
          update: { allowed: true, blocking_reason: null },
          stop: { allowed: true, blocking_reason: null },
        },
      },
      provenance: { source: "live", scope: { kind: "latest" } },
    },
  })),
  stopGuidedSession: vi.fn(async () => ({
    result: "accepted",
    state: {
      value: {
        status: "idle",
        session: null,
        entered_at_unix_msec: null,
        blocking_reason: null,
        termination: null,
        last_command: { operation_id: "stop_guided_session", session_kind: null, at_unix_msec: 3 },
        actions: {
          start: { allowed: true, blocking_reason: null },
          update: { allowed: false, blocking_reason: "operation_in_progress" },
          stop: { allowed: false, blocking_reason: "operation_in_progress" },
        },
      },
      provenance: { source: "live", scope: { kind: "latest" } },
    },
  })),
  calibrateAccel: vi.fn(async () => undefined),
  calibrateGyro: vi.fn(async () => undefined),
  calibrateCompassStart: vi.fn(async () => undefined),
  calibrateCompassAccept: vi.fn(async () => undefined),
  calibrateCompassCancel: vi.fn(async () => undefined),
  rebootVehicle: vi.fn(async () => undefined),
  motorTest: vi.fn(async () => undefined),
  setServo: vi.fn(async () => undefined),
  rcOverride: vi.fn(async () => undefined),
  requestPrearmChecks: vi.fn(async () => undefined),
  paramParseFile: vi.fn(async () => ({ ARMING_CHECK: 0 })),
  paramFormatFile: vi.fn(async () => "ARMING_CHECK,0\n"),
  logParseSummary: vi.fn(async () => ({
    summary: {
      file_name: "flight.tlog",
      start_usec: 100,
      end_usec: 200,
      duration_secs: 0.0001,
      total_entries: 1,
      message_types: { HEARTBEAT: 1 },
      log_type: "tlog",
    },
    diagnostics: [],
  })),
  logQueryMessages: vi.fn(async () => []),
  logRawMessagesQuery: vi.fn(async (path: string, format: string, bytes: Uint8Array, request: unknown) => ({
    entry_id: (request as { entry_id?: string }).entry_id ?? "entry-1",
    items: [],
    next_cursor: null,
    total_available: 0,
  })),
  logChartSeriesQuery: vi.fn(async (path: string, format: string, bytes: Uint8Array, request: unknown) => ({
    entry_id: (request as { entry_id?: string }).entry_id ?? "entry-1",
    start_usec: null,
    end_usec: null,
    series: [],
    diagnostics: [],
  })),
  logFlightPath: vi.fn(async () => []),
  logTelemetryTrack: vi.fn(async () => []),
  logTelemetryAt: vi.fn(async () => ({ timestamp_usec: 100 })),
  logFlightSummary: vi.fn(async () => ({ duration_secs: 0, max_alt_m: null, avg_alt_m: null, max_speed_mps: null, avg_speed_mps: null, total_distance_m: null, max_distance_from_home_m: null, battery_start_v: null, battery_end_v: null, battery_min_v: null, mah_consumed: null, gps_sats_min: null, gps_sats_max: null })),
  logExportCsvBytes: vi.fn(async () => ({ operation_id: "log_export", destination_path: "flight.csv", bytes_written: 1, rows_written: 1, diagnostics: [], bytes: [10] })),
}));

vi.mock("../wasm", () => ({
  ensureWasmRuntime: vi.fn(async () => wasmRuntimeMock),
  wasmAvailableMessageRates: wasmContractMock.availableMessageRates,
  wasmFenceClear: wasmContractMock.fenceClear,
  wasmFenceDownload: wasmContractMock.fenceDownload,
  wasmFenceUpload: wasmContractMock.fenceUpload,
  wasmFirmwareBootloaderCatalogTargetsFromManifest: wasmContractMock.firmwareBootloaderCatalogTargetsFromManifest,
  wasmFirmwareCatalogEntriesFromManifest: wasmContractMock.firmwareCatalogEntriesFromManifest,
  wasmFirmwareCatalogTargetsFromManifest: wasmContractMock.firmwareCatalogTargetsFromManifest,
  wasmMissionCancel: wasmContractMock.missionCancel,
  wasmMissionClear: wasmContractMock.missionClear,
  wasmMissionDownload: wasmContractMock.missionDownload,
  wasmMissionSetCurrent: wasmContractMock.missionSetCurrent,
  wasmMissionUpload: wasmContractMock.missionUpload,
  wasmMissionValidate: wasmContractMock.missionValidate,
  wasmMotorTest: wasmContractMock.motorTest,
  wasmParamCancel: wasmContractMock.paramCancel,
  wasmParamDownloadAll: wasmContractMock.paramDownloadAll,
  wasmParamFormatFile: wasmContractMock.paramFormatFile,
  wasmParamParseFile: wasmContractMock.paramParseFile,
  wasmParamWrite: wasmContractMock.paramWrite,
  wasmParamWriteBatch: wasmContractMock.paramWriteBatch,
  wasmCalibrateAccel: wasmContractMock.calibrateAccel,
  wasmCalibrateCompassAccept: wasmContractMock.calibrateCompassAccept,
  wasmCalibrateCompassCancel: wasmContractMock.calibrateCompassCancel,
  wasmCalibrateCompassStart: wasmContractMock.calibrateCompassStart,
  wasmCalibrateGyro: wasmContractMock.calibrateGyro,
  wasmRcOverride: wasmContractMock.rcOverride,
  wasmRallyClear: wasmContractMock.rallyClear,
  wasmRallyDownload: wasmContractMock.rallyDownload,
  wasmRallyUpload: wasmContractMock.rallyUpload,
  wasmRebootVehicle: wasmContractMock.rebootVehicle,
  wasmRequestPrearmChecks: wasmContractMock.requestPrearmChecks,
  wasmSetServo: wasmContractMock.setServo,
  wasmStartGuidedSession: wasmContractMock.startGuidedSession,
  wasmStopGuidedSession: wasmContractMock.stopGuidedSession,
  wasmUpdateGuidedSession: wasmContractMock.updateGuidedSession,
  wasmWebSerialFirmwareInstallUpdate: wasmContractMock.webSerialFirmwareInstallUpdate,
  wasmWebTransportDescriptors: wasmContractMock.webTransportDescriptors,
  wasmLogParseSummary: wasmContractMock.logParseSummary,
  wasmLogQueryMessages: wasmContractMock.logQueryMessages,
  wasmLogRawMessagesQuery: wasmContractMock.logRawMessagesQuery,
  wasmLogChartSeriesQuery: wasmContractMock.logChartSeriesQuery,
  wasmLogFlightPath: wasmContractMock.logFlightPath,
  wasmLogTelemetryTrack: wasmContractMock.logTelemetryTrack,
  wasmLogTelemetryAt: wasmContractMock.logTelemetryAt,
  wasmLogFlightSummary: wasmContractMock.logFlightSummary,
  wasmLogExportCsvBytes: wasmContractMock.logExportCsvBytes,
}));

const webSerialFirmwareMock = vi.hoisted(() => ({
  isWebSerialFirmwareAvailable: vi.fn(() => false),
  listGrantedWebSerialFirmwarePorts: vi.fn(async (): Promise<unknown[]> => []),
  requestWebSerialFirmwarePort: vi.fn(async () => ({
    port_name: "webserial:1",
    vid: 1155,
    pid: 22336,
    serial_number: null,
    manufacturer: null,
    product: "WebSerial device",
    location: "webserial:1",
  })),
  openWebSerialFirmwarePort: vi.fn(async () => ({
    close: vi.fn(async () => undefined),
  })),
}));

vi.mock("../firmware/web-serial", () => webSerialFirmwareMock);

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
import { createWebSocketTransport } from "../transports/websocket";
import { invokeWebCommand } from "./commands";
import { resetWebFirmwareCatalogCacheForTests } from "./firmware";
import { getBrowserPersistentStorage } from "./browser-storage";
import { registerWebLogTestBytes } from "./logs";
import { resetWebRecordingStateForTests } from "./recording";

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
    webSerialFirmwareMock.isWebSerialFirmwareAvailable.mockReturnValue(false);
    webSerialFirmwareMock.listGrantedWebSerialFirmwarePorts.mockResolvedValue([]);
    resetWebFirmwareCatalogCacheForTests();
    resetWebRecordingStateForTests();
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:recording"),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("reports browser transport availability", async () => {
    vi.mocked(isWebSerialAvailable).mockReturnValue(true);

    await expect(invokeWebCommand("available_transports")).resolves.toEqual([
      expect.objectContaining({ kind: "demo", validation: {} }),
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

    expect(capabilities.firmware_install_update).toEqual(expect.objectContaining({ kind: "unsupported" }));
    expect(capabilities.log_library_filesystem).toEqual(expect.objectContaining({ kind: "unsupported" }));
    expect(capabilities.recording_filesystem).toEqual(expect.objectContaining({ kind: "maybe" }));
    expect(capabilities.mission_transfer).toEqual(expect.objectContaining({ kind: "maybe" }));
    expect(capabilities.parameter_transfer).toEqual(expect.objectContaining({ kind: "maybe" }));
    expect(capabilities.transports).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "websocket" }),
    ]));
  });

  it("advertises firmware install/update when WebSerial firmware support is available", async () => {
    webSerialFirmwareMock.isWebSerialFirmwareAvailable.mockReturnValue(true);

    const capabilities = await invokeWebCommand<Record<string, unknown>>("runtime_capabilities");

    expect(capabilities.firmware_install_update).toEqual({ kind: "supported" });
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

  it("connects the built-in demo vehicle through the wasm runtime", async () => {
    await invokeWebCommand("connect_link", {
      request: { transport: { kind: "demo", vehicle_preset: "quadplane" } },
    });

    expect(wasmRuntimeMock.connectDemo).toHaveBeenCalledWith("quadplane");
    expect(wasmRuntimeMock.beginConnect).not.toHaveBeenCalled();
    expect(createWebSocketTransport).not.toHaveBeenCalled();
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

  it("delegates parameter transfer and file commands to the wasm runtime", async () => {
    const paramStore = {
      expected_count: 1,
      params: {
        ARMING_CHECK: { name: "ARMING_CHECK", value: 0, param_type: "uint8", index: 0 },
      },
    };

    await expect(invokeWebCommand("param_download_all")).resolves.toBeUndefined();
    await expect(invokeWebCommand("param_cancel")).resolves.toBeUndefined();
    await expect(invokeWebCommand("param_write", { name: "ARMING_CHECK", value: 0 })).resolves.toEqual({
      name: "ARMING_CHECK",
      requested_value: 0,
      confirmed_value: 0,
      success: true,
    });
    await expect(invokeWebCommand("param_write_batch", { params: [["BATT_CAPACITY", 5000]] })).resolves.toEqual([
      {
        name: "BATT_CAPACITY",
        requested_value: 5000,
        confirmed_value: 5000,
        success: true,
      },
    ]);
    await expect(invokeWebCommand("param_parse_file", { contents: "ARMING_CHECK,0\n" })).resolves.toEqual({ ARMING_CHECK: 0 });
    await expect(invokeWebCommand("param_format_file", { store: paramStore })).resolves.toBe("ARMING_CHECK,0\n");

    expect(wasmContractMock.paramDownloadAll).toHaveBeenCalledTimes(1);
    expect(wasmContractMock.paramCancel).toHaveBeenCalledTimes(1);
    expect(wasmContractMock.paramWrite).toHaveBeenCalledWith("ARMING_CHECK", 0);
    expect(wasmContractMock.paramWriteBatch).toHaveBeenCalledWith([["BATT_CAPACITY", 5000]]);
    expect(wasmContractMock.paramParseFile).toHaveBeenCalledWith("ARMING_CHECK,0\n");
    expect(wasmContractMock.paramFormatFile).toHaveBeenCalledWith(paramStore);
  });

  it("delegates mission, fence, and rally transfer commands to the wasm runtime", async () => {
    const missionPlan = { items: [] };
    const fencePlan = { return_point: null, regions: [] };
    const rallyPlan = { points: [] };

    await expect(invokeWebCommand("mission_validate", { plan: missionPlan })).resolves.toEqual([]);
    await expect(invokeWebCommand("mission_upload", { plan: missionPlan })).resolves.toBeUndefined();
    await expect(invokeWebCommand("mission_download")).resolves.toEqual({ plan: { items: [] }, home: null });
    await expect(invokeWebCommand("mission_clear")).resolves.toBeUndefined();
    await expect(invokeWebCommand("mission_set_current", { seq: 2 })).resolves.toBeUndefined();
    await expect(invokeWebCommand("mission_cancel")).resolves.toBeUndefined();
    await expect(invokeWebCommand("fence_upload", { plan: fencePlan })).resolves.toBeUndefined();
    await expect(invokeWebCommand("fence_download")).resolves.toEqual({ return_point: null, regions: [] });
    await expect(invokeWebCommand("fence_clear")).resolves.toBeUndefined();
    await expect(invokeWebCommand("rally_upload", { plan: rallyPlan })).resolves.toBeUndefined();
    await expect(invokeWebCommand("rally_download")).resolves.toEqual({ points: [] });
    await expect(invokeWebCommand("rally_clear")).resolves.toBeUndefined();

    expect(wasmContractMock.missionValidate).toHaveBeenCalledWith(missionPlan);
    expect(wasmContractMock.missionUpload).toHaveBeenCalledWith(missionPlan);
    expect(wasmContractMock.missionDownload).toHaveBeenCalledTimes(1);
    expect(wasmContractMock.missionClear).toHaveBeenCalledTimes(1);
    expect(wasmContractMock.missionSetCurrent).toHaveBeenCalledWith(2);
    expect(wasmContractMock.missionCancel).toHaveBeenCalledTimes(1);
    expect(wasmContractMock.fenceUpload).toHaveBeenCalledWith(fencePlan);
    expect(wasmContractMock.fenceDownload).toHaveBeenCalledTimes(1);
    expect(wasmContractMock.fenceClear).toHaveBeenCalledTimes(1);
    expect(wasmContractMock.rallyUpload).toHaveBeenCalledWith(rallyPlan);
    expect(wasmContractMock.rallyDownload).toHaveBeenCalledTimes(1);
    expect(wasmContractMock.rallyClear).toHaveBeenCalledTimes(1);
  });

  it("delegates guided session commands to the wasm runtime", async () => {
    const startRequest = { session: { kind: "goto", latitude_deg: 47.1, longitude_deg: 8.2, altitude_m: 120 } };
    const updateRequest = { session: { kind: "goto", latitude_deg: 47.3, longitude_deg: 8.4, altitude_m: 130 } };

    await expect(invokeWebCommand("start_guided_session", { request: startRequest })).resolves.toEqual(expect.objectContaining({
      result: "accepted",
      state: expect.objectContaining({
        value: expect.objectContaining({
          last_command: expect.objectContaining({ operation_id: "start_guided_session" }),
        }),
      }),
    }));
    await expect(invokeWebCommand("update_guided_session", { request: updateRequest })).resolves.toEqual(expect.objectContaining({
      result: "accepted",
      state: expect.objectContaining({
        value: expect.objectContaining({
          last_command: expect.objectContaining({ operation_id: "update_guided_session" }),
        }),
      }),
    }));
    await expect(invokeWebCommand("stop_guided_session")).resolves.toEqual(expect.objectContaining({
      result: "accepted",
      state: expect.objectContaining({
        value: expect.objectContaining({
          status: "idle",
          last_command: expect.objectContaining({ operation_id: "stop_guided_session" }),
        }),
      }),
    }));

    expect(wasmContractMock.startGuidedSession).toHaveBeenCalledWith(startRequest);
    expect(wasmContractMock.updateGuidedSession).toHaveBeenCalledWith(updateRequest);
    expect(wasmContractMock.stopGuidedSession).toHaveBeenCalledTimes(1);
  });

  it("delegates calibration, setup, and low-level commands to the wasm runtime", async () => {
    const channels = [
      { channel: 1, value: { kind: "pwm", pwm_us: 1500 } },
      { channel: 2, value: { kind: "release" } },
    ];

    await expect(invokeWebCommand("calibrate_accel")).resolves.toBeUndefined();
    await expect(invokeWebCommand("calibrate_gyro")).resolves.toBeUndefined();
    await expect(invokeWebCommand("calibrate_compass_start", { compassMask: 3 })).resolves.toBeUndefined();
    await expect(invokeWebCommand("calibrate_compass_accept", { compassMask: 3 })).resolves.toBeUndefined();
    await expect(invokeWebCommand("calibrate_compass_cancel", { compassMask: 3 })).resolves.toBeUndefined();
    await expect(invokeWebCommand("reboot_vehicle")).resolves.toBeUndefined();
    await expect(invokeWebCommand("motor_test", { motorInstance: 4, throttlePct: 5, durationS: 2 })).resolves.toBeUndefined();
    await expect(invokeWebCommand("set_servo", { instance: 6, pwmUs: 1750 })).resolves.toBeUndefined();
    await expect(invokeWebCommand("rc_override", { channels })).resolves.toBeUndefined();
    await expect(invokeWebCommand("request_prearm_checks")).resolves.toBeUndefined();

    expect(wasmContractMock.calibrateAccel).toHaveBeenCalledTimes(1);
    expect(wasmContractMock.calibrateGyro).toHaveBeenCalledTimes(1);
    expect(wasmContractMock.calibrateCompassStart).toHaveBeenCalledWith(3);
    expect(wasmContractMock.calibrateCompassAccept).toHaveBeenCalledWith(3);
    expect(wasmContractMock.calibrateCompassCancel).toHaveBeenCalledWith(3);
    expect(wasmContractMock.rebootVehicle).toHaveBeenCalledTimes(1);
    expect(wasmContractMock.motorTest).toHaveBeenCalledWith(4, 5, 2);
    expect(wasmContractMock.setServo).toHaveBeenCalledWith(6, 1750);
    expect(wasmContractMock.rcOverride).toHaveBeenCalledWith(channels);
    expect(wasmContractMock.requestPrearmChecks).toHaveBeenCalledTimes(1);
  });

  it("returns graceful empty browser state for out-of-scope filesystem flows", async () => {
    await expect(invokeWebCommand("log_library_list")).resolves.toEqual(expect.objectContaining({
      entries: [],
      storage: expect.objectContaining({ kind: "browser_storage" }),
    }));
    await expect(invokeWebCommand("log_library_register_open_file")).resolves.toBeNull();
    await expect(invokeWebCommand("log_library_cancel")).resolves.toBe(false);
    await expect(invokeWebCommand("recording_settings_read")).resolves.toEqual(expect.objectContaining({
      operation_id: "recording_settings_read",
    }));
    await expect(invokeWebCommand("firmware_session_status")).resolves.toEqual({ kind: "idle" });
    await expect(invokeWebCommand("firmware_install_update_preflight")).resolves.toEqual(expect.objectContaining({
      session_ready: false,
      available_ports: [],
    }));
    await expect(invokeWebCommand("firmware_install_update_readiness", {
      request: {
        port: "",
        source: { kind: "local_apj_bytes", data: [] },
        options: { full_chip_erase: false },
      },
    })).resolves.toEqual(expect.objectContaining({
      request_token: "firmware-install-readiness:port=:source_kind=local_apj_bytes:source_identity=0-cbf29ce484222325:full_chip_erase=0",
      readiness: { kind: "blocked", reason: "port_unselected" },
    }));
    await expect(invokeWebCommand("firmware_install_update")).resolves.toEqual({
      result: "failed",
      reason: "Firmware install/update requires WebSerial in the browser-only web runtime.",
    });
    await expect(invokeWebCommand("firmware_bootloader_installation")).resolves.toEqual(expect.objectContaining({ result: "platform_unsupported" }));
  });

  it("registers browser-stored logs and delegates queries to the wasm log engine", async () => {
    const entry = await registerWebLogTestBytes("flight.tlog", new Uint8Array([1, 2, 3]), 123);

    await expect(invokeWebCommand("log_library_list")).resolves.toEqual(expect.objectContaining({
      entries: [expect.objectContaining({ entry_id: entry.entry_id, status: "ready" })],
    }));
    await expect(invokeWebCommand("log_open", { path: entry.entry_id })).resolves.toEqual(expect.objectContaining({
      file_name: "flight.tlog",
    }));
    await expect(invokeWebCommand("log_raw_messages_query", {
      request: {
        entry_id: entry.entry_id,
        cursor: null,
        start_usec: null,
        end_usec: null,
        message_types: [],
        text: null,
        field_filters: [],
        limit: 100,
        include_detail: false,
        include_hex: false,
      },
    })).resolves.toEqual(expect.objectContaining({ entry_id: entry.entry_id }));

    expect(wasmContractMock.logParseSummary).toHaveBeenCalledWith("flight.tlog", "tlog", new Uint8Array([1, 2, 3]));
    expect(wasmContractMock.logRawMessagesQuery).toHaveBeenCalledTimes(1);
  });

  it("records browser inbound transport bytes as a completed TLOG", async () => {
    await expect(invokeWebCommand("recording_settings_write", {
      settings: {
        auto_record_on_connect: false,
        auto_record_directory: "browser-storage://recordings",
        filename_template: "YYYY-MM-DD_HH-MM-SS_{vehicle-or-sysid-or-unknown}.tlog",
        add_completed_recordings_to_library: true,
      },
    })).resolves.toEqual(expect.objectContaining({ operation_id: "recording_settings_write" }));

    await invokeWebCommand("connect_link", { request: { transport: { kind: "websocket", url: "ws://vehicle" } } });
    await expect(invokeWebCommand("recording_start", {
      request: { destination_path: "/tmp/browser-flight.tlog", mode: "manual" },
    })).resolves.toBe("browser-flight.tlog");

    const websocketCalls = vi.mocked(createWebSocketTransport).mock.calls;
    const bridge = websocketCalls[websocketCalls.length - 1]?.[1];
    await bridge?.pushInbound(new Uint8Array([0xfe, 0, 1, 1, 1, 0, 0, 0]));

    await expect(invokeWebCommand("recording_status")).resolves.toEqual(expect.objectContaining({
      kind: "recording",
      operation_id: "recording_start",
      file_name: "browser-flight.tlog",
      destination_path: expect.stringContaining("browser-save://browser-flight.tlog"),
      bytes_written: 16,
    }));
    await expect(invokeWebCommand("recording_stop")).resolves.toBeUndefined();

    await expect.poll(async () => (await invokeWebCommand<{ kind: string }>("recording_status")).kind).toBe("idle");
    const completed = await getBrowserPersistentStorage().listCompletedRecordings();
    expect(completed).toEqual(expect.arrayContaining([
      expect.objectContaining({ file_name: "browser-flight.tlog", bytes: expect.any(Uint8Array) }),
    ]));
    await expect(invokeWebCommand("log_library_list")).resolves.toEqual(expect.objectContaining({
      entries: expect.arrayContaining([expect.objectContaining({ entry_id: expect.stringContaining("browser-flight.tlog") })]),
    }));
  });

  it("starts auto recording after a web connect request opts in", async () => {
    await invokeWebCommand("connect_link", {
      request: { transport: { kind: "websocket", url: "ws://vehicle" }, auto_record_on_connect: true },
    });

    await expect(invokeWebCommand("recording_status")).resolves.toEqual(expect.objectContaining({
      kind: "recording",
      mode: "auto_on_connect",
      destination_path: expect.stringContaining("browser-storage://recordings/"),
    }));
    expect(wasmRuntimeMock.waitConnect).toHaveBeenCalled();
  });

  it("lists granted WebSerial firmware ports and installs through the wasm firmware bridge", async () => {
    webSerialFirmwareMock.isWebSerialFirmwareAvailable.mockReturnValue(true);
    webSerialFirmwareMock.listGrantedWebSerialFirmwarePorts.mockResolvedValue([{ port_name: "webserial:1", vid: 1155, pid: 22336, serial_number: null, manufacturer: null, product: "WebSerial device", location: "webserial:1" }]);

    await expect(invokeWebCommand("firmware_request_serial_port")).resolves.toEqual(expect.objectContaining({ port_name: "webserial:1" }));
    await expect(invokeWebCommand("firmware_list_ports")).resolves.toEqual({
      kind: "available",
      ports: [expect.objectContaining({ port_name: "webserial:1" })],
    });
    await expect(invokeWebCommand("firmware_install_update_preflight")).resolves.toEqual(expect.objectContaining({
      session_ready: true,
      available_ports: [expect.objectContaining({ port_name: "webserial:1" })],
    }));
    await expect(invokeWebCommand("firmware_install_update_readiness", {
      request: {
        port: "webserial:1",
        source: { kind: "local_apj_bytes", data: [1, 2, 3] },
        options: { full_chip_erase: false },
      },
    })).resolves.toEqual(expect.objectContaining({
      readiness: { kind: "advisory" },
      validation_pending: true,
    }));

    await expect(invokeWebCommand("firmware_install_update", {
      request: {
        port: "webserial:1",
        baud: 115200,
        source: { kind: "local_apj_bytes", data: [1, 2, 3] },
        options: { full_chip_erase: false },
      },
    })).resolves.toEqual({ result: "verified", board_id: 140, bootloader_rev: 5, port: "webserial:1" });
    expect(webSerialFirmwareMock.openWebSerialFirmwarePort).toHaveBeenCalledWith("webserial:1", 115200, expect.any(AbortSignal));
    expect(wasmContractMock.webSerialFirmwareInstallUpdate).toHaveBeenCalledWith(expect.objectContaining({
      portName: "webserial:1",
      source: { kind: "local_apj_bytes", data: [1, 2, 3] },
    }));
    await expect(invokeWebCommand("firmware_session_status")).resolves.toEqual({
      kind: "completed",
      outcome: {
        path: "firmware_install_update",
        outcome: { result: "verified", board_id: 140, bootloader_rev: 5, port: "webserial:1" },
      },
    });
  });

  it("fetches firmware catalog data with browser fetch and delegates catalog shaping to wasm", async () => {
    const manifestBytes = new Uint8Array([31, 139, 8, 0]);
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/manifest.json.gz")) {
        return responseBytes(manifestBytes);
      }
      if (url.endsWith("/Tools/Bootloaders/")) {
        return responseText('<a href="CubeOrange_bl.bin">CubeOrange_bl.bin</a>');
      }
      return responseText("missing", 404);
    }));

    await expect(invokeWebCommand("firmware_catalog_targets")).resolves.toEqual([
      expect.objectContaining({ board_id: 140, platform: "CubeOrange" }),
    ]);
    await expect(invokeWebCommand("firmware_catalog_entries", { boardId: 140, platform: "CubeOrange" })).resolves.toEqual([
      expect.objectContaining({ board_id: 140, platform: "CubeOrange", format: "apj" }),
    ]);
    await expect(invokeWebCommand("firmware_bootloader_catalog_targets")).resolves.toEqual([
      expect.objectContaining({ board_id: 140, platform: "CubeOrange" }),
    ]);

    expect(wasmContractMock.firmwareCatalogTargetsFromManifest).toHaveBeenCalledWith(manifestBytes);
    expect(wasmContractMock.firmwareCatalogEntriesFromManifest).toHaveBeenCalledWith(manifestBytes, 140, "CubeOrange");
    expect(wasmContractMock.firmwareBootloaderCatalogTargetsFromManifest).toHaveBeenCalledWith(
      manifestBytes,
      '<a href="CubeOrange_bl.bin">CubeOrange_bl.bin</a>',
    );
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
  });

  it("surfaces browser catalog fetch failures instead of returning empty catalog data", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }));

    await expect(invokeWebCommand("firmware_catalog_targets")).rejects.toThrow(
      "firmware catalog manifest fetch failed. Browser fetch may be blocked by network or CORS: Failed to fetch",
    );
  });

  it("downloads catalog URL firmware sources before invoking the wasm serial uploader", async () => {
    webSerialFirmwareMock.isWebSerialFirmwareAvailable.mockReturnValue(true);
    webSerialFirmwareMock.listGrantedWebSerialFirmwarePorts.mockResolvedValue([{ port_name: "webserial:1", vid: 1155, pid: 22336, serial_number: null, manufacturer: null, product: "WebSerial device", location: "webserial:1" }]);
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "https://firmware.example/CubeOrange.apj") {
        return responseBytes(new Uint8Array([7, 8, 9]));
      }
      return responseText("missing", 404);
    }));

    await expect(invokeWebCommand("firmware_install_update", {
      request: {
        port: "webserial:1",
        baud: 115200,
        source: { kind: "catalog_url", url: "https://firmware.example/CubeOrange.apj" },
        options: { full_chip_erase: false },
      },
    })).resolves.toEqual({ result: "verified", board_id: 140, bootloader_rev: 5, port: "webserial:1" });

    expect(wasmContractMock.webSerialFirmwareInstallUpdate).toHaveBeenCalledWith(expect.objectContaining({
      source: { kind: "local_apj_bytes", data: [7, 8, 9] },
    }));
    await invokeWebCommand("firmware_session_clear_completed");
  });

  it("keeps pure-web DFU and bootloader installation explicitly unsupported", async () => {
    await expect(invokeWebCommand("firmware_list_dfu_devices")).resolves.toEqual(expect.objectContaining({
      kind: "unsupported",
      reason: expect.stringContaining("WebUSB/DFU"),
    }));
    await expect(invokeWebCommand("firmware_bootloader_installation")).resolves.toEqual(expect.objectContaining({
      result: "platform_unsupported",
      reason: expect.stringContaining("WebUSB/DFU"),
    }));
  });

  it("returns benign empty results for browser transport probes", async () => {
    await expect(invokeWebCommand("list_serial_ports_cmd")).resolves.toEqual([]);
    await expect(invokeWebCommand("bt_scan_ble")).resolves.toEqual([]);
    await expect(invokeWebCommand("bt_get_bonded_devices")).resolves.toEqual([]);
    await expect(invokeWebCommand("bt_request_permissions")).resolves.toBeUndefined();
    await expect(invokeWebCommand("bt_stop_scan_ble")).resolves.toBeUndefined();
  });

  it("rejects unknown commands clearly", async () => {
    await expect(invokeWebCommand("unknown_oracle_command")).rejects.toThrow(
      "unknown_oracle_command is not available in the browser-only web runtime",
    );
    await expect(invokeWebCommand("unknown_oracle_command")).rejects.not.toThrow("not wired");
  });
});

function responseBytes(bytes: Uint8Array, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    text: async () => new TextDecoder().decode(bytes),
  } as Response;
}

function responseText(text: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    arrayBuffer: async () => new TextEncoder().encode(text).buffer,
    text: async () => text,
  } as Response;
}

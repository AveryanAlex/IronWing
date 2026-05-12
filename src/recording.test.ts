import { beforeEach, describe, expect, it, vi } from "vitest";

import { loadSettings, SETTINGS_STORAGE_KEY } from "./lib/stores/settings";
import {
  getRecordingSettings,
  getRecordingStatus,
  saveRecordingSettings,
  startRecording,
  startRecordingWithRequest,
  stopRecording,
  type RecordingSettingsResult,
  type RecordingStatus,
  withPersistedRecordingSettings,
} from "./recording";

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}));

vi.mock("@platform/core", () => ({
  invoke: invokeMock,
}));

function createStorage(rawSettings?: Record<string, unknown>) {
  const values = new Map<string, string>();
  if (rawSettings) {
    values.set(SETTINGS_STORAGE_KEY, JSON.stringify(rawSettings));
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

function backendSettingsResult(
  autoRecordOnConnect = false,
): RecordingSettingsResult {
  return {
    operation_id: "recording_settings_read",
    settings: {
      auto_record_on_connect: autoRecordOnConnect,
      auto_record_directory: "/tmp/ironwing/logs/recordings",
      filename_template: "YYYY-MM-DD_HH-MM-SS_{vehicle-or-sysid-or-unknown}.tlog",
      add_completed_recordings_to_library: true,
    },
  };
}

describe("recording bridge", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("defaults auto-record opt-in to disabled when ironwing.settings is empty", async () => {
    const storage = createStorage();
    invokeMock.mockResolvedValue(backendSettingsResult());

    const result = await getRecordingSettings(storage);

    expect(result.settings.auto_record_on_connect).toBe(false);
    expect(invokeMock).toHaveBeenCalledWith("recording_settings_read");
  });

  it("persists the auto-record opt-in in ironwing.settings without dropping existing settings", async () => {
    const storage = createStorage({
      telemetryRateHz: 8,
      cruiseSpeedMps: 17,
    });
    invokeMock.mockResolvedValue({
      operation_id: "recording_settings_write",
      settings: backendSettingsResult().settings,
    } satisfies RecordingSettingsResult);

    const result = await saveRecordingSettings(
      {
        auto_record_on_connect: true,
        auto_record_directory: "/ignored/by/backend",
        filename_template: "ignored",
        add_completed_recordings_to_library: false,
      },
      storage,
    );

    expect(result.settings.auto_record_on_connect).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith("recording_settings_write", {
      settings: {
        auto_record_on_connect: true,
        auto_record_directory: "/ignored/by/backend",
        filename_template: "ignored",
        add_completed_recordings_to_library: false,
      },
    });
    expect(loadSettings(storage)).toMatchObject({
      telemetryRateHz: 8,
      cruiseSpeedMps: 17,
      recordingAutoRecordOnConnect: true,
    });
  });

  it("hydrates a previously persisted opt-in over backend defaults", async () => {
    const storage = createStorage({
      recordingAutoRecordOnConnect: true,
    });
    invokeMock.mockResolvedValue(backendSettingsResult(false));

    const result = await getRecordingSettings(storage);

    expect(result.settings.auto_record_on_connect).toBe(true);
  });

  it("applies the persisted auto-record opt-in to connect requests", () => {
    const storage = createStorage({
      recordingAutoRecordOnConnect: true,
    });

    expect(
      withPersistedRecordingSettings(
        {
          transport: { kind: "tcp", address: "127.0.0.1:5760" },
        },
        storage,
      ),
    ).toEqual({
      transport: { kind: "tcp", address: "127.0.0.1:5760" },
      auto_record_on_connect: true,
    });
  });

  it("forwards manual and auto recording start requests through invoke", async () => {
    invokeMock.mockResolvedValue("flight-001.tlog");

    await startRecording("/tmp/flight-001.tlog");
    await startRecordingWithRequest({
      destination_path: "",
      mode: "auto_on_connect",
    });

    expect(invokeMock).toHaveBeenNthCalledWith(1, "recording_start", {
      request: {
        destination_path: "/tmp/flight-001.tlog",
        mode: "manual",
      },
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, "recording_start", {
      request: {
        destination_path: "",
        mode: "auto_on_connect",
      },
    });
  });

  it("returns failed recording status payloads unchanged", async () => {
    const failedStatus: RecordingStatus = {
      kind: "failed",
      failure: {
        operation_id: "recording_start",
        reason: {
          kind: "failed",
          message: "disk full",
        },
      },
    };
    invokeMock.mockResolvedValue(failedStatus);

    await expect(getRecordingStatus()).resolves.toEqual(failedStatus);
    expect(invokeMock).toHaveBeenCalledWith("recording_status");
  });

  it("stops recordings through invoke", async () => {
    invokeMock.mockResolvedValue(undefined);

    await stopRecording();

    expect(invokeMock).toHaveBeenCalledWith("recording_stop");
  });
});

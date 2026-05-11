import { invoke } from "@platform/core";
import { getBrowserStorage } from "./lib/local-storage";
import { loadSettings, persistSettings } from "./lib/stores/settings";
import type { OperationFailure, OperationId } from "./session";
import type { ConnectRequest } from "./transport";

export type RecordingStatus =
  | { kind: "idle" }
  | {
      kind: "recording";
      operation_id: "recording_start";
      mode: RecordingMode;
      file_name: string;
      destination_path: string;
      bytes_written: number;
      started_at_unix_msec: number;
    }
  | {
      kind: "stopping";
      operation_id: "recording_stop";
      file_name: string;
      destination_path: string;
      bytes_written: number;
    }
  | { kind: "failed"; failure: OperationFailure };

export type RecordingMode = "manual" | "auto_on_connect";

export type RecordingSettings = {
  auto_record_on_connect: boolean;
  auto_record_directory: string;
  filename_template: string;
  add_completed_recordings_to_library: boolean;
};

export type RecordingStartRequest = {
  destination_path: string;
  mode: RecordingMode;
};

export type RecordingSettingsResult = {
  operation_id: OperationId;
  settings: RecordingSettings;
};

export type RecordingFailure = {
  operation_id: OperationId;
  reason: OperationFailure["reason"];
  destination_path: string | null;
};

type StorageLike = Pick<Storage, "getItem" | "setItem"> | null;

export type RecordingAwareConnectRequest = ConnectRequest & {
  auto_record_on_connect: boolean;
};

export async function startRecording(path: string): Promise<string> {
  return startRecordingWithRequest({
    destination_path: path,
    mode: "manual",
  });
}

export async function startRecordingWithRequest(request: RecordingStartRequest): Promise<string> {
  return invoke<string>("recording_start", { request });
}

export async function stopRecording(): Promise<void> {
  return invoke<void>("recording_stop");
}

export async function getRecordingStatus(): Promise<RecordingStatus> {
  return invoke<RecordingStatus>("recording_status");
}

export function withPersistedRecordingSettings(
  request: ConnectRequest,
  storage: Pick<Storage, "getItem"> | null = getBrowserStorage(),
): RecordingAwareConnectRequest {
  return {
    ...request,
    auto_record_on_connect: loadSettings(storage).recordingAutoRecordOnConnect,
  };
}

export async function getRecordingSettings(
  storage: StorageLike = getBrowserStorage(),
): Promise<RecordingSettingsResult> {
  const result = await invoke<RecordingSettingsResult>("recording_settings_read");
  return {
    ...result,
    settings: {
      ...result.settings,
      auto_record_on_connect: loadSettings(storage).recordingAutoRecordOnConnect,
    },
  };
}

export async function saveRecordingSettings(
  settings: RecordingSettings,
  storage: StorageLike = getBrowserStorage(),
): Promise<RecordingSettingsResult> {
  const result = await invoke<RecordingSettingsResult>("recording_settings_write", { settings });
  const nextSettings = {
    ...result.settings,
    auto_record_on_connect: settings.auto_record_on_connect,
  };
  const persistedSettings = loadSettings(storage);
  persistSettings(
    {
      ...persistedSettings,
      recordingAutoRecordOnConnect: nextSettings.auto_record_on_connect,
    },
    storage,
  );
  return {
    ...result,
    settings: nextSettings,
  };
}

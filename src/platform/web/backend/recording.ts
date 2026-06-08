import { saveBrowserBytes } from "./browser-files";
import { getBrowserPersistentStorage } from "./browser-storage";
import { definePlatformCommandHandlers } from "./command-handler";
import { registerBrowserLogBytes } from "./logs";
import type { BrowserFileMetadata, BrowserSaveResult } from "./browser-files";
import type { RecordingMode, RecordingSettings, RecordingSettingsResult, RecordingStartRequest, RecordingStatus } from "../../../recording";
import type { OperationFailure } from "../../../session";
import type { WasmByteBridge } from "../types";

const AUTO_RECORD_FILENAME_TEMPLATE = "YYYY-MM-DD_HH-MM-SS_{vehicle-or-sysid-or-unknown}.tlog";
const TLOG_MIME_TYPE = "application/octet-stream";

export const DEFAULT_WEB_RECORDING_SETTINGS: RecordingSettings = {
  auto_record_on_connect: false,
  auto_record_directory: "browser-storage://recordings",
  filename_template: AUTO_RECORD_FILENAME_TEMPLATE,
  add_completed_recordings_to_library: true,
};

type ActiveRecording = {
  mode: RecordingMode;
  fileName: string;
  destinationPath: string;
  startedAtUnixMsec: number;
  parser: MavlinkTlogFrameRecorder;
  chunks: Uint8Array[];
  bytesWritten: number;
};

type StoppingRecording = {
  fileName: string;
  destinationPath: string;
  bytesWritten: number;
};

let webRecordingSettings: RecordingSettings = { ...DEFAULT_WEB_RECORDING_SETTINGS };
let activeRecording: ActiveRecording | null = null;
let stoppingRecording: StoppingRecording | null = null;
let failedRecording: OperationFailure | null = null;

export const recordingCommandHandlers = definePlatformCommandHandlers({
  recording_start: ({ request }) => startWebRecording(request),
  recording_stop: () => stopWebRecording(),
  recording_status: () => webRecordingStatus(),
  recording_settings_read: () => ({
    operation_id: "recording_settings_read",
    settings: webRecordingSettings,
  }) satisfies RecordingSettingsResult,
  recording_settings_write: ({ settings }) => writeWebRecordingSettings(settings),
});

export function observeRecordingInboundBridge(bridge: WasmByteBridge): WasmByteBridge {
  return {
    close: () => bridge.close(),
    free: () => bridge.free(),
    [Symbol.dispose]: () => bridge[Symbol.dispose](),
    isClosed: () => bridge.isClosed(),
    nextOutbound: () => bridge.nextOutbound(),
    pushInbound: async (bytes: Uint8Array) => {
      appendRecordingTransportBytes(bytes);
      await bridge.pushInbound(bytes);
    },
  } as WasmByteBridge;
}

export function startAutoRecordingOnConnect(enabled: boolean): string | null {
  if (!enabled) {
    return null;
  }
  return startWebRecording({ destination_path: "", mode: "auto_on_connect" });
}

export function stopWebRecording(options: { saveToUserDestination?: boolean } = {}): void {
  if (!activeRecording) {
    return;
  }

  const recording = activeRecording;
  activeRecording = null;
  stoppingRecording = {
    fileName: recording.fileName,
    destinationPath: recording.destinationPath,
    bytesWritten: recording.bytesWritten,
  };

  void finalizeRecording(recording, options.saveToUserDestination ?? true)
    .then(() => {
      if (stoppingRecording?.fileName === recording.fileName) {
        stoppingRecording = null;
      }
    })
    .catch((error) => {
      stoppingRecording = null;
      failedRecording = operationFailure("recording_stop", errorMessage(error));
    });
}

export function resetWebRecordingStateForTests(): void {
  webRecordingSettings = { ...DEFAULT_WEB_RECORDING_SETTINGS };
  activeRecording = null;
  stoppingRecording = null;
  failedRecording = null;
}

function startWebRecording(request: Partial<RecordingStartRequest>): string {
  if (activeRecording || stoppingRecording) {
    failedRecording = operationFailure("recording_start", "already recording");
    throw new Error("already recording");
  }

  const mode = request.mode ?? "manual";
  const fileName = recordingFileName(request.destination_path, mode);
  const destinationPath = browserRecordingDestination(fileName, mode, request.destination_path);
  activeRecording = {
    mode,
    fileName,
    destinationPath,
    startedAtUnixMsec: Date.now(),
    parser: new MavlinkTlogFrameRecorder(),
    chunks: [],
    bytesWritten: 0,
  };
  failedRecording = null;
  return fileName;
}

function appendRecordingTransportBytes(bytes: Uint8Array): void {
  if (!activeRecording || bytes.byteLength === 0) {
    return;
  }

  for (const frame of activeRecording.parser.push(bytes)) {
    const chunk = tlogRecord(frame, Math.trunc(Date.now() * 1000));
    activeRecording.chunks.push(chunk);
    activeRecording.bytesWritten += chunk.byteLength;
  }
}

async function finalizeRecording(recording: ActiveRecording, saveToUserDestination: boolean): Promise<void> {
  const bytes = concatBytes(recording.chunks, recording.bytesWritten);
  const completedAtUnixMsec = Date.now();
  const recordingId = `recording-${recording.startedAtUnixMsec}-${sanitizeFileName(recording.fileName)}`;
  let saveResult: BrowserSaveResult | null = null;
  let saveError: unknown = null;

  if (saveToUserDestination && recording.mode === "manual") {
    try {
      saveResult = await saveBrowserBytes(bytes, {
        suggested_name: recording.fileName,
        mime_type: TLOG_MIME_TYPE,
        accepts: [{ description: "MAVLink telemetry log", extensions: [".tlog"], mime_types: [TLOG_MIME_TYPE] }],
      });
    } catch (error) {
      saveError = error;
    }
  }

  const destinationPath = saveResult?.metadata.pseudo_path ?? `browser-storage://recordings/${encodeURIComponent(recordingId)}`;
  await getBrowserPersistentStorage().putCompletedRecording({
    recording_id: recordingId,
    file_name: recording.fileName,
    destination_path: destinationPath,
    bytes,
    started_at_unix_msec: recording.startedAtUnixMsec,
    completed_at_unix_msec: completedAtUnixMsec,
    content_type: TLOG_MIME_TYPE,
  });

  if (webRecordingSettings.add_completed_recordings_to_library) {
    await registerBrowserLogBytes(
      saveResult?.metadata ?? browserStoredRecordingMetadata(recordingId, recording.fileName, bytes.byteLength, completedAtUnixMsec, destinationPath),
      bytes,
      recordingId,
    );
  }

  if (saveError) {
    throw saveError;
  }
}

function writeWebRecordingSettings(settings: Partial<RecordingSettings>): RecordingSettingsResult {
  webRecordingSettings = {
    ...webRecordingSettings,
    ...settings,
    auto_record_on_connect: settings.auto_record_on_connect ?? webRecordingSettings.auto_record_on_connect,
    auto_record_directory: settings.auto_record_directory ?? webRecordingSettings.auto_record_directory,
    filename_template: settings.filename_template || webRecordingSettings.filename_template,
    add_completed_recordings_to_library: settings.add_completed_recordings_to_library ?? webRecordingSettings.add_completed_recordings_to_library,
  };
  return {
    operation_id: "recording_settings_write",
    settings: webRecordingSettings,
  };
}

function webRecordingStatus(): RecordingStatus {
  if (failedRecording) {
    return { kind: "failed", failure: failedRecording };
  }
  if (stoppingRecording) {
    return {
      kind: "stopping",
      operation_id: "recording_stop",
      file_name: stoppingRecording.fileName,
      destination_path: stoppingRecording.destinationPath,
      bytes_written: stoppingRecording.bytesWritten,
    };
  }
  if (activeRecording) {
    return {
      kind: "recording",
      operation_id: "recording_start",
      mode: activeRecording.mode,
      file_name: activeRecording.fileName,
      destination_path: activeRecording.destinationPath,
      bytes_written: activeRecording.bytesWritten,
      started_at_unix_msec: activeRecording.startedAtUnixMsec,
    };
  }
  return { kind: "idle" };
}

function browserRecordingDestination(fileName: string, mode: RecordingMode, requestedPath: string | undefined): string {
  if (mode === "auto_on_connect") {
    return `browser-storage://recordings/${encodeURIComponent(fileName)}`;
  }
  const requested = requestedPath?.trim();
  return requested ? `browser-save://${encodeURIComponent(fileName)}?requested=${encodeURIComponent(requested)}` : `browser-save://${encodeURIComponent(fileName)}`;
}

function recordingFileName(destinationPath: string | undefined, mode: RecordingMode): string {
  const candidate = destinationPath?.trim();
  if (mode === "manual" && candidate) {
    return ensureTlogExtension(baseName(candidate));
  }
  return ensureTlogExtension(renderRecordingTemplate(webRecordingSettings.filename_template || AUTO_RECORD_FILENAME_TEMPLATE));
}

function renderRecordingTemplate(template: string): string {
  const now = new Date();
  return template
    .replace(/YYYY/g, String(now.getUTCFullYear()).padStart(4, "0"))
    .replace(/MM/g, String(now.getUTCMonth() + 1).padStart(2, "0"))
    .replace(/DD/g, String(now.getUTCDate()).padStart(2, "0"))
    .replace(/HH/g, String(now.getUTCHours()).padStart(2, "0"))
    .replace(/mm/g, String(now.getUTCMinutes()).padStart(2, "0"))
    .replace(/SS/g, String(now.getUTCSeconds()).padStart(2, "0"))
    .replace(/\{vehicle-or-sysid-or-unknown\}/g, "unknown");
}

function baseName(path: string): string {
  const segments = path.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] || "recording.tlog";
}

function ensureTlogExtension(fileName: string): string {
  return fileName.toLowerCase().endsWith(".tlog") ? fileName : `${fileName}.tlog`;
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9_.-]/g, "_");
}

function browserStoredRecordingMetadata(
  recordingId: string,
  fileName: string,
  sizeBytes: number,
  modifiedUnixMsec: number,
  pseudoPath: string,
): BrowserFileMetadata {
  return {
    id: recordingId,
    name: fileName,
    size_bytes: sizeBytes,
    modified_unix_msec: modifiedUnixMsec,
    mime_type: TLOG_MIME_TYPE,
    pseudo_path: pseudoPath,
  };
}

function tlogRecord(frame: Uint8Array, timestampUsec: number): Uint8Array {
  const record = new Uint8Array(8 + frame.byteLength);
  const view = new DataView(record.buffer);
  view.setUint32(0, timestampUsec >>> 0, true);
  view.setUint32(4, Math.floor(timestampUsec / 0x1_0000_0000), true);
  record.set(frame, 8);
  return record;
}

function concatBytes(chunks: Uint8Array[], totalLength: number): Uint8Array {
  const bytes = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function operationFailure(operationId: OperationFailure["operation_id"], message: string): OperationFailure {
  return {
    operation_id: operationId,
    reason: { kind: "failed", message },
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

class MavlinkTlogFrameRecorder {
  #pending = new Uint8Array();

  push(chunk: Uint8Array): Uint8Array[] {
    const buffer = concatBytes([this.#pending, chunk], this.#pending.byteLength + chunk.byteLength);
    const frames: Uint8Array[] = [];
    let offset = 0;

    while (offset < buffer.byteLength) {
      const start = findFrameStart(buffer, offset);
      if (start < 0) {
        offset = buffer.byteLength;
        break;
      }
      if (start > offset) {
        offset = start;
      }

      const frameLength = mavlinkFrameLength(buffer, offset);
      if (frameLength == null) {
        break;
      }
      frames.push(buffer.slice(offset, offset + frameLength));
      offset += frameLength;
    }

    this.#pending = buffer.slice(offset);
    return frames;
  }
}

function findFrameStart(buffer: Uint8Array, offset: number): number {
  for (let i = offset; i < buffer.byteLength; i += 1) {
    if (buffer[i] === 0xfe || buffer[i] === 0xfd) {
      return i;
    }
  }
  return -1;
}

function mavlinkFrameLength(buffer: Uint8Array, offset: number): number | null {
  const marker = buffer[offset];
  if (marker === 0xfe) {
    if (buffer.byteLength - offset < 2) return null;
    const length = 8 + buffer[offset + 1];
    return buffer.byteLength - offset >= length ? length : null;
  }
  if (marker === 0xfd) {
    if (buffer.byteLength - offset < 10) return null;
    const length = 12 + buffer[offset + 1] + ((buffer[offset + 2] & 0x01) === 0x01 ? 13 : 0);
    return buffer.byteLength - offset >= length ? length : null;
  }
  return null;
}

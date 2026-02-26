import { invoke } from "@tauri-apps/api/core";

export type RecordingStatus =
  | "idle"
  | { recording: { file_name: string; bytes_written: number } };

export async function startRecording(path: string): Promise<string> {
  return invoke<string>("recording_start", { path });
}

export async function stopRecording(): Promise<void> {
  return invoke<void>("recording_stop");
}

export async function getRecordingStatus(): Promise<RecordingStatus> {
  return invoke<RecordingStatus>("recording_status");
}

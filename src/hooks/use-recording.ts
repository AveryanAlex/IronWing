import { useEffect, useState, useCallback, useRef } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import {
  startRecording,
  stopRecording,
  getRecordingStatus,
  type RecordingStatus,
} from "../recording";

export function useRecording(connected: boolean) {
  const [status, setStatus] = useState<RecordingStatus>("idle");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isRecording = status !== "idle";

  // Poll status while recording
  useEffect(() => {
    if (isRecording) {
      pollRef.current = setInterval(async () => {
        try {
          setStatus(await getRecordingStatus());
        } catch {
          // ignore poll errors
        }
      }, 2000);
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [isRecording]);

  // Reset to idle when disconnected
  useEffect(() => {
    if (!connected) {
      setStatus("idle");
    }
  }, [connected]);

  const start = useCallback(async () => {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, "0");
    const defaultName = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}.tlog`;

    const path = await save({
      defaultPath: defaultName,
      filters: [{ name: "TLOG Files", extensions: ["tlog"] }],
    });
    if (!path) return;

    try {
      const fileName = await startRecording(path);
      setStatus({ recording: { file_name: fileName, bytes_written: 0 } });
      toast.success("Recording started", { description: fileName });
    } catch (err) {
      toast.error("Failed to start recording", {
        description:
          typeof err === "string"
            ? err
            : err instanceof Error
              ? err.message
              : "unexpected error",
      });
    }
  }, []);

  const stop = useCallback(async () => {
    try {
      await stopRecording();
      setStatus("idle");
      toast.success("Recording stopped");
    } catch (err) {
      toast.error("Failed to stop recording", {
        description:
          typeof err === "string"
            ? err
            : err instanceof Error
              ? err.message
              : "unexpected error",
      });
    }
  }, []);

  return { status, isRecording, start, stop };
}

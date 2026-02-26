import { useEffect, useState, useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import {
  openLog,
  closeLog,
  queryLogMessages,
  subscribeLogProgress,
  type LogSummary,
  type LogProgress,
  type LogDataPoint,
} from "../logs";

export function useLogs() {
  const [summary, setSummary] = useState<LogSummary | null>(null);
  const [progress, setProgress] = useState<LogProgress | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let stop: (() => void) | null = null;
    (async () => {
      stop = await subscribeLogProgress(setProgress);
    })();
    return () => { stop?.(); };
  }, []);

  const openFile = useCallback(async () => {
    const path = await open({
      filters: [{ name: "TLOG Files", extensions: ["tlog"] }],
      multiple: false,
    });
    if (!path) return;

    setLoading(true);
    setProgress(null);
    try {
      const result = await openLog(path);
      setSummary(result);
      toast.success("Log loaded", {
        description: `${result.total_entries} entries, ${result.duration_secs.toFixed(1)}s`,
      });
    } catch (err) {
      toast.error("Failed to open log", {
        description: typeof err === "string" ? err : err instanceof Error ? err.message : "unexpected error",
      });
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const closeFile = useCallback(async () => {
    try {
      await closeLog();
      setSummary(null);
      setProgress(null);
    } catch (err) {
      toast.error("Failed to close log", {
        description: typeof err === "string" ? err : err instanceof Error ? err.message : "unexpected error",
      });
    }
  }, []);

  const queryMessages = useCallback(
    async (
      msgType: string,
      startUsec?: number,
      endUsec?: number,
      maxPoints?: number,
    ): Promise<LogDataPoint[]> => {
      return queryLogMessages(msgType, startUsec, endUsec, maxPoints);
    },
    [],
  );

  return { summary, progress, loading, openFile, closeFile, queryMessages };
}

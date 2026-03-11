import { useState, useEffect, useCallback, useMemo } from "react";
import { Check, X, Loader2, Play, RotateCw } from "lucide-react";
import {
  calibrateCompassStart,
  calibrateCompassAccept,
  calibrateCompassCancel,
  rebootVehicle,
} from "../../../calibration";
import {
  subscribeCompassCalProgress,
  subscribeCompassCalReport,
  type MagCalProgress,
  type MagCalReport,
  type MagCalStatus,
} from "../../../sensor-health";
import type { ParamStore } from "../../../params";
import { toast } from "sonner";

type CalibState = "idle" | "in_progress" | "success" | "failed" | "accepting";

type CompassCalibWizardProps = {
  connected: boolean;
  params: { paramStore: ParamStore | null };
};

export function CompassCalibWizard({ connected, params }: CompassCalibWizardProps) {
  const [state, setState] = useState<CalibState>("idle");
  const [progressMap, setProgressMap] = useState<Map<number, MagCalProgress>>(new Map());
  const [reports, setReports] = useState<Map<number, MagCalReport>>(new Map());
  const [errorStatus, setErrorStatus] = useState<MagCalStatus | null>(null);

  // Detect compass count from params
  const compassCount = useMemo(() => {
    const store = params.paramStore;
    if (!store) return 0;
    const ids = [
      store.params["COMPASS_DEV_ID"]?.value,
      store.params["COMPASS_DEV_ID2"]?.value,
      store.params["COMPASS_DEV_ID3"]?.value,
    ];
    return ids.filter((v) => v !== undefined && v !== 0).length;
  }, [params.paramStore]);

  // Subscribe to compass cal progress/report events
  useEffect(() => {
    if (state !== "in_progress" && state !== "accepting") return;

    let unlistenProgress: (() => void) | null = null;
    let unlistenReport: (() => void) | null = null;

    (async () => {
      unlistenProgress = await subscribeCompassCalProgress((progress) => {
        setProgressMap((prev) => {
          const next = new Map(prev);
          next.set(progress.compass_id, progress);
          return next;
        });
      });

      unlistenReport = await subscribeCompassCalReport((report) => {
        setReports((prev) => {
          const next = new Map(prev);
          next.set(report.compass_id, report);
          return next;
        });

        if (report.status === "success") {
          // Check if all compasses have reported success
          setReports((prev) => {
            const allSuccess = Array.from(prev.values()).every((r) => r.status === "success");
            if (allSuccess && prev.size >= Math.max(compassCount, 1)) {
              setState("success");
            }
            return prev;
          });
        } else if (
          report.status === "failed" ||
          report.status === "bad_orientation" ||
          report.status === "bad_radius"
        ) {
          setErrorStatus(report.status);
          setState("failed");
        }
      });
    })();

    return () => {
      unlistenProgress?.();
      unlistenReport?.();
    };
  }, [state, compassCount]);

  const startCalibration = useCallback(async () => {
    setState("in_progress");
    setProgressMap(new Map());
    setReports(new Map());
    setErrorStatus(null);
    try {
      await calibrateCompassStart(0);
    } catch (err) {
      toast.error("Compass calibration command rejected", {
        description: err instanceof Error ? err.message : String(err),
      });
      setState("failed");
    }
  }, []);

  const acceptCalibration = useCallback(async () => {
    setState("accepting");
    try {
      await calibrateCompassAccept(0);
      toast.success("Compass calibration accepted");
    } catch (err) {
      toast.error("Failed to accept calibration", {
        description: err instanceof Error ? err.message : String(err),
      });
      setState("failed");
    }
  }, []);

  const cancelCalibration = useCallback(async () => {
    try {
      await calibrateCompassCancel(0);
    } catch {
      // Ignore cancel errors
    }
    setState("idle");
    setProgressMap(new Map());
    setReports(new Map());
  }, []);

  const handleReboot = useCallback(async () => {
    try {
      await rebootVehicle();
      toast.success("Reboot command sent");
    } catch (err) {
      toast.error("Reboot failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  const reset = () => {
    setState("idle");
    setProgressMap(new Map());
    setReports(new Map());
    setErrorStatus(null);
  };

  const statusLabel = (status: MagCalStatus): string => {
    switch (status) {
      case "running_step_one": return "Step 1";
      case "running_step_two": return "Step 2";
      case "waiting_to_start": return "Waiting...";
      case "success": return "Complete";
      case "failed": return "Failed";
      case "bad_orientation": return "Bad Orientation";
      case "bad_radius": return "Bad Radius";
      default: return status;
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-text-primary">Compass Calibration</h3>
          <p className="text-[11px] text-text-muted">
            {compassCount > 0
              ? `${compassCount} compass${compassCount > 1 ? "es" : ""} detected. Rotate vehicle in all orientations.`
              : "No compasses detected. Connect vehicle to detect sensors."}
          </p>
        </div>
        {state === "idle" && (
          <button
            onClick={startCalibration}
            disabled={!connected || compassCount === 0}
            className="flex items-center gap-1.5 rounded-md bg-accent-blue px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
          >
            <Play size={12} />
            Start
          </button>
        )}
        {(state === "failed") && (
          <button
            onClick={reset}
            className="flex items-center gap-1.5 rounded-md border border-border bg-bg-secondary px-3 py-1.5 text-xs font-medium text-text-primary"
          >
            <RotateCw size={12} />
            Retry
          </button>
        )}
      </div>

      {/* Progress bars per compass */}
      {state === "in_progress" && (
        <div className="flex flex-col gap-2">
          {Array.from(progressMap.entries())
            .sort(([a], [b]) => a - b)
            .map(([id, progress]) => (
              <div key={id} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-medium text-text-primary">Compass {id + 1}</span>
                  <span className="text-text-muted">{statusLabel(progress.status)} — {Math.round(progress.completion_pct)}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-bg-tertiary">
                  <div
                    className="h-full rounded-full bg-accent-blue transition-all duration-300"
                    style={{ width: `${Math.min(100, progress.completion_pct)}%` }}
                  />
                </div>
              </div>
            ))}
          <button
            onClick={cancelCalibration}
            className="mt-1 flex items-center gap-1.5 self-start rounded-md border border-border bg-bg-secondary px-3 py-1.5 text-xs font-medium text-text-primary"
          >
            <X size={12} />
            Cancel
          </button>
        </div>
      )}

      {/* Accepting state */}
      {state === "accepting" && (
        <div className="flex items-center gap-2 rounded bg-accent-blue/10 px-3 py-2 text-xs text-accent-blue">
          <Loader2 size={14} className="animate-spin" />
          Accepting calibration...
        </div>
      )}

      {/* Success with fitness + accept + reboot */}
      {state === "success" && (
        <div className="flex flex-col gap-2">
          {Array.from(reports.entries())
            .sort(([a], [b]) => a - b)
            .map(([id, report]) => (
              <div key={id} className="flex items-center justify-between rounded bg-success/10 px-3 py-2 text-xs">
                <div className="flex items-center gap-2 text-success">
                  <Check size={14} />
                  Compass {id + 1}
                </div>
                <span className="font-mono text-text-muted">fitness {report.fitness.toFixed(3)}</span>
              </div>
            ))}

          <div className="flex items-center gap-2">
            <button
              onClick={acceptCalibration}
              className="flex items-center gap-1.5 rounded-md bg-success px-3 py-1.5 text-xs font-medium text-white"
            >
              <Check size={12} />
              Accept
            </button>
            <button
              onClick={reset}
              className="flex items-center gap-1.5 rounded-md border border-border bg-bg-secondary px-3 py-1.5 text-xs font-medium text-text-primary"
            >
              Discard
            </button>
          </div>

          <div className="flex items-center gap-2 rounded border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
            <span>Reboot required after accepting calibration.</span>
            <button
              onClick={handleReboot}
              className="ml-auto shrink-0 rounded bg-warning px-2 py-1 text-[11px] font-medium text-white"
            >
              Reboot Now
            </button>
          </div>
        </div>
      )}

      {/* Failed state */}
      {state === "failed" && (
        <div className="flex items-center gap-2 rounded bg-danger/10 px-3 py-2 text-xs text-danger">
          <X size={14} />
          Calibration failed{errorStatus ? `: ${statusLabel(errorStatus)}` : ""}
        </div>
      )}
    </div>
  );
}

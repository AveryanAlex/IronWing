import { useState, useEffect, useCallback } from "react";
import { Check, X, Loader2, Play } from "lucide-react";
import { calibrateAccel } from "../../calibration";
import { subscribeStatusText, type StatusMessage } from "../../statustext";
import { toast } from "sonner";

const POSITIONS = [
  { id: "level", label: "Level", description: "Place vehicle level on a flat surface" },
  { id: "nose-down", label: "Nose Down", description: "Point nose straight down" },
  { id: "nose-up", label: "Nose Up", description: "Point nose straight up" },
  { id: "left", label: "Left Side", description: "Roll vehicle onto left side" },
  { id: "right", label: "Right Side", description: "Roll vehicle onto right side" },
  { id: "back", label: "Back/Inverted", description: "Place vehicle upside down" },
] as const;

type CalibState = "idle" | "running" | "success" | "failed";
type PositionState = "pending" | "active" | "done";

export function AccelCalibWizard({ connected }: { connected: boolean }) {
  const [state, setState] = useState<CalibState>("idle");
  const [positions, setPositions] = useState<Record<string, PositionState>>(() =>
    Object.fromEntries(POSITIONS.map((p) => [p.id, "pending" as PositionState])),
  );
  const [lastStatus, setLastStatus] = useState("");

  // Listen to STATUSTEXT for position prompts from ArduPilot
  useEffect(() => {
    if (state !== "running") return;

    let unlisten: (() => void) | null = null;

    const handleStatus = (msg: StatusMessage) => {
      const text = msg.text.toLowerCase();
      setLastStatus(msg.text);

      // ArduPilot sends messages like "Place vehicle level and press any key"
      // or "Calibration successful" / "Calibration FAILED"
      if (text.includes("calibration successful") || text.includes("calibration complete")) {
        setState("success");
        setPositions((prev) => {
          const next = { ...prev };
          for (const key of Object.keys(next)) {
            if (next[key] === "active") next[key] = "done";
          }
          return next;
        });
      } else if (text.includes("calibration failed") || text.includes("cal failed")) {
        setState("failed");
      } else if (text.includes("place vehicle")) {
        // Mark appropriate position as active
        setPositions((prev) => {
          const next = { ...prev };
          // Mark previously active as done
          for (const key of Object.keys(next)) {
            if (next[key] === "active") next[key] = "done";
          }
          // Determine which position from text
          if (text.includes("level")) next["level"] = "active";
          else if (text.includes("nose down") || text.includes("nosedown")) next["nose-down"] = "active";
          else if (text.includes("nose up") || text.includes("noseup")) next["nose-up"] = "active";
          else if (text.includes("left")) next["left"] = "active";
          else if (text.includes("right") && !text.includes("upright")) next["right"] = "active";
          else if (text.includes("back") || text.includes("inverted")) next["back"] = "active";
          return next;
        });
      }
    };

    (async () => {
      unlisten = await subscribeStatusText(handleStatus);
    })();

    return () => { unlisten?.(); };
  }, [state]);

  const startCalibration = useCallback(async () => {
    setState("running");
    setLastStatus("");
    setPositions(Object.fromEntries(POSITIONS.map((p) => [p.id, "pending" as PositionState])));
    try {
      await calibrateAccel();
    } catch (err) {
      toast.error("Accel calibration command rejected", {
        description: err instanceof Error ? err.message : String(err),
      });
      setState("failed");
    }
  }, []);

  const reset = () => {
    setState("idle");
    setLastStatus("");
    setPositions(Object.fromEntries(POSITIONS.map((p) => [p.id, "pending" as PositionState])));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-text-primary">Accelerometer Calibration</h3>
          <p className="text-[11px] text-text-muted">6-position calibration for accurate attitude estimation</p>
        </div>
        {state === "idle" && (
          <button
            onClick={startCalibration}
            disabled={!connected}
            className="flex items-center gap-1.5 rounded-md bg-accent-blue px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
          >
            <Play size={12} />
            Start
          </button>
        )}
        {(state === "success" || state === "failed") && (
          <button
            onClick={reset}
            className="flex items-center gap-1.5 rounded-md border border-border bg-bg-secondary px-3 py-1.5 text-xs font-medium text-text-primary"
          >
            Reset
          </button>
        )}
      </div>

      {state !== "idle" && (
        <div className="flex flex-col gap-1.5">
          {POSITIONS.map((pos) => {
            const pState = positions[pos.id];
            return (
              <div
                key={pos.id}
                className={`flex items-center gap-2 rounded px-2 py-1.5 text-xs ${
                  pState === "active" ? "bg-accent-blue/10 border border-accent-blue/30" : "bg-bg-tertiary/30"
                }`}
              >
                {pState === "done" ? (
                  <Check size={14} className="shrink-0 text-success" />
                ) : pState === "active" ? (
                  <Loader2 size={14} className="shrink-0 animate-spin text-accent-blue" />
                ) : (
                  <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-border" />
                )}
                <span className={`font-medium ${pState === "active" ? "text-accent-blue" : "text-text-primary"}`}>
                  {pos.label}
                </span>
                <span className="text-text-muted">{pos.description}</span>
              </div>
            );
          })}
        </div>
      )}

      {state === "success" && (
        <div className="flex items-center gap-2 rounded bg-success/10 px-3 py-2 text-xs text-success">
          <Check size={14} />
          Calibration successful
        </div>
      )}
      {state === "failed" && (
        <div className="flex items-center gap-2 rounded bg-danger/10 px-3 py-2 text-xs text-danger">
          <X size={14} />
          Calibration failed
        </div>
      )}

      {lastStatus && state === "running" && (
        <div className="text-[10px] text-text-muted font-mono truncate" title={lastStatus}>
          {lastStatus}
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Check,
  X,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { requestPrearmChecks } from "../../../calibration";
import { subscribeStatusText, type StatusMessage } from "../../../statustext";
import type { SensorHealth } from "../../../sensor-health";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type PrearmStepProps = {
  connected: boolean;
  sensorHealth: SensorHealth | null;
};

// ---------------------------------------------------------------------------
// Known pre-arm patterns
// ---------------------------------------------------------------------------

type PrearmPattern = {
  pattern: RegExp;
  category: string;
  guidance: string;
};

const PREARM_PATTERNS: PrearmPattern[] = [
  { pattern: /gps/i, category: "GPS", guidance: "Ensure GPS has clear sky view. Wait for 3D fix and >6 satellites." },
  { pattern: /ahrs|ekf/i, category: "EKF", guidance: "Wait for EKF to converge. May take 30-60 seconds after boot." },
  { pattern: /compass|mag/i, category: "Compass", guidance: "Run compass calibration in the Calibration step." },
  { pattern: /accel|ins/i, category: "IMU", guidance: "Run accelerometer calibration in the Calibration step." },
  { pattern: /rc|throttle/i, category: "RC", guidance: "Calibrate radio in the Calibration step." },
  { pattern: /batt/i, category: "Battery", guidance: "Check battery connection and voltage." },
  { pattern: /safety/i, category: "Safety", guidance: "Press the hardware safety switch on the flight controller." },
  { pattern: /baro/i, category: "Baro", guidance: "Check barometer hardware. May need power cycle." },
  { pattern: /board|internal/i, category: "Hardware", guidance: "Check flight controller hardware." },
  { pattern: /log/i, category: "Logging", guidance: "Check SD card is inserted and functional." },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type PrearmBlocker = {
  id: string;
  category: string;
  rawText: string;
  guidance: string;
  timestamp: number;
};

function classifyMessage(text: string, ts: number): PrearmBlocker {
  // Strip "PreArm:" or "prearm:" prefix for matching
  const stripped = text.replace(/^pre-?arm:\s*/i, "").trim();

  for (const { pattern, category, guidance } of PREARM_PATTERNS) {
    if (pattern.test(stripped)) {
      return { id: `${category}-${ts}`, category, rawText: text, guidance, timestamp: ts };
    }
  }

  return {
    id: `unknown-${ts}`,
    category: "Other",
    rawText: text,
    guidance: "Check ArduPilot documentation for this pre-arm failure.",
    timestamp: ts,
  };
}

function categoryIcon(category: string) {
  switch (category) {
    case "GPS":
      return "🛰";
    case "EKF":
      return "📐";
    case "Compass":
      return "🧭";
    case "IMU":
      return "⚖️";
    case "RC":
      return "📡";
    case "Battery":
      return "🔋";
    case "Safety":
      return "🔒";
    case "Baro":
      return "🌡";
    case "Hardware":
      return "🔧";
    case "Logging":
      return "💾";
    default:
      return "⚠️";
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PrearmStep({ connected, sensorHealth }: PrearmStepProps) {
  const [blockers, setBlockers] = useState<PrearmBlocker[]>([]);
  const [checking, setChecking] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);
  const lastCheckTime = useRef<number>(0);

  // Subscribe to STATUSTEXT and filter pre-arm messages
  useEffect(() => {
    let unlisten: (() => void) | null = null;

    const handleStatus = (msg: StatusMessage) => {
      const text = msg.text;
      // Only process messages received after our last check request
      const now = Date.now();
      if (now < lastCheckTime.current) return;

      // Filter for pre-arm messages
      if (!text.toLowerCase().includes("prearm")) return;

      const blocker = classifyMessage(text, now);

      setBlockers((prev) => {
        // Deduplicate by category — keep latest message per category
        const filtered = prev.filter((b) => b.category !== blocker.category);
        return [...filtered, blocker];
      });
    };

    (async () => {
      unlisten = await subscribeStatusText(handleStatus);
    })();

    return () => {
      unlisten?.();
    };
  }, []);

  // Request pre-arm checks
  const runChecks = useCallback(async () => {
    if (!connected) return;
    setChecking(true);
    setBlockers([]);
    lastCheckTime.current = Date.now();

    try {
      await requestPrearmChecks();
      setHasChecked(true);
    } catch {
      // Silently handle — vehicle may not support the command
    }

    // Give time for STATUSTEXT responses to arrive
    setTimeout(() => setChecking(false), 3000);
  }, [connected]);

  // Auto-check on mount
  useEffect(() => {
    if (connected && !hasChecked) {
      runChecks();
    }
  }, [connected]); // eslint-disable-line react-hooks/exhaustive-deps

  const isReady = sensorHealth?.pre_arm_good === true;
  const blockerCount = blockers.length;

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* Status header */}
      <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isReady ? (
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-success/15">
                <ShieldCheck size={20} className="text-success" />
              </span>
            ) : (
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-danger/15">
                <ShieldAlert size={20} className="text-danger" />
              </span>
            )}
            <div>
              <h3 className="text-sm font-semibold text-text-primary">
                {isReady ? "Ready to Arm" : "Pre-Arm Checks"}
              </h3>
              <p className="text-[11px] text-text-muted">
                {isReady
                  ? "All pre-arm checks passed. Vehicle is ready to arm."
                  : checking
                    ? "Checking pre-arm requirements..."
                    : hasChecked
                      ? `${blockerCount} blocker${blockerCount !== 1 ? "s" : ""} remaining`
                      : "Run checks to identify pre-arm blockers"}
              </p>
            </div>
          </div>

          <button
            onClick={runChecks}
            disabled={!connected || checking}
            className="flex items-center gap-1.5 rounded-md border border-border bg-bg-secondary px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-bg-tertiary disabled:opacity-40"
          >
            <RefreshCw size={12} className={checking ? "animate-spin" : ""} />
            {checking ? "Checking..." : "Refresh"}
          </button>
        </div>

        {/* Status bar */}
        {hasChecked && (
          <div className="mt-3 flex items-center gap-2">
            <div className="h-1.5 flex-1 rounded-full bg-bg-secondary overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${isReady ? "bg-success w-full" : "bg-danger"}`}
                style={isReady ? undefined : { width: "30%" }}
              />
            </div>
            <span className={`text-[10px] font-medium ${isReady ? "text-success" : "text-danger"}`}>
              {isReady ? "PASS" : "FAIL"}
            </span>
          </div>
        )}
      </div>

      {/* Blocker list */}
      {blockerCount > 0 && (
        <div className="flex flex-col gap-1.5">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted px-1">
            Pre-Arm Blockers
          </h4>
          {blockers.map((blocker) => (
            <div
              key={blocker.id}
              className="rounded-lg border border-danger/20 bg-danger/5 p-3"
            >
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 text-sm leading-none" role="img" aria-label={blocker.category}>
                  {categoryIcon(blocker.category)}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-text-primary">
                      {blocker.category}
                    </span>
                    <X size={10} className="text-danger" />
                  </div>
                  <p className="mt-0.5 text-[11px] font-mono text-text-secondary truncate" title={blocker.rawText}>
                    {blocker.rawText}
                  </p>
                  <p className="mt-1 text-[11px] text-text-muted leading-relaxed">
                    {blocker.guidance}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Ready state */}
      {isReady && hasChecked && blockerCount === 0 && (
        <div className="flex items-center gap-2 rounded-lg bg-success/10 border border-success/20 px-4 py-3 text-xs text-success">
          <Check size={14} />
          <span className="font-medium">All pre-arm checks passed</span>
        </div>
      )}

      {/* No blockers but not ready */}
      {!isReady && hasChecked && !checking && blockerCount === 0 && (
        <div className="flex items-center gap-2 rounded-lg bg-warning/10 border border-warning/20 px-4 py-3 text-xs text-warning">
          <AlertTriangle size={14} />
          <span>
            Pre-arm status reports not ready but no specific blockers received.
            Try pressing Refresh or wait for sensor convergence.
          </span>
        </div>
      )}

      {/* Help section */}
      <div className="rounded-lg border border-border bg-bg-tertiary/50 p-3">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-2">
          Tips
        </h4>
        <ul className="flex flex-col gap-1.5 text-[11px] text-text-secondary">
          <li className="flex items-start gap-2">
            <span className="mt-0.5 h-1 w-1 shrink-0 rounded-full bg-text-muted" />
            Pre-arm checks ensure your vehicle is safe to fly
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 h-1 w-1 shrink-0 rounded-full bg-text-muted" />
            Address blockers in order — some depend on others
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 h-1 w-1 shrink-0 rounded-full bg-text-muted" />
            EKF convergence may take 30-60 seconds after power-on
          </li>
          <li className="flex items-center gap-2">
            <span className="mt-0.5 h-1 w-1 shrink-0 rounded-full bg-text-muted" />
            <a
              href="https://ardupilot.org/copter/docs/common-prearm-safety-checks.html"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-accent hover:underline"
            >
              ArduPilot Pre-Arm Documentation
              <ExternalLink size={10} />
            </a>
          </li>
        </ul>
      </div>
    </div>
  );
}

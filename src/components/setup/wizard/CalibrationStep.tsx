import { useState, useCallback, useMemo } from "react";
import { Check, AlertCircle, Loader2, ChevronDown, Crosshair, RotateCw } from "lucide-react";
import { AccelCalibWizard } from "../AccelCalibWizard";
import { RadioCalibWizard } from "../RadioCalibWizard";
import { CompassCalibWizard } from "./CompassCalibWizard";
import { calibrateGyro } from "../../../calibration";
import type { Telemetry } from "../../../telemetry";
import type { useParams } from "../../../hooks/use-params";
import { toast } from "sonner";

type CalibrationStepProps = {
  params: ReturnType<typeof useParams>;
  telemetry: Telemetry | null;
  connected: boolean;
};

type CalibStatus = "calibrated" | "not_calibrated" | "in_progress" | "quick";

function StatusBadge({ status }: { status: CalibStatus }) {
  switch (status) {
    case "calibrated":
      return (
        <span className="flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-medium text-success">
          <Check size={10} />
          Calibrated
        </span>
      );
    case "not_calibrated":
      return (
        <span className="flex items-center gap-1 rounded-full bg-danger/15 px-2 py-0.5 text-[10px] font-medium text-danger">
          <AlertCircle size={10} />
          Not Calibrated
        </span>
      );
    case "in_progress":
      return (
        <span className="flex items-center gap-1 rounded-full bg-accent-blue/15 px-2 py-0.5 text-[10px] font-medium text-accent-blue">
          <Loader2 size={10} className="animate-spin" />
          In Progress
        </span>
      );
    case "quick":
      return (
        <span className="flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-medium text-warning">
          Quick Cal
        </span>
      );
  }
}

function CalibrationCard({
  title,
  description,
  status,
  children,
}: {
  title: string;
  description: string;
  status: CalibStatus;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-bg-tertiary/30">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-text-primary">{title}</span>
            <StatusBadge status={status} />
          </div>
          <p className="text-[11px] text-text-muted mt-0.5">{description}</p>
        </div>
        <ChevronDown
          size={14}
          className={`shrink-0 text-text-muted transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
        />
      </button>
      {expanded && (
        <div className="border-t border-border px-3 py-3">
          {children}
        </div>
      )}
    </div>
  );
}

export function CalibrationStep({ params, telemetry, connected }: CalibrationStepProps) {
  const [gyroRunning, setGyroRunning] = useState(false);

  const handleGyroCalibrate = useCallback(async () => {
    setGyroRunning(true);
    try {
      await calibrateGyro();
      toast.success("Gyroscope calibration started");
    } catch (err) {
      toast.error("Gyro calibration failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setGyroRunning(false);
    }
  }, []);

  const accelStatus = useMemo((): CalibStatus => {
    const store = params.store;
    if (!store) return "not_calibrated";
    const x = store.params["INS_ACCOFFS_X"]?.value ?? 0;
    const y = store.params["INS_ACCOFFS_Y"]?.value ?? 0;
    const z = store.params["INS_ACCOFFS_Z"]?.value ?? 0;
    return x !== 0 || y !== 0 || z !== 0 ? "calibrated" : "not_calibrated";
  }, [params.store]);

  const compassStatus = useMemo((): CalibStatus => {
    const store = params.store;
    if (!store) return "not_calibrated";
    const devId = store.params["COMPASS_DEV_ID"]?.value ?? 0;
    if (devId === 0) return "not_calibrated";
    const ofsX = store.params["COMPASS_OFS_X"]?.value ?? 0;
    const ofsY = store.params["COMPASS_OFS_Y"]?.value ?? 0;
    const ofsZ = store.params["COMPASS_OFS_Z"]?.value ?? 0;
    return ofsX !== 0 || ofsY !== 0 || ofsZ !== 0 ? "calibrated" : "not_calibrated";
  }, [params.store]);

  const radioStatus = useMemo((): CalibStatus => {
    const store = params.store;
    if (!store) return "not_calibrated";
    const min = store.params["RC1_MIN"]?.value ?? 1100;
    const max = store.params["RC1_MAX"]?.value ?? 1100;
    return min < max && min !== 1100 ? "calibrated" : "not_calibrated";
  }, [params.store]);

  const handleStageParams = useCallback(
    (staged: [string, number][]) => {
      for (const [k, v] of staged) {
        params.stage(k, v);
      }
    },
    [params.stage],
  );

  return (
    <div className="flex flex-col gap-3 p-4">
      <CalibrationCard
        title="Accelerometer"
        description="6-position calibration for accurate attitude estimation"
        status={accelStatus}
      >
        <AccelCalibWizard connected={connected} />
      </CalibrationCard>

      <CalibrationCard
        title="Gyroscope"
        description="Keep the vehicle still and level. Resets on reboot."
        status="quick"
      >
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-text-muted">
            Quick calibration — keep the vehicle still and level during the process.
          </p>
          <button
            onClick={handleGyroCalibrate}
            disabled={!connected || gyroRunning}
            className="flex items-center gap-1.5 rounded-md bg-accent-blue px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
          >
            {gyroRunning ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Crosshair size={12} />
            )}
            Calibrate
          </button>
        </div>
      </CalibrationCard>

      <CalibrationCard
        title="Compass"
        description="Onboard compass calibration for heading accuracy"
        status={compassStatus}
      >
        <CompassCalibWizard connected={connected} params={{ paramStore: params.store }} />
      </CalibrationCard>

      <CalibrationCard
        title="Radio"
        description="Record RC transmitter stick and switch ranges"
        status={radioStatus}
      >
        <RadioCalibWizard
          connected={connected}
          onStageParams={handleStageParams}
        />
      </CalibrationCard>
    </div>
  );
}

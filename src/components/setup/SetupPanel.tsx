import { useCallback } from "react";
import { Crosshair, Radio, RotateCw } from "lucide-react";
import { AccelCalibWizard } from "./AccelCalibWizard";
import { RadioCalibWizard } from "./RadioCalibWizard";
import { calibrateGyro } from "../../calibration";
import { toast } from "sonner";

type SetupPanelProps = {
  connected: boolean;
  onStageParams: (params: [string, number][]) => void;
};

export function SetupPanel({ connected, onStageParams }: SetupPanelProps) {
  const handleGyroCalibrate = useCallback(async () => {
    try {
      await calibrateGyro();
      toast.success("Gyroscope calibration started");
    } catch (err) {
      toast.error("Gyro calibration failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto">
      {!connected ? (
        <div className="flex h-full items-center justify-center text-sm text-text-muted">
          Connect to a vehicle to access setup wizards
        </div>
      ) : (
        <>
          {/* Accelerometer */}
          <div className="rounded-lg border border-border p-3">
            <AccelCalibWizard connected={connected} />
          </div>

          {/* Gyroscope (simple card) */}
          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="flex items-center gap-1.5 text-sm font-medium text-text-primary">
                  <RotateCw size={14} />
                  Gyroscope Calibration
                </h3>
                <p className="text-[11px] text-text-muted">
                  Keep the vehicle still and level. Takes a few seconds.
                </p>
              </div>
              <button
                onClick={handleGyroCalibrate}
                disabled={!connected}
                className="flex items-center gap-1.5 rounded-md bg-accent-blue px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
              >
                <Crosshair size={12} />
                Calibrate
              </button>
            </div>
          </div>

          {/* Radio */}
          <div className="rounded-lg border border-border p-3">
            <RadioCalibWizard connected={connected} onStageParams={onStageParams} />
          </div>
        </>
      )}
    </div>
  );
}

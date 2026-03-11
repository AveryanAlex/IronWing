import { useState, useCallback } from "react";
import {
  Check,
  Circle,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  AlertTriangle,
  Wrench,
  Unplug,
  X,
  Upload,
  Trash2,
  RotateCw,
} from "lucide-react";
import { useSetupWizard, type WizardStepId } from "../../hooks/use-setup-wizard";
import type { useParams } from "../../hooks/use-params";
import { useBreakpoint } from "../../hooks/use-breakpoint";
import type { VehicleState, Telemetry, LinkState, HomePosition, FlightModeEntry } from "../../telemetry";
import type { SensorHealth } from "../../sensor-health";
import type { Param } from "../../params";
import type { ParamMetadataMap } from "../../param-metadata";
import { InspectionStep } from "./wizard/InspectionStep";
import { CalibrationStep } from "./wizard/CalibrationStep";
import { FrameMotorStep } from "./wizard/FrameMotorStep";
import { FlightModesStep } from "./wizard/FlightModesStep";
import { FailsafeStep } from "./wizard/FailsafeStep";
import { PrearmStep } from "./wizard/PrearmStep";
import { ReadinessStep } from "./wizard/ReadinessStep";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type SetupWizardPanelProps = {
  connected: boolean;
  vehicleState: VehicleState | null;
  telemetry: Telemetry | null;
  linkState: LinkState | null;
  params: ReturnType<typeof useParams>;
  sensorHealth: SensorHealth | null;
  homePosition: HomePosition | null;
  availableModes: FlightModeEntry[];
};

// ---------------------------------------------------------------------------
// Step icon helper
// ---------------------------------------------------------------------------

function StepIcon({ status, index }: { status: string; index: number }) {
  if (status === "complete") {
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success/20 text-success">
        <Check size={12} strokeWidth={3} />
      </span>
    );
  }
  if (status === "in_progress") {
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-white text-[11px] font-bold">
        {index + 1}
      </span>
    );
  }
  if (status === "blocked") {
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bg-tertiary text-text-muted">
        <Circle size={10} />
      </span>
    );
  }
  // idle / skipped
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bg-tertiary text-text-muted text-[11px] font-medium">
      {index + 1}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Staged diff panel (inline, scoped to wizard)
// ---------------------------------------------------------------------------

const INTEGER_TYPES = ["uint8", "int8", "uint16", "int16", "uint32", "int32"];

function fmtVal(value: number, paramType?: string): string {
  if (paramType && INTEGER_TYPES.includes(paramType)) return String(Math.round(value));
  return String(value);
}

function displayValue(param: Param): string {
  if (INTEGER_TYPES.includes(param.param_type)) return String(Math.round(param.value));
  return String(param.value);
}

function WizardStagedBar({
  params,
}: {
  params: ReturnType<typeof useParams>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [applying, setApplying] = useState(false);

  const handleApply = useCallback(async () => {
    setApplying(true);
    try {
      await params.applyStaged();
    } finally {
      setApplying(false);
    }
  }, [params]);

  const handleDiscardAll = useCallback(() => {
    params.unstageAll();
  }, [params]);

  const staged = params.staged;
  const store = params.store;

  if (staged.size === 0) return null;

  const hasRebootRequired = Array.from(staged.keys()).some((name) => {
    const meta = params.metadata?.get(name);
    return meta?.rebootRequired;
  });

  return (
    <div className="border-t border-warning/30 bg-warning/5">
      {/* Summary bar */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs text-warning hover:bg-warning/10 transition-colors"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span className="font-medium">{staged.size} parameter{staged.size !== 1 ? "s" : ""} staged</span>
        <span className="ml-auto text-[11px] text-text-muted">Review & Apply</span>
      </button>

      {/* Expanded diff view */}
      {expanded && (
        <div className="border-t border-warning/20 px-3 py-2">
          {hasRebootRequired && (
            <div className="mb-2 flex items-center gap-1 rounded bg-warning/10 px-2 py-1 text-[10px] text-warning">
              <RotateCw size={10} />
              Some changes require a vehicle reboot
            </div>
          )}
          <div className="flex flex-col gap-0.5 max-h-40 overflow-y-auto mb-2">
            {Array.from(staged.entries())
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([name, newValue]) => {
                const current = store?.params[name];
                return (
                  <div key={name} className="flex items-center gap-2 text-[11px] font-mono">
                    <span className="w-40 truncate text-text-primary sm:w-48" title={name}>{name}</span>
                    <span className="text-text-muted">{current ? displayValue(current) : "?"}</span>
                    <span className="text-text-muted">&rarr;</span>
                    <span className="text-warning">{fmtVal(newValue, current?.param_type)}</span>
                    {params.metadata?.get(name)?.rebootRequired && (
                      <RotateCw size={8} className="text-warning" />
                    )}
                    <button
                      onClick={() => params.unstage(name)}
                      className="ml-auto p-0.5 text-text-muted hover:text-danger"
                      title="Unstage"
                    >
                      <X size={10} />
                    </button>
                  </div>
                );
              })}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleApply}
              disabled={applying}
              className="flex items-center gap-1.5 rounded-md bg-success px-3 py-1.5 text-xs font-medium text-white transition-opacity disabled:opacity-40"
            >
              <Upload size={12} className={applying ? "animate-pulse" : ""} />
              {applying ? "Applying..." : "Apply All"}
            </button>
            <button
              onClick={handleDiscardAll}
              disabled={applying}
              className="flex items-center gap-1.5 rounded-md border border-border bg-bg-secondary px-3 py-1.5 text-xs font-medium text-text-primary transition-opacity disabled:opacity-40"
            >
              <Trash2 size={12} />
              Discard All
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gate screens
// ---------------------------------------------------------------------------

function DisconnectedGate() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-text-muted">
      <Unplug size={40} strokeWidth={1.5} className="opacity-40" />
      <p className="text-sm">Connect to a vehicle to begin setup</p>
    </div>
  );
}

function UnsupportedGate() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-text-muted">
      <AlertTriangle size={40} strokeWidth={1.5} className="opacity-40" />
      <p className="text-sm">Setup wizard is currently available for ArduPilot vehicles only</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SetupWizardPanel({
  connected,
  vehicleState,
  telemetry,
  linkState: _linkState,
  params,
  sensorHealth,
  homePosition,
  availableModes,
}: SetupWizardPanelProps) {
  const { isMobile } = useBreakpoint();
  const wizard = useSetupWizard(
    { paramStore: params.store, downloadAll: params.download },
    vehicleState,
    connected,
  );

  // Gate: not connected
  if (!connected) return <DisconnectedGate />;

  // Gate: not ArduPilot
  if (!wizard.isSupported) return <UnsupportedGate />;

  const completedCount = Array.from(wizard.stepStatuses.values()).filter((s) => s === "complete").length;
  const totalCount = wizard.steps.length;
  const activeIdx = wizard.steps.findIndex((s) => s.id === wizard.activeStep);
  const isFirst = activeIdx === 0;
  const isLast = activeIdx === wizard.steps.length - 1;

  const renderStep = () => {
    switch (wizard.activeStep) {
      case "inspection":
        return <InspectionStep vehicleState={vehicleState} telemetry={telemetry} sensorHealth={sensorHealth} />;
      case "calibration":
        return <CalibrationStep params={params} telemetry={telemetry} connected={connected} />;
      case "frame_motor":
        return <FrameMotorStep params={params} vehicleState={vehicleState} connected={connected} onConfirm={() => wizard.confirmStep("frame_motor")} />;
      case "flight_modes":
        return <FlightModesStep params={params} vehicleState={vehicleState} telemetry={telemetry} availableModes={availableModes} onConfirm={() => wizard.confirmStep("flight_modes")} />;
      case "failsafe":
        return <FailsafeStep params={params} onConfirm={() => wizard.confirmStep("failsafe")} />;
      case "prearm":
        return <PrearmStep connected={connected} sensorHealth={sensorHealth} />;
      case "readiness":
        return <ReadinessStep vehicleState={vehicleState} telemetry={telemetry} homePosition={homePosition} sensorHealth={sensorHealth} stepStatuses={wizard.stepStatuses} steps={wizard.steps} />;
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-3 py-2">
        <Wrench size={16} className="text-accent shrink-0" />
        <h2 className="text-sm font-semibold text-text-primary">Setup Wizard</h2>
        <span className="ml-auto text-[11px] text-text-muted">
          {completedCount} of {totalCount} steps complete
        </span>
      </div>

      {/* Body: sidebar + content */}
      <div className="flex flex-1 overflow-hidden">
        {isMobile ? (
          /* Mobile: horizontal step strip */
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="flex gap-1 overflow-x-auto border-b border-border px-2 py-1.5 scrollbar-none">
              {wizard.steps.map((step, i) => {
                const status = wizard.stepStatuses.get(step.id) ?? "idle";
                const isActive = step.id === wizard.activeStep;
                return (
                  <button
                    key={step.id}
                    onClick={() => wizard.goToStep(step.id)}
                    className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                      isActive
                        ? "bg-accent/15 text-accent"
                        : status === "complete"
                          ? "text-success hover:bg-bg-tertiary/50"
                          : "text-text-muted hover:bg-bg-tertiary/50"
                    }`}
                  >
                    <StepIcon status={status} index={i} />
                    <span className="hidden sm:inline">{step.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex-1 overflow-y-auto">
              {renderStep()}
            </div>
          </div>
        ) : (
          /* Desktop: left sidebar + right content */
          <>
            <nav className="flex w-56 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border py-2 px-1.5">
              {wizard.steps.map((step, i) => {
                const status = wizard.stepStatuses.get(step.id) ?? "idle";
                const isActive = step.id === wizard.activeStep;
                return (
                  <button
                    key={step.id}
                    onClick={() => wizard.goToStep(step.id)}
                    className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-xs transition-colors ${
                      isActive
                        ? "bg-accent/10 text-accent"
                        : status === "complete"
                          ? "text-success hover:bg-bg-tertiary/50"
                          : "text-text-secondary hover:bg-bg-tertiary/50"
                    }`}
                  >
                    <StepIcon status={status} index={i} />
                    <span className="truncate font-medium">{step.label}</span>
                    {step.required && status !== "complete" && (
                      <span className="ml-auto text-[9px] text-text-muted">req</span>
                    )}
                  </button>
                );
              })}
            </nav>

            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto">
                {renderStep()}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Staged params apply bar */}
      <WizardStagedBar params={params} />

      {/* Navigation buttons */}
      <div className="flex items-center justify-between border-t border-border px-3 py-2">
        <button
          onClick={wizard.goPrev}
          disabled={isFirst}
          className="flex items-center gap-1.5 rounded-md border border-border bg-bg-secondary px-3 py-1.5 text-xs font-medium text-text-primary transition-opacity disabled:opacity-30"
        >
          <ChevronLeft size={14} />
          Back
        </button>
        <button
          onClick={wizard.goNext}
          disabled={isLast}
          className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity disabled:opacity-30"
        >
          Next
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

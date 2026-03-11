import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import type { ParamStore } from "../params";
import type { SensorHealth } from "../sensor-health";
import type { VehicleState } from "../telemetry";

// ---------------------------------------------------------------------------
// SITL Limitations (for testing reference)
// ---------------------------------------------------------------------------
// - Compass calibration: SITL does not emit MAG_CAL_PROGRESS (msg 191) or
//   MAG_CAL_REPORT since it uses simulated magnetometers. The CompassCalibWizard
//   progress UI won't advance. On real hardware, rotate vehicle in all orientations.
// - Motor test: SITL accepts motor_test commands but no physical motor response
//   can be verified. Always test motor order/direction on real hardware with
//   propellers removed.
// - GPS lock: SITL provides instant 3D fix with perfect HDOP. Real hardware
//   requires clear sky view and 30-120s for initial fix.
// - Sensor calibration: SITL auto-calibrates accelerometer and gyroscope with
//   default offsets. Real hardware starts with zero offsets and requires manual
//   calibration before flight.
// - Pre-arm checks: SITL passes most pre-arm checks immediately after boot.
//   Real hardware may fail on EKF convergence, compass variance, GPS lock, etc.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WizardStepId =
  | "inspection"
  | "calibration"
  | "frame_motor"
  | "flight_modes"
  | "failsafe"
  | "prearm"
  | "readiness";

export type WizardStep = {
  id: WizardStepId;
  label: string;
  required: boolean;
  prerequisiteIds: WizardStepId[];
};

export type StepStatus = "idle" | "in_progress" | "complete" | "blocked" | "skipped";

export type SetupWizardReturn = {
  activeStep: WizardStepId;
  steps: WizardStep[];
  stepStatuses: Map<WizardStepId, StepStatus>;
  goToStep: (id: WizardStepId) => void;
  goNext: () => void;
  goPrev: () => void;
  confirmStep: (id: WizardStepId) => void;
  resetWizard: () => void;
  isSupported: boolean;
};

// ---------------------------------------------------------------------------
// Step definitions
// ---------------------------------------------------------------------------

const STEPS: WizardStep[] = [
  { id: "inspection", label: "Vehicle Inspection", required: false, prerequisiteIds: [] },
  { id: "calibration", label: "Sensor Calibration", required: true, prerequisiteIds: [] },
  { id: "frame_motor", label: "Frame & Motor Test", required: true, prerequisiteIds: [] },
  { id: "flight_modes", label: "Flight Modes", required: false, prerequisiteIds: [] },
  { id: "failsafe", label: "Failsafe Settings", required: false, prerequisiteIds: [] },
  { id: "prearm", label: "Pre-Arm Checks", required: true, prerequisiteIds: [] },
  { id: "readiness", label: "Readiness Review", required: false, prerequisiteIds: [] },
];

const STEP_IDS = STEPS.map((s) => s.id);

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

type PersistedWizard = {
  lastStep: WizardStepId;
  confirmed: Record<string, boolean>;
};

function storageKey(vehicleState: VehicleState | null): string {
  const sysId = vehicleState?.system_id ?? 0;
  const vType = vehicleState?.vehicle_type ?? "unknown";
  return `ironwing_setup_${sysId}_${vType}`;
}

function loadPersisted(key: string): PersistedWizard | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedWizard;
  } catch {
    return null;
  }
}

function savePersisted(key: string, data: PersistedWizard): void {
  localStorage.setItem(key, JSON.stringify(data));
}

// ---------------------------------------------------------------------------
// Param-derived completion
// ---------------------------------------------------------------------------

type Param = { value: number };

function deriveStepCompletion(
  stepId: WizardStepId,
  params: Record<string, Param> | null,
): boolean | null {
  if (!params) return null;
  const p = (name: string) => params[name]?.value ?? null;

  switch (stepId) {
    case "inspection":
      return true; // informational, always complete

    case "calibration": {
      const accelDone =
        (p("INS_ACCOFFS_X") ?? 0) !== 0 ||
        (p("INS_ACCOFFS_Y") ?? 0) !== 0 ||
        (p("INS_ACCOFFS_Z") ?? 0) !== 0;
      const compassDone =
        (p("COMPASS_OFS_X") ?? 0) !== 0 ||
        (p("COMPASS_OFS_Y") ?? 0) !== 0 ||
        (p("COMPASS_OFS_Z") ?? 0) !== 0;
      const radioDone =
        (p("RC1_MIN") ?? 1100) < (p("RC1_MAX") ?? 1900) &&
        (p("RC1_MIN") ?? 1100) !== 1100;
      return accelDone && compassDone && radioDone;
    }

    case "frame_motor": {
      const frameClassSet = (p("FRAME_CLASS") ?? 0) !== 0;
      return frameClassSet; // motor test confirmation comes from localStorage
    }

    default:
      return null; // user-confirmed steps use localStorage
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSetupWizard(
  params: { paramStore: ParamStore | null; downloadAll: () => void },
  vehicleState: VehicleState | null,
  connected: boolean,
  sensorHealth: SensorHealth | null,
): SetupWizardReturn {
  const isSupported = vehicleState?.autopilot === "ardu_pilot_mega";

  const key = storageKey(vehicleState);
  const persisted = useRef<PersistedWizard | null>(null);

  // Load persisted state on key change
  useEffect(() => {
    persisted.current = loadPersisted(key);
  }, [key]);

  // Initial active step from persisted or first step
  const [activeStep, setActiveStep] = useState<WizardStepId>(() => {
    const saved = loadPersisted(storageKey(vehicleState));
    if (saved && STEP_IDS.includes(saved.lastStep)) return saved.lastStep;
    return STEPS[0].id;
  });

  // Sync active step when key changes (board switch)
  const prevKeyRef = useRef(key);
  useEffect(() => {
    if (prevKeyRef.current !== key) {
      prevKeyRef.current = key;
      const saved = loadPersisted(key);
      if (saved && STEP_IDS.includes(saved.lastStep)) {
        setActiveStep(saved.lastStep);
      } else {
        setActiveStep(STEPS[0].id);
      }
    }
  }, [key]);

  // Persist active step changes
  useEffect(() => {
    const current = loadPersisted(key) ?? { lastStep: STEPS[0].id, confirmed: {} };
    current.lastStep = activeStep;
    savePersisted(key, current);
    persisted.current = current;
  }, [activeStep, key]);

  // Auto-download params on mount if connected but no store
  const downloadTriggered = useRef(false);
  useEffect(() => {
    if (connected && !params.paramStore && !downloadTriggered.current) {
      downloadTriggered.current = true;
      params.downloadAll();
    }
    if (!connected) {
      downloadTriggered.current = false;
    }
  }, [connected, params.paramStore, params.downloadAll]);

  // Confirmed steps from localStorage (reactive via state)
  const [confirmedSteps, setConfirmedSteps] = useState<Record<string, boolean>>(() => {
    const saved = loadPersisted(storageKey(vehicleState));
    return saved?.confirmed ?? {};
  });

  // Sync confirmed steps when key changes
  useEffect(() => {
    const saved = loadPersisted(key);
    setConfirmedSteps(saved?.confirmed ?? {});
  }, [key]);

  // Compute step statuses
  const stepStatuses = useMemo(() => {
    const statuses = new Map<WizardStepId, StepStatus>();
    const paramMap = params.paramStore?.params ?? null;

    for (const step of STEPS) {
      const derived = deriveStepCompletion(step.id, paramMap);

      if (derived === true) {
        statuses.set(step.id, "complete");
      } else if (step.id === "prearm" && sensorHealth?.pre_arm_good === true) {
        statuses.set(step.id, "complete");
      } else if (confirmedSteps[step.id]) {
        statuses.set(step.id, "complete");
      } else if (step.id === activeStep) {
        statuses.set(step.id, "in_progress");
      } else {
        statuses.set(step.id, "idle");
      }
    }

    return statuses;
  }, [params.paramStore, confirmedSteps, activeStep, sensorHealth]);

  // Navigation
  const goToStep = useCallback((id: WizardStepId) => {
    if (STEP_IDS.includes(id)) {
      setActiveStep(id);
    }
  }, []);

  const goNext = useCallback(() => {
    const idx = STEP_IDS.indexOf(activeStep);
    if (idx < STEP_IDS.length - 1) {
      setActiveStep(STEP_IDS[idx + 1]);
    }
  }, [activeStep]);

  const goPrev = useCallback(() => {
    const idx = STEP_IDS.indexOf(activeStep);
    if (idx > 0) {
      setActiveStep(STEP_IDS[idx - 1]);
    }
  }, [activeStep]);

  // Confirm a step (user-driven)
  const confirmStep = useCallback(
    (id: WizardStepId) => {
      setConfirmedSteps((prev) => {
        const next = { ...prev, [id]: true };
        const current = loadPersisted(key) ?? { lastStep: activeStep, confirmed: {} };
        current.confirmed = next;
        savePersisted(key, current);
        persisted.current = current;
        return next;
      });
    },
    [key, activeStep],
  );

  // Reset wizard
  const resetWizard = useCallback(() => {
    localStorage.removeItem(key);
    persisted.current = null;
    setActiveStep(STEPS[0].id);
    setConfirmedSteps({});
  }, [key]);

  return {
    activeStep,
    steps: STEPS,
    stepStatuses,
    goToStep,
    goNext,
    goPrev,
    confirmStep,
    resetWizard,
    isSupported,
  };
}

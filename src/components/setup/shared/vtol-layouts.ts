import { getMotorLayout, type MotorLayout } from "../../../data/motor-layouts";
import type { VtolProfile } from "./vehicle-helpers";

export type MotorDiagramOverlay = "none" | "tiltrotor" | "tailsitter";
export type MotorDiagramMotorRole = "lift" | "tilt" | "propulsion";
export type MotorDiagramStatus = "supported" | "preview-only" | "unsupported";

export type MotorDiagramEntry = MotorLayout & {
  role?: MotorDiagramMotorRole;
};

export type MotorDiagramModel = {
  status: MotorDiagramStatus;
  source: "ap-motors" | "custom";
  className: string;
  typeName: string;
  overlay: MotorDiagramOverlay;
  motors: MotorDiagramEntry[];
  hasLiftMotorSurface: boolean;
  message: string | null;
};

const FALLBACK_TILTROTOR_MOTORS: MotorDiagramEntry[] = [
  { motorNumber: 1, rollFactor: -0.8, pitchFactor: 0.75, yawFactor: -1, testOrder: 1, role: "tilt" },
  { motorNumber: 2, rollFactor: 0.8, pitchFactor: 0.75, yawFactor: 1, testOrder: 2, role: "tilt" },
  { motorNumber: 3, rollFactor: -0.65, pitchFactor: -0.75, yawFactor: 1, testOrder: 3, role: "lift" },
  { motorNumber: 4, rollFactor: 0.65, pitchFactor: -0.75, yawFactor: -1, testOrder: 4, role: "lift" },
];

const CUSTOM_TAILSITTER_MOTORS: MotorDiagramEntry[] = [
  { motorNumber: 1, rollFactor: -0.75, pitchFactor: 0, yawFactor: 0, testOrder: 1, role: "propulsion" },
  { motorNumber: 2, rollFactor: 0.75, pitchFactor: 0, yawFactor: 0, testOrder: 2, role: "propulsion" },
];

function cloneMotors(motors: MotorLayout[]): MotorDiagramEntry[] {
  return motors.map((motor) => ({ ...motor }));
}

function markTiltMotors(motors: MotorLayout[]): MotorDiagramEntry[] {
  if (motors.length === 0) return [];

  const maxPitchFactor = Math.max(...motors.map((motor) => motor.pitchFactor));

  return motors.map((motor) => ({
    ...motor,
    role: motor.pitchFactor === maxPitchFactor ? "tilt" : "lift",
  }));
}

function buildUnsupportedModel(message: string): MotorDiagramModel {
  return {
    status: "unsupported",
    source: "custom",
    className: "VTOL",
    typeName: "Unsupported",
    overlay: "none",
    motors: [],
    hasLiftMotorSurface: false,
    message,
  };
}

export function getApMotorDiagramModel(
  frameClass: number,
  frameType: number,
): MotorDiagramModel | null {
  const layout = getMotorLayout(frameClass, frameType);
  if (!layout) return null;

  return {
    status: "supported",
    source: "ap-motors",
    className: layout.className,
    typeName: layout.typeName,
    overlay: "none",
    motors: cloneMotors(layout.motors),
    hasLiftMotorSurface: layout.motors.length > 0,
    message: null,
  };
}

function buildCustomTiltrotorModel(): MotorDiagramModel {
  const baseQuadX = getMotorLayout(1, 1);
  const motors = baseQuadX
    ? markTiltMotors(baseQuadX.motors)
    : FALLBACK_TILTROTOR_MOTORS;

  return {
    status: "supported",
    source: "custom",
    className: "CUSTOM",
    typeName: "Tilt-Rotor",
    overlay: "tiltrotor",
    motors,
    hasLiftMotorSurface: true,
    message:
      "Custom tilt-rotor preview shown because this QuadPlane layout is outside the AP_Motors dataset.",
  };
}

function buildCustomTailsitterModel(): MotorDiagramModel {
  return {
    status: "preview-only",
    source: "custom",
    className: "CUSTOM",
    typeName: "Tailsitter",
    overlay: "tailsitter",
    motors: CUSTOM_TAILSITTER_MOTORS,
    hasLiftMotorSurface: false,
    message:
      "Custom tailsitter preview shown. This layout does not expose a dedicated lift-motor surface for motor testing here yet.",
  };
}

export function getVtolLayoutModel(
  profile: Pick<
    VtolProfile,
    "frameParamFamily" | "frameClassValue" | "frameTypeValue" | "subtype" | "hasUnsupportedSubtype"
  >,
): MotorDiagramModel | null {
  if (
    profile.frameParamFamily !== "quadplane" ||
    profile.frameClassValue == null ||
    profile.frameTypeValue == null
  ) {
    return null;
  }

  if (profile.hasUnsupportedSubtype || profile.subtype === "compound") {
    return buildUnsupportedModel(
      "Tilt-rotor and tailsitter flags are both enabled. Refresh the VTOL params and confirm the airframe before testing motors.",
    );
  }

  const apModel = getApMotorDiagramModel(
    profile.frameClassValue,
    profile.frameTypeValue,
  );

  if (apModel) {
    if (profile.subtype === "tiltrotor") {
      return {
        ...apModel,
        overlay: "tiltrotor",
        motors: markTiltMotors(apModel.motors),
        message:
          "Using the detected lift-motor map with a tilt-rotor overlay.",
      };
    }

    if (profile.subtype === "tailsitter") {
      return {
        ...apModel,
        overlay: "tailsitter",
        message:
          "Using the detected lift-motor map with a tailsitter overlay.",
      };
    }

    return apModel;
  }

  if (profile.subtype === "tiltrotor") {
    return buildCustomTiltrotorModel();
  }

  if (profile.subtype === "tailsitter") {
    return buildCustomTailsitterModel();
  }

  return buildUnsupportedModel(
    `QuadPlane frame class ${profile.frameClassValue} type ${profile.frameTypeValue} is outside the known lift-motor layouts. Verify the airframe manually before testing motors.`,
  );
}

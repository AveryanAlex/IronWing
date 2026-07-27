import { getMotorLayout, type MotorLayout } from "../../data/motor-layouts";
import type { VtolTopologySnapshot } from "./vtol-topology-model";

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
  hasMotorTestSurface: boolean;
  message: string | null;
};

function cloneMotors(motors: MotorLayout[]): MotorDiagramEntry[] {
  return motors.map((motor) => ({ ...motor }));
}

function propulsionEntries(frameClass: number, motors: MotorLayout[]): MotorLayout[] {
  return motors.filter((motor) => !(frameClass === 7 && motor.motorNumber === 7));
}

export function getApMotorDiagramModel(frameClass: number, frameType: number): MotorDiagramModel | null {
  const layout = getMotorLayout(frameClass, frameType);
  if (!layout) {
    return null;
  }
  const motors = propulsionEntries(frameClass, layout.motors);

  return {
    status: "supported",
    source: "ap-motors",
    className: layout.className,
    typeName: layout.typeName,
    overlay: "none",
    motors: cloneMotors(motors),
    hasLiftMotorSurface: motors.length > 0,
    hasMotorTestSurface: motors.length > 0,
    message: null,
  };
}

export function getVtolTopologyDiagramModel(snapshot: VtolTopologySnapshot): MotorDiagramModel | null {
  if (!snapshot.enabled) {
    return null;
  }

  const numberedPropulsors = snapshot.propulsors.filter(
    (propulsor): propulsor is typeof propulsor & { motorNumber: number } => propulsor.motorNumber !== null,
  );
  if (numberedPropulsors.length === 0) {
    return {
      status: "preview-only",
      source: "custom",
      className: snapshot.frameClassLabel,
      typeName: snapshot.frameTypeLabel,
      overlay: snapshot.architecture.startsWith("tailsitter") ? "tailsitter" : "tiltrotor",
      motors: [],
      hasLiftMotorSurface: false,
      hasMotorTestSurface: false,
      message: "This architecture uses plane throttle functions instead of the multicopter motor_test numbering. Verify its propulsion outputs through the documented tailsitter/bicopter bench procedure.",
    };
  }

  return {
    status: snapshot.supportedDiagram ? "supported" : "unsupported",
    source: "ap-motors",
    className: snapshot.frameClassLabel,
    typeName: snapshot.frameTypeLabel,
    overlay: snapshot.architecture === "tiltrotor" || snapshot.architecture === "bicopter"
      ? "tiltrotor"
      : snapshot.architecture.startsWith("tailsitter")
        ? "tailsitter"
        : "none",
    motors: numberedPropulsors.map((propulsor) => ({
      motorNumber: propulsor.motorNumber,
      rollFactor: propulsor.rollFactor,
      pitchFactor: propulsor.pitchFactor,
      yawFactor: propulsor.yawFactor,
      testOrder: propulsor.testOrder,
      role: propulsor.tilts ? "tilt" : "lift",
    })),
    hasLiftMotorSurface: true,
    hasMotorTestSurface: true,
    message: null,
  };
}

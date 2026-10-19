import type { Airframe, MotorLayout, MotorNumber } from "../airframe";
import { getMotorLayout } from "../../data/motor-layouts";
import type { VtolTopologySnapshot } from "./vtol-topology-model";

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
  motors: MotorDiagramEntry[];
  message: string | null;
};

function cloneMotors(motors: MotorLayout[]): MotorDiagramEntry[] {
  return motors.map((motor) => ({ ...motor }));
}

export function getApMotorDiagramModel(frame: Airframe | null): MotorDiagramModel | null {
  const layout = getMotorLayout(frame);
  if (!layout) {
    return null;
  }
  const motors = layout.motors;

  return {
    status: "supported",
    source: "ap-motors",
    className: layout.className,
    typeName: layout.typeName,
    motors: cloneMotors(motors),
    message: null,
  };
}

export function getVtolTopologyDiagramModel(snapshot: VtolTopologySnapshot): MotorDiagramModel | null {
  if (!snapshot.enabled) {
    return null;
  }

  const numberedPropulsors = snapshot.propulsors.filter(
    (propulsor): propulsor is typeof propulsor & { motorNumber: MotorNumber } => propulsor.motorNumber !== null,
  );
  if (numberedPropulsors.length === 0) {
    const usesPlaneThrottle =
      snapshot.propulsors.length > 0 &&
      (snapshot.architecture === "bicopter" || snapshot.architecture === "tailsitter_single_dual");
    return {
      status: usesPlaneThrottle ? "preview-only" : "unsupported",
      source: "custom",
      className: snapshot.frameClassLabel,
      typeName: snapshot.frameTypeLabel,
      motors: [],
      message: usesPlaneThrottle
        ? "This architecture uses plane throttle functions instead of the multicopter motor_test numbering. Verify its propulsion outputs through the documented tailsitter/bicopter bench procedure."
        : "The selected VTOL frame or mechanism has no verified motor diagram. Review the airframe configuration before testing outputs.",
    };
  }

  return {
    status: snapshot.supportedDiagram ? "supported" : "unsupported",
    source: "ap-motors",
    className: snapshot.frameClassLabel,
    typeName: snapshot.frameTypeLabel,
    motors: numberedPropulsors.map((propulsor) => ({
      motorNumber: propulsor.motorNumber,
      position: propulsor.position,
      rotation: propulsor.rotation,
      testOrder: propulsor.testOrder,
      role: propulsor.tilts ? "tilt" : "lift",
    })),
    message: null,
  };
}

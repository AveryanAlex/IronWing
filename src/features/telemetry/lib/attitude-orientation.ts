export type QuaternionComponents = {
  x: number;
  y: number;
  z: number;
  w: number;
};

export type AttitudeModelKind =
  | "fixed_wing"
  | "vtol"
  | "multirotor"
  | "helicopter"
  | "rover"
  | "submarine"
  | "generic";

type Vector3Components = {
  x: number;
  y: number;
  z: number;
};

const DEG_TO_RAD = Math.PI / 180;

function finiteOrZero(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeDegrees(value: number | null | undefined): number {
  const finiteValue = finiteOrZero(value);
  return ((finiteValue + 180) % 360 + 360) % 360 - 180;
}

function multiplyQuaternions(a: QuaternionComponents, b: QuaternionComponents): QuaternionComponents {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

/**
 * Converts MAVLink roll/pitch/yaw into the Three.js model basis used by the
 * attitude scene: forward -Z, right +X, and up +Y.
 */
export function attitudeQuaternion(
  rollDeg: number | null | undefined,
  pitchDeg: number | null | undefined,
  yawDeg: number | null | undefined,
): QuaternionComponents {
  const rollHalf = -normalizeDegrees(rollDeg) * DEG_TO_RAD / 2;
  const pitchHalf = normalizeDegrees(pitchDeg) * DEG_TO_RAD / 2;
  const yawHalf = -normalizeDegrees(yawDeg) * DEG_TO_RAD / 2;

  const yaw = { x: 0, y: Math.sin(yawHalf), z: 0, w: Math.cos(yawHalf) };
  const pitch = { x: Math.sin(pitchHalf), y: 0, z: 0, w: Math.cos(pitchHalf) };
  const roll = { x: 0, y: 0, z: Math.sin(rollHalf), w: Math.cos(rollHalf) };
  const composed = multiplyQuaternions(multiplyQuaternions(yaw, pitch), roll);
  const magnitude = Math.hypot(composed.x, composed.y, composed.z, composed.w) || 1;

  return {
    x: composed.x / magnitude,
    y: composed.y / magnitude,
    z: composed.z / magnitude,
    w: composed.w / magnitude,
  };
}

export function rotateVectorByQuaternion(
  vector: Vector3Components,
  quaternion: QuaternionComponents,
): Vector3Components {
  const { x, y, z, w } = quaternion;
  const ix = w * vector.x + y * vector.z - z * vector.y;
  const iy = w * vector.y + z * vector.x - x * vector.z;
  const iz = w * vector.z + x * vector.y - y * vector.x;
  const iw = -x * vector.x - y * vector.y - z * vector.z;

  return {
    x: ix * w + iw * -x + iy * -z - iz * -y,
    y: iy * w + iw * -y + iz * -x - ix * -z,
    z: iz * w + iw * -z + ix * -y - iy * -x,
  };
}

export function resolveAttitudeModelKind(vehicleType: string | null | undefined): AttitudeModelKind {
  const normalized = vehicleType?.trim().toLowerCase().replace(/[- ]/g, "_") ?? "";

  if (normalized === "fixed_wing" || normalized === "plane" || normalized.includes("arduplane")) {
    return "fixed_wing";
  }
  if (normalized === "vtol" || normalized.includes("quadplane")) {
    return "vtol";
  }
  if (normalized.includes("helicopter") || normalized === "heli") {
    return "helicopter";
  }
  if (
    normalized.includes("quad")
    || normalized.includes("hex")
    || normalized.includes("octo")
    || normalized.includes("tri")
    || normalized.includes("copter")
    || normalized === "coaxial"
  ) {
    return "multirotor";
  }
  if (normalized.includes("rover") || normalized === "car") {
    return "rover";
  }
  if (normalized.includes("submarine") || normalized === "sub" || normalized === "boat") {
    return "submarine";
  }

  return "generic";
}

export function multirotorLayout(vehicleType: string | null | undefined): "tri" | "quad" | "hex" | "octo" | "coaxial" {
  const normalized = vehicleType?.trim().toLowerCase() ?? "";
  if (normalized.includes("tri")) return "tri";
  if (normalized.includes("hex")) return "hex";
  if (normalized.includes("octo")) return "octo";
  if (normalized.includes("coaxial")) return "coaxial";
  return "quad";
}

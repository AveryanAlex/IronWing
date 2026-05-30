export type RollPitchStickInput = {
  roll: number;
  pitch: number;
};

export type CopterTiltEnvelope = {
  rollRad: number;
  pitchRad: number;
  thrust: {
    x: number;
    y: number;
  };
  thrustLimit: number;
};

export type CopterTiltCapInput = {
  atcAngleMaxDeg: number;
  pscAngleMaxDeg?: number | null;
  loitAngleMaxDeg?: number | null;
};

export type CopterTiltCaps = {
  angleModeDeg: number;
  assistedModeDeg: number;
  loiterPilotDeg: number;
  pscUsesAtc: boolean;
  loiterUsesAutomatic: boolean;
};

const MAX_SAFE_TILT_DEG = 85;
const MIN_LIMIT_TILT_DEG = 10;

/**
 * Models ArduPilot's rc_input_to_roll_pitch_rad from libraries/AP_Math/control.cpp.
 * The returned thrust vector is useful for plotting the same circular cap that the
 * firmware applies before converting the target back to Euler roll and pitch.
 */
export function rcInputToRollPitchRad(
  stick: RollPitchStickInput,
  angleMaxDeg: number,
  angleLimitDeg: number = angleMaxDeg,
): CopterTiltEnvelope {
  const roll = clampNumber(stick.roll, -1, 1);
  const pitch = clampNumber(stick.pitch, -1, 1);
  const maxAngleDeg = clampNumber(angleMaxDeg, 0, MAX_SAFE_TILT_DEG);
  const maxAngleRad = degreesToRadians(maxAngleDeg);
  const limitAngleDeg = clampNumber(angleLimitDeg, Math.min(MIN_LIMIT_TILT_DEG, maxAngleDeg), maxAngleDeg);
  const thrustLimit = Math.tan(degreesToRadians(limitAngleDeg));

  let thrustX = -Math.tan(maxAngleRad * pitch);
  let thrustY = Math.tan(maxAngleRad * roll);
  const thrustLength = Math.hypot(thrustX, thrustY);
  if (thrustLength > thrustLimit && thrustLength > 0) {
    const scale = thrustLimit / thrustLength;
    thrustX *= scale;
    thrustY *= scale;
  }

  const pitchRad = -Math.atan(thrustX);
  const rollRad = Math.atan(Math.cos(pitchRad) * thrustY);

  return {
    rollRad,
    pitchRad,
    thrust: {
      x: thrustX,
      y: thrustY,
    },
    thrustLimit,
  };
}

/** Resolves static Copter cap semantics before transient altitude-hold limiting. */
export function resolveCopterTiltCapsDeg(input: CopterTiltCapInput): CopterTiltCaps {
  const angleModeDeg = clampNumber(input.atcAngleMaxDeg, 0, MAX_SAFE_TILT_DEG);
  const pscUsesAtc = !isPositive(input.pscAngleMaxDeg);
  const assistedModeDeg = pscUsesAtc
    ? angleModeDeg
    : Math.min(angleModeDeg, input.pscAngleMaxDeg as number);
  const loiterUsesAutomatic = !isPositive(input.loitAngleMaxDeg);
  const loiterPilotDeg = loiterUsesAutomatic
    ? assistedModeDeg * (2 / 3)
    : Math.min(assistedModeDeg, input.loitAngleMaxDeg as number);

  return {
    angleModeDeg,
    assistedModeDeg,
    loiterPilotDeg,
    pscUsesAtc,
    loiterUsesAutomatic,
  };
}

export function degreesToRadians(value: number): number {
  return value * (Math.PI / 180);
}

export function radiansToDegrees(value: number): number {
  return value * (180 / Math.PI);
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function isPositive(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

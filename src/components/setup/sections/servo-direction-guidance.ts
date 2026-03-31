export type DirectionGuidance = {
  minLabel: string;
  maxLabel: string;
};

const FALLBACK: DirectionGuidance = {
  minLabel: "Min PWM position",
  maxLabel: "Max PWM position",
};

/**
 * Direction guidance for ArduPilot servo function codes.
 * Verified against ArduPilot source (SRV_Channel.cpp, ArduPlane/servos.cpp).
 * Core rule: positive internal control value → MAX PWM (with REVERSED=0).
 */
const GUIDANCE: ReadonlyMap<number, DirectionGuidance> = new Map([
  // Control surfaces
  [4,  { minLabel: "Roll left (trailing edge up)", maxLabel: "Roll right (trailing edge down)" }],
  [19, { minLabel: "Pitch down (trailing edge down)", maxLabel: "Pitch up (trailing edge up)" }],
  [21, { minLabel: "Yaw left", maxLabel: "Yaw right" }],
  [24, { minLabel: "Surface up", maxLabel: "Surface down" }],
  [25, { minLabel: "Surface up", maxLabel: "Surface down" }],
  [77, { minLabel: "Surface down", maxLabel: "Surface up" }],
  [78, { minLabel: "Surface down", maxLabel: "Surface up" }],
  [79, { minLabel: "Surface down", maxLabel: "Surface up" }],
  [80, { minLabel: "Surface down", maxLabel: "Surface up" }],

  // Flaps & spoilers
  [2,   { minLabel: "Retracted", maxLabel: "Fully deployed" }],
  [3,   { minLabel: "Retracted", maxLabel: "Fully deployed" }],
  [16,  { minLabel: "Retracted", maxLabel: "Fully deployed" }],
  [17,  { minLabel: "Retracted", maxLabel: "Fully deployed" }],
  [86,  { minLabel: "Retracted", maxLabel: "Fully deployed" }],
  [87,  { minLabel: "Retracted", maxLabel: "Fully deployed" }],
  [110, { minLabel: "Retracted", maxLabel: "Fully deployed" }],

  // Throttle & propulsion
  [70, { minLabel: "Idle / off", maxLabel: "Full throttle" }],
  [73, { minLabel: "Idle / off", maxLabel: "Full throttle" }],
  [74, { minLabel: "Idle / off", maxLabel: "Full throttle" }],
  [81, { minLabel: "Idle / off", maxLabel: "Full throttle" }],

  // Ground steering
  [26, { minLabel: "Full left", maxLabel: "Full right" }],

  // Gimbal / mount
  [6,  { minLabel: "Full left", maxLabel: "Full right" }],
  [7,  { minLabel: "Full down", maxLabel: "Full up" }],
  [8,  { minLabel: "Full left", maxLabel: "Full right" }],
  [9,  { minLabel: "Retracted", maxLabel: "Deployed" }],
  [12, { minLabel: "Full left", maxLabel: "Full right" }],
  [13, { minLabel: "Full down", maxLabel: "Full up" }],
  [14, { minLabel: "Full left", maxLabel: "Full right" }],
  [15, { minLabel: "Retracted", maxLabel: "Deployed" }],

  // VTOL tilt
  [41, { minLabel: "Forward flight", maxLabel: "Vertical hover" }],
  [45, { minLabel: "Forward flight", maxLabel: "Vertical hover" }],
  [46, { minLabel: "Forward flight", maxLabel: "Vertical hover" }],
  [47, { minLabel: "Forward flight", maxLabel: "Vertical hover" }],
  [75, { minLabel: "Forward flight", maxLabel: "Vertical hover" }],
  [76, { minLabel: "Forward flight", maxLabel: "Vertical hover" }],

  // Mechanical
  [27, { minLabel: "Locked", maxLabel: "Released" }],
  [29, { minLabel: "Deployed (down)", maxLabel: "Retracted (up)" }],
  [88, { minLabel: "Retract", maxLabel: "Deploy" }],
]);

/** Return direction guidance for an ArduPilot servo function code. */
export function getDirectionGuidance(functionCode: number): DirectionGuidance {
  return GUIDANCE.get(functionCode) ?? FALLBACK;
}

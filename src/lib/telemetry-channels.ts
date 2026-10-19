/** Position is channel number minus one; null is an unavailable sample. */
export type PwmChannelSamples = readonly (number | null)[];

export const RC_TELEMETRY_CHANNEL_COUNT = 18;
export const SERVO_TELEMETRY_CHANNEL_COUNT = 16;
export const SERVO_PARAMETER_OUTPUT_COUNT = 32;

export function readChannelPwm(samples: PwmChannelSamples | null | undefined, channel: number): number | null {
  if (!Number.isInteger(channel) || channel < 1) return null;
  const value = samples?.[channel - 1];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

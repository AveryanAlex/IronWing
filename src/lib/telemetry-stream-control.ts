import type { SourceKind } from "../session";
import type { LiveSettingsStoreState } from "./stores/live-settings";

export const RC_CHANNELS_MESSAGE_ID = 65;
export const SERVO_OUTPUT_MESSAGE_ID = 36;
export const PWM_TELEMETRY_RATE_HZ = 5;

export type TelemetryStreamControlKind =
  | "live"
  | "enable"
  | "enabling"
  | "waiting"
  | "failed"
  | "disconnected"
  | "playback";

export type TelemetryStreamControlView = {
  kind: TelemetryStreamControlKind;
  error: string | null;
  requestedCount: number;
};

type TelemetryStreamControlInput = {
  available: boolean;
  connected: boolean;
  activeSource: SourceKind | null;
  messageIds: readonly number[];
  settings: Pick<
    LiveSettingsStoreState,
    "applyPhase" | "applyTarget" | "confirmedSettings" | "messageRateApplyIds" | "messageRateErrors"
  >;
};

export function resolveTelemetryStreamControl(input: TelemetryStreamControlInput): TelemetryStreamControlView {
  if (input.available) {
    return { kind: "live", error: null, requestedCount: input.messageIds.length };
  }

  const requestedCount = input.messageIds.filter(
    (messageId) => input.settings.confirmedSettings.messageRates[messageId] !== undefined,
  ).length;
  const activeIds = new Set(input.settings.messageRateApplyIds);
  const applyingRequestedStream = input.settings.applyPhase === "applying"
    && input.messageIds.some((messageId) => activeIds.has(messageId));
  const error = input.messageIds
    .map((messageId) => input.settings.messageRateErrors[messageId]?.message ?? null)
    .find((message): message is string => message !== null) ?? null;

  if (applyingRequestedStream) {
    return { kind: "enabling", error: null, requestedCount };
  }

  if (input.activeSource === "playback") {
    return { kind: "playback", error: null, requestedCount };
  }

  if (!input.connected) {
    return { kind: "disconnected", error: null, requestedCount };
  }

  if (error) {
    return { kind: "failed", error, requestedCount };
  }

  if (requestedCount === input.messageIds.length) {
    return { kind: "waiting", error: null, requestedCount };
  }

  return { kind: "enable", error: null, requestedCount };
}

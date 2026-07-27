import { describe, expect, it } from "vitest";

import type { LiveSettingsStoreState } from "./stores/live-settings";
import { resolveTelemetryStreamControl } from "./telemetry-stream-control";

function settings(
  overrides: Partial<Pick<
    LiveSettingsStoreState,
    "applyPhase" | "applyTarget" | "confirmedSettings" | "messageRateApplyIds" | "messageRateErrors"
  >> = {},
) {
  return {
    applyPhase: "idle",
    applyTarget: null,
    confirmedSettings: {
      telemetryRateHz: 5,
      svsEnabled: true,
      messageRates: {},
      terrainSafetyMarginM: 10,
      cruiseSpeedMps: 15,
      hoverSpeedMps: 5,
      recordingAutoRecordOnConnect: false,
    },
    messageRateApplyIds: [],
    messageRateErrors: {},
    ...overrides,
  } satisfies Pick<
    LiveSettingsStoreState,
    "applyPhase" | "applyTarget" | "confirmedSettings" | "messageRateApplyIds" | "messageRateErrors"
  >;
}

describe("telemetry stream control", () => {
  it("offers enable for missing live streams and reports live data when it arrives", () => {
    expect(resolveTelemetryStreamControl({
      available: false,
      connected: true,
      activeSource: "live",
      messageIds: [65],
      settings: settings(),
    }).kind).toBe("enable");

    expect(resolveTelemetryStreamControl({
      available: true,
      connected: true,
      activeSource: "live",
      messageIds: [65],
      settings: settings(),
    }).kind).toBe("live");
  });

  it("distinguishes applying, requested-but-waiting, and failed streams", () => {
    expect(resolveTelemetryStreamControl({
      available: false,
      connected: true,
      activeSource: "live",
      messageIds: [36, 65],
      settings: settings({
        applyPhase: "applying",
        applyTarget: "quick",
        messageRateApplyIds: [36, 65],
      }),
    }).kind).toBe("enabling");

    expect(resolveTelemetryStreamControl({
      available: false,
      connected: true,
      activeSource: "live",
      messageIds: [36, 65],
      settings: settings({
        confirmedSettings: {
          ...settings().confirmedSettings,
          messageRates: { 36: 5, 65: 5 },
        },
      }),
    }).kind).toBe("waiting");

    const failed = resolveTelemetryStreamControl({
      available: false,
      connected: true,
      activeSource: "live",
      messageIds: [65],
      settings: settings({
        messageRateErrors: {
          65: { messageId: 65, requestedRateHz: 5, message: "request rejected" },
        },
      }),
    });
    expect(failed).toMatchObject({ kind: "failed", error: "request rejected" });
  });

  it("does not offer a live request during playback or while disconnected", () => {
    expect(resolveTelemetryStreamControl({
      available: false,
      connected: false,
      activeSource: "playback",
      messageIds: [65],
      settings: settings(),
    }).kind).toBe("playback");

    expect(resolveTelemetryStreamControl({
      available: false,
      connected: false,
      activeSource: "live",
      messageIds: [65],
      settings: settings(),
    }).kind).toBe("disconnected");
  });
});

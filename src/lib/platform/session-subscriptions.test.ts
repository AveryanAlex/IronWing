import { describe, expect, it, vi } from "vitest";

const {
  subscribeSessionState,
  subscribeTelemetryState,
  subscribePlaybackState,
  subscribeSupportState,
  subscribeSensorHealthStateEvent,
  subscribeConfigurationFactsEvent,
  subscribeCalibrationStateEvent,
  subscribeGuidedState,
  subscribeStatusTextState,
} = vi.hoisted(() => ({
  subscribeSessionState: vi.fn(),
  subscribeTelemetryState: vi.fn(),
  subscribePlaybackState: vi.fn(),
  subscribeSupportState: vi.fn(),
  subscribeSensorHealthStateEvent: vi.fn(),
  subscribeConfigurationFactsEvent: vi.fn(),
  subscribeCalibrationStateEvent: vi.fn(),
  subscribeGuidedState: vi.fn(),
  subscribeStatusTextState: vi.fn(),
}));

vi.mock("../../session", () => ({
  ackSessionSnapshot: vi.fn(),
  connectSession: vi.fn(),
  disconnectSession: vi.fn(),
  openSessionSnapshot: vi.fn(),
  subscribeSessionState,
  subscribeStatusTextState,
  subscribeSupportState,
  subscribeTelemetryState,
}));

vi.mock("../../playback", () => ({
  subscribePlaybackState,
}));

vi.mock("../../telemetry", () => ({
  btGetBondedDevices: vi.fn(),
  btRequestPermissions: vi.fn(),
  btScanBle: vi.fn(),
  getAvailableModes: vi.fn(),
  listSerialPorts: vi.fn(),
}));

vi.mock("../../transport", () => ({
  availableTransportDescriptors: vi.fn(),
  buildConnectRequest: vi.fn(),
  describeTransportAvailability: vi.fn(),
  validateTransportDescriptor: vi.fn(),
}));

vi.mock("../../guided", () => ({
  subscribeGuidedState,
}));

vi.mock("../../calibration", () => ({
  subscribeCalibrationStateEvent,
}));

vi.mock("../../configuration-facts", () => ({
  subscribeConfigurationFactsEvent,
}));

vi.mock("../../sensor-health", () => ({
  subscribeSensorHealthStateEvent,
}));

vi.mock("../error-format", () => ({
  formatUnknownError: vi.fn(),
}));

vi.mock("../local-storage", () => ({
  getBrowserStorage: vi.fn(),
  readStorageJson: vi.fn(),
  writeStorageJson: vi.fn(),
}));

describe("platform session subscriptions", () => {
  it("wires playback state into subscribeAll and disposes every listener", async () => {
    const sessionUnlisten = vi.fn();
    const telemetryUnlisten = vi.fn();
    const playbackUnlisten = vi.fn();
    const supportUnlisten = vi.fn();
    const sensorHealthUnlisten = vi.fn();
    const configurationFactsUnlisten = vi.fn();
    const calibrationUnlisten = vi.fn();
    const guidedUnlisten = vi.fn();
    const statusTextUnlisten = vi.fn();

    subscribeSessionState.mockResolvedValue(sessionUnlisten);
    subscribeTelemetryState.mockResolvedValue(telemetryUnlisten);
    subscribePlaybackState.mockResolvedValue(playbackUnlisten);
    subscribeSupportState.mockResolvedValue(supportUnlisten);
    subscribeSensorHealthStateEvent.mockResolvedValue(sensorHealthUnlisten);
    subscribeConfigurationFactsEvent.mockResolvedValue(configurationFactsUnlisten);
    subscribeCalibrationStateEvent.mockResolvedValue(calibrationUnlisten);
    subscribeGuidedState.mockResolvedValue(guidedUnlisten);
    subscribeStatusTextState.mockResolvedValue(statusTextUnlisten);

    const { subscribeAll } = await import("./session");
    const handlers = {
      onSession: vi.fn(),
      onTelemetry: vi.fn(),
      onPlayback: vi.fn(),
      onSupport: vi.fn(),
      onSensorHealth: vi.fn(),
      onConfigurationFacts: vi.fn(),
      onCalibration: vi.fn(),
      onGuided: vi.fn(),
      onStatusText: vi.fn(),
    };

    const dispose = await subscribeAll(handlers);

    expect(subscribePlaybackState).toHaveBeenCalledWith(handlers.onPlayback);

    dispose();

    expect(sessionUnlisten).toHaveBeenCalledOnce();
    expect(telemetryUnlisten).toHaveBeenCalledOnce();
    expect(playbackUnlisten).toHaveBeenCalledOnce();
    expect(supportUnlisten).toHaveBeenCalledOnce();
    expect(sensorHealthUnlisten).toHaveBeenCalledOnce();
    expect(configurationFactsUnlisten).toHaveBeenCalledOnce();
    expect(calibrationUnlisten).toHaveBeenCalledOnce();
    expect(guidedUnlisten).toHaveBeenCalledOnce();
    expect(statusTextUnlisten).toHaveBeenCalledOnce();
  });
});

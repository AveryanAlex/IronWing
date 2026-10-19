export enum ArduPilotRssiSource {
  Disabled = 0,
  AnalogPin = 1,
  RcChannelPwm = 2,
  ReceiverProtocol = 3,
  PwmInputPin = 4,
  TelemetryRadio = 5,
}
type RssiSourceDescriptor = {
  label: string;
  parameters: readonly string[];
  calibration: { low: string; high: string } | null;
  livePreview: "rc_channel" | "none";
  description: string;
};
const STATUS_DESCRIPTION =
  "Raw samples for this RSSI source may not be available in the RC channel monitor. Use the live RSSI status value to confirm vehicle reporting.";
export const RSSI_SOURCE_DESCRIPTORS: Record<ArduPilotRssiSource, RssiSourceDescriptor> = {
  [ArduPilotRssiSource.Disabled]: {
    label: "Disabled",
    parameters: [],
    calibration: null,
    livePreview: "none",
    description: "RSSI reporting is disabled. The vehicle may still expose a retained live RSSI status value.",
  },
  [ArduPilotRssiSource.AnalogPin]: {
    label: "Analog pin",
    parameters: ["RSSI_ANA_PIN", "RSSI_PIN_LOW", "RSSI_PIN_HIGH"],
    calibration: { low: "RSSI_PIN_LOW", high: "RSSI_PIN_HIGH" },
    livePreview: "none",
    description: STATUS_DESCRIPTION,
  },
  [ArduPilotRssiSource.RcChannelPwm]: {
    label: "RC channel PWM value",
    parameters: ["RSSI_CHANNEL", "RSSI_CHAN_LOW", "RSSI_CHAN_HIGH"],
    calibration: { low: "RSSI_CHAN_LOW", high: "RSSI_CHAN_HIGH" },
    livePreview: "rc_channel",
    description:
      "This source uses a receiver-channel PWM sample, so the selected channel can be previewed from the live RC monitor when available.",
  },
  [ArduPilotRssiSource.ReceiverProtocol]: {
    label: "Receiver protocol",
    parameters: [],
    calibration: null,
    livePreview: "none",
    description: STATUS_DESCRIPTION,
  },
  [ArduPilotRssiSource.PwmInputPin]: {
    label: "PWM input pin",
    parameters: ["RSSI_ANA_PIN", "RSSI_CHAN_LOW", "RSSI_CHAN_HIGH"],
    calibration: { low: "RSSI_CHAN_LOW", high: "RSSI_CHAN_HIGH" },
    livePreview: "none",
    description: STATUS_DESCRIPTION,
  },
  [ArduPilotRssiSource.TelemetryRadio]: {
    label: "Telemetry radio RSSI",
    parameters: [],
    calibration: null,
    livePreview: "none",
    description: STATUS_DESCRIPTION,
  },
};
export function resolveRssiSourceType(value: number | null | undefined): ArduPilotRssiSource | null {
  return value != null && Object.prototype.hasOwnProperty.call(RSSI_SOURCE_DESCRIPTORS, value)
    ? (value as ArduPilotRssiSource)
    : null;
}
export function rssiSourceDescriptor(value: number | null | undefined): RssiSourceDescriptor | null {
  const source = resolveRssiSourceType(value);
  return source === null ? null : RSSI_SOURCE_DESCRIPTORS[source];
}

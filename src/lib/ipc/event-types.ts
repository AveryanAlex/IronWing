import { EVENT_NAMES, type EventName } from "../generated/events";
import type { CalibrationDomain } from "../../calibration";
import type { FirmwareProgress } from "../../firmware";
import type { GuidedDomain } from "../../guided";
import type { LogProgress } from "../../logs";
import type { MissionState, TransferProgress } from "../../mission";
import type { ParamProgress, ParamStore } from "../../params";
import type { PlaybackStateSnapshot } from "../../playback";
import type { MagCalProgress, MagCalReport, SensorHealthDomain } from "../../sensor-health";
import type { SessionDomain, SessionEvent } from "../../session";
import type { StatusTextDomain } from "../../statustext";
import type { SupportDomain } from "../../support";
import type { TelemetryDomain } from "../../telemetry";

export type EventPayloadMap = {
  [EVENT_NAMES.SESSION_STATE]: SessionEvent<SessionDomain>;
  [EVENT_NAMES.TELEMETRY_STATE]: SessionEvent<TelemetryDomain>;
  [EVENT_NAMES.MISSION_STATE]: SessionEvent<MissionState>;
  [EVENT_NAMES.MISSION_PROGRESS]: SessionEvent<TransferProgress>;
  [EVENT_NAMES.PARAM_STORE]: SessionEvent<ParamStore>;
  [EVENT_NAMES.PARAM_PROGRESS]: SessionEvent<ParamProgress>;
  [EVENT_NAMES.SENSOR_HEALTH_STATE]: SessionEvent<SensorHealthDomain>;
  [EVENT_NAMES.CALIBRATION_STATE]: SessionEvent<CalibrationDomain>;
  [EVENT_NAMES.COMPASS_CAL_PROGRESS]: MagCalProgress;
  [EVENT_NAMES.COMPASS_CAL_REPORT]: MagCalReport;
  [EVENT_NAMES.STATUS_TEXT_STATE]: SessionEvent<StatusTextDomain>;
  [EVENT_NAMES.SUPPORT_STATE]: SessionEvent<SupportDomain>;
  [EVENT_NAMES.GUIDED_STATE]: SessionEvent<GuidedDomain>;
  [EVENT_NAMES.PLAYBACK_STATE]: SessionEvent<PlaybackStateSnapshot>;
  [EVENT_NAMES.LOG_PROGRESS]: LogProgress;
  [EVENT_NAMES.FIRMWARE_PROGRESS]: FirmwareProgress;
};

export type KnownEventName = keyof EventPayloadMap & EventName;
export type UnlistedMappedEvent = Exclude<keyof EventPayloadMap, EventName>;
export type UnmappedGeneratedEvent = Exclude<EventName, keyof EventPayloadMap>;
export type EventPayload<E extends keyof EventPayloadMap> = EventPayloadMap[E];

const eventMapUsesGeneratedEvents: UnlistedMappedEvent extends never ? true : never = true;
const eventMapCoversGeneratedEvents: UnmappedGeneratedEvent extends never ? true : never = true;

export { eventMapCoversGeneratedEvents, eventMapUsesGeneratedEvents };

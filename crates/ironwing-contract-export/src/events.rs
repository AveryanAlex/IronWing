use std::error::Error;

use ironwing_core::event_names;

pub struct EventSpec {
    pub constant_name: &'static str,
    pub event_name: &'static str,
    pub payload_ts: &'static str,
}

const fn event(
    constant_name: &'static str,
    event_name: &'static str,
    payload_ts: &'static str,
) -> EventSpec {
    EventSpec {
        constant_name,
        event_name,
        payload_ts,
    }
}

pub const EVENT_SPECS: &[EventSpec] = &[
    event(
        "SESSION_STATE",
        event_names::SESSION_STATE,
        "SessionEvent<SessionDomain>",
    ),
    event(
        "TELEMETRY_STATE",
        event_names::TELEMETRY_STATE,
        "SessionEvent<TelemetryDomain>",
    ),
    event("MISSION_STATE", event_names::MISSION_STATE, "SessionEvent<MissionState>"),
    event(
        "MISSION_PROGRESS",
        event_names::MISSION_PROGRESS,
        "SessionEvent<TransferProgress>",
    ),
    event("PARAM_STORE", event_names::PARAM_STORE, "SessionEvent<ParamStore>"),
    event(
        "PARAM_PROGRESS",
        event_names::PARAM_PROGRESS,
        "SessionEvent<ParamProgress>",
    ),
    event(
        "SENSOR_HEALTH_STATE",
        event_names::SENSOR_HEALTH_STATE,
        "SessionEvent<SensorHealthDomain>",
    ),
    event(
        "CALIBRATION_STATE",
        event_names::CALIBRATION_STATE,
        "SessionEvent<CalibrationDomain>",
    ),
    event("COMPASS_CAL_PROGRESS", event_names::COMPASS_CAL_PROGRESS, "MagCalProgress"),
    event("COMPASS_CAL_REPORT", event_names::COMPASS_CAL_REPORT, "MagCalReport"),
    event(
        "STATUS_TEXT_STATE",
        event_names::STATUS_TEXT_STATE,
        "SessionEvent<StatusTextDomain>",
    ),
    event("SUPPORT_STATE", event_names::SUPPORT_STATE, "SessionEvent<SupportDomain>"),
    event("GUIDED_STATE", event_names::GUIDED_STATE, "SessionEvent<GuidedDomain>"),
    event(
        "PLAYBACK_STATE",
        event_names::PLAYBACK_STATE,
        "SessionEvent<PlaybackStateSnapshot>",
    ),
    event("LOG_PROGRESS", event_names::LOG_PROGRESS, "LogProgress"),
    event("FIRMWARE_PROGRESS", event_names::FIRMWARE_PROGRESS, "FirmwareProgress"),
];

pub fn events_ts() -> Result<String, Box<dyn Error>> {
    let mut body = String::from(imports_ts());
    body.push('\n');
    body.push_str("export const EVENT_NAMES = {\n");
    for spec in EVENT_SPECS {
        body.push_str("  ");
        body.push_str(spec.constant_name);
        body.push_str(": ");
        body.push_str(&serde_json::to_string(spec.event_name)?);
        body.push_str(",\n");
    }
    body.push_str("} as const;\n\n");
    body.push_str("export type EventName = (typeof EVENT_NAMES)[keyof typeof EVENT_NAMES];\n");
    body.push('\n');
    body.push_str(&event_payload_map_ts());

    Ok(body)
}

fn imports_ts() -> &'static str {
    r#"import type { CalibrationDomain } from "../../calibration";
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
"#
}

fn event_payload_map_ts() -> String {
    let mut body = String::from("export type EventPayloadMap = {\n");
    for spec in EVENT_SPECS {
        body.push_str("  [EVENT_NAMES.");
        body.push_str(spec.constant_name);
        body.push_str("]: ");
        body.push_str(spec.payload_ts);
        body.push_str(";\n");
    }
    body.push_str("};\n\n");
    body.push_str("export type KnownEventName = keyof EventPayloadMap & EventName;\n");
    body.push_str("export type UnlistedMappedEvent = Exclude<keyof EventPayloadMap, EventName>;\n");
    body.push_str("export type UnmappedGeneratedEvent = Exclude<EventName, keyof EventPayloadMap>;\n");
    body.push_str("export type EventPayload<E extends keyof EventPayloadMap> = EventPayloadMap[E];\n\n");
    body.push_str("const eventMapUsesGeneratedEvents: UnlistedMappedEvent extends never ? true : never = true;\n");
    body.push_str("const eventMapCoversGeneratedEvents: UnmappedGeneratedEvent extends never ? true : never = true;\n\n");
    body.push_str("export { eventMapCoversGeneratedEvents, eventMapUsesGeneratedEvents };\n");
    body
}

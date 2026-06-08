use std::error::Error;

use ironwing_core::event_names;

const EVENTS: &[(&str, &str)] = &[
    ("SESSION_STATE", event_names::SESSION_STATE),
    ("TELEMETRY_STATE", event_names::TELEMETRY_STATE),
    ("MISSION_STATE", event_names::MISSION_STATE),
    ("MISSION_PROGRESS", event_names::MISSION_PROGRESS),
    ("PARAM_STORE", event_names::PARAM_STORE),
    ("PARAM_PROGRESS", event_names::PARAM_PROGRESS),
    ("SENSOR_HEALTH_STATE", event_names::SENSOR_HEALTH_STATE),
    ("CALIBRATION_STATE", event_names::CALIBRATION_STATE),
    ("COMPASS_CAL_PROGRESS", event_names::COMPASS_CAL_PROGRESS),
    ("COMPASS_CAL_REPORT", event_names::COMPASS_CAL_REPORT),
    ("STATUS_TEXT_STATE", event_names::STATUS_TEXT_STATE),
    ("SUPPORT_STATE", event_names::SUPPORT_STATE),
    ("GUIDED_STATE", event_names::GUIDED_STATE),
    ("PLAYBACK_STATE", event_names::PLAYBACK_STATE),
    ("LOG_PROGRESS", event_names::LOG_PROGRESS),
    ("FIRMWARE_PROGRESS", event_names::FIRMWARE_PROGRESS),
];

pub fn events_ts() -> Result<String, Box<dyn Error>> {
    let mut body = String::from("export const EVENT_NAMES = {\n");
    for (key, value) in EVENTS {
        body.push_str("  ");
        body.push_str(key);
        body.push_str(": ");
        body.push_str(&serde_json::to_string(value)?);
        body.push_str(",\n");
    }
    body.push_str("} as const;\n\n");
    body.push_str("export type EventName = (typeof EVENT_NAMES)[keyof typeof EVENT_NAMES];\n");

    Ok(body)
}

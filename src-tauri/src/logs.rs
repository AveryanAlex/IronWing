use std::collections::HashMap;
use std::io::Write;

use mavkit::tlog::{TlogEntry, TlogFile};
use mavlink::Message;
use mavkit::dialect::MavMessage;
use serde::Serialize;

use crate::{
    AppState,
    e2e_emit::emit_event,
    helpers,
    ipc::{
        DomainProvenance, DomainValue, PlaybackSnapshot, SessionConnection, SessionEnvelope,
        SessionSnapshot, SessionStatus, StatusTextSnapshot, SupportSnapshot,
        TelemetrySnapshot as GroupedTelemetrySnapshot,
        playback::{PlaybackSeekResult, PlaybackState},
        status_text_snapshot_from_entries, telemetry_snapshot_from_value,
    },
};

#[derive(Serialize, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum LogType {
    Tlog,
    Bin,
}

#[derive(Serialize, Clone)]
pub(crate) struct LogSummary {
    file_name: String,
    start_usec: u64,
    end_usec: u64,
    duration_secs: f64,
    total_entries: usize,
    message_types: HashMap<String, usize>,
    log_type: LogType,
}

#[derive(Serialize, Clone)]
pub(crate) struct LogDataPoint {
    timestamp_usec: u64,
    fields: HashMap<String, f64>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "snake_case")]
enum LogLoadPhase {
    Parsing,
    Indexing,
    Completed,
}

#[derive(Serialize, Clone)]
struct LogProgress {
    phase: LogLoadPhase,
    parsed: usize,
}

struct StoredEntry {
    timestamp_usec: u64,
    msg_name: String,
    fields: HashMap<String, f64>,
}

pub(crate) struct LogStore {
    summary: LogSummary,
    entries: Vec<StoredEntry>,
    type_index: HashMap<String, Vec<usize>>,
    playback_cursor_usec: Option<u64>,
}

#[derive(Serialize, Clone)]
struct ScopedPlaybackStateEvent {
    envelope: SessionEnvelope,
    value: PlaybackState,
}

#[derive(Serialize, Clone)]
struct ScopedDomainEvent<T> {
    envelope: SessionEnvelope,
    value: T,
}

pub(crate) struct PlaybackFrame {
    pub session: DomainValue<SessionSnapshot>,
    pub telemetry: GroupedTelemetrySnapshot,
    pub support: SupportSnapshot,
    pub status_text: StatusTextSnapshot,
    pub playback: PlaybackSnapshot,
}

impl LogStore {
    pub(crate) fn seek_playback(
        &mut self,
        cursor_usec: Option<u64>,
        envelope: SessionEnvelope,
    ) -> PlaybackSeekResult {
        self.playback_cursor_usec = self.resolve_cursor_usec(cursor_usec);
        PlaybackSeekResult {
            envelope,
            cursor_usec: self.playback_cursor_usec,
        }
    }

    pub(crate) fn playback_frame(&self) -> PlaybackFrame {
        let cursor_usec = self.resolve_cursor_usec(self.playback_cursor_usec);
        let telemetry = self.telemetry_at(cursor_usec);
        let vehicle_state = self.vehicle_state_at(&telemetry);

        PlaybackFrame {
            session: DomainValue::present(
                SessionSnapshot {
                    status: SessionStatus::Active,
                    connection: SessionConnection::Disconnected,
                    vehicle_state,
                    home_position: None,
                },
                DomainProvenance::Playback,
            ),
            telemetry: telemetry_snapshot_from_value(
                &serde_json::to_value(telemetry).unwrap_or(serde_json::Value::Null),
                DomainProvenance::Playback,
            ),
            support: DomainValue::missing(DomainProvenance::Playback),
            status_text: status_text_snapshot_from_entries(Vec::new(), DomainProvenance::Playback),
            playback: PlaybackSnapshot { cursor_usec },
        }
    }

    fn resolve_cursor_usec(&self, cursor_usec: Option<u64>) -> Option<u64> {
        if self.entries.is_empty() {
            return None;
        }

        let min = self.summary.start_usec;
        let max = self.summary.end_usec;
        Some(cursor_usec.unwrap_or(min).clamp(min, max))
    }

    fn telemetry_at(&self, cursor_usec: Option<u64>) -> TelemetrySnapshot {
        let Some(cursor_usec) = cursor_usec else {
            return TelemetrySnapshot::default();
        };

        let mut telemetry = TelemetrySnapshot::default();
        for entry in self
            .entries
            .iter()
            .take_while(|entry| entry.timestamp_usec <= cursor_usec)
        {
            if self.summary.log_type == LogType::Bin {
                apply_bin_entry(&mut telemetry, entry);
            } else {
                apply_tlog_entry(&mut telemetry, entry);
            }
        }
        telemetry.timestamp_usec = cursor_usec;
        telemetry
    }

    /// Construct a vehicle-state–shaped JSON value for the playback session snapshot.
    /// VehicleState is not publicly accessible in mavkit v0.4.0, so we produce a
    /// serde_json::Value that matches the frontend contract shape.
    fn vehicle_state_at(&self, telemetry: &TelemetrySnapshot) -> Option<serde_json::Value> {
        let armed = telemetry.armed?;
        let custom_mode = telemetry.custom_mode?;

        Some(serde_json::json!({
            "armed": armed,
            "custom_mode": custom_mode,
            "mode_name": format!("Mode {custom_mode}"),
            "system_status": "active",
            "vehicle_type": "",
            "autopilot": "",
            "system_id": 0,
            "component_id": 0,
            "heartbeat_received": false,
        }))
    }
}

fn extract_fields(msg: &MavMessage) -> (String, HashMap<String, f64>) {
    let name = msg.message_name().to_string();
    let mut fields = HashMap::new();

    match msg {
        MavMessage::ATTITUDE(d) => {
            fields.insert("roll".into(), d.roll as f64);
            fields.insert("pitch".into(), d.pitch as f64);
            fields.insert("yaw".into(), d.yaw as f64);
            fields.insert("rollspeed".into(), d.rollspeed as f64);
            fields.insert("pitchspeed".into(), d.pitchspeed as f64);
            fields.insert("yawspeed".into(), d.yawspeed as f64);
        }
        MavMessage::VFR_HUD(d) => {
            fields.insert("airspeed".into(), d.airspeed as f64);
            fields.insert("groundspeed".into(), d.groundspeed as f64);
            fields.insert("heading".into(), d.heading as f64);
            fields.insert("throttle".into(), d.throttle as f64);
            fields.insert("alt".into(), d.alt as f64);
            fields.insert("climb".into(), d.climb as f64);
        }
        MavMessage::GLOBAL_POSITION_INT(d) => {
            fields.insert("lat".into(), d.lat as f64 / 1e7);
            fields.insert("lon".into(), d.lon as f64 / 1e7);
            fields.insert("alt".into(), d.alt as f64 / 1000.0);
            fields.insert("relative_alt".into(), d.relative_alt as f64 / 1000.0);
            fields.insert("vx".into(), d.vx as f64 / 100.0);
            fields.insert("vy".into(), d.vy as f64 / 100.0);
            fields.insert("vz".into(), d.vz as f64 / 100.0);
            fields.insert("hdg".into(), d.hdg as f64 / 100.0);
        }
        MavMessage::SYS_STATUS(d) => {
            fields.insert("voltage_battery".into(), d.voltage_battery as f64 / 1000.0);
            fields.insert("current_battery".into(), d.current_battery as f64 / 100.0);
            fields.insert("battery_remaining".into(), d.battery_remaining as f64);
            fields.insert("load".into(), d.load as f64 / 10.0);
        }
        MavMessage::GPS_RAW_INT(d) => {
            fields.insert("lat".into(), d.lat as f64 / 1e7);
            fields.insert("lon".into(), d.lon as f64 / 1e7);
            fields.insert("alt".into(), d.alt as f64 / 1000.0);
            fields.insert("fix_type".into(), d.fix_type as u8 as f64);
            fields.insert("satellites_visible".into(), d.satellites_visible as f64);
            fields.insert("eph".into(), d.eph as f64 / 100.0);
            fields.insert("epv".into(), d.epv as f64 / 100.0);
        }
        MavMessage::HEARTBEAT(d) => {
            fields.insert("custom_mode".into(), d.custom_mode as f64);
            fields.insert("base_mode".into(), d.base_mode.bits() as f64);
            fields.insert("system_status".into(), d.system_status as u8 as f64);
        }
        MavMessage::RC_CHANNELS(d) => {
            fields.insert("chan1_raw".into(), d.chan1_raw as f64);
            fields.insert("chan2_raw".into(), d.chan2_raw as f64);
            fields.insert("chan3_raw".into(), d.chan3_raw as f64);
            fields.insert("chan4_raw".into(), d.chan4_raw as f64);
            fields.insert("chan5_raw".into(), d.chan5_raw as f64);
            fields.insert("chan6_raw".into(), d.chan6_raw as f64);
            fields.insert("chan7_raw".into(), d.chan7_raw as f64);
            fields.insert("chan8_raw".into(), d.chan8_raw as f64);
            fields.insert("chancount".into(), d.chancount as f64);
            fields.insert("rssi".into(), d.rssi as f64);
        }
        MavMessage::SERVO_OUTPUT_RAW(d) => {
            fields.insert("servo1_raw".into(), d.servo1_raw as f64);
            fields.insert("servo2_raw".into(), d.servo2_raw as f64);
            fields.insert("servo3_raw".into(), d.servo3_raw as f64);
            fields.insert("servo4_raw".into(), d.servo4_raw as f64);
            fields.insert("servo5_raw".into(), d.servo5_raw as f64);
            fields.insert("servo6_raw".into(), d.servo6_raw as f64);
            fields.insert("servo7_raw".into(), d.servo7_raw as f64);
            fields.insert("servo8_raw".into(), d.servo8_raw as f64);
        }
        MavMessage::BATTERY_STATUS(d) => {
            fields.insert("current_battery".into(), d.current_battery as f64 / 100.0);
            fields.insert("current_consumed".into(), d.current_consumed as f64);
            fields.insert("energy_consumed".into(), d.energy_consumed as f64);
            fields.insert("battery_remaining".into(), d.battery_remaining as f64);
        }
        MavMessage::NAV_CONTROLLER_OUTPUT(d) => {
            fields.insert("nav_roll".into(), d.nav_roll as f64);
            fields.insert("nav_pitch".into(), d.nav_pitch as f64);
            fields.insert("nav_bearing".into(), d.nav_bearing as f64);
            fields.insert("target_bearing".into(), d.target_bearing as f64);
            fields.insert("wp_dist".into(), d.wp_dist as f64);
            fields.insert("alt_error".into(), d.alt_error as f64);
            fields.insert("xtrack_error".into(), d.xtrack_error as f64);
        }
        _ => {}
    }

    (name, fields)
}

fn tlog_to_stored(entry: &TlogEntry) -> StoredEntry {
    let (name, fields) = extract_fields(&entry.message);
    StoredEntry {
        timestamp_usec: entry.timestamp_usec,
        msg_name: name,
        fields,
    }
}

fn bin_to_stored(entry: &ardupilot_binlog::Entry) -> Option<StoredEntry> {
    let ts = entry.timestamp_usec?;
    let fields: HashMap<String, f64> = entry
        .fields()
        .filter_map(|(k, v)| v.as_f64().map(|f| (k.to_string(), f)))
        .collect();
    Some(StoredEntry {
        timestamp_usec: ts,
        msg_name: entry.name.clone(),
        fields,
    })
}

#[derive(Serialize, Clone)]
pub(crate) struct FlightPathPoint {
    timestamp_usec: u64,
    lat: f64,
    lon: f64,
    alt: f64,
    heading: f64,
}

const TELEMETRY_TRACK_INTERVAL_USEC: u64 = 100_000;

#[derive(Serialize, Clone, Default)]
pub(crate) struct TelemetrySnapshot {
    timestamp_usec: u64,
    latitude_deg: Option<f64>,
    longitude_deg: Option<f64>,
    altitude_m: Option<f64>,
    heading_deg: Option<f64>,
    speed_mps: Option<f64>,
    airspeed_mps: Option<f64>,
    climb_rate_mps: Option<f64>,
    roll_deg: Option<f64>,
    pitch_deg: Option<f64>,
    yaw_deg: Option<f64>,
    battery_pct: Option<f64>,
    battery_voltage_v: Option<f64>,
    battery_current_a: Option<f64>,
    energy_consumed_wh: Option<f64>,
    gps_fix_type: Option<String>,
    gps_satellites: Option<f64>,
    gps_hdop: Option<f64>,
    throttle_pct: Option<f64>,
    wp_dist_m: Option<f64>,
    nav_bearing_deg: Option<f64>,
    target_bearing_deg: Option<f64>,
    xtrack_error_m: Option<f64>,
    armed: Option<bool>,
    custom_mode: Option<u32>,
    rc_channels: Option<Vec<f64>>,
    rc_rssi: Option<f64>,
    servo_outputs: Option<Vec<f64>>,
}

#[derive(Serialize, Clone)]
pub(crate) struct FlightSummary {
    duration_secs: f64,
    max_alt_m: Option<f64>,
    avg_alt_m: Option<f64>,
    max_speed_mps: Option<f64>,
    avg_speed_mps: Option<f64>,
    total_distance_m: Option<f64>,
    max_distance_from_home_m: Option<f64>,
    battery_start_v: Option<f64>,
    battery_end_v: Option<f64>,
    battery_min_v: Option<f64>,
    mah_consumed: Option<f64>,
    gps_sats_min: Option<u32>,
    gps_sats_max: Option<u32>,
}

fn gps_fix_type_name(val: f64) -> String {
    match val as u8 {
        0 => "no_gps".into(),
        1 => "no_fix".into(),
        2 => "fix_2d".into(),
        3 => "fix_3d".into(),
        4 => "dgps".into(),
        5 => "rtk_float".into(),
        6 => "rtk_fixed".into(),
        _ => format!("fix_{}", val as u8),
    }
}

fn apply_tlog_entry(snap: &mut TelemetrySnapshot, entry: &StoredEntry) {
    let f = &entry.fields;
    match entry.msg_name.as_str() {
        "ATTITUDE" => {
            snap.roll_deg = f.get("roll").map(|v| v.to_degrees());
            snap.pitch_deg = f.get("pitch").map(|v| v.to_degrees());
            snap.yaw_deg = f.get("yaw").map(|v| v.to_degrees());
        }
        "VFR_HUD" => {
            snap.altitude_m = f.get("alt").copied();
            snap.speed_mps = f.get("groundspeed").copied();
            snap.heading_deg = f.get("heading").copied();
            snap.climb_rate_mps = f.get("climb").copied();
            snap.throttle_pct = f.get("throttle").copied();
            snap.airspeed_mps = f.get("airspeed").copied();
        }
        "GLOBAL_POSITION_INT" => {
            snap.latitude_deg = f.get("lat").copied();
            snap.longitude_deg = f.get("lon").copied();
            if snap.altitude_m.is_none() {
                snap.altitude_m = f.get("relative_alt").copied();
            }
            if snap.heading_deg.is_none() {
                snap.heading_deg = f.get("hdg").copied();
            }
        }
        "SYS_STATUS" => {
            snap.battery_voltage_v = f.get("voltage_battery").copied();
            snap.battery_current_a = f.get("current_battery").copied();
            snap.battery_pct = f.get("battery_remaining").copied();
        }
        "GPS_RAW_INT" => {
            snap.gps_fix_type = f.get("fix_type").map(|v| gps_fix_type_name(*v));
            snap.gps_satellites = f.get("satellites_visible").copied();
            snap.gps_hdop = f.get("eph").copied();
        }
        "HEARTBEAT" => {
            snap.custom_mode = f.get("custom_mode").map(|v| *v as u32);
            snap.armed = f.get("base_mode").map(|v| (*v as u32) & 0x80 != 0);
        }
        "NAV_CONTROLLER_OUTPUT" => {
            snap.nav_bearing_deg = f.get("nav_bearing").copied();
            snap.target_bearing_deg = f.get("target_bearing").copied();
            snap.wp_dist_m = f.get("wp_dist").copied();
            snap.xtrack_error_m = f.get("xtrack_error").copied();
        }
        "RC_CHANNELS" => {
            let chans: Vec<f64> = (1..=8)
                .filter_map(|i| f.get(&format!("chan{i}_raw")).copied())
                .collect();
            if !chans.is_empty() {
                snap.rc_channels = Some(chans);
            }
            snap.rc_rssi = f.get("rssi").copied();
        }
        "SERVO_OUTPUT_RAW" => {
            let servos: Vec<f64> = (1..=8)
                .filter_map(|i| f.get(&format!("servo{i}_raw")).copied())
                .collect();
            if !servos.is_empty() {
                snap.servo_outputs = Some(servos);
            }
        }
        "BATTERY_STATUS" => {
            snap.energy_consumed_wh = f.get("energy_consumed").copied();
        }
        _ => {}
    }
}

fn apply_bin_entry(snap: &mut TelemetrySnapshot, entry: &StoredEntry) {
    let f = &entry.fields;
    match entry.msg_name.as_str() {
        "ATT" => {
            snap.roll_deg = f.get("Roll").copied();
            snap.pitch_deg = f.get("Pitch").copied();
            snap.yaw_deg = f.get("Yaw").copied();
        }
        "CTUN" => {
            snap.altitude_m = f.get("Alt").copied();
            snap.climb_rate_mps = f.get("CRt").copied();
        }
        "GPS" => {
            snap.latitude_deg = f.get("Lat").map(|v| v / 1e7);
            snap.longitude_deg = f.get("Lng").map(|v| v / 1e7);
            snap.speed_mps = f.get("Spd").copied();
            snap.heading_deg = f.get("GCrs").copied();
            snap.gps_fix_type = f.get("Status").map(|v| gps_fix_type_name(*v));
            snap.gps_satellites = f.get("NSats").copied();
            snap.gps_hdop = f.get("HDop").copied();
        }
        "BAT" => {
            snap.battery_voltage_v = f.get("Volt").copied();
            snap.battery_current_a = f.get("Curr").copied();
            snap.battery_pct = f.get("Rem").copied();
        }
        "MODE" => {
            snap.custom_mode = f.get("ModeNum").map(|v| *v as u32);
        }
        "RCIN" => {
            let chans: Vec<f64> = (1..=8)
                .filter_map(|i| f.get(&format!("C{i}")).copied())
                .collect();
            if !chans.is_empty() {
                snap.rc_channels = Some(chans);
            }
        }
        "RCOU" => {
            let servos: Vec<f64> = (1..=8)
                .filter_map(|i| f.get(&format!("C{i}")).copied())
                .collect();
            if !servos.is_empty() {
                snap.servo_outputs = Some(servos);
            }
        }
        _ => {}
    }
}

fn haversine_m(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
    let r = 6_371_000.0;
    let dlat = (lat2 - lat1).to_radians();
    let dlon = (lon2 - lon1).to_radians();
    let a = (dlat / 2.0).sin().powi(2)
        + lat1.to_radians().cos() * lat2.to_radians().cos() * (dlon / 2.0).sin().powi(2);
    r * 2.0 * a.sqrt().asin()
}

#[tauri::command]
pub(crate) async fn log_open(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
    path: String,
) -> Result<LogSummary, String> {
    *state.log_store.lock().await = None;

    emit_event(
        &app,
        "log://progress",
        &LogProgress {
            phase: LogLoadPhase::Parsing,
            parsed: 0,
        },
    );

    let is_bin = path.ends_with(".bin") || path.ends_with(".BIN");

    let (stored_entries, start_usec, end_usec, log_type) = if is_bin {
        let path_clone = path.clone();
        let (bin_entries, time_range) = tokio::task::spawn_blocking(move || {
            let file = ardupilot_binlog::File::open(&path_clone).map_err(|e| e.to_string())?;
            let time_range = file.time_range().map_err(|e| e.to_string())?;
            let entries: Vec<ardupilot_binlog::Entry> = file
                .entries()
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;
            Ok::<_, String>((entries, time_range))
        })
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e: String| e)?;

        let total_parsed = bin_entries.len();
        emit_event(
            &app,
            "log://progress",
            &LogProgress {
                phase: LogLoadPhase::Parsing,
                parsed: total_parsed,
            },
        );

        let stored: Vec<StoredEntry> = bin_entries.iter().filter_map(bin_to_stored).collect();

        let (start, end) = if let Some((s, e)) = time_range {
            (s, e)
        } else if !stored.is_empty() {
            (
                stored
                    .first()
                    .expect("non-empty stored entries")
                    .timestamp_usec,
                stored
                    .last()
                    .expect("non-empty stored entries")
                    .timestamp_usec,
            )
        } else {
            (0, 0)
        };

        (stored, start, end, LogType::Bin)
    } else {
        let tlog = TlogFile::open(&path).await.map_err(|e| e.to_string())?;
        let reader = tlog.entries().await.map_err(|e| e.to_string())?;
        let all_entries = reader.collect().await.map_err(|e| e.to_string())?;

        let total_parsed = all_entries.len();
        emit_event(
            &app,
            "log://progress",
            &LogProgress {
                phase: LogLoadPhase::Parsing,
                parsed: total_parsed,
            },
        );

        let (start, end) = if total_parsed > 0 {
            (
                all_entries[0].timestamp_usec,
                all_entries[total_parsed - 1].timestamp_usec,
            )
        } else {
            (0, 0)
        };

        let stored: Vec<StoredEntry> = all_entries.iter().map(tlog_to_stored).collect();
        (stored, start, end, LogType::Tlog)
    };

    emit_event(
        &app,
        "log://progress",
        &LogProgress {
            phase: LogLoadPhase::Indexing,
            parsed: stored_entries.len(),
        },
    );

    let mut type_index: HashMap<String, Vec<usize>> = HashMap::new();
    let mut message_types: HashMap<String, usize> = HashMap::new();
    for (i, entry) in stored_entries.iter().enumerate() {
        type_index
            .entry(entry.msg_name.clone())
            .or_default()
            .push(i);
        *message_types.entry(entry.msg_name.clone()).or_insert(0) += 1;

        if (i + 1) % 5000 == 0 {
            emit_event(
                &app,
                "log://progress",
                &LogProgress {
                    phase: LogLoadPhase::Indexing,
                    parsed: i + 1,
                },
            );
        }
    }

    let total = stored_entries.len();

    let duration_secs = if end_usec > start_usec {
        (end_usec - start_usec) as f64 / 1_000_000.0
    } else {
        0.0
    };

    let file_name = std::path::Path::new(&path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.clone());

    let summary = LogSummary {
        file_name,
        start_usec,
        end_usec,
        duration_secs,
        total_entries: total,
        message_types,
        log_type,
    };

    let store = LogStore {
        summary: summary.clone(),
        entries: stored_entries,
        type_index,
        playback_cursor_usec: None,
    };

    *state.log_store.lock().await = Some(store);

    emit_event(
        &app,
        "log://progress",
        &LogProgress {
            phase: LogLoadPhase::Completed,
            parsed: total,
        },
    );

    Ok(summary)
}

#[tauri::command]
pub(crate) async fn playback_seek(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
    cursor_usec: Option<u64>,
) -> Result<PlaybackSeekResult, String> {
    let mut guard = state.log_store.lock().await;
    let store = guard.as_mut().ok_or_else(|| "no log open".to_string())?;
    let envelope = {
        let mut runtime = state.session_runtime.lock().await;
        runtime
            .issue_playback_seek()
            .map_err(|failure| failure.reason.message)?
    };
    state
        .guided_runtime
        .lock()
        .await
        .reset_for_playback("playback source switched");
    let result = store.seek_playback(cursor_usec, envelope.clone());
    let frame = store.playback_frame();
    emit_event(
        &app,
        "session://state",
        &ScopedDomainEvent {
            envelope: envelope.clone(),
            value: frame.session.clone(),
        },
    );
    emit_event(
        &app,
        "telemetry://state",
        &ScopedDomainEvent {
            envelope: envelope.clone(),
            value: frame.telemetry.clone(),
        },
    );
    emit_event(
        &app,
        "support://state",
        &ScopedDomainEvent {
            envelope: envelope.clone(),
            value: frame.support.clone(),
        },
    );
    emit_event(
        &app,
        "status_text://state",
        &ScopedDomainEvent {
            envelope: envelope.clone(),
            value: frame.status_text.clone(),
        },
    );
    emit_event(
        &app,
        "playback://state",
        &ScopedPlaybackStateEvent {
            envelope: result.envelope.clone(),
            value: PlaybackState {
                cursor_usec: result.cursor_usec,
                barrier_ready: true,
            },
        },
    );
    Ok(result)
}

#[tauri::command]
pub(crate) async fn log_query(
    state: tauri::State<'_, AppState>,
    msg_type: String,
    start_usec: Option<u64>,
    end_usec: Option<u64>,
    max_points: Option<usize>,
) -> Result<Vec<LogDataPoint>, String> {
    let store = helpers::with_log_store(&state).await?;

    let indices = store
        .type_index
        .get(&msg_type)
        .ok_or_else(|| format!("no entries for message type: {msg_type}"))?;

    let mut points: Vec<LogDataPoint> = Vec::new();
    for &idx in indices {
        let entry = &store.entries[idx];
        let ts = entry.timestamp_usec;
        if let Some(start) = start_usec
            && ts < start
        {
            continue;
        }
        if let Some(end) = end_usec
            && ts > end
        {
            continue;
        }
        points.push(LogDataPoint {
            timestamp_usec: ts,
            fields: entry.fields.clone(),
        });
    }

    if let Some(max) = max_points {
        return Ok(helpers::downsample(points, max));
    }

    Ok(points)
}

#[tauri::command]
pub(crate) async fn log_get_flight_path(
    state: tauri::State<'_, AppState>,
    max_points: Option<usize>,
) -> Result<Vec<FlightPathPoint>, String> {
    let store = helpers::with_log_store(&state).await?;

    let gps_type = if store.type_index.contains_key("GLOBAL_POSITION_INT") {
        "GLOBAL_POSITION_INT"
    } else if store.type_index.contains_key("GPS") {
        "GPS"
    } else {
        return Err("no GPS data in log".into());
    };

    let (lat_key, lon_key, alt_key, hdg_key, needs_dege7_scale) = match store.summary.log_type {
        LogType::Tlog => ("lat", "lon", "relative_alt", "hdg", false),
        LogType::Bin => ("Lat", "Lng", "Alt", "GCrs", true),
    };

    let indices = &store.type_index[gps_type];
    let mut points: Vec<FlightPathPoint> = Vec::with_capacity(indices.len());
    for &idx in indices {
        let entry = &store.entries[idx];
        let mut lat = entry.fields.get(lat_key).copied().unwrap_or(0.0);
        let mut lon = entry.fields.get(lon_key).copied().unwrap_or(0.0);
        if needs_dege7_scale {
            lat /= 1e7;
            lon /= 1e7;
        }
        if lat.abs() < 1e-6 && lon.abs() < 1e-6 {
            continue;
        }
        points.push(FlightPathPoint {
            timestamp_usec: entry.timestamp_usec,
            lat,
            lon,
            alt: entry.fields.get(alt_key).copied().unwrap_or(0.0),
            heading: entry.fields.get(hdg_key).copied().unwrap_or(0.0),
        });
    }

    if let Some(max) = max_points {
        return Ok(helpers::downsample(points, max));
    }

    Ok(points)
}

#[tauri::command]
pub(crate) async fn log_get_telemetry_track(
    state: tauri::State<'_, AppState>,
    max_points: Option<usize>,
) -> Result<Vec<TelemetrySnapshot>, String> {
    let store = helpers::with_log_store(&state).await?;

    let is_bin = store.summary.log_type == LogType::Bin;
    let mut running = TelemetrySnapshot::default();
    let mut track: Vec<TelemetrySnapshot> = Vec::new();
    let mut last_emit: u64 = 0;

    for entry in &store.entries {
        if is_bin {
            apply_bin_entry(&mut running, entry);
        } else {
            apply_tlog_entry(&mut running, entry);
        }

        if entry.timestamp_usec >= last_emit + TELEMETRY_TRACK_INTERVAL_USEC || track.is_empty() {
            let mut snap = running.clone();
            snap.timestamp_usec = entry.timestamp_usec;
            track.push(snap);
            last_emit = entry.timestamp_usec;
        }
    }

    if let Some(max) = max_points {
        return Ok(helpers::downsample(track, max));
    }

    Ok(track)
}

#[tauri::command]
pub(crate) async fn log_get_summary(
    state: tauri::State<'_, AppState>,
) -> Result<Option<LogSummary>, String> {
    let guard = state.log_store.lock().await;
    Ok(guard.as_ref().map(|s| s.summary.clone()))
}

#[tauri::command]
pub(crate) async fn log_close(
    state: tauri::State<'_, AppState>,
    _app: tauri::AppHandle,
) -> Result<(), String> {
    *state.log_store.lock().await = None;
    state.session_runtime.lock().await.close_playback_session();
    Ok(())
}

#[tauri::command]
pub(crate) async fn log_get_flight_summary(
    state: tauri::State<'_, AppState>,
) -> Result<FlightSummary, String> {
    let store = helpers::with_log_store(&state).await?;
    let is_bin = store.summary.log_type == LogType::Bin;

    let (alt_msg, alt_field) = if is_bin {
        ("CTUN", "Alt")
    } else {
        ("VFR_HUD", "alt")
    };
    let (spd_msg, spd_field) = if is_bin {
        ("GPS", "Spd")
    } else {
        ("VFR_HUD", "groundspeed")
    };
    let (bat_msg, bat_v_field) = if is_bin {
        ("BAT", "Volt")
    } else {
        ("SYS_STATUS", "voltage_battery")
    };
    let (gps_msg, lat_key, lon_key, sats_key, needs_dege7) = if is_bin {
        ("GPS", "Lat", "Lng", "NSats", true)
    } else {
        (
            "GLOBAL_POSITION_INT",
            "lat",
            "lon",
            "satellites_visible",
            false,
        )
    };
    let sats_msg = if is_bin { "GPS" } else { "GPS_RAW_INT" };

    let mut alt_sum = 0.0_f64;
    let mut alt_count = 0_u64;
    let mut alt_max: Option<f64> = None;
    if let Some(indices) = store.type_index.get(alt_msg) {
        for &idx in indices {
            if let Some(&v) = store.entries[idx].fields.get(alt_field) {
                alt_sum += v;
                alt_count += 1;
                alt_max = Some(alt_max.map_or(v, |m: f64| m.max(v)));
            }
        }
    }

    let mut spd_sum = 0.0_f64;
    let mut spd_count = 0_u64;
    let mut spd_max: Option<f64> = None;
    if let Some(indices) = store.type_index.get(spd_msg) {
        for &idx in indices {
            if let Some(&v) = store.entries[idx].fields.get(spd_field) {
                spd_sum += v;
                spd_count += 1;
                spd_max = Some(spd_max.map_or(v, |m: f64| m.max(v)));
            }
        }
    }

    let mut bat_start: Option<f64> = None;
    let mut bat_end: Option<f64> = None;
    let mut bat_min: Option<f64> = None;
    if let Some(indices) = store.type_index.get(bat_msg) {
        for &idx in indices {
            if let Some(&v) = store.entries[idx].fields.get(bat_v_field)
                && v > 0.0
            {
                if bat_start.is_none() {
                    bat_start = Some(v);
                }
                bat_end = Some(v);
                bat_min = Some(bat_min.map_or(v, |m: f64| m.min(v)));
            }
        }
    }

    let mah_consumed = if is_bin {
        store.type_index.get("BAT").and_then(|indices| {
            indices
                .last()
                .and_then(|&idx| store.entries[idx].fields.get("CurrTot").copied())
        })
    } else {
        store.type_index.get("BATTERY_STATUS").and_then(|indices| {
            indices
                .last()
                .and_then(|&idx| store.entries[idx].fields.get("current_consumed").copied())
        })
    };

    let mut total_dist = 0.0_f64;
    let mut max_dist_home: Option<f64> = None;
    let mut home_lat: Option<f64> = None;
    let mut home_lon: Option<f64> = None;
    let mut prev_lat: Option<f64> = None;
    let mut prev_lon: Option<f64> = None;

    if let Some(indices) = store.type_index.get(gps_msg) {
        for &idx in indices {
            let entry = &store.entries[idx];
            let mut lat = entry.fields.get(lat_key).copied().unwrap_or(0.0);
            let mut lon = entry.fields.get(lon_key).copied().unwrap_or(0.0);
            if needs_dege7 {
                lat /= 1e7;
                lon /= 1e7;
            }
            if lat.abs() < 1e-6 && lon.abs() < 1e-6 {
                continue;
            }
            if home_lat.is_none() {
                home_lat = Some(lat);
                home_lon = Some(lon);
            }
            if let (Some(plat), Some(plon)) = (prev_lat, prev_lon) {
                total_dist += haversine_m(plat, plon, lat, lon);
            }
            if let (Some(hlat), Some(hlon)) = (home_lat, home_lon) {
                let d = haversine_m(hlat, hlon, lat, lon);
                max_dist_home = Some(max_dist_home.map_or(d, |m: f64| m.max(d)));
            }
            prev_lat = Some(lat);
            prev_lon = Some(lon);
        }
    }

    let mut sats_min: Option<u32> = None;
    let mut sats_max: Option<u32> = None;
    if let Some(indices) = store.type_index.get(sats_msg) {
        for &idx in indices {
            if let Some(&v) = store.entries[idx].fields.get(sats_key) {
                let s = v as u32;
                sats_min = Some(sats_min.map_or(s, |m| m.min(s)));
                sats_max = Some(sats_max.map_or(s, |m| m.max(s)));
            }
        }
    }

    Ok(FlightSummary {
        duration_secs: store.summary.duration_secs,
        max_alt_m: alt_max,
        avg_alt_m: if alt_count > 0 {
            Some(alt_sum / alt_count as f64)
        } else {
            None
        },
        max_speed_mps: spd_max,
        avg_speed_mps: if spd_count > 0 {
            Some(spd_sum / spd_count as f64)
        } else {
            None
        },
        total_distance_m: if total_dist > 0.0 {
            Some(total_dist)
        } else {
            None
        },
        max_distance_from_home_m: max_dist_home,
        battery_start_v: bat_start,
        battery_end_v: bat_end,
        battery_min_v: bat_min,
        mah_consumed,
        gps_sats_min: sats_min,
        gps_sats_max: sats_max,
    })
}

#[tauri::command]
pub(crate) async fn log_export_csv(
    state: tauri::State<'_, AppState>,
    path: String,
    start_usec: Option<u64>,
    end_usec: Option<u64>,
) -> Result<u64, String> {
    let store = helpers::with_log_store(&state).await?;

    let entries: Vec<&StoredEntry> = store
        .entries
        .iter()
        .filter(|e| {
            if let Some(s) = start_usec
                && e.timestamp_usec < s
            {
                return false;
            }
            if let Some(end) = end_usec
                && e.timestamp_usec > end
            {
                return false;
            }
            true
        })
        .collect();

    if entries.is_empty() {
        return Err("no entries in selected range".into());
    }

    let mut field_set = std::collections::BTreeSet::new();
    for e in &entries {
        for k in e.fields.keys() {
            field_set.insert(k.clone());
        }
    }
    let field_names: Vec<String> = field_set.into_iter().collect();

    let file = std::fs::File::create(&path).map_err(|e| format!("failed to create file: {e}"))?;
    let mut w = std::io::BufWriter::new(file);

    write!(w, "timestamp_sec,msg_type").map_err(|e| e.to_string())?;
    for name in &field_names {
        write!(w, ",{name}").map_err(|e| e.to_string())?;
    }
    writeln!(w).map_err(|e| e.to_string())?;

    let mut row_count = 0_u64;
    for e in &entries {
        write!(w, "{:.6},{}", e.timestamp_usec as f64 / 1e6, e.msg_name)
            .map_err(|e| e.to_string())?;
        for name in &field_names {
            if let Some(&v) = e.fields.get(name) {
                write!(w, ",{v}").map_err(|e| e.to_string())?;
            } else {
                write!(w, ",").map_err(|e| e.to_string())?;
            }
        }
        writeln!(w).map_err(|e| e.to_string())?;
        row_count += 1;
    }

    w.flush().map_err(|e| e.to_string())?;
    Ok(row_count)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ipc::SourceKind;
    use ardupilot_binlog::Reader;
    use mavkit::tlog::TlogEntry;
    use mavkit::dialect::{
        ATTITUDE_DATA, COMMAND_LONG_DATA, GLOBAL_POSITION_INT_DATA, GPS_RAW_INT_DATA,
        HEARTBEAT_DATA, MavAutopilot, MavModeFlag, MavState, MavSysStatusSensor,
        MavSysStatusSensorExtended, MavType, RC_CHANNELS_DATA, SYS_STATUS_DATA, VFR_HUD_DATA,
    };
    use std::io::Cursor;

    const HEADER_MAGIC: [u8; 2] = [0xA3, 0x95];
    const FMT_TYPE: u8 = 0x80;

    fn assert_field_eq(fields: &HashMap<String, f64>, key: &str, expected: f64) {
        let got = fields.get(key).copied().unwrap_or(f64::NAN);
        assert!(
            (got - expected).abs() < 1e-5,
            "field {key} mismatch: got {got}, expected {expected}"
        );
    }

    fn build_fmt_bootstrap() -> Vec<u8> {
        let mut msg = Vec::new();
        msg.extend_from_slice(&HEADER_MAGIC);
        msg.push(FMT_TYPE);
        let mut payload = [0u8; 86];
        payload[0] = FMT_TYPE;
        payload[1] = 89;
        payload[2..6].copy_from_slice(b"FMT\0");
        payload[6..11].copy_from_slice(b"BBnNZ");
        let labels = b"Type,Length,Name,Format,Labels";
        payload[22..22 + labels.len()].copy_from_slice(labels);
        msg.extend_from_slice(&payload);
        msg
    }

    fn build_fmt_for_type(
        msg_type: u8,
        msg_len: u8,
        name: &[u8; 4],
        format: &str,
        labels: &str,
    ) -> Vec<u8> {
        let mut msg = Vec::new();
        msg.extend_from_slice(&HEADER_MAGIC);
        msg.push(FMT_TYPE);
        let mut payload = [0u8; 86];
        payload[0] = msg_type;
        payload[1] = msg_len;
        payload[2..6].copy_from_slice(name);
        let fmt_bytes = format.as_bytes();
        payload[6..6 + fmt_bytes.len()].copy_from_slice(fmt_bytes);
        let lbl_bytes = labels.as_bytes();
        payload[22..22 + lbl_bytes.len()].copy_from_slice(lbl_bytes);
        msg.extend_from_slice(&payload);
        msg
    }

    fn build_data_message(msg_type: u8, payload: &[u8]) -> Vec<u8> {
        let mut msg = Vec::new();
        msg.extend_from_slice(&HEADER_MAGIC);
        msg.push(msg_type);
        msg.extend_from_slice(payload);
        msg
    }

    fn parse_entries(bytes: Vec<u8>) -> Vec<ardupilot_binlog::Entry> {
        Reader::new(Cursor::new(bytes))
            .collect::<Result<Vec<_>, _>>()
            .expect("synthetic BIN should parse")
    }

    fn stored_entry(msg_name: &str, fields: HashMap<String, f64>) -> StoredEntry {
        StoredEntry {
            timestamp_usec: 0,
            msg_name: msg_name.to_string(),
            fields,
        }
    }

    fn empty_store() -> LogStore {
        LogStore {
            summary: LogSummary {
                file_name: "test.tlog".into(),
                start_usec: 100,
                end_usec: 200,
                duration_secs: 0.1,
                total_entries: 0,
                message_types: HashMap::new(),
                log_type: LogType::Tlog,
            },
            entries: Vec::new(),
            type_index: HashMap::new(),
            playback_cursor_usec: None,
        }
    }

    #[test]
    fn extract_fields_attitude() {
        let msg = MavMessage::ATTITUDE(ATTITUDE_DATA {
            time_boot_ms: 0,
            roll: 0.5,
            pitch: -0.1,
            yaw: 1.2,
            rollspeed: 0.01,
            pitchspeed: 0.02,
            yawspeed: 0.03,
        });

        let (name, fields) = extract_fields(&msg);
        assert_eq!(name, "ATTITUDE");
        assert_eq!(fields.len(), 6);
        assert_field_eq(&fields, "roll", 0.5);
        assert_field_eq(&fields, "pitch", -0.1);
        assert_field_eq(&fields, "yaw", 1.2);
        assert_field_eq(&fields, "rollspeed", 0.01);
        assert_field_eq(&fields, "pitchspeed", 0.02);
        assert_field_eq(&fields, "yawspeed", 0.03);
    }

    #[test]
    fn extract_fields_vfr_hud() {
        let msg = MavMessage::VFR_HUD(VFR_HUD_DATA {
            airspeed: 12.3,
            groundspeed: 11.4,
            heading: 250,
            throttle: 77,
            alt: 123.4,
            climb: -1.2,
        });

        let (name, fields) = extract_fields(&msg);
        assert_eq!(name, "VFR_HUD");
        assert_eq!(fields.len(), 6);
        assert_field_eq(&fields, "airspeed", 12.3);
        assert_field_eq(&fields, "groundspeed", 11.4);
        assert_field_eq(&fields, "heading", 250.0);
        assert_field_eq(&fields, "throttle", 77.0);
        assert_field_eq(&fields, "alt", 123.4);
        assert_field_eq(&fields, "climb", -1.2);
    }

    #[test]
    fn extract_fields_global_position_int_scaled() {
        let msg = MavMessage::GLOBAL_POSITION_INT(GLOBAL_POSITION_INT_DATA {
            time_boot_ms: 0,
            lat: 374221234,
            lon: -1220845678,
            alt: 123_456,
            relative_alt: 7_890,
            vx: 321,
            vy: -123,
            vz: 45,
            hdg: 9_001,
        });

        let (_, fields) = extract_fields(&msg);
        assert_eq!(fields.len(), 8);
        assert_field_eq(&fields, "lat", 37.4221234);
        assert_field_eq(&fields, "lon", -122.0845678);
        assert_field_eq(&fields, "alt", 123.456);
        assert_field_eq(&fields, "relative_alt", 7.89);
        assert_field_eq(&fields, "vx", 3.21);
        assert_field_eq(&fields, "vy", -1.23);
        assert_field_eq(&fields, "vz", 0.45);
        assert_field_eq(&fields, "hdg", 90.01);
    }

    #[test]
    fn extract_fields_sys_status_scaled() {
        let msg = MavMessage::SYS_STATUS(SYS_STATUS_DATA {
            onboard_control_sensors_present: MavSysStatusSensor::empty(),
            onboard_control_sensors_enabled: MavSysStatusSensor::empty(),
            onboard_control_sensors_health: MavSysStatusSensor::empty(),
            onboard_control_sensors_present_extended: MavSysStatusSensorExtended::empty(),
            onboard_control_sensors_enabled_extended: MavSysStatusSensorExtended::empty(),
            onboard_control_sensors_health_extended: MavSysStatusSensorExtended::empty(),
            load: 500,
            voltage_battery: 11_900,
            current_battery: 345,
            battery_remaining: 67,
            drop_rate_comm: 0,
            errors_comm: 0,
            errors_count1: 0,
            errors_count2: 0,
            errors_count3: 0,
            errors_count4: 0,
        });

        let (_, fields) = extract_fields(&msg);
        assert_field_eq(&fields, "voltage_battery", 11.9);
        assert_field_eq(&fields, "current_battery", 3.45);
        assert_field_eq(&fields, "battery_remaining", 67.0);
        assert_field_eq(&fields, "load", 50.0);
    }

    #[test]
    fn extract_fields_gps_raw_int_scaled() {
        let msg = MavMessage::GPS_RAW_INT(GPS_RAW_INT_DATA {
            time_usec: 0,
            fix_type: mavkit::dialect::GpsFixType::GPS_FIX_TYPE_3D_FIX,
            lat: 374221234,
            lon: -1220845678,
            alt: 12_345,
            eph: 234,
            epv: 567,
            vel: 0,
            cog: 0,
            satellites_visible: 12,
            alt_ellipsoid: 0,
            h_acc: 0,
            v_acc: 0,
            vel_acc: 0,
            hdg_acc: 0,
            yaw: 0,
        });

        let (_, fields) = extract_fields(&msg);
        assert_eq!(fields.len(), 7);
        assert_field_eq(&fields, "lat", 37.4221234);
        assert_field_eq(&fields, "lon", -122.0845678);
        assert_field_eq(&fields, "alt", 12.345);
        assert_field_eq(&fields, "fix_type", 3.0);
        assert_field_eq(&fields, "satellites_visible", 12.0);
        assert_field_eq(&fields, "eph", 2.34);
        assert_field_eq(&fields, "epv", 5.67);
    }

    #[test]
    fn extract_fields_heartbeat() {
        let msg = MavMessage::HEARTBEAT(HEARTBEAT_DATA {
            custom_mode: 42,
            mavtype: MavType::MAV_TYPE_QUADROTOR,
            autopilot: MavAutopilot::MAV_AUTOPILOT_ARDUPILOTMEGA,
            base_mode: MavModeFlag::MAV_MODE_FLAG_SAFETY_ARMED,
            system_status: MavState::MAV_STATE_ACTIVE,
            mavlink_version: 3,
        });

        let (_, fields) = extract_fields(&msg);
        assert_eq!(fields.len(), 3);
        assert_field_eq(&fields, "custom_mode", 42.0);
        assert_field_eq(
            &fields,
            "base_mode",
            MavModeFlag::MAV_MODE_FLAG_SAFETY_ARMED.bits() as f64,
        );
        assert_field_eq(
            &fields,
            "system_status",
            MavState::MAV_STATE_ACTIVE as u8 as f64,
        );
    }

    #[test]
    fn extract_fields_unhandled_message_returns_empty_map() {
        let msg = MavMessage::COMMAND_LONG(COMMAND_LONG_DATA {
            target_system: 1,
            target_component: 1,
            command: mavkit::dialect::MavCmd::MAV_CMD_COMPONENT_ARM_DISARM,
            confirmation: 0,
            param1: 0.0,
            param2: 0.0,
            param3: 0.0,
            param4: 0.0,
            param5: 0.0,
            param6: 0.0,
            param7: 0.0,
        });

        let (_, fields) = extract_fields(&msg);
        assert!(fields.is_empty());
    }

    #[test]
    fn tlog_to_stored_copies_timestamp_and_extracts_fields() {
        let msg = MavMessage::ATTITUDE(ATTITUDE_DATA {
            time_boot_ms: 0,
            roll: 0.25,
            pitch: -0.5,
            yaw: 1.0,
            rollspeed: 0.11,
            pitchspeed: 0.22,
            yawspeed: 0.33,
        });
        let expected = extract_fields(&msg);
        let entry = TlogEntry {
            timestamp_usec: 123_456,
            message: msg,
        };

        let stored = tlog_to_stored(&entry);
        assert_eq!(stored.timestamp_usec, 123_456);
        assert_eq!(stored.msg_name, expected.0);
        assert_eq!(stored.fields, expected.1);
    }

    #[test]
    fn playback_seek_clamps_cursor_and_keeps_envelope() {
        let mut store = empty_store();
        store.entries.push(StoredEntry {
            timestamp_usec: 150,
            msg_name: "GPS_RAW_INT".into(),
            fields: HashMap::new(),
        });

        let envelope = SessionEnvelope {
            session_id: "session-1".into(),
            source_kind: SourceKind::Playback,
            seek_epoch: 1,
            reset_revision: 1,
        };
        let result = store.seek_playback(Some(500), envelope.clone());

        assert_eq!(result.envelope, envelope);
        assert_eq!(result.cursor_usec, Some(200));
    }

    #[test]
    fn bin_to_stored_with_timestamp_returns_entry() {
        let mut data = Vec::new();
        data.extend(build_fmt_bootstrap());
        data.extend(build_fmt_for_type(0x81, 11, b"TST\0", "Q", "TimeUS"));
        data.extend(build_data_message(0x81, &1_234u64.to_le_bytes()));
        let entries = parse_entries(data);
        let tst = entries
            .iter()
            .find(|e| e.name == "TST")
            .expect("TST entry should exist");

        let stored = bin_to_stored(tst).expect("timestamped entry should convert");
        assert_eq!(stored.timestamp_usec, 1_234);
        assert_eq!(stored.msg_name, "TST");
        assert_field_eq(&stored.fields, "TimeUS", 1_234.0);
    }

    #[test]
    fn bin_to_stored_without_timestamp_returns_none() {
        let mut data = Vec::new();
        data.extend(build_fmt_bootstrap());
        data.extend(build_fmt_for_type(0x82, 7, b"NOT\0", "f", "Value"));
        data.extend(build_data_message(0x82, &12.5f32.to_le_bytes()));
        let entries = parse_entries(data);
        let no_ts = entries
            .iter()
            .find(|e| e.name == "NOT")
            .expect("NOT entry should exist");

        assert!(bin_to_stored(no_ts).is_none());
    }

    #[test]
    fn bin_to_stored_keeps_only_numeric_fields() {
        let mut data = Vec::new();
        data.extend(build_fmt_bootstrap());
        data.extend(build_fmt_for_type(
            0x83,
            79,
            b"MIX\0",
            "QZf",
            "TimeUS,Message,Value",
        ));

        let mut payload = Vec::new();
        payload.extend_from_slice(&777u64.to_le_bytes());
        let mut msg_bytes = [0u8; 64];
        msg_bytes[..2].copy_from_slice(b"ok");
        payload.extend_from_slice(&msg_bytes);
        payload.extend_from_slice(&3.5f32.to_le_bytes());
        data.extend(build_data_message(0x83, &payload));

        let entries = parse_entries(data);
        let mix = entries
            .iter()
            .find(|e| e.name == "MIX")
            .expect("MIX entry should exist");

        let stored = bin_to_stored(mix).expect("MIX should convert");
        assert!(stored.fields.contains_key("TimeUS"));
        assert!(stored.fields.contains_key("Value"));
        assert!(!stored.fields.contains_key("Message"));
    }

    #[test]
    fn gps_fix_type_name_named_variants_and_unknown() {
        assert_eq!(gps_fix_type_name(0.0), "no_gps");
        assert_eq!(gps_fix_type_name(1.0), "no_fix");
        assert_eq!(gps_fix_type_name(2.0), "fix_2d");
        assert_eq!(gps_fix_type_name(3.0), "fix_3d");
        assert_eq!(gps_fix_type_name(4.0), "dgps");
        assert_eq!(gps_fix_type_name(5.0), "rtk_float");
        assert_eq!(gps_fix_type_name(6.0), "rtk_fixed");
        assert_eq!(gps_fix_type_name(99.0), "fix_99");
    }

    #[test]
    fn haversine_nyc_to_london() {
        let dist = haversine_m(40.7128, -74.0060, 51.5074, -0.1278);
        assert!(
            (5_514_000.0..=5_626_000.0).contains(&dist),
            "expected ~5570 km, got {dist}"
        );
    }

    #[test]
    fn haversine_same_point() {
        let dist = haversine_m(48.8566, 2.3522, 48.8566, 2.3522);
        assert!(dist.abs() < 1e-6, "expected 0.0, got {dist}");
    }

    #[test]
    fn haversine_short_distance() {
        let dist = haversine_m(0.0, 0.0, 0.0009, 0.0);
        assert!(
            (50.0..=200.0).contains(&dist),
            "expected ~100 m, got {dist}"
        );
    }

    #[test]
    fn apply_tlog_entry_attitude_converts_radians_to_degrees() {
        let msg = MavMessage::ATTITUDE(ATTITUDE_DATA {
            time_boot_ms: 0,
            roll: 1.0,
            pitch: 0.5,
            yaw: -0.3,
            rollspeed: 0.0,
            pitchspeed: 0.0,
            yawspeed: 0.0,
        });
        let (_, fields) = extract_fields(&msg);
        let entry = stored_entry("ATTITUDE", fields);

        let mut snap = TelemetrySnapshot::default();
        apply_tlog_entry(&mut snap, &entry);

        assert!((snap.roll_deg.expect("roll") - 1.0_f64.to_degrees()).abs() < 1e-6);
        assert!((snap.pitch_deg.expect("pitch") - 0.5_f64.to_degrees()).abs() < 1e-6);
        assert!((snap.yaw_deg.expect("yaw") - (-0.3_f64).to_degrees()).abs() < 1e-6);
    }

    #[test]
    fn apply_tlog_entry_vfr_hud_sets_core_fields() {
        let msg = MavMessage::VFR_HUD(VFR_HUD_DATA {
            airspeed: 21.2,
            groundspeed: 19.8,
            heading: 275,
            throttle: 64,
            alt: 123.4,
            climb: -0.7,
        });
        let (_, fields) = extract_fields(&msg);
        let entry = stored_entry("VFR_HUD", fields);

        let mut snap = TelemetrySnapshot::default();
        apply_tlog_entry(&mut snap, &entry);

        assert!((snap.altitude_m.expect("alt") - 123.4).abs() < 1e-5);
        assert!((snap.speed_mps.expect("speed") - 19.8).abs() < 1e-5);
        assert_eq!(snap.heading_deg, Some(275.0));
        assert!((snap.climb_rate_mps.expect("climb") - (-0.7)).abs() < 1e-5);
        assert_eq!(snap.throttle_pct, Some(64.0));
        assert!((snap.airspeed_mps.expect("airspeed") - 21.2).abs() < 1e-5);
    }

    #[test]
    fn apply_tlog_entry_global_position_int_sets_position() {
        let msg = MavMessage::GLOBAL_POSITION_INT(GLOBAL_POSITION_INT_DATA {
            time_boot_ms: 0,
            lat: 377_749_000,
            lon: -1_220_419_000,
            alt: 42_000,
            relative_alt: 15_500,
            vx: 0,
            vy: 0,
            vz: 0,
            hdg: 9_000,
        });
        let (_, fields) = extract_fields(&msg);
        let entry = stored_entry("GLOBAL_POSITION_INT", fields);

        let mut snap = TelemetrySnapshot::default();
        apply_tlog_entry(&mut snap, &entry);

        assert!((snap.latitude_deg.expect("lat") - 37.7749).abs() < 1e-6);
        assert!((snap.longitude_deg.expect("lon") - (-122.0419)).abs() < 1e-6);
        assert_eq!(snap.altitude_m, Some(15.5));
        assert_eq!(snap.heading_deg, Some(90.0));
    }

    #[test]
    fn apply_tlog_entry_sys_status_sets_battery_fields() {
        let msg = MavMessage::SYS_STATUS(SYS_STATUS_DATA {
            onboard_control_sensors_present: MavSysStatusSensor::empty(),
            onboard_control_sensors_enabled: MavSysStatusSensor::empty(),
            onboard_control_sensors_health: MavSysStatusSensor::empty(),
            onboard_control_sensors_present_extended: MavSysStatusSensorExtended::empty(),
            onboard_control_sensors_enabled_extended: MavSysStatusSensorExtended::empty(),
            onboard_control_sensors_health_extended: MavSysStatusSensorExtended::empty(),
            load: 0,
            voltage_battery: 11_200,
            current_battery: 378,
            battery_remaining: 55,
            drop_rate_comm: 0,
            errors_comm: 0,
            errors_count1: 0,
            errors_count2: 0,
            errors_count3: 0,
            errors_count4: 0,
        });
        let (_, fields) = extract_fields(&msg);
        let entry = stored_entry("SYS_STATUS", fields);

        let mut snap = TelemetrySnapshot::default();
        apply_tlog_entry(&mut snap, &entry);

        assert_eq!(snap.battery_voltage_v, Some(11.2));
        assert_eq!(snap.battery_current_a, Some(3.78));
        assert_eq!(snap.battery_pct, Some(55.0));
    }

    #[test]
    fn apply_tlog_entry_gps_raw_int_sets_fix_label() {
        let msg = MavMessage::GPS_RAW_INT(GPS_RAW_INT_DATA {
            time_usec: 0,
            fix_type: mavkit::dialect::GpsFixType::GPS_FIX_TYPE_3D_FIX,
            lat: 0,
            lon: 0,
            alt: 0,
            eph: 145,
            epv: 200,
            vel: 0,
            cog: 0,
            satellites_visible: 17,
            alt_ellipsoid: 0,
            h_acc: 0,
            v_acc: 0,
            vel_acc: 0,
            hdg_acc: 0,
            yaw: 0,
        });
        let (_, fields) = extract_fields(&msg);
        let entry = stored_entry("GPS_RAW_INT", fields);

        let mut snap = TelemetrySnapshot::default();
        apply_tlog_entry(&mut snap, &entry);

        assert_eq!(snap.gps_fix_type.as_deref(), Some("fix_3d"));
        assert_eq!(snap.gps_satellites, Some(17.0));
        assert_eq!(snap.gps_hdop, Some(1.45));
    }

    #[test]
    fn apply_tlog_entry_heartbeat_sets_armed_and_custom_mode() {
        let msg = MavMessage::HEARTBEAT(HEARTBEAT_DATA {
            custom_mode: 6,
            mavtype: MavType::MAV_TYPE_QUADROTOR,
            autopilot: MavAutopilot::MAV_AUTOPILOT_ARDUPILOTMEGA,
            base_mode: MavModeFlag::MAV_MODE_FLAG_SAFETY_ARMED,
            system_status: MavState::MAV_STATE_ACTIVE,
            mavlink_version: 3,
        });
        let (_, fields) = extract_fields(&msg);
        let entry = stored_entry("HEARTBEAT", fields);

        let mut snap = TelemetrySnapshot::default();
        apply_tlog_entry(&mut snap, &entry);

        assert_eq!(snap.armed, Some(true));
        assert_eq!(snap.custom_mode, Some(6));
    }

    #[test]
    fn apply_tlog_entry_rc_channels_populates_channels_and_rssi() {
        let msg = MavMessage::RC_CHANNELS(RC_CHANNELS_DATA {
            time_boot_ms: 0,
            chancount: 8,
            chan1_raw: 1100,
            chan2_raw: 1200,
            chan3_raw: 1300,
            chan4_raw: 1400,
            chan5_raw: 1500,
            chan6_raw: 1600,
            chan7_raw: 1700,
            chan8_raw: 1800,
            chan9_raw: 1900,
            chan10_raw: 2000,
            chan11_raw: 0,
            chan12_raw: 0,
            chan13_raw: 0,
            chan14_raw: 0,
            chan15_raw: 0,
            chan16_raw: 0,
            chan17_raw: 0,
            chan18_raw: 0,
            rssi: 99,
        });
        let (_, fields) = extract_fields(&msg);
        let entry = stored_entry("RC_CHANNELS", fields);

        let mut snap = TelemetrySnapshot::default();
        apply_tlog_entry(&mut snap, &entry);

        assert_eq!(snap.rc_rssi, Some(99.0));
        assert_eq!(
            snap.rc_channels,
            Some(vec![
                1100.0, 1200.0, 1300.0, 1400.0, 1500.0, 1600.0, 1700.0, 1800.0
            ])
        );
    }

    #[test]
    fn apply_tlog_entry_unknown_keeps_existing_values() {
        let mut snap = TelemetrySnapshot {
            roll_deg: Some(12.0),
            altitude_m: Some(50.0),
            gps_fix_type: Some("fix_3d".to_string()),
            ..Default::default()
        };

        let mut fields = HashMap::new();
        fields.insert("ignored".to_string(), 1.0);
        let entry = stored_entry("UNKNOWN", fields);
        apply_tlog_entry(&mut snap, &entry);

        assert_eq!(snap.roll_deg, Some(12.0));
        assert_eq!(snap.altitude_m, Some(50.0));
        assert_eq!(snap.gps_fix_type.as_deref(), Some("fix_3d"));
    }

    #[test]
    fn apply_tlog_entry_carry_forward_across_messages() {
        let att = MavMessage::ATTITUDE(ATTITUDE_DATA {
            time_boot_ms: 0,
            roll: 0.25,
            pitch: 0.0,
            yaw: 0.0,
            rollspeed: 0.0,
            pitchspeed: 0.0,
            yawspeed: 0.0,
        });
        let (_, att_fields) = extract_fields(&att);
        let att_entry = stored_entry("ATTITUDE", att_fields);

        let vfr = MavMessage::VFR_HUD(VFR_HUD_DATA {
            airspeed: 10.0,
            groundspeed: 9.0,
            heading: 180,
            throttle: 45,
            alt: 88.0,
            climb: 0.1,
        });
        let (_, vfr_fields) = extract_fields(&vfr);
        let vfr_entry = stored_entry("VFR_HUD", vfr_fields);

        let mut unknown_fields = HashMap::new();
        unknown_fields.insert("foo".to_string(), 1.0);
        let unknown_entry = stored_entry("UNKNOWN", unknown_fields);

        let mut snap = TelemetrySnapshot::default();
        apply_tlog_entry(&mut snap, &att_entry);
        let expected_roll = 0.25_f64.to_degrees();
        assert!((snap.roll_deg.expect("roll") - expected_roll).abs() < 1e-6);

        apply_tlog_entry(&mut snap, &vfr_entry);
        assert!((snap.roll_deg.expect("roll retained") - expected_roll).abs() < 1e-6);
        assert_eq!(snap.altitude_m, Some(88.0));

        apply_tlog_entry(&mut snap, &unknown_entry);
        assert!((snap.roll_deg.expect("roll still retained") - expected_roll).abs() < 1e-6);
        assert_eq!(snap.altitude_m, Some(88.0));
        assert_eq!(snap.heading_deg, Some(180.0));
    }

    #[test]
    fn apply_bin_entry_att_sets_attitude_fields() {
        let mut fields = HashMap::new();
        fields.insert("Roll".to_string(), 45.0);
        fields.insert("Pitch".to_string(), -10.0);
        fields.insert("Yaw".to_string(), 180.0);
        let entry = stored_entry("ATT", fields);

        let mut snap = TelemetrySnapshot::default();
        apply_bin_entry(&mut snap, &entry);

        assert_eq!(snap.roll_deg, Some(45.0));
        assert_eq!(snap.pitch_deg, Some(-10.0));
        assert_eq!(snap.yaw_deg, Some(180.0));
    }

    #[test]
    fn apply_bin_entry_gps_scales_and_sets_navigation_fields() {
        let mut fields = HashMap::new();
        fields.insert("Lat".to_string(), 377_749_000.0);
        fields.insert("Lng".to_string(), -1_220_419_000.0);
        fields.insert("Spd".to_string(), 15.5);
        fields.insert("GCrs".to_string(), 270.0);
        fields.insert("Status".to_string(), 3.0);
        fields.insert("NSats".to_string(), 14.0);
        fields.insert("HDop".to_string(), 0.8);
        let entry = stored_entry("GPS", fields);

        let mut snap = TelemetrySnapshot::default();
        apply_bin_entry(&mut snap, &entry);

        assert!((snap.latitude_deg.expect("lat") - 37.7749).abs() < 1e-6);
        assert!((snap.longitude_deg.expect("lon") - (-122.0419)).abs() < 1e-6);
        assert_eq!(snap.speed_mps, Some(15.5));
        assert_eq!(snap.heading_deg, Some(270.0));
        assert_eq!(snap.gps_fix_type.as_deref(), Some("fix_3d"));
        assert_eq!(snap.gps_satellites, Some(14.0));
    }

    #[test]
    fn apply_bin_entry_bat_sets_battery_fields() {
        let mut fields = HashMap::new();
        fields.insert("Volt".to_string(), 11.7);
        fields.insert("Curr".to_string(), 6.3);
        fields.insert("Rem".to_string(), 48.0);
        let entry = stored_entry("BAT", fields);

        let mut snap = TelemetrySnapshot::default();
        apply_bin_entry(&mut snap, &entry);

        assert_eq!(snap.battery_voltage_v, Some(11.7));
        assert_eq!(snap.battery_current_a, Some(6.3));
        assert_eq!(snap.battery_pct, Some(48.0));
    }

    #[test]
    fn apply_bin_entry_rcin_populates_rc_channels() {
        let mut fields = HashMap::new();
        for i in 1..=8 {
            fields.insert(format!("C{i}"), 1000.0 + (i as f64 * 10.0));
        }
        let entry = stored_entry("RCIN", fields);

        let mut snap = TelemetrySnapshot::default();
        apply_bin_entry(&mut snap, &entry);

        assert_eq!(
            snap.rc_channels,
            Some(vec![
                1010.0, 1020.0, 1030.0, 1040.0, 1050.0, 1060.0, 1070.0, 1080.0
            ])
        );
    }

    #[test]
    fn apply_bin_entry_rcou_populates_servo_outputs() {
        let mut fields = HashMap::new();
        for i in 1..=8 {
            fields.insert(format!("C{i}"), 1100.0 + (i as f64 * 5.0));
        }
        let entry = stored_entry("RCOU", fields);

        let mut snap = TelemetrySnapshot::default();
        apply_bin_entry(&mut snap, &entry);

        assert_eq!(
            snap.servo_outputs,
            Some(vec![
                1105.0, 1110.0, 1115.0, 1120.0, 1125.0, 1130.0, 1135.0, 1140.0
            ])
        );
    }

    #[test]
    fn apply_bin_entry_ctun_sets_altitude_and_climb_rate() {
        let mut fields = HashMap::new();
        fields.insert("Alt".to_string(), 120.0);
        fields.insert("CRt".to_string(), 1.7);
        let entry = stored_entry("CTUN", fields);

        let mut snap = TelemetrySnapshot::default();
        apply_bin_entry(&mut snap, &entry);

        assert_eq!(snap.altitude_m, Some(120.0));
        assert_eq!(snap.climb_rate_mps, Some(1.7));
    }

    #[test]
    fn apply_bin_entry_mode_sets_custom_mode() {
        let mut fields = HashMap::new();
        fields.insert("ModeNum".to_string(), 4.0);
        let entry = stored_entry("MODE", fields);

        let mut snap = TelemetrySnapshot::default();
        apply_bin_entry(&mut snap, &entry);

        assert_eq!(snap.custom_mode, Some(4));
    }

    #[test]
    fn apply_bin_entry_unknown_keeps_existing_values() {
        let mut snap = TelemetrySnapshot {
            roll_deg: Some(9.0),
            altitude_m: Some(22.0),
            ..Default::default()
        };

        let mut fields = HashMap::new();
        fields.insert("Something".to_string(), 1.0);
        let entry = stored_entry("NKF1", fields);
        apply_bin_entry(&mut snap, &entry);

        assert_eq!(snap.roll_deg, Some(9.0));
        assert_eq!(snap.altitude_m, Some(22.0));
    }

    #[test]
    fn tlog_and_bin_gps_scaling_parity() {
        let tlog_msg = MavMessage::GLOBAL_POSITION_INT(GLOBAL_POSITION_INT_DATA {
            time_boot_ms: 0,
            lat: 377_749_000,
            lon: -1_220_419_000,
            alt: 0,
            relative_alt: 0,
            vx: 0,
            vy: 0,
            vz: 0,
            hdg: 0,
        });
        let (_, tlog_fields) = extract_fields(&tlog_msg);
        let tlog_entry = stored_entry("GLOBAL_POSITION_INT", tlog_fields);

        let mut bin_fields = HashMap::new();
        bin_fields.insert("Lat".to_string(), 377_749_000.0);
        bin_fields.insert("Lng".to_string(), -1_220_419_000.0);
        let bin_entry = stored_entry("GPS", bin_fields);

        let mut tlog_snap = TelemetrySnapshot::default();
        let mut bin_snap = TelemetrySnapshot::default();
        apply_tlog_entry(&mut tlog_snap, &tlog_entry);
        apply_bin_entry(&mut bin_snap, &bin_entry);

        let tlog_lat = tlog_snap.latitude_deg.expect("tlog lat");
        let tlog_lon = tlog_snap.longitude_deg.expect("tlog lon");
        let bin_lat = bin_snap.latitude_deg.expect("bin lat");
        let bin_lon = bin_snap.longitude_deg.expect("bin lon");

        assert!((tlog_lat - 37.7749).abs() < 1e-6);
        assert!((tlog_lon - (-122.0419)).abs() < 1e-6);
        assert!((bin_lat - 37.7749).abs() < 1e-6);
        assert!((bin_lon - (-122.0419)).abs() < 1e-6);
        assert!((tlog_lat - bin_lat).abs() < 1e-6);
        assert!((tlog_lon - bin_lon).abs() < 1e-6);
    }

    #[test]
    fn haversine_antipodal_points() {
        // Antipodal points are exactly opposite on the globe
        // Distance should be half the Earth's circumference ≈ 20,015 km
        let dist = haversine_m(0.0, 0.0, 0.0, 180.0);
        // Half circumference = π * R = π * 6,371,000 ≈ 20,015,087 m
        let expected = std::f64::consts::PI * 6_371_000.0;
        assert!(
            (dist - expected).abs() / expected < 0.01,
            "Expected ~{:.0}m, got {:.0}m",
            expected,
            dist
        );
    }
}

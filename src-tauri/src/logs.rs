use std::collections::HashMap;
use std::io::Write;

use mavkit::tlog::{TlogEntry, TlogFile};
use mavlink::common::MavMessage;
use mavlink::Message;
use serde::Serialize;
use tauri::Emitter;

use crate::{helpers, AppState};

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
        0 => "No GPS".into(),
        1 => "No Fix".into(),
        2 => "2D Fix".into(),
        3 => "3D Fix".into(),
        4 => "DGPS".into(),
        5 => "RTK Float".into(),
        6 => "RTK Fixed".into(),
        _ => format!("Fix({})", val as u8),
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
            if snap.battery_voltage_v.is_none() {
                snap.battery_voltage_v = f.get("current_battery").copied();
            }
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

    let _ = app.emit(
        "log://progress",
        LogProgress {
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
        let _ = app.emit(
            "log://progress",
            LogProgress {
                phase: LogLoadPhase::Parsing,
                parsed: total_parsed,
            },
        );

        let stored: Vec<StoredEntry> = bin_entries.iter().filter_map(bin_to_stored).collect();

        let (start, end) = if let Some((s, e)) = time_range {
            (s, e)
        } else if !stored.is_empty() {
            (
                stored.first().unwrap().timestamp_usec,
                stored.last().unwrap().timestamp_usec,
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
        let _ = app.emit(
            "log://progress",
            LogProgress {
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

    let _ = app.emit(
        "log://progress",
        LogProgress {
            phase: LogLoadPhase::Indexing,
            parsed: stored_entries.len(),
        },
    );

    let mut type_index: HashMap<String, Vec<usize>> = HashMap::new();
    let mut message_types: HashMap<String, usize> = HashMap::new();
    for (i, entry) in stored_entries.iter().enumerate() {
        type_index.entry(entry.msg_name.clone()).or_default().push(i);
        *message_types.entry(entry.msg_name.clone()).or_insert(0) += 1;

        if (i + 1) % 5000 == 0 {
            let _ = app.emit(
                "log://progress",
                LogProgress {
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
    };

    *state.log_store.lock().await = Some(store);

    let _ = app.emit(
        "log://progress",
        LogProgress {
            phase: LogLoadPhase::Completed,
            parsed: total,
        },
    );

    Ok(summary)
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
        if let Some(start) = start_usec {
            if ts < start {
                continue;
            }
        }
        if let Some(end) = end_usec {
            if ts > end {
                continue;
            }
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
pub(crate) async fn log_close(state: tauri::State<'_, AppState>) -> Result<(), String> {
    *state.log_store.lock().await = None;
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
        ("GLOBAL_POSITION_INT", "lat", "lon", "satellites_visible", false)
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
            if let Some(&v) = store.entries[idx].fields.get(bat_v_field) {
                if v > 0.0 {
                    if bat_start.is_none() {
                        bat_start = Some(v);
                    }
                    bat_end = Some(v);
                    bat_min = Some(bat_min.map_or(v, |m: f64| m.min(v)));
                }
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
            if let Some(s) = start_usec {
                if e.timestamp_usec < s {
                    return false;
                }
            }
            if let Some(end) = end_usec {
                if e.timestamp_usec > end {
                    return false;
                }
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
        write!(w, "{:.6},{}", e.timestamp_usec as f64 / 1e6, e.msg_name).map_err(|e| e.to_string())?;
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

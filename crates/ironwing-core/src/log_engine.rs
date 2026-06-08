use std::collections::{BTreeMap, HashMap};
use std::io::{Cursor, Write};

use mavkit::dialect::MavMessage;
use mavlink::{Message, ReadVersion, peek_reader::PeekReader, read_versioned_raw_message};
use serde::Serialize;
use serde_json::{Map as JsonMap, Value as JsonValue};

use crate::ipc::logs::{
    ChartPoint, ChartSeries, ChartSeriesPage, ChartSeriesRequest, LogDiagnostic,
    LogDiagnosticSeverity, LogDiagnosticSource, LogExportRequest, RawMessageFieldFilter,
    RawMessagePage, RawMessageQuery, RawMessageRecord,
};
use crate::ipc::playback::PlaybackSeekResult;
use crate::ipc::{SessionEnvelope, VehicleState};
use crate::log_playback::{
    PlaybackFrame, PlaybackLogBounds, playback_frame_from_parts, resolve_playback_cursor_usec,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LogType {
    Tlog,
    Bin,
}

impl From<LogType> for crate::ipc::logs::LogFormat {
    fn from(value: LogType) -> Self {
        match value {
            LogType::Tlog => Self::Tlog,
            LogType::Bin => Self::Bin,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct LogSummary {
    pub file_name: String,
    pub start_usec: u64,
    pub end_usec: u64,
    pub duration_secs: f64,
    pub total_entries: usize,
    pub message_types: HashMap<String, usize>,
    pub log_type: LogType,
}

#[derive(Debug, Clone, Serialize)]
pub struct LogDataPoint {
    pub timestamp_usec: u64,
    pub fields: HashMap<String, f64>,
}

#[derive(Debug, Clone)]
pub struct StoredEntry {
    pub sequence: u64,
    pub timestamp_usec: u64,
    pub msg_name: String,
    pub fields: HashMap<String, f64>,
    pub field_values: BTreeMap<String, JsonValue>,
    pub raw_len_bytes: u32,
    pub raw_payload: Option<Vec<u8>>,
    pub system_id: Option<u8>,
    pub component_id: Option<u8>,
    pub text: String,
}

impl StoredEntry {
    pub fn from_numeric_fields(
        sequence: u64,
        timestamp_usec: u64,
        msg_name: impl Into<String>,
        fields: HashMap<String, f64>,
    ) -> Self {
        let field_values = json_fields_from_numeric(&fields);
        build_stored_entry(StoredEntryParts {
            sequence,
            timestamp_usec,
            msg_name: msg_name.into(),
            fields,
            field_values,
            raw_payload: None,
            system_id: None,
            component_id: None,
        })
    }
}

#[derive(Debug, Clone)]
pub struct LogStore {
    pub summary: LogSummary,
    pub source_path: String,
    pub entry_id: Option<String>,
    pub entries: Vec<StoredEntry>,
    pub type_index: HashMap<String, Vec<usize>>,
    pub playback_cursor_usec: Option<u64>,
}

#[derive(Debug, Clone)]
pub struct ParsedLog {
    pub store: LogStore,
    pub diagnostics: Vec<LogDiagnostic>,
}

#[derive(Debug, Clone, Serialize)]
pub struct FlightPathPoint {
    pub timestamp_usec: u64,
    pub lat: f64,
    pub lon: f64,
    pub alt: f64,
    pub heading: f64,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct TelemetrySnapshot {
    pub timestamp_usec: u64,
    pub latitude_deg: Option<f64>,
    pub longitude_deg: Option<f64>,
    pub altitude_m: Option<f64>,
    pub heading_deg: Option<f64>,
    pub speed_mps: Option<f64>,
    pub airspeed_mps: Option<f64>,
    pub climb_rate_mps: Option<f64>,
    pub roll_deg: Option<f64>,
    pub pitch_deg: Option<f64>,
    pub yaw_deg: Option<f64>,
    pub battery_pct: Option<f64>,
    pub battery_voltage_v: Option<f64>,
    pub battery_current_a: Option<f64>,
    pub energy_consumed_wh: Option<f64>,
    pub gps_fix_type: Option<String>,
    pub gps_satellites: Option<f64>,
    pub gps_hdop: Option<f64>,
    pub throttle_pct: Option<f64>,
    pub wp_dist_m: Option<f64>,
    pub nav_bearing_deg: Option<f64>,
    pub target_bearing_deg: Option<f64>,
    pub xtrack_error_m: Option<f64>,
    pub armed: Option<bool>,
    pub custom_mode: Option<u32>,
    pub rc_channels: Option<Vec<f64>>,
    pub rc_rssi: Option<f64>,
    pub servo_outputs: Option<Vec<f64>>,
}

#[derive(Debug, Clone, Serialize)]
pub struct FlightSummary {
    pub duration_secs: f64,
    pub max_alt_m: Option<f64>,
    pub avg_alt_m: Option<f64>,
    pub max_speed_mps: Option<f64>,
    pub avg_speed_mps: Option<f64>,
    pub total_distance_m: Option<f64>,
    pub max_distance_from_home_m: Option<f64>,
    pub battery_start_v: Option<f64>,
    pub battery_end_v: Option<f64>,
    pub battery_min_v: Option<f64>,
    pub mah_consumed: Option<f64>,
    pub gps_sats_min: Option<u32>,
    pub gps_sats_max: Option<u32>,
}

impl LogStore {
    pub fn from_entries(path: &str, log_type: LogType, entries: Vec<StoredEntry>) -> Self {
        build_store(path, log_type, entries)
    }

    pub fn summary(&self) -> &LogSummary {
        &self.summary
    }

    pub fn source_path(&self) -> &str {
        &self.source_path
    }

    pub fn entry_id(&self) -> Option<&str> {
        self.entry_id.as_deref()
    }

    pub fn set_entry_id(&mut self, entry_id: Option<String>) {
        self.entry_id = entry_id;
    }

    pub fn entries(&self) -> &[StoredEntry] {
        &self.entries
    }

    pub fn type_index(&self) -> &HashMap<String, Vec<usize>> {
        &self.type_index
    }

    pub fn playback_bounds(&self) -> Option<(u64, u64)> {
        (!self.entries.is_empty()).then_some((self.summary.start_usec, self.summary.end_usec))
    }

    pub fn playback_log_bounds(&self) -> PlaybackLogBounds {
        PlaybackLogBounds {
            cursor_usec: self.resolved_playback_cursor_usec(),
            start_usec: self.summary.start_usec,
            end_usec: self.summary.end_usec,
            duration_secs: self.summary.duration_secs,
        }
    }

    pub fn resolved_playback_cursor_usec(&self) -> Option<u64> {
        self.resolve_cursor_usec(self.playback_cursor_usec)
    }

    pub fn set_playback_cursor_usec(&mut self, cursor_usec: Option<u64>) -> Option<u64> {
        self.playback_cursor_usec = self.resolve_cursor_usec(cursor_usec);
        self.playback_cursor_usec
    }

    pub fn seek_playback(
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

    pub fn playback_frame(&self) -> PlaybackFrame {
        let cursor_usec = self.resolve_cursor_usec(self.playback_cursor_usec);
        let telemetry = telemetry_at(self, cursor_usec);
        let vehicle_state = vehicle_state_at(&telemetry);

        playback_frame_from_parts(
            vehicle_state,
            &serde_json::to_value(telemetry).unwrap_or(serde_json::Value::Null),
            cursor_usec,
        )
    }

    fn resolve_cursor_usec(&self, cursor_usec: Option<u64>) -> Option<u64> {
        resolve_playback_cursor_usec(
            !self.entries.is_empty(),
            self.summary.start_usec,
            self.summary.end_usec,
            cursor_usec,
        )
    }
}

fn vehicle_state_at(telemetry: &TelemetrySnapshot) -> Option<VehicleState> {
    let armed = telemetry.armed?;
    let custom_mode = telemetry.custom_mode?;

    Some(VehicleState {
        armed,
        custom_mode,
        mode_name: format!("Mode {custom_mode}"),
        system_status: mavkit::SystemStatus::Active,
        vehicle_type: Default::default(),
        autopilot: Default::default(),
        firmware_version: None,
        system_id: 0,
        component_id: 0,
        heartbeat_received: false,
    })
}

const DEFAULT_COMPAT_QUERY_POINTS: usize = 2_000;
const DEFAULT_CHART_QUERY_POINTS: usize = 1_000;
const MAX_CHART_QUERY_POINTS: usize = 5_000;
const DEFAULT_RAW_MESSAGE_LIMIT: usize = 100;
const MAX_RAW_MESSAGE_LIMIT: usize = 500;
const DEFAULT_FLIGHT_PATH_POINTS: usize = 1_000;
const MAX_FLIGHT_PATH_POINTS: usize = 5_000;
const TELEMETRY_TRACK_INTERVAL_USEC: u64 = 100_000;

pub fn parse_log_bytes(path: &str, bytes: &[u8], log_type: LogType) -> Result<ParsedLog, String> {
    match log_type {
        LogType::Tlog => parse_tlog_bytes(path, bytes),
        LogType::Bin => parse_bin_bytes(path, bytes),
    }
}

pub fn query_log_messages(
    store: &LogStore,
    msg_type: &str,
    start_usec: Option<u64>,
    end_usec: Option<u64>,
    max_points: Option<usize>,
) -> Result<Vec<LogDataPoint>, String> {
    let indices = store
        .type_index
        .get(msg_type)
        .ok_or_else(|| format!("no entries for message type: {msg_type}"))?;
    let mut points = Vec::new();
    for &idx in indices {
        let entry = &store.entries[idx];
        if in_time_range(entry.timestamp_usec, start_usec, end_usec) {
            points.push(LogDataPoint {
                timestamp_usec: entry.timestamp_usec,
                fields: entry.fields.clone(),
            });
        }
    }
    Ok(downsample_if_needed(
        points,
        bounded_max_points(
            max_points,
            DEFAULT_COMPAT_QUERY_POINTS,
            MAX_CHART_QUERY_POINTS,
        ),
    ))
}

pub fn query_raw_message_page(
    store: &LogStore,
    request: &RawMessageQuery,
) -> Result<RawMessagePage, String> {
    let start_index = parse_raw_cursor(request.cursor.as_deref())?;
    let limit = bounded_page_limit(
        request.limit,
        DEFAULT_RAW_MESSAGE_LIMIT,
        MAX_RAW_MESSAGE_LIMIT,
    );
    let mut items = Vec::with_capacity(limit);
    let mut matched_total = 0_u64;
    let mut next_cursor = None;

    for (index, entry) in store.entries.iter().enumerate() {
        if !entry_matches_common_filters(
            entry,
            request.start_usec,
            request.end_usec,
            &request.message_types,
            request.text.as_deref(),
            &request.field_filters,
        ) {
            continue;
        }
        matched_total += 1;
        if index < start_index {
            continue;
        }
        if items.len() < limit {
            items.push(build_raw_message_record(
                entry,
                request.include_detail,
                request.include_hex,
            ));
        } else if next_cursor.is_none() {
            next_cursor = Some(encode_raw_cursor(index));
        }
    }

    Ok(RawMessagePage {
        entry_id: request.entry_id.clone(),
        items,
        next_cursor,
        total_available: Some(matched_total),
    })
}

pub fn query_chart_series(store: &LogStore, request: &ChartSeriesRequest) -> ChartSeriesPage {
    let max_points = bounded_max_points(
        request.max_points.map(|value| value as usize),
        DEFAULT_CHART_QUERY_POINTS,
        MAX_CHART_QUERY_POINTS,
    );
    let series = request
        .selectors
        .iter()
        .map(|selector| {
            let mut points = Vec::new();
            if let Some(indices) = store.type_index.get(&selector.message_type) {
                for &index in indices {
                    let entry = &store.entries[index];
                    if in_time_range(entry.timestamp_usec, request.start_usec, request.end_usec)
                        && let Some(value) = entry.fields.get(&selector.field).copied()
                    {
                        points.push(ChartPoint {
                            timestamp_usec: entry.timestamp_usec,
                            value,
                        });
                    }
                }
            }
            ChartSeries {
                selector: selector.clone(),
                points: downsample_if_needed(points, max_points),
            }
        })
        .collect();

    ChartSeriesPage {
        entry_id: request.entry_id.clone(),
        start_usec: request.start_usec,
        end_usec: request.end_usec,
        series,
        diagnostics: Vec::new(),
    }
}

pub fn flight_path_points(
    store: &LogStore,
    start_usec: Option<u64>,
    end_usec: Option<u64>,
    max_points: Option<usize>,
) -> Result<Vec<FlightPathPoint>, String> {
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
    let mut points = Vec::new();
    for &index in &store.type_index[gps_type] {
        let entry = &store.entries[index];
        if !in_time_range(entry.timestamp_usec, start_usec, end_usec) {
            continue;
        }
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
    Ok(downsample_if_needed(
        points,
        bounded_max_points(
            max_points,
            DEFAULT_FLIGHT_PATH_POINTS,
            MAX_FLIGHT_PATH_POINTS,
        ),
    ))
}

pub fn telemetry_track(store: &LogStore, max_points: Option<usize>) -> Vec<TelemetrySnapshot> {
    let mut running = TelemetrySnapshot::default();
    let mut track = Vec::new();
    let mut last_emit = 0_u64;
    for entry in &store.entries {
        apply_entry(store.summary.log_type, &mut running, entry);
        if entry.timestamp_usec >= last_emit + TELEMETRY_TRACK_INTERVAL_USEC || track.is_empty() {
            let mut snap = running.clone();
            snap.timestamp_usec = entry.timestamp_usec;
            track.push(snap);
            last_emit = entry.timestamp_usec;
        }
    }
    max_points.map_or(track.clone(), |max| downsample_if_needed(track, max))
}

pub fn telemetry_at(store: &LogStore, cursor_usec: Option<u64>) -> TelemetrySnapshot {
    let Some(cursor_usec) = cursor_usec else {
        return TelemetrySnapshot::default();
    };
    let mut telemetry = TelemetrySnapshot::default();
    for entry in store
        .entries
        .iter()
        .take_while(|entry| entry.timestamp_usec <= cursor_usec)
    {
        apply_entry(store.summary.log_type, &mut telemetry, entry);
    }
    telemetry.timestamp_usec = cursor_usec;
    telemetry
}

pub fn flight_summary(store: &LogStore) -> FlightSummary {
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
    let (alt_max, alt_avg) = field_max_avg(store, alt_msg, alt_field);
    let (spd_max, spd_avg) = field_max_avg(store, spd_msg, spd_field);
    let (battery_start_v, battery_end_v, battery_min_v) =
        first_last_min_positive(store, bat_msg, bat_v_field);
    let mah_consumed = if is_bin {
        last_field(store, "BAT", "CurrTot")
    } else {
        last_field(store, "BATTERY_STATUS", "current_consumed")
    };
    let (total_distance_m, max_distance_from_home_m) =
        distance_stats(store, gps_msg, lat_key, lon_key, needs_dege7);
    let (gps_sats_min, gps_sats_max) = sats_stats(store, sats_msg, sats_key);
    FlightSummary {
        duration_secs: store.summary.duration_secs,
        max_alt_m: alt_max,
        avg_alt_m: alt_avg,
        max_speed_mps: spd_max,
        avg_speed_mps: spd_avg,
        total_distance_m,
        max_distance_from_home_m,
        battery_start_v,
        battery_end_v,
        battery_min_v,
        mah_consumed,
        gps_sats_min,
        gps_sats_max,
    }
}

pub fn export_csv_bytes(
    store: &LogStore,
    request: &LogExportRequest,
) -> Result<(Vec<u8>, u64), String> {
    let entries: Vec<&StoredEntry> = store
        .entries
        .iter()
        .filter(|entry| {
            entry_matches_common_filters(
                entry,
                request.start_usec,
                request.end_usec,
                &request.message_types,
                request.text.as_deref(),
                &request.field_filters,
            )
        })
        .collect();
    write_csv_export(entries)
}

fn parse_bin_bytes(path: &str, bytes: &[u8]) -> Result<ParsedLog, String> {
    let has_trailing_fragment = bytes
        .windows(2)
        .rposition(|window| window == [0xA3, 0x95])
        .is_some_and(|position| position > 0 && bytes.len() - position < 5);
    let mut entries = Vec::new();
    let mut diagnostics = Vec::new();
    for result in ardupilot_binlog::Reader::new(Cursor::new(bytes)) {
        match result {
            Ok(entry) => {
                let sequence = entries.len() as u64;
                if let Some(stored) = bin_to_stored(sequence, &entry) {
                    entries.push(stored);
                }
            }
            Err(error) => {
                let code = if entries.is_empty() {
                    "bin_parse_failed"
                } else {
                    "bin_partial_parse"
                };
                let severity = if entries.is_empty() {
                    LogDiagnosticSeverity::Error
                } else {
                    LogDiagnosticSeverity::Warning
                };
                diagnostics.push(log_diagnostic(
                    severity,
                    LogDiagnosticSource::Parse,
                    code,
                    format!(
                        "BIN parse stopped after {} recoverable messages: {error}",
                        entries.len()
                    ),
                    !entries.is_empty(),
                    entries.last().map(|entry| entry.timestamp_usec),
                ));
                break;
            }
        }
    }
    if has_trailing_fragment && diagnostics.is_empty() {
        diagnostics.push(log_diagnostic(
            LogDiagnosticSeverity::Warning,
            LogDiagnosticSource::Parse,
            "bin_partial_parse",
            format!(
                "BIN parse stopped after {} recoverable messages because the file ends with a partial record",
                entries.len()
            ),
            !entries.is_empty(),
            entries.last().map(|entry| entry.timestamp_usec),
        ));
    }
    Ok(ParsedLog {
        store: build_store(path, LogType::Bin, entries),
        diagnostics,
    })
}

fn parse_tlog_bytes(path: &str, bytes: &[u8]) -> Result<ParsedLog, String> {
    let mut reader = PeekReader::new(Cursor::new(bytes));
    let mut entries = Vec::new();
    let mut sequence = 0_u64;
    loop {
        let ts_bytes = match reader.read_exact(8) {
            Ok(bytes) => bytes,
            Err(mavlink::error::MessageReadError::Io(error))
                if error.kind() == std::io::ErrorKind::UnexpectedEof =>
            {
                break;
            }
            Err(error) => return Err(format!("failed to parse TLOG timestamp: {error}")),
        };
        let timestamp_usec = u64::from_le_bytes(
            ts_bytes
                .try_into()
                .map_err(|_| "invalid TLOG timestamp width")?,
        );
        let raw = read_versioned_raw_message::<MavMessage, _>(&mut reader, ReadVersion::Any)
            .map_err(|error| format!("failed to parse TLOG frame: {error}"))?;
        let message = MavMessage::parse(raw.version(), raw.message_id(), raw.payload())
            .map_err(|error| format!("failed to decode TLOG payload: {error}"))?;
        entries.push(tlog_to_stored(
            sequence,
            timestamp_usec,
            raw.system_id(),
            raw.component_id(),
            raw.payload().to_vec(),
            message,
        ));
        sequence += 1;
    }
    Ok(ParsedLog {
        store: build_store(path, LogType::Tlog, entries),
        diagnostics: Vec::new(),
    })
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
            for (i, value) in [
                d.chan1_raw,
                d.chan2_raw,
                d.chan3_raw,
                d.chan4_raw,
                d.chan5_raw,
                d.chan6_raw,
                d.chan7_raw,
                d.chan8_raw,
            ]
            .into_iter()
            .enumerate()
            {
                fields.insert(format!("chan{}_raw", i + 1), value as f64);
            }
            fields.insert("chancount".into(), d.chancount as f64);
            fields.insert("rssi".into(), d.rssi as f64);
        }
        MavMessage::SERVO_OUTPUT_RAW(d) => {
            for (i, value) in [
                d.servo1_raw,
                d.servo2_raw,
                d.servo3_raw,
                d.servo4_raw,
                d.servo5_raw,
                d.servo6_raw,
                d.servo7_raw,
                d.servo8_raw,
            ]
            .into_iter()
            .enumerate()
            {
                fields.insert(format!("servo{}_raw", i + 1), value as f64);
            }
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

fn json_fields_from_numeric(fields: &HashMap<String, f64>) -> BTreeMap<String, JsonValue> {
    fields
        .iter()
        .map(|(key, value)| (key.clone(), JsonValue::from(*value)))
        .collect()
}

struct StoredEntryParts {
    sequence: u64,
    timestamp_usec: u64,
    msg_name: String,
    fields: HashMap<String, f64>,
    field_values: BTreeMap<String, JsonValue>,
    raw_payload: Option<Vec<u8>>,
    system_id: Option<u8>,
    component_id: Option<u8>,
}

fn build_stored_entry(parts: StoredEntryParts) -> StoredEntry {
    let StoredEntryParts {
        sequence,
        timestamp_usec,
        msg_name,
        fields,
        field_values,
        raw_payload,
        system_id,
        component_id,
    } = parts;
    let detail = JsonValue::Object(JsonMap::from_iter(field_values.clone()));
    let text = if field_values.is_empty() {
        msg_name.clone()
    } else {
        format!(
            "{msg_name} {}",
            serde_json::to_string(&detail).unwrap_or_default()
        )
    };
    let raw_len_bytes = raw_payload
        .as_ref()
        .map_or(0, |payload| payload.len() as u32);
    StoredEntry {
        sequence,
        timestamp_usec,
        msg_name,
        fields,
        field_values,
        raw_len_bytes,
        raw_payload,
        system_id,
        component_id,
        text,
    }
}

fn tlog_to_stored(
    sequence: u64,
    timestamp_usec: u64,
    system_id: u8,
    component_id: u8,
    raw_payload: Vec<u8>,
    message: MavMessage,
) -> StoredEntry {
    let (name, fields) = extract_fields(&message);
    let field_values = json_fields_from_numeric(&fields);
    build_stored_entry(StoredEntryParts {
        sequence,
        timestamp_usec,
        msg_name: name,
        fields,
        field_values,
        raw_payload: Some(raw_payload),
        system_id: Some(system_id),
        component_id: Some(component_id),
    })
}

fn bin_to_stored(sequence: u64, entry: &ardupilot_binlog::Entry) -> Option<StoredEntry> {
    let timestamp_usec = entry.timestamp_usec?;
    let mut fields = HashMap::new();
    let mut field_values = BTreeMap::new();
    for (key, value) in entry.fields() {
        if let Some(number) = value.as_f64() {
            fields.insert(key.to_string(), number);
            field_values.insert(key.to_string(), JsonValue::from(number));
        }
    }
    Some(build_stored_entry(StoredEntryParts {
        sequence,
        timestamp_usec,
        msg_name: entry.name.clone(),
        fields,
        field_values,
        raw_payload: None,
        system_id: None,
        component_id: None,
    }))
}

fn build_store(path: &str, log_type: LogType, entries: Vec<StoredEntry>) -> LogStore {
    let summary = summarize_entries(path, log_type, &entries);
    let mut type_index: HashMap<String, Vec<usize>> = HashMap::new();
    for (i, entry) in entries.iter().enumerate() {
        type_index
            .entry(entry.msg_name.clone())
            .or_default()
            .push(i);
    }
    LogStore {
        summary,
        source_path: path.to_string(),
        entry_id: None,
        entries,
        type_index,
        playback_cursor_usec: None,
    }
}

fn summarize_entries(path: &str, log_type: LogType, entries: &[StoredEntry]) -> LogSummary {
    let start_usec = entries.first().map_or(0, |entry| entry.timestamp_usec);
    let end_usec = entries.last().map_or(0, |entry| entry.timestamp_usec);
    let duration_secs = if end_usec > start_usec {
        (end_usec - start_usec) as f64 / 1_000_000.0
    } else {
        0.0
    };
    let file_name = path.rsplit(['/', '\\']).next().unwrap_or(path).to_string();
    let mut message_types = HashMap::new();
    for entry in entries {
        *message_types.entry(entry.msg_name.clone()).or_insert(0) += 1;
    }
    LogSummary {
        file_name,
        start_usec,
        end_usec,
        duration_secs,
        total_entries: entries.len(),
        message_types,
        log_type,
    }
}

fn log_diagnostic(
    severity: LogDiagnosticSeverity,
    source: LogDiagnosticSource,
    code: &str,
    message: String,
    recoverable: bool,
    timestamp_usec: Option<u64>,
) -> LogDiagnostic {
    LogDiagnostic {
        severity,
        source,
        code: code.to_string(),
        message,
        recoverable,
        timestamp_usec,
    }
}

fn build_raw_message_record(
    entry: &StoredEntry,
    include_detail: bool,
    include_hex: bool,
) -> RawMessageRecord {
    RawMessageRecord {
        sequence: entry.sequence,
        timestamp_usec: entry.timestamp_usec,
        message_type: entry.msg_name.clone(),
        system_id: entry.system_id,
        component_id: entry.component_id,
        raw_len_bytes: entry.raw_len_bytes,
        fields: entry.field_values.clone(),
        detail: include_detail
            .then(|| JsonValue::Object(JsonMap::from_iter(entry.field_values.clone()))),
        hex_payload: include_hex
            .then_some(entry.raw_payload.as_deref())
            .flatten()
            .map(hex_payload),
        diagnostics: Vec::new(),
    }
}

fn hex_payload(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn parse_raw_cursor(cursor: Option<&str>) -> Result<usize, String> {
    cursor
        .map(|value| {
            usize::from_str_radix(value, 16)
                .map_err(|error| format!("invalid raw message cursor {value}: {error}"))
        })
        .transpose()
        .map(|value| value.unwrap_or(0))
}

fn encode_raw_cursor(index: usize) -> String {
    format!("{index:016x}")
}

fn normalized_text_filter(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|candidate| !candidate.is_empty())
        .map(|candidate| candidate.to_ascii_lowercase())
}

fn json_value_matches_text(value: &JsonValue, needle: &str) -> bool {
    match value {
        JsonValue::String(text) => text.to_ascii_lowercase().contains(needle),
        JsonValue::Number(number) => number.to_string().to_ascii_lowercase().contains(needle),
        JsonValue::Bool(boolean) => boolean.to_string().contains(needle),
        JsonValue::Null => "null".contains(needle),
        JsonValue::Array(items) => items
            .iter()
            .any(|item| json_value_matches_text(item, needle)),
        JsonValue::Object(map) => map.iter().any(|(key, value)| {
            key.to_ascii_lowercase().contains(needle) || json_value_matches_text(value, needle)
        }),
    }
}

fn entry_matches_text_filter(entry: &StoredEntry, text: &str) -> bool {
    entry.msg_name.to_ascii_lowercase().contains(text)
        || entry.text.to_ascii_lowercase().contains(text)
        || entry.field_values.iter().any(|(key, value)| {
            key.to_ascii_lowercase().contains(text) || json_value_matches_text(value, text)
        })
}

fn entry_matches_field_filters(entry: &StoredEntry, filters: &[RawMessageFieldFilter]) -> bool {
    filters.iter().all(|filter| {
        let Some(value) = entry.field_values.get(&filter.field) else {
            return false;
        };
        normalized_text_filter(filter.value_text.as_deref())
            .is_none_or(|needle| json_value_matches_text(value, &needle))
    })
}

fn entry_matches_common_filters(
    entry: &StoredEntry,
    start_usec: Option<u64>,
    end_usec: Option<u64>,
    message_types: &[String],
    text: Option<&str>,
    field_filters: &[RawMessageFieldFilter],
) -> bool {
    in_time_range(entry.timestamp_usec, start_usec, end_usec)
        && (message_types.is_empty()
            || message_types
                .iter()
                .any(|candidate| candidate == &entry.msg_name))
        && normalized_text_filter(text).is_none_or(|text| entry_matches_text_filter(entry, &text))
        && entry_matches_field_filters(entry, field_filters)
}

fn in_time_range(timestamp_usec: u64, start_usec: Option<u64>, end_usec: Option<u64>) -> bool {
    start_usec.is_none_or(|start| timestamp_usec >= start)
        && end_usec.is_none_or(|end| timestamp_usec <= end)
}

fn bounded_max_points(max_points: Option<usize>, default: usize, max: usize) -> usize {
    match max_points {
        Some(value) if value > 0 => value.min(max),
        _ => default,
    }
}

fn bounded_page_limit(limit: u32, default: usize, max: usize) -> usize {
    let requested = usize::try_from(limit).unwrap_or(max);
    if requested == 0 {
        default
    } else {
        requested.min(max)
    }
}

fn downsample_if_needed<T: Clone>(items: Vec<T>, max_points: usize) -> Vec<T> {
    if max_points == 0 || items.len() <= max_points {
        return items;
    }
    if max_points == 1 {
        return items.first().cloned().into_iter().collect();
    }
    let last = items.len() - 1;
    let out_last = max_points - 1;
    (0..max_points)
        .map(|i| items[i * last / out_last].clone())
        .collect()
}

fn apply_entry(log_type: LogType, snap: &mut TelemetrySnapshot, entry: &StoredEntry) {
    match log_type {
        LogType::Tlog => apply_tlog_entry(snap, entry),
        LogType::Bin => apply_bin_entry(snap, entry),
    }
}

fn gps_fix_type_name(val: f64) -> &'static str {
    match val as u8 {
        2 => "fix_2d",
        3 => "fix_3d",
        4 => "dgps",
        5 => "rtk_float",
        6 => "rtk_fixed",
        _ => "no_fix",
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
            snap.altitude_m = snap.altitude_m.or_else(|| f.get("relative_alt").copied());
            snap.heading_deg = snap.heading_deg.or_else(|| f.get("hdg").copied());
        }
        "SYS_STATUS" => {
            snap.battery_voltage_v = f.get("voltage_battery").copied();
            snap.battery_current_a = f.get("current_battery").copied();
            snap.battery_pct = f.get("battery_remaining").copied();
        }
        "GPS_RAW_INT" => {
            snap.gps_fix_type = f.get("fix_type").map(|v| gps_fix_type_name(*v).into());
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
        "BATTERY_STATUS" => snap.energy_consumed_wh = f.get("energy_consumed").copied(),
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
            snap.gps_fix_type = f.get("Status").map(|v| gps_fix_type_name(*v).into());
            snap.gps_satellites = f.get("NSats").copied();
            snap.gps_hdop = f.get("HDop").copied();
        }
        "BAT" => {
            snap.battery_voltage_v = f.get("Volt").copied();
            snap.battery_current_a = f.get("Curr").copied();
            snap.battery_pct = f.get("Rem").copied();
        }
        "MODE" => snap.custom_mode = f.get("ModeNum").map(|v| *v as u32),
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

fn field_max_avg(store: &LogStore, msg: &str, field: &str) -> (Option<f64>, Option<f64>) {
    let mut sum = 0.0;
    let mut count = 0_u64;
    let mut max_value: Option<f64> = None;
    if let Some(indices) = store.type_index.get(msg) {
        for &idx in indices {
            if let Some(value) = store.entries[idx].fields.get(field).copied() {
                sum += value;
                count += 1;
                max_value = Some(max_value.map_or(value, |max| max.max(value)));
            }
        }
    }
    (max_value, (count > 0).then_some(sum / count as f64))
}

fn first_last_min_positive(
    store: &LogStore,
    msg: &str,
    field: &str,
) -> (Option<f64>, Option<f64>, Option<f64>) {
    let mut first = None;
    let mut last = None;
    let mut min_value: Option<f64> = None;
    if let Some(indices) = store.type_index.get(msg) {
        for &idx in indices {
            if let Some(value) = store.entries[idx].fields.get(field).copied()
                && value > 0.0
            {
                first.get_or_insert(value);
                last = Some(value);
                min_value = Some(min_value.map_or(value, |min| min.min(value)));
            }
        }
    }
    (first, last, min_value)
}

fn last_field(store: &LogStore, msg: &str, field: &str) -> Option<f64> {
    store.type_index.get(msg).and_then(|indices| {
        indices
            .last()
            .and_then(|&idx| store.entries[idx].fields.get(field).copied())
    })
}

fn distance_stats(
    store: &LogStore,
    msg: &str,
    lat_key: &str,
    lon_key: &str,
    needs_dege7: bool,
) -> (Option<f64>, Option<f64>) {
    let mut total = 0.0;
    let mut max_home: Option<f64> = None;
    let mut home: Option<(f64, f64)> = None;
    let mut prev: Option<(f64, f64)> = None;
    if let Some(indices) = store.type_index.get(msg) {
        for &idx in indices {
            let mut lat = store.entries[idx]
                .fields
                .get(lat_key)
                .copied()
                .unwrap_or(0.0);
            let mut lon = store.entries[idx]
                .fields
                .get(lon_key)
                .copied()
                .unwrap_or(0.0);
            if needs_dege7 {
                lat /= 1e7;
                lon /= 1e7;
            }
            if lat.abs() < 1e-6 && lon.abs() < 1e-6 {
                continue;
            }
            home.get_or_insert((lat, lon));
            if let Some((prev_lat, prev_lon)) = prev {
                total += haversine_m(prev_lat, prev_lon, lat, lon);
            }
            if let Some((home_lat, home_lon)) = home {
                let distance = haversine_m(home_lat, home_lon, lat, lon);
                max_home = Some(max_home.map_or(distance, |max| max.max(distance)));
            }
            prev = Some((lat, lon));
        }
    }
    ((total > 0.0).then_some(total), max_home)
}

fn sats_stats(store: &LogStore, msg: &str, field: &str) -> (Option<u32>, Option<u32>) {
    let mut min_value: Option<u32> = None;
    let mut max_value: Option<u32> = None;
    if let Some(indices) = store.type_index.get(msg) {
        for &idx in indices {
            if let Some(value) = store.entries[idx].fields.get(field).copied() {
                let value = value as u32;
                min_value = Some(min_value.map_or(value, |min| min.min(value)));
                max_value = Some(max_value.map_or(value, |max| max.max(value)));
            }
        }
    }
    (min_value, max_value)
}

fn csv_field_names(entries: &[&StoredEntry]) -> Vec<String> {
    let mut field_set = std::collections::BTreeSet::new();
    for entry in entries {
        for key in entry.fields.keys() {
            field_set.insert(key.clone());
        }
    }
    field_set.into_iter().collect()
}

fn write_csv_cell<W: Write>(
    writer: &mut W,
    value: &str,
    protect_formula: bool,
) -> Result<(), String> {
    let protected;
    let value = if protect_formula && matches!(value.chars().next(), Some('=' | '+' | '-' | '@')) {
        protected = format!("'{value}");
        protected.as_str()
    } else {
        value
    };
    if value.contains(',') || value.contains('"') || value.contains('\n') || value.contains('\r') {
        write!(writer, "\"{}\"", value.replace('"', "\"\"")).map_err(|error| error.to_string())
    } else {
        write!(writer, "{value}").map_err(|error| error.to_string())
    }
}

fn write_csv_export(entries: Vec<&StoredEntry>) -> Result<(Vec<u8>, u64), String> {
    if entries.is_empty() {
        return Err("no entries in selected range".into());
    }
    let field_names = csv_field_names(&entries);
    let mut writer = Vec::new();
    write_csv_cell(&mut writer, "timestamp_sec", false)?;
    write!(writer, ",").map_err(|error| error.to_string())?;
    write_csv_cell(&mut writer, "msg_type", false)?;
    for name in &field_names {
        write!(writer, ",").map_err(|error| error.to_string())?;
        write_csv_cell(&mut writer, name, true)?;
    }
    writeln!(writer).map_err(|error| error.to_string())?;
    let mut row_count = 0_u64;
    for entry in entries {
        write_csv_cell(
            &mut writer,
            &format!("{:.6}", entry.timestamp_usec as f64 / 1e6),
            false,
        )?;
        write!(writer, ",").map_err(|error| error.to_string())?;
        write_csv_cell(&mut writer, &entry.msg_name, true)?;
        for name in &field_names {
            write!(writer, ",").map_err(|error| error.to_string())?;
            if let Some(value) = entry.fields.get(name) {
                write_csv_cell(&mut writer, &value.to_string(), false)?;
            }
        }
        writeln!(writer).map_err(|error| error.to_string())?;
        row_count += 1;
    }
    Ok((writer, row_count))
}

#[cfg(test)]
mod tests {
    use super::*;
    use mavkit::dialect::{
        GLOBAL_POSITION_INT_DATA, HEARTBEAT_DATA, MavAutopilot, MavModeFlag, MavState, MavType,
        VFR_HUD_DATA,
    };

    fn stored_entry_with_values(
        sequence: u64,
        timestamp_usec: u64,
        msg_name: &str,
        fields: HashMap<String, f64>,
        field_values: BTreeMap<String, JsonValue>,
        raw_payload: Option<Vec<u8>>,
    ) -> StoredEntry {
        build_stored_entry(StoredEntryParts {
            sequence,
            timestamp_usec,
            msg_name: msg_name.to_string(),
            fields,
            field_values,
            raw_payload,
            system_id: None,
            component_id: None,
        })
    }

    fn numeric_entry(
        sequence: u64,
        timestamp_usec: u64,
        msg_name: &str,
        fields: HashMap<String, f64>,
    ) -> StoredEntry {
        StoredEntry::from_numeric_fields(sequence, timestamp_usec, msg_name, fields)
    }

    fn store_from_entries(path: &str, log_type: LogType, entries: Vec<StoredEntry>) -> LogStore {
        LogStore::from_entries(path, log_type, entries)
    }

    fn assert_close(actual: f64, expected: f64) {
        assert!(
            (actual - expected).abs() < 1e-5,
            "expected {expected}, got {actual}"
        );
    }

    #[test]
    fn extract_fields_scales_global_position_int_units() {
        let message = MavMessage::GLOBAL_POSITION_INT(GLOBAL_POSITION_INT_DATA {
            time_boot_ms: 0,
            lat: 374_221_234,
            lon: -1_220_845_678,
            alt: 123_456,
            relative_alt: 7_890,
            vx: 321,
            vy: -123,
            vz: 45,
            hdg: 9_001,
        });

        let (name, fields) = extract_fields(&message);

        assert_eq!(name, "GLOBAL_POSITION_INT");
        assert_close(fields["lat"], 37.4221234);
        assert_close(fields["lon"], -122.0845678);
        assert_close(fields["alt"], 123.456);
        assert_close(fields["relative_alt"], 7.89);
        assert_close(fields["hdg"], 90.01);
    }

    #[test]
    fn query_raw_message_page_paginates_and_filters_shared_store() {
        let store = store_from_entries(
            "raw-query.tlog",
            LogType::Tlog,
            vec![
                stored_entry_with_values(
                    0,
                    100,
                    "HEARTBEAT",
                    HashMap::from([("custom_mode".to_string(), 4.0)]),
                    BTreeMap::from([
                        ("custom_mode".to_string(), JsonValue::from(4.0)),
                        ("note".to_string(), JsonValue::from("startup")),
                    ]),
                    Some(vec![0xFE, 0x09, 0x00]),
                ),
                stored_entry_with_values(
                    1,
                    200,
                    "GLOBAL_POSITION_INT",
                    HashMap::from([("relative_alt".to_string(), 12_000.0)]),
                    BTreeMap::from([
                        ("relative_alt".to_string(), JsonValue::from(12_000.0)),
                        ("note".to_string(), JsonValue::from("alt match one")),
                    ]),
                    Some(vec![0xFD, 0x0C, 0x01]),
                ),
                stored_entry_with_values(
                    2,
                    300,
                    "GLOBAL_POSITION_INT",
                    HashMap::from([("relative_alt".to_string(), 16_000.0)]),
                    BTreeMap::from([
                        ("relative_alt".to_string(), JsonValue::from(16_000.0)),
                        ("note".to_string(), JsonValue::from("alt match two")),
                    ]),
                    Some(vec![0xFD, 0x0C, 0x02]),
                ),
            ],
        );
        let request = RawMessageQuery {
            entry_id: "entry-tlog".into(),
            cursor: None,
            start_usec: Some(150),
            end_usec: Some(350),
            message_types: vec!["GLOBAL_POSITION_INT".into()],
            text: Some("alt match".into()),
            field_filters: vec![RawMessageFieldFilter {
                field: "relative_alt".into(),
                value_text: Some("000".into()),
            }],
            limit: 1,
            include_detail: true,
            include_hex: true,
        };

        let first_page = query_raw_message_page(&store, &request).expect("first page");
        assert_eq!(first_page.total_available, Some(2));
        assert_eq!(first_page.items.len(), 1);
        assert_eq!(first_page.items[0].sequence, 1);
        assert_eq!(first_page.items[0].hex_payload.as_deref(), Some("fd0c01"));
        assert_eq!(first_page.next_cursor.as_deref(), Some("0000000000000002"));

        let second_page = query_raw_message_page(
            &store,
            &RawMessageQuery {
                cursor: first_page.next_cursor,
                ..request
            },
        )
        .expect("second page");
        assert_eq!(second_page.items.len(), 1);
        assert_eq!(second_page.items[0].sequence, 2);
        assert_eq!(second_page.next_cursor, None);
    }

    #[test]
    fn query_chart_series_bounds_and_downsamples_points() {
        let store = store_from_entries(
            "chart-query.tlog",
            LogType::Tlog,
            vec![
                numeric_entry(0, 100, "VFR_HUD", HashMap::from([("alt".to_string(), 0.0)])),
                numeric_entry(
                    1,
                    200,
                    "VFR_HUD",
                    HashMap::from([("alt".to_string(), 10.0)]),
                ),
                numeric_entry(
                    2,
                    300,
                    "VFR_HUD",
                    HashMap::from([("alt".to_string(), 20.0)]),
                ),
                numeric_entry(
                    3,
                    400,
                    "VFR_HUD",
                    HashMap::from([("alt".to_string(), 30.0)]),
                ),
            ],
        );
        let page = query_chart_series(
            &store,
            &ChartSeriesRequest {
                entry_id: "entry-tlog".into(),
                selectors: vec![crate::ipc::logs::ChartSeriesSelector {
                    message_type: "VFR_HUD".into(),
                    field: "alt".into(),
                    label: "Altitude".into(),
                    unit: Some("m".into()),
                }],
                start_usec: Some(150),
                end_usec: Some(450),
                max_points: Some(2),
            },
        );

        assert_eq!(page.series.len(), 1);
        assert_eq!(page.series[0].points.len(), 2);
        assert_eq!(page.series[0].points[0].timestamp_usec, 200);
        assert_eq!(page.series[0].points[1].timestamp_usec, 400);
    }

    #[test]
    fn telemetry_at_carries_tlog_values_to_cursor() {
        let heartbeat = MavMessage::HEARTBEAT(HEARTBEAT_DATA {
            custom_mode: 42,
            mavtype: MavType::MAV_TYPE_QUADROTOR,
            autopilot: MavAutopilot::MAV_AUTOPILOT_ARDUPILOTMEGA,
            base_mode: MavModeFlag::MAV_MODE_FLAG_SAFETY_ARMED,
            system_status: MavState::MAV_STATE_ACTIVE,
            mavlink_version: 3,
        });
        let vfr = MavMessage::VFR_HUD(VFR_HUD_DATA {
            airspeed: 12.0,
            groundspeed: 11.0,
            heading: 250,
            throttle: 70,
            alt: 123.4,
            climb: -1.2,
        });
        let (_, heartbeat_fields) = extract_fields(&heartbeat);
        let (_, vfr_fields) = extract_fields(&vfr);
        let store = store_from_entries(
            "telemetry.tlog",
            LogType::Tlog,
            vec![
                numeric_entry(0, 100, "HEARTBEAT", heartbeat_fields),
                numeric_entry(1, 150, "VFR_HUD", vfr_fields),
            ],
        );

        let snapshot = telemetry_at(&store, Some(150));

        assert_eq!(snapshot.custom_mode, Some(42));
        assert_eq!(snapshot.armed, Some(true));
        assert_close(snapshot.altitude_m.expect("altitude"), 123.4);
        assert_close(snapshot.speed_mps.expect("ground speed"), 11.0);
    }

    #[test]
    fn flight_path_points_scale_bin_gps_dege7_values() {
        let store = store_from_entries(
            "path.bin",
            LogType::Bin,
            vec![numeric_entry(
                0,
                1_000,
                "GPS",
                HashMap::from([
                    ("Lat".to_string(), 377_749_000.0),
                    ("Lng".to_string(), -1_220_419_000.0),
                    ("Alt".to_string(), 12.0),
                    ("GCrs".to_string(), 180.0),
                ]),
            )],
        );

        let points = flight_path_points(&store, None, None, None).expect("flight path");

        assert_eq!(points.len(), 1);
        assert_close(points[0].lat, 37.7749);
        assert_close(points[0].lon, -122.0419);
        assert_eq!(points[0].alt, 12.0);
    }

    #[test]
    fn flight_summary_computes_basic_tlog_stats() {
        let store = store_from_entries(
            "summary.tlog",
            LogType::Tlog,
            vec![
                numeric_entry(
                    0,
                    0,
                    "VFR_HUD",
                    HashMap::from([("alt".to_string(), 10.0), ("groundspeed".to_string(), 2.0)]),
                ),
                numeric_entry(
                    1,
                    1_000_000,
                    "VFR_HUD",
                    HashMap::from([("alt".to_string(), 20.0), ("groundspeed".to_string(), 4.0)]),
                ),
                numeric_entry(
                    2,
                    1_000_000,
                    "SYS_STATUS",
                    HashMap::from([("voltage_battery".to_string(), 11.5)]),
                ),
                numeric_entry(
                    3,
                    1_000_000,
                    "GLOBAL_POSITION_INT",
                    HashMap::from([
                        ("lat".to_string(), 37.0),
                        ("lon".to_string(), -122.0),
                        ("satellites_visible".to_string(), 10.0),
                    ]),
                ),
                numeric_entry(
                    4,
                    2_000_000,
                    "GLOBAL_POSITION_INT",
                    HashMap::from([
                        ("lat".to_string(), 37.001),
                        ("lon".to_string(), -122.0),
                        ("satellites_visible".to_string(), 12.0),
                    ]),
                ),
                numeric_entry(
                    5,
                    2_000_000,
                    "GPS_RAW_INT",
                    HashMap::from([("satellites_visible".to_string(), 9.0)]),
                ),
            ],
        );

        let summary = flight_summary(&store);

        assert_eq!(summary.duration_secs, 2.0);
        assert_eq!(summary.max_alt_m, Some(20.0));
        assert_eq!(summary.avg_alt_m, Some(15.0));
        assert_eq!(summary.max_speed_mps, Some(4.0));
        assert!(
            summary
                .total_distance_m
                .is_some_and(|distance| distance > 0.0)
        );
        assert_eq!(summary.battery_start_v, Some(11.5));
        assert_eq!(summary.gps_sats_min, Some(9));
    }

    #[test]
    fn export_csv_bytes_filters_and_sanitizes_headers() {
        let store = store_from_entries(
            "export.tlog",
            LogType::Tlog,
            vec![
                stored_entry_with_values(
                    0,
                    100,
                    "=MSG,TYPE",
                    HashMap::from([
                        ("field,comma".to_string(), 1.0),
                        ("field\"quote".to_string(), 2.0),
                        ("field\nnewline".to_string(), 3.0),
                        ("=field_formula".to_string(), 4.0),
                    ]),
                    BTreeMap::from([
                        ("field,comma".to_string(), JsonValue::from(1.0)),
                        ("field\"quote".to_string(), JsonValue::from(2.0)),
                        ("field\nnewline".to_string(), JsonValue::from(3.0)),
                        ("=field_formula".to_string(), JsonValue::from(4.0)),
                    ]),
                    None,
                ),
                numeric_entry(1, 200, "OTHER", HashMap::from([("value".to_string(), 5.0)])),
            ],
        );
        let request = LogExportRequest {
            entry_id: "entry-tlog".into(),
            instance_id: "export-strings".into(),
            format: crate::ipc::logs::LogExportFormat::Csv,
            destination_path: "ignored.csv".into(),
            start_usec: None,
            end_usec: None,
            message_types: vec!["=MSG,TYPE".into()],
            text: None,
            field_filters: vec![],
        };

        let (bytes, rows_written) = export_csv_bytes(&store, &request).expect("csv bytes");
        let csv = String::from_utf8(bytes).expect("utf8 csv");

        assert_eq!(rows_written, 1);
        assert!(csv.contains("\"field,comma\""));
        assert!(csv.contains("\"field\"\"quote\""));
        assert!(csv.contains("\"field\nnewline\""));
        assert!(csv.contains("'=field_formula"));
        assert!(csv.contains("\"'=MSG,TYPE\""));
        assert!(!csv.contains("OTHER"));
    }

    #[test]
    fn playback_frame_uses_telemetry_vehicle_state() {
        let store = store_from_entries(
            "playback.tlog",
            LogType::Tlog,
            vec![numeric_entry(
                0,
                100,
                "HEARTBEAT",
                HashMap::from([
                    ("custom_mode".to_string(), 4.0),
                    ("base_mode".to_string(), 128.0),
                ]),
            )],
        );

        let frame = store.playback_frame();
        let vehicle_state = frame
            .session
            .value
            .as_ref()
            .and_then(|session| session.vehicle_state.as_ref())
            .expect("vehicle state");

        assert!(vehicle_state.armed);
        assert_eq!(vehicle_state.custom_mode, 4);
        assert_eq!(frame.playback.cursor_usec, Some(100));
    }
}

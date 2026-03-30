use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;
use std::time::Instant;

use mavkit::{
    SensorHealthSummary, Vehicle,
    ardupilot::{MagCalProgress, MagCalReport},
};
use serde::Serialize;
use tauri::Manager;

use crate::AppState;
use crate::e2e_emit::emit_event;
use crate::guided::{emit_guided_snapshot, live_context_from_vehicle};
use crate::ipc::calibration::CalibrationSources;
use crate::ipc::session::{SessionConnection, VehicleState};
use crate::ipc::{
    DomainProvenance, DomainValue, ScopedEvent, SessionEnvelope, SessionSnapshot, SessionStatus,
    configuration_facts_snapshot_from_param_store, push_status_text_entry,
    sensor_health_snapshot_from_summary, session_connection_from_link_state,
    status_text_entry_from_value, status_text_snapshot_from_entries, support_snapshot,
    telemetry_snapshot_from_value,
};

pub(crate) struct SessionContext {
    pub connection: SessionConnection,
    pub vehicle_state: Option<VehicleState>,
    pub home_position: Option<mavkit::HomePosition>,
}

impl SessionContext {
    pub(crate) fn new() -> Self {
        Self {
            connection: SessionConnection::Disconnected,
            vehicle_state: None,
            home_position: None,
        }
    }

    pub(crate) fn reset(&mut self) {
        self.connection = SessionConnection::Disconnected;
        self.vehicle_state = None;
        self.home_position = None;
    }
}

pub(crate) static TELEMETRY_INTERVAL_MS: AtomicU64 = AtomicU64::new(200);


async fn snapshot_from_context(handle: &tauri::AppHandle) -> DomainValue<SessionSnapshot> {
    let state: tauri::State<'_, AppState> = handle.state();
    let ctx = state.session_context.lock().await;
    DomainValue::present(
        SessionSnapshot {
            status: SessionStatus::Active,
            connection: ctx.connection.clone(),
            vehicle_state: ctx.vehicle_state.clone(),
            home_position: ctx.home_position.clone(),
        },
        DomainProvenance::Stream,
    )
}

async fn current_stream_envelope(handle: &tauri::AppHandle) -> Option<SessionEnvelope> {
    let state: tauri::State<'_, AppState> = handle.state();
    let mut runtime = state.session_runtime.lock().await;
    runtime.current_stream_envelope(Instant::now())
}

pub(crate) async fn emit_scoped<T>(handle: &tauri::AppHandle, event: &str, value: T)
where
    T: Serialize + Clone + Send + 'static,
{
    if let Some(envelope) = current_stream_envelope(handle).await {
        emit_event(handle, event, &ScopedEvent { envelope, value });
    }
}

async fn reconcile_guided_runtime(handle: &tauri::AppHandle, vehicle: &Vehicle) {
    let state: tauri::State<'_, AppState> = handle.state();
    let maybe_snapshot = {
        let mut guided_runtime = state.guided_runtime.lock().await;
        guided_runtime.ensure_live_validity(live_context_from_vehicle(vehicle))
    };

    if let Some(snapshot) = maybe_snapshot {
        emit_guided_snapshot(&state, handle, snapshot).await;
    }
}

/// Maps `dialect::MavSeverity` to the lowercase snake_case names used on the
/// IPC wire. `dialect::MavSeverity` is a generated mavlink enum without a
/// `Serialize` impl, so we map it by hand here.
fn mav_severity_name(severity: mavkit::dialect::MavSeverity) -> &'static str {
    use mavkit::dialect::MavSeverity::*;
    match severity {
        MAV_SEVERITY_EMERGENCY => "emergency",
        MAV_SEVERITY_ALERT => "alert",
        MAV_SEVERITY_CRITICAL => "critical",
        MAV_SEVERITY_ERROR => "error",
        MAV_SEVERITY_WARNING => "warning",
        MAV_SEVERITY_NOTICE => "notice",
        MAV_SEVERITY_INFO => "info",
        MAV_SEVERITY_DEBUG => "debug",
    }
}

pub(crate) async fn spawn_event_bridges(
    app: &tauri::AppHandle,
    vehicle: &Vehicle,
) -> Vec<tokio::task::JoinHandle<()>> {
    let mut tasks = Vec::new();

    // Seed identity-derived fields so the first session://state has vehicle info
    {
        let identity = vehicle.identity();
        let state: tauri::State<'_, AppState> = app.state();
        let mut ctx = state.session_context.lock().await;
        ctx.vehicle_state = Some(VehicleState {
            armed: false,
            custom_mode: 0,
            mode_name: "unknown".into(),
            system_status: mavkit::SystemStatus::Active,
            vehicle_type: identity.vehicle_type,
            autopilot: identity.autopilot,
            system_id: identity.system_id,
            component_id: identity.component_id,
            heartbeat_received: true,
        });
        ctx.connection = SessionConnection::Connected;
    }

    let calibration_sources = Arc::new(tokio::sync::Mutex::new(CalibrationSources::default()));

    // Telemetry — throttled by TELEMETRY_INTERVAL_MS.
    // The new mavkit API uses MetricHandle/ObservationHandle per metric, not a
    // single monolith watch channel. We grab a snapshot of grouped telemetry
    // by serializing individual metric handles on each tick.
    {
        let telemetry = vehicle.telemetry();
        let position_global = telemetry.position().global();
        let groundspeed = telemetry.position().groundspeed_mps();
        let airspeed = telemetry.position().airspeed_mps();
        let climb_rate = telemetry.position().climb_rate_mps();
        let heading = telemetry.position().heading_deg();
        let throttle = telemetry.position().throttle_pct();
        let attitude = telemetry.attitude().euler();
        let bat_remaining = telemetry.battery().remaining_pct();
        let bat_voltage = telemetry.battery().voltage_v();
        let bat_current = telemetry.battery().current_a();
        let bat_cells = telemetry.battery().cells();
        let bat_energy = telemetry.battery().energy_consumed_wh();
        let bat_time_remaining = telemetry.battery().time_remaining_s();
        let gps_quality = telemetry.gps().quality();
        let nav_wp = telemetry.navigation().waypoint();
        let nav_guidance = telemetry.navigation().guidance();
        let terrain_clearance = telemetry.terrain().clearance();
        let rc = telemetry.rc();
        let rc_channels: Vec<_> = (0..18).filter_map(|index| rc.channel_pwm_us(index)).collect();
        let rc_rssi = rc.rssi_pct();
        let actuators = telemetry.actuators();
        let servo_outputs: Vec<_> = (0..16)
            .filter_map(|index| actuators.servo_pwm_us(index))
            .collect();

        let handle = app.clone();
        tasks.push(tokio::spawn(async move {
            loop {
                let ms = TELEMETRY_INTERVAL_MS.load(Ordering::Relaxed);
                tokio::time::sleep(Duration::from_millis(ms)).await;

                let rc_channel_values: Vec<f64> = rc_channels
                    .iter()
                    .filter_map(|channel| channel.latest().map(|s| f64::from(s.value)))
                    .collect();
                let servo_output_values: Vec<f64> = servo_outputs
                    .iter()
                    .filter_map(|servo| servo.latest().map(|s| f64::from(s.value)))
                    .collect();

                // Build a flat JSON snapshot keyed to match telemetry_state_from_value()
                let snapshot = serde_json::json!({
                    // Position — extract from nested GlobalPosition
                    "latitude_deg": position_global.latest().map(|s| s.value.latitude_deg),
                    "longitude_deg": position_global.latest().map(|s| s.value.longitude_deg),
                    "altitude_m": position_global.latest().map(|s| s.value.altitude_msl_m),
                    // Flight
                    "speed_mps": groundspeed.latest().map(|s| s.value),
                    "airspeed_mps": airspeed.latest().map(|s| s.value),
                    "climb_rate_mps": climb_rate.latest().map(|s| s.value),
                    "heading_deg": heading.latest().map(|s| s.value),
                    "throttle_pct": throttle.latest().map(|s| s.value),
                    // Attitude — extract from nested EulerAttitude
                    "roll_deg": attitude.latest().map(|s| s.value.roll_deg),
                    "pitch_deg": attitude.latest().map(|s| s.value.pitch_deg),
                    "yaw_deg": attitude.latest().map(|s| s.value.yaw_deg),
                    // Battery
                    "battery_pct": bat_remaining.latest().map(|s| s.value),
                    "battery_voltage_v": bat_voltage.latest().map(|s| s.value),
                    "battery_current_a": bat_current.latest().map(|s| s.value),
                    "battery_voltage_cells": bat_cells.latest().map(|s| s.value.voltages_v.clone()),
                    "energy_consumed_wh": bat_energy.latest().map(|s| s.value),
                    "battery_time_remaining_s": bat_time_remaining.latest().map(|s| f64::from(s.value)),
                    // GPS — extract from nested GpsQuality
                    "gps_fix_type": gps_quality.latest().map(|s| s.value.fix_type),
                    "gps_satellites": gps_quality.latest().and_then(|s| s.value.satellites.map(|v| v as u64)),
                    "gps_hdop": gps_quality.latest().and_then(|s| s.value.hdop),
                    // Navigation waypoint — extract from nested WaypointProgress
                    "wp_dist_m": nav_wp.latest().map(|s| s.value.distance_m),
                    "nav_bearing_deg": nav_wp.latest().map(|s| s.value.bearing_deg),
                    "target_bearing_deg": nav_guidance.latest().map(|s| s.value.bearing_deg),
                    "xtrack_error_m": nav_guidance.latest().map(|s| s.value.cross_track_error_m),
                    "terrain_height_m": terrain_clearance.latest().map(|s| s.value.terrain_height_m),
                    "height_above_terrain_m": terrain_clearance.latest().map(|s| s.value.height_above_terrain_m),
                    "rc_channels": (!rc_channel_values.is_empty()).then_some(rc_channel_values),
                    "rc_rssi": rc_rssi.latest().map(|s| f64::from(s.value)),
                    "servo_outputs": (!servo_output_values.is_empty()).then_some(servo_output_values),
                });

                let grouped = telemetry_snapshot_from_value(
                    &snapshot,
                    DomainProvenance::Stream,
                );
                emit_scoped(&handle, "telemetry://state", grouped).await;
            }
        }));
    }

    // LinkState — drives session://state
    {
        let link_observation = vehicle.link().state();
        let mut link_sub = link_observation.subscribe();
        let handle = app.clone();
        let guided_vehicle = vehicle.clone();
        tasks.push(tokio::spawn(async move {
            while let Some(ls) = link_sub.recv().await {
                {
                    let state: tauri::State<'_, AppState> = handle.state();
                    let mut ctx = state.session_context.lock().await;
                    ctx.connection = session_connection_from_link_state(&ls);
                }
                let snapshot = snapshot_from_context(&handle).await;
                emit_scoped(&handle, "session://state", snapshot).await;
                reconcile_guided_runtime(&handle, &guided_vehicle).await;
            }
        }));
    }

    // Armed state
    {
        let armed_metric = vehicle.telemetry().armed();
        let mut armed_sub = armed_metric.subscribe();
        let handle = app.clone();
        tasks.push(tokio::spawn(async move {
            while let Some(sample) = armed_sub.recv().await {
                {
                    let state: tauri::State<'_, AppState> = handle.state();
                    let mut ctx = state.session_context.lock().await;
                    if let Some(ref mut vs) = ctx.vehicle_state {
                        vs.armed = sample.value;
                    }
                }
                let snapshot = snapshot_from_context(&handle).await;
                emit_scoped(&handle, "session://state", snapshot).await;
            }
        }));
    }

    // Current flight mode
    {
        let mode_obs = vehicle.current_mode();
        let mut mode_sub = mode_obs.subscribe();
        let handle = app.clone();
        tasks.push(tokio::spawn(async move {
            while let Some(current_mode) = mode_sub.recv().await {
                {
                    let state: tauri::State<'_, AppState> = handle.state();
                    let mut ctx = state.session_context.lock().await;
                    if let Some(ref mut vs) = ctx.vehicle_state {
                        vs.custom_mode = current_mode.custom_mode;
                        vs.mode_name = current_mode.name.clone();
                    }
                }
                let snapshot = snapshot_from_context(&handle).await;
                emit_scoped(&handle, "session://state", snapshot).await;
            }
        }));
    }

    // Home position
    {
        let home_metric = vehicle.telemetry().home();
        let mut home_sub = home_metric.subscribe();
        let handle = app.clone();
        tasks.push(tokio::spawn(async move {
            while let Some(sample) = home_sub.recv().await {
                let geo = sample.value;
                {
                    let state: tauri::State<'_, AppState> = handle.state();
                    let mut ctx = state.session_context.lock().await;
                    ctx.home_position = Some(mavkit::HomePosition {
                        latitude_deg: geo.latitude_deg,
                        longitude_deg: geo.longitude_deg,
                        altitude_m: geo.altitude_msl_m,
                    });
                }
                let snapshot = snapshot_from_context(&handle).await;
                emit_scoped(&handle, "session://state", snapshot).await;
            }
        }));
    }

    // MissionState
    {
        let mut mission_sub = vehicle.mission().subscribe();
        let handle = app.clone();
        tasks.push(tokio::spawn(async move {
            while let Some(ms) = mission_sub.recv().await {
                emit_scoped(&handle, "mission://state", ms).await;
            }
        }));
    }

    // ParamState (combines store and progress)
    {
        let mut param_sub = vehicle.params().subscribe();
        let handle = app.clone();
        tasks.push(tokio::spawn(async move {
            while let Some(ps) = param_sub.recv().await {
                if let Some(ref store) = ps.store {
                    emit_scoped(&handle, "param://store", store.clone()).await;
                    emit_scoped(
                        &handle,
                        "configuration_facts://state",
                        configuration_facts_snapshot_from_param_store(
                            store,
                            DomainProvenance::Stream,
                        ),
                    )
                    .await;
                }
            }
        }));
    }

    // StatusText
    {
        let status_text_handle = vehicle.telemetry().messages().status_text();
        let mut status_sub = status_text_handle.subscribe();
        let handle = app.clone();
        tasks.push(tokio::spawn(async move {
            while let Some(sample) = status_sub.recv().await {
                let msg = sample.value;
                let msg_json = serde_json::json!({
                    "text": msg.text,
                    "severity": mav_severity_name(msg.severity),
                    "id": msg.id,
                    "source_system": msg.source_system,
                    "source_component": msg.source_component,
                });
                if let Some(mut entry) = status_text_entry_from_value(&msg_json) {
                    let state: tauri::State<'_, AppState> = handle.state();
                    entry.sequence = state
                        .next_status_text_sequence
                        .fetch_add(1, Ordering::Relaxed);
                    let mut history = state.status_text_history.lock().await;
                    push_status_text_entry(&mut history, entry);
                    emit_scoped(
                        &handle,
                        "status_text://state",
                        status_text_snapshot_from_entries(
                            history.clone(),
                            DomainProvenance::Stream,
                        ),
                    )
                    .await;
                }
            }
        }));
    }

    // SensorHealth
    {
        let sensor_health_metric = vehicle.telemetry().sensor_health();
        let mut sensor_sub = sensor_health_metric.subscribe();
        let handle = app.clone();
        tasks.push(tokio::spawn(async move {
            while let Some(sample) = sensor_sub.recv().await {
                let val: SensorHealthSummary = sample.value;
                emit_scoped(
                    &handle,
                    "support://state",
                    support_snapshot(DomainProvenance::Stream),
                )
                .await;
                emit_scoped(
                    &handle,
                    "sensor_health://state",
                    sensor_health_snapshot_from_summary(&val, DomainProvenance::Stream),
                )
                .await;
            }
        }));
    }

    // MagCalProgress
    {
        let mag_cal_progress_obs = vehicle.ardupilot().mag_cal_progress();
        let mut mag_progress_sub = mag_cal_progress_obs.subscribe();
        let calibration_sources = Arc::clone(&calibration_sources);
        let handle = app.clone();
        tasks.push(tokio::spawn(async move {
            while let Some(progress_vec) = mag_progress_sub.recv().await {
                // Take the first compass entry for the existing single-compass UI
                let val: Option<MagCalProgress> = progress_vec.first().cloned();
                if let Some(ref val) = val {
                    emit_event(&handle, "compass://cal_progress", val);
                }
                let calibration = {
                    let mut sources = calibration_sources.lock().await;
                    sources.update_mag_progress(val);
                    sources.snapshot(DomainProvenance::Stream)
                };
                emit_scoped(&handle, "calibration://state", calibration).await;
            }
        }));
    }

    // MagCalReport
    {
        let mag_cal_report_obs = vehicle.ardupilot().mag_cal_report();
        let mut mag_report_sub = mag_cal_report_obs.subscribe();
        let calibration_sources = Arc::clone(&calibration_sources);
        let handle = app.clone();
        tasks.push(tokio::spawn(async move {
            while let Some(report_vec) = mag_report_sub.recv().await {
                // Take the first compass entry for the existing single-compass UI
                let val: Option<MagCalReport> = report_vec.first().cloned();
                if let Some(ref val) = val {
                    emit_event(&handle, "compass://cal_report", val);
                }
                let calibration = {
                    let mut sources = calibration_sources.lock().await;
                    sources.update_mag_report(val);
                    sources.snapshot(DomainProvenance::Stream)
                };
                emit_scoped(&handle, "calibration://state", calibration).await;
            }
        }));
    }

    tasks
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ipc::session::VehicleState;
    use mavkit::{AutopilotType, VehicleType};

    /// Guard against the serde wire format drifting — multi-word enum variants
    /// must serialize as snake_case strings so the frontend can match them.
    #[test]
    fn vehicle_state_serializes_vehicle_type_as_snake_case() {
        let state = VehicleState {
            armed: false,
            custom_mode: 0,
            mode_name: String::new(),
            system_status: mavkit::SystemStatus::Standby,
            vehicle_type: VehicleType::FixedWing,
            autopilot: AutopilotType::ArduPilotMega,
            system_id: 1,
            component_id: 1,
            heartbeat_received: false,
        };
        let json = serde_json::to_value(&state).expect("serialize VehicleState");
        assert_eq!(json["vehicle_type"], "fixed_wing");
        assert_eq!(json["autopilot"], "ardu_pilot_mega");
        assert_eq!(json["system_status"], "standby");
    }

    #[test]
    fn mav_severity_name_maps_all_variants_to_lowercase() {
        use mavkit::dialect::MavSeverity::*;
        assert_eq!(mav_severity_name(MAV_SEVERITY_EMERGENCY), "emergency");
        assert_eq!(mav_severity_name(MAV_SEVERITY_ALERT), "alert");
        assert_eq!(mav_severity_name(MAV_SEVERITY_CRITICAL), "critical");
        assert_eq!(mav_severity_name(MAV_SEVERITY_ERROR), "error");
        assert_eq!(mav_severity_name(MAV_SEVERITY_WARNING), "warning");
        assert_eq!(mav_severity_name(MAV_SEVERITY_NOTICE), "notice");
        assert_eq!(mav_severity_name(MAV_SEVERITY_INFO), "info");
        assert_eq!(mav_severity_name(MAV_SEVERITY_DEBUG), "debug");
    }
}

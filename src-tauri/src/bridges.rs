use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use ironwing_core::event_names;
use ironwing_core::vehicle_snapshot::{
    mav_severity_name, seeded_vehicle_state, telemetry_snapshot_from_vehicle,
};
use mavkit::{
    SensorHealthSummary, Vehicle,
    ardupilot::{MagCalProgress, MagCalReport},
};
use serde::Serialize;
use tauri::Manager;
use web_time::Instant;

use crate::AppState;
use crate::e2e_emit::emit_event;
use crate::guided::{emit_guided_snapshot, live_context_from_vehicle};
use crate::ipc::calibration::CalibrationSources;
use crate::ipc::session::SessionConnection;
use crate::ipc::{
    DomainProvenance, DomainValue, ScopedEvent, SessionEnvelope, SessionSnapshot, SessionStatus,
    configuration_facts_snapshot_from_param_store, push_status_text_entry,
    sensor_health_snapshot_from_summary, session_connection_from_link_state,
    status_text_entry_from_value, status_text_snapshot_from_entries, support_snapshot,
};

pub(crate) use ironwing_core::live::SessionContext;

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

pub(crate) async fn spawn_event_bridges(
    app: &tauri::AppHandle,
    vehicle: &Vehicle,
) -> Vec<tokio::task::JoinHandle<()>> {
    let mut tasks = Vec::new();

    // Seed identity-derived fields so the first session://state has vehicle info
    {
        let state: tauri::State<'_, AppState> = app.state();
        let mut ctx = state.session_context.lock().await;
        ctx.vehicle_state = Some(seeded_vehicle_state(vehicle));
        ctx.connection = SessionConnection::Connected;
    }

    let calibration_sources = Arc::new(tokio::sync::Mutex::new(CalibrationSources::default()));

    // Telemetry — throttled by TELEMETRY_INTERVAL_MS.
    {
        let telemetry_vehicle = vehicle.clone();
        let handle = app.clone();
        tasks.push(tokio::spawn(async move {
            loop {
                let ms = TELEMETRY_INTERVAL_MS.load(Ordering::Relaxed);
                tokio::time::sleep(Duration::from_millis(ms)).await;

                let grouped = telemetry_snapshot_from_vehicle(&telemetry_vehicle, DomainProvenance::Stream);
                {
                    let state: tauri::State<'_, AppState> = handle.state();
                    *state.live_telemetry.lock().await = grouped.clone();
                }
                emit_scoped(&handle, event_names::TELEMETRY_STATE, grouped).await;
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
                emit_scoped(&handle, event_names::SESSION_STATE, snapshot).await;
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
                emit_scoped(&handle, event_names::SESSION_STATE, snapshot).await;
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
                emit_scoped(&handle, event_names::SESSION_STATE, snapshot).await;
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
                emit_scoped(&handle, event_names::SESSION_STATE, snapshot).await;
            }
        }));
    }

    // MissionState
    {
        let mut mission_sub = vehicle.mission().subscribe();
        let handle = app.clone();
        tasks.push(tokio::spawn(async move {
            while let Some(ms) = mission_sub.recv().await {
                emit_scoped(&handle, event_names::MISSION_STATE, ms).await;
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
                    emit_scoped(&handle, event_names::PARAM_STORE, store.clone()).await;
                    emit_scoped(
                        &handle,
                        event_names::CONFIGURATION_FACTS_STATE,
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
                        event_names::STATUS_TEXT_STATE,
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
                    event_names::SUPPORT_STATE,
                    support_snapshot(DomainProvenance::Stream),
                )
                .await;
                emit_scoped(
                    &handle,
                    event_names::SENSOR_HEALTH_STATE,
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
                    emit_event(&handle, event_names::COMPASS_CAL_PROGRESS, val);
                }
                let calibration = {
                    let mut sources = calibration_sources.lock().await;
                    sources.update_mag_progress(val);
                    sources.snapshot(DomainProvenance::Stream)
                };
                emit_scoped(&handle, event_names::CALIBRATION_STATE, calibration).await;
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
                    emit_event(&handle, event_names::COMPASS_CAL_REPORT, val);
                }
                let calibration = {
                    let mut sources = calibration_sources.lock().await;
                    sources.update_mag_report(val);
                    sources.snapshot(DomainProvenance::Stream)
                };
                emit_scoped(&handle, event_names::CALIBRATION_STATE, calibration).await;
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

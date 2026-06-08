use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use ironwing_core::live_runtime::{self, SendTaskSpawner, SendTimer, TelemetryIntervalProvider};
use ironwing_core::telemetry;
use mavkit::Vehicle;
use serde::Serialize;
use tauri::Manager;

use crate::AppState;
use crate::guided::{emit_guided_snapshot, live_context_from_vehicle};

#[cfg(test)]
pub(crate) use ironwing_core::live::SessionContext;

pub(crate) static TELEMETRY_INTERVAL_MS: AtomicU64 =
    AtomicU64::new(telemetry::DEFAULT_TELEMETRY_INTERVAL_MS);

#[derive(Default)]
struct TokioTaskSet {
    tasks: Vec<tokio::task::JoinHandle<()>>,
}

impl SendTaskSpawner for TokioTaskSet {
    fn spawn_send<F>(&mut self, future: F)
    where
        F: std::future::Future<Output = ()> + Send + 'static,
    {
        self.tasks.push(tokio::spawn(future));
    }
}

#[derive(Clone)]
struct TokioTimer;

impl SendTimer for TokioTimer {
    type Sleep = tokio::time::Sleep;

    fn sleep(&self, duration: Duration) -> Self::Sleep {
        tokio::time::sleep(duration)
    }
}

#[derive(Clone)]
struct TauriTelemetryInterval;

impl TelemetryIntervalProvider for TauriTelemetryInterval {
    fn telemetry_interval(&self) -> Duration {
        Duration::from_millis(TELEMETRY_INTERVAL_MS.load(Ordering::Relaxed))
    }
}

pub(crate) async fn emit_scoped<T>(handle: &tauri::AppHandle, event: &'static str, value: T)
where
    T: Serialize + Clone + Send + 'static,
{
    let state: tauri::State<'_, AppState> = handle.state();
    live_runtime::emit_scoped(&state.live_runtime, event, value);
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
    let state: tauri::State<'_, AppState> = app.state();
    let mut task_set = TokioTaskSet::default();

    live_runtime::spawn_send_event_bridges(
        state.live_runtime.clone(),
        &mut task_set,
        TokioTimer,
        TauriTelemetryInterval,
        vehicle,
    );

    {
        let handle = app.clone();
        let guided_vehicle = vehicle.clone();
        let mut link_sub = vehicle.link().state().subscribe();
        task_set.tasks.push(tokio::spawn(async move {
            while link_sub.recv().await.is_some() {
                reconcile_guided_runtime(&handle, &guided_vehicle).await;
            }
        }));
    }

    task_set.tasks
}

#[cfg(test)]
mod tests {
    use crate::ipc::session::VehicleState;
    use ironwing_core::vehicle_snapshot::mav_severity_name;
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
            firmware_version: None,
            system_id: 1,
            component_id: 1,
            heartbeat_received: false,
        };
        let json = serde_json::to_value(&state).expect("serialize VehicleState");
        assert_eq!(json["vehicle_type"], "fixed_wing");
        assert_eq!(json["autopilot"], "ardu_pilot_mega");
        assert_eq!(json["firmware_version"], serde_json::Value::Null);
        assert_eq!(json["system_status"], "standby");
    }

    #[test]
    fn mav_severity_name_maps_all_variants_to_lowercase() {
        use mavkit::MavSeverity::*;
        assert_eq!(mav_severity_name(Emergency), "emergency");
        assert_eq!(mav_severity_name(Alert), "alert");
        assert_eq!(mav_severity_name(Critical), "critical");
        assert_eq!(mav_severity_name(Error), "error");
        assert_eq!(mav_severity_name(Warning), "warning");
        assert_eq!(mav_severity_name(Notice), "notice");
        assert_eq!(mav_severity_name(Info), "info");
        assert_eq!(mav_severity_name(Debug), "debug");
    }
}

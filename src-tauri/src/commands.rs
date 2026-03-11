use std::collections::HashMap;
use std::sync::atomic::Ordering;

use mavkit::{
    FlightMode, HomePosition, LinkState, MissionIssue, MissionPlan, MissionState, MissionType,
    Param, ParamProgress, ParamStore, ParamWriteResult, Telemetry, VehicleState,
    format_param_file, parse_param_file, validate_plan,
};

use crate::bridges::TELEMETRY_INTERVAL_MS;
use crate::{AppState, helpers::with_vehicle};

#[derive(serde::Serialize)]
pub(crate) struct VehicleSnapshot {
    pub link_state: LinkState,
    pub vehicle_state: VehicleState,
    pub telemetry: Telemetry,
    pub home_position: Option<HomePosition>,
    pub mission_state: MissionState,
    pub param_store: ParamStore,
    pub param_progress: ParamProgress,
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
pub(crate) fn list_serial_ports_cmd() -> Result<Vec<String>, String> {
    let ports = serialport::available_ports().map_err(|e| e.to_string())?;
    Ok(ports.into_iter().map(|p| p.port_name).collect())
}

#[cfg(target_os = "android")]
#[tauri::command]
pub(crate) fn list_serial_ports_cmd() -> Result<Vec<String>, String> {
    Err("not supported on android".to_string())
}

#[tauri::command]
pub(crate) fn mission_validate_plan(plan: MissionPlan) -> Vec<MissionIssue> {
    validate_plan(&plan)
}

#[tauri::command]
pub(crate) fn available_transports() -> Vec<&'static str> {
    let mut t = vec!["udp", "tcp"];
    #[cfg(not(target_os = "android"))]
    t.push("serial");
    t.push("bluetooth_ble");
    #[cfg(target_os = "android")]
    t.push("bluetooth_spp");
    t
}

#[tauri::command]
pub(crate) async fn arm_vehicle(
    state: tauri::State<'_, AppState>,
    force: bool,
) -> Result<(), String> {
    with_vehicle(&state)
        .await?
        .arm(force)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn disarm_vehicle(
    state: tauri::State<'_, AppState>,
    force: bool,
) -> Result<(), String> {
    with_vehicle(&state)
        .await?
        .disarm(force)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn set_flight_mode(
    state: tauri::State<'_, AppState>,
    custom_mode: u32,
) -> Result<(), String> {
    with_vehicle(&state)
        .await?
        .set_mode(custom_mode)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn vehicle_takeoff(
    state: tauri::State<'_, AppState>,
    altitude_m: f32,
) -> Result<(), String> {
    with_vehicle(&state)
        .await?
        .takeoff(altitude_m)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn vehicle_guided_goto(
    state: tauri::State<'_, AppState>,
    lat_deg: f64,
    lon_deg: f64,
    alt_m: f32,
) -> Result<(), String> {
    with_vehicle(&state)
        .await?
        .goto(lat_deg, lon_deg, alt_m)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn get_available_modes(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<FlightMode>, String> {
    Ok(with_vehicle(&state).await?.available_modes())
}

#[tauri::command]
pub(crate) fn set_telemetry_rate(rate_hz: u32) -> Result<(), String> {
    if rate_hz == 0 || rate_hz > 20 {
        return Err("rate_hz must be between 1 and 20".into());
    }
    TELEMETRY_INTERVAL_MS.store(1000 / rate_hz as u64, Ordering::Relaxed);
    Ok(())
}

#[tauri::command]
pub(crate) async fn mission_upload_plan(
    state: tauri::State<'_, AppState>,
    plan: MissionPlan,
) -> Result<(), String> {
    with_vehicle(&state)
        .await?
        .mission()
        .upload(plan)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn mission_download_plan(
    state: tauri::State<'_, AppState>,
    mission_type: MissionType,
) -> Result<MissionPlan, String> {
    with_vehicle(&state)
        .await?
        .mission()
        .download(mission_type)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn mission_clear_plan(
    state: tauri::State<'_, AppState>,
    mission_type: MissionType,
) -> Result<(), String> {
    with_vehicle(&state)
        .await?
        .mission()
        .clear(mission_type)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn mission_verify_roundtrip(
    state: tauri::State<'_, AppState>,
    plan: MissionPlan,
) -> Result<bool, String> {
    with_vehicle(&state)
        .await?
        .mission()
        .verify_roundtrip(plan)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn mission_set_current(
    state: tauri::State<'_, AppState>,
    seq: u16,
) -> Result<(), String> {
    with_vehicle(&state)
        .await?
        .mission()
        .set_current(seq)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn mission_cancel(state: tauri::State<'_, AppState>) -> Result<(), String> {
    with_vehicle(&state).await?.mission().cancel_transfer();
    Ok(())
}

#[tauri::command]
pub(crate) async fn calibrate_accel(state: tauri::State<'_, AppState>) -> Result<(), String> {
    with_vehicle(&state)
        .await?
        .preflight_calibration(false, true, false)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn calibrate_gyro(state: tauri::State<'_, AppState>) -> Result<(), String> {
    with_vehicle(&state)
        .await?
        .preflight_calibration(true, false, false)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn param_download_all(
    state: tauri::State<'_, AppState>,
) -> Result<ParamStore, String> {
    with_vehicle(&state)
        .await?
        .params()
        .download_all()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn param_write(
    state: tauri::State<'_, AppState>,
    name: String,
    value: f32,
) -> Result<Param, String> {
    with_vehicle(&state)
        .await?
        .params()
        .write(name, value)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn param_write_batch(
    state: tauri::State<'_, AppState>,
    params: Vec<(String, f32)>,
) -> Result<Vec<ParamWriteResult>, String> {
    with_vehicle(&state)
        .await?
        .params()
        .write_batch(params)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn param_parse_file(contents: String) -> Result<HashMap<String, f32>, String> {
    parse_param_file(&contents)
}

#[tauri::command]
pub(crate) fn param_format_file(store: ParamStore) -> String {
    format_param_file(&store)
}

#[tauri::command]
pub(crate) async fn reboot_vehicle(state: tauri::State<'_, AppState>) -> Result<(), String> {
    with_vehicle(&state)
        .await?
        .reboot()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn motor_test(
    state: tauri::State<'_, AppState>,
    motor_instance: u8,
    throttle_pct: f32,
    duration_s: f32,
) -> Result<(), String> {
    with_vehicle(&state)
        .await?
        .motor_test(motor_instance, throttle_pct, duration_s)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn calibrate_compass_start(
    state: tauri::State<'_, AppState>,
    compass_mask: u8,
) -> Result<(), String> {
    with_vehicle(&state)
        .await?
        .start_mag_cal(compass_mask, true, false)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn calibrate_compass_accept(
    state: tauri::State<'_, AppState>,
    compass_mask: u8,
) -> Result<(), String> {
    with_vehicle(&state)
        .await?
        .accept_mag_cal(compass_mask)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn calibrate_compass_cancel(
    state: tauri::State<'_, AppState>,
    compass_mask: u8,
) -> Result<(), String> {
    with_vehicle(&state)
        .await?
        .cancel_mag_cal(compass_mask)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn request_prearm_checks(
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    with_vehicle(&state)
        .await?
        .request_prearm_checks()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn get_vehicle_snapshot(
    state: tauri::State<'_, AppState>,
) -> Result<Option<VehicleSnapshot>, String> {
    let guard = state.vehicle.lock().await;
    let Some(vehicle) = guard.as_ref() else {
        return Ok(None);
    };
    Ok(Some(VehicleSnapshot {
        link_state: vehicle.link_state().borrow().clone(),
        vehicle_state: vehicle.state().borrow().clone(),
        telemetry: vehicle.telemetry().borrow().clone(),
        home_position: vehicle.home_position().borrow().clone(),
        mission_state: vehicle.mission_state().borrow().clone(),
        param_store: vehicle.param_store().borrow().clone(),
        param_progress: vehicle.param_progress().borrow().clone(),
    }))
}

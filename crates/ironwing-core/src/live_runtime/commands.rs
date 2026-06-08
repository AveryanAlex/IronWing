use std::fmt;

use mavkit::dialect::MavCmd;
use mavkit::{
    FencePlan, FlightMode, GeoPoint2d, GeoPoint3dMsl, GuidedSpecific, HomePosition, MissionIssue,
    MissionPlan, ParamStore, ParamWriteResult, RallyPlan, RcOverride, format_param_file,
    parse_param_file, validate_plan,
};

use crate::ipc::{GuidedLiveContext, MissionDownload, RcOverrideChannelWire};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LiveCommandError {
    InvalidInput(String),
    Unavailable(String),
    Vehicle(String),
}

pub type LiveCommandResult<T> = Result<T, LiveCommandError>;

impl LiveCommandError {
    pub fn invalid_input(message: impl Into<String>) -> Self {
        Self::InvalidInput(message.into())
    }

    pub fn unavailable(message: impl Into<String>) -> Self {
        Self::Unavailable(message.into())
    }

    fn vehicle(error: impl fmt::Display) -> Self {
        Self::Vehicle(error.to_string())
    }
}

impl fmt::Display for LiveCommandError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidInput(message) | Self::Unavailable(message) | Self::Vehicle(message) => {
                f.write_str(message)
            }
        }
    }
}

impl std::error::Error for LiveCommandError {}

pub fn get_available_modes(vehicle: &mavkit::Vehicle) -> Vec<FlightMode> {
    vehicle.available_modes().iter().collect()
}

pub fn live_context_from_vehicle(vehicle: &mavkit::Vehicle) -> GuidedLiveContext {
    let link_connected = vehicle
        .link()
        .state()
        .latest()
        .is_some_and(|ls| matches!(ls, mavkit::LinkState::Connected));
    let armed = vehicle
        .telemetry()
        .armed()
        .latest()
        .map(|s| s.value)
        .unwrap_or(false);
    let mode_name = vehicle
        .available_modes()
        .current()
        .latest()
        .map(|m| m.name.to_ascii_uppercase())
        .unwrap_or_default();
    GuidedLiveContext {
        has_live_vehicle: link_connected,
        is_armed: armed,
        in_guided_mode: mode_name == "GUIDED",
    }
}

pub async fn set_flight_mode(vehicle: &mavkit::Vehicle, custom_mode: u32) -> LiveCommandResult<()> {
    vehicle
        .set_mode_no_wait(custom_mode)
        .await
        .map_err(LiveCommandError::vehicle)
}

pub async fn arm(vehicle: &mavkit::Vehicle, force: bool) -> LiveCommandResult<()> {
    let result = if force {
        vehicle.force_arm().await
    } else {
        vehicle.arm().await
    };
    result.map_err(LiveCommandError::vehicle)
}

pub async fn disarm(vehicle: &mavkit::Vehicle, force: bool) -> LiveCommandResult<()> {
    let result = if force {
        vehicle.force_disarm().await
    } else {
        vehicle.disarm().await
    };
    result.map_err(LiveCommandError::vehicle)
}

pub async fn takeoff(vehicle: &mavkit::Vehicle, altitude_m: f32) -> LiveCommandResult<()> {
    vehicle
        .raw()
        .command_long(
            MavCmd::MAV_CMD_NAV_TAKEOFF as u16,
            [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, altitude_m],
        )
        .await
        .map(|_| ())
        .map_err(LiveCommandError::vehicle)
}

pub async fn guided_goto(
    vehicle: &mavkit::Vehicle,
    latitude_deg: f64,
    longitude_deg: f64,
    altitude_msl_m: f32,
) -> LiveCommandResult<()> {
    let session = vehicle
        .ardupilot()
        .guided()
        .await
        .map_err(LiveCommandError::vehicle)?;
    let msl_target = GeoPoint3dMsl {
        latitude_deg,
        longitude_deg,
        altitude_msl_m: f64::from(altitude_msl_m),
    };

    let command_result = match session.specific() {
        GuidedSpecific::Copter(copter) => copter.goto_msl(msl_target).await,
        GuidedSpecific::Plane(plane) => plane.reposition(msl_target).await,
        GuidedSpecific::Rover(rover) => {
            rover
                .drive_to(GeoPoint2d {
                    latitude_deg,
                    longitude_deg,
                })
                .await
        }
        GuidedSpecific::Sub(_) => Err(mavkit::VehicleError::Unsupported(
            "guided goto with MSL altitude is not supported for submarine vehicles".to_string(),
        )),
    };
    let close_result = session.close().await;

    command_result
        .and(close_result)
        .map_err(LiveCommandError::vehicle)
}

pub fn mission_validate(plan: &MissionPlan) -> Vec<MissionIssue> {
    validate_plan(plan)
}

pub async fn mission_upload(vehicle: &mavkit::Vehicle, plan: MissionPlan) -> LiveCommandResult<()> {
    let op = vehicle
        .mission()
        .upload(plan)
        .map_err(LiveCommandError::vehicle)?;
    op.wait().await.map_err(LiveCommandError::vehicle)
}

pub async fn mission_download(vehicle: &mavkit::Vehicle) -> LiveCommandResult<MissionDownload> {
    let op = vehicle
        .mission()
        .download()
        .map_err(LiveCommandError::vehicle)?;
    let plan = op.wait().await.map_err(LiveCommandError::vehicle)?;
    let home = vehicle
        .telemetry()
        .home()
        .latest()
        .map(|sample| HomePosition {
            latitude_deg: sample.value.latitude_deg,
            longitude_deg: sample.value.longitude_deg,
            altitude_m: sample.value.altitude_msl_m,
        });
    Ok(MissionDownload { plan, home })
}

pub async fn mission_clear(vehicle: &mavkit::Vehicle) -> LiveCommandResult<()> {
    let op = vehicle
        .mission()
        .clear()
        .map_err(LiveCommandError::vehicle)?;
    op.wait().await.map_err(LiveCommandError::vehicle)
}

pub async fn mission_set_current(vehicle: &mavkit::Vehicle, seq: u16) -> LiveCommandResult<()> {
    vehicle
        .mission()
        .set_current(seq)
        .await
        .map_err(LiveCommandError::vehicle)
}

pub async fn fence_upload(vehicle: &mavkit::Vehicle, plan: FencePlan) -> LiveCommandResult<()> {
    let op = vehicle
        .fence()
        .upload(plan)
        .map_err(LiveCommandError::vehicle)?;
    op.wait().await.map_err(LiveCommandError::vehicle)
}

pub async fn fence_download(vehicle: &mavkit::Vehicle) -> LiveCommandResult<FencePlan> {
    let op = vehicle
        .fence()
        .download()
        .map_err(LiveCommandError::vehicle)?;
    op.wait().await.map_err(LiveCommandError::vehicle)
}

pub async fn fence_clear(vehicle: &mavkit::Vehicle) -> LiveCommandResult<()> {
    let op = vehicle.fence().clear().map_err(LiveCommandError::vehicle)?;
    op.wait().await.map_err(LiveCommandError::vehicle)
}

pub async fn rally_upload(vehicle: &mavkit::Vehicle, plan: RallyPlan) -> LiveCommandResult<()> {
    let op = vehicle
        .rally()
        .upload(plan)
        .map_err(LiveCommandError::vehicle)?;
    op.wait().await.map_err(LiveCommandError::vehicle)
}

pub async fn rally_download(vehicle: &mavkit::Vehicle) -> LiveCommandResult<RallyPlan> {
    let op = vehicle
        .rally()
        .download()
        .map_err(LiveCommandError::vehicle)?;
    op.wait().await.map_err(LiveCommandError::vehicle)
}

pub async fn rally_clear(vehicle: &mavkit::Vehicle) -> LiveCommandResult<()> {
    let op = vehicle.rally().clear().map_err(LiveCommandError::vehicle)?;
    op.wait().await.map_err(LiveCommandError::vehicle)
}

pub async fn param_write(
    vehicle: &mavkit::Vehicle,
    name: &str,
    value: f32,
) -> LiveCommandResult<ParamWriteResult> {
    vehicle
        .params()
        .write(name, value)
        .await
        .map_err(LiveCommandError::vehicle)
}

pub async fn param_write_batch(
    vehicle: &mavkit::Vehicle,
    params: Vec<(String, f32)>,
) -> LiveCommandResult<Vec<ParamWriteResult>> {
    let handle = vehicle
        .params()
        .write_batch(params)
        .map_err(LiveCommandError::vehicle)?;
    handle.wait().await.map_err(LiveCommandError::vehicle)
}

pub fn param_parse_file(
    contents: &str,
) -> LiveCommandResult<std::collections::HashMap<String, f32>> {
    parse_param_file(contents)
        .map(|pairs| pairs.into_iter().collect())
        .map_err(LiveCommandError::vehicle)
}

pub fn param_format_file(store: &ParamStore) -> String {
    format_param_file(store)
}

pub async fn calibrate_accel(vehicle: &mavkit::Vehicle) -> LiveCommandResult<()> {
    vehicle
        .ardupilot()
        .preflight_calibration(false, true, false, false)
        .await
        .map_err(LiveCommandError::vehicle)
}

pub async fn calibrate_gyro(vehicle: &mavkit::Vehicle) -> LiveCommandResult<()> {
    vehicle
        .ardupilot()
        .preflight_calibration(true, false, false, false)
        .await
        .map_err(LiveCommandError::vehicle)
}

pub async fn reboot_vehicle(vehicle: &mavkit::Vehicle) -> LiveCommandResult<()> {
    vehicle
        .ardupilot()
        .reboot()
        .await
        .map_err(LiveCommandError::vehicle)
}

pub async fn reboot_to_bootloader(vehicle: &mavkit::Vehicle) -> LiveCommandResult<()> {
    vehicle
        .ardupilot()
        .reboot_to_bootloader()
        .await
        .map_err(LiveCommandError::vehicle)
}

pub async fn motor_test(
    vehicle: &mavkit::Vehicle,
    motor_instance: u8,
    throttle_pct: f32,
    duration_s: f32,
) -> LiveCommandResult<()> {
    vehicle
        .ardupilot()
        .motor_test(
            motor_instance,
            throttle_pct,
            duration_s.clamp(0.0, u16::MAX as f32) as u16,
        )
        .await
        .map_err(LiveCommandError::vehicle)
}

pub async fn set_servo(
    vehicle: &mavkit::Vehicle,
    instance: u8,
    pwm_us: u16,
) -> LiveCommandResult<()> {
    vehicle
        .ardupilot()
        .set_servo(instance, pwm_us)
        .await
        .map_err(LiveCommandError::vehicle)
}

pub async fn rc_override(
    vehicle: &mavkit::Vehicle,
    channels: Vec<RcOverrideChannelWire>,
) -> LiveCommandResult<()> {
    let mut overrides = RcOverride::new();
    for channel in channels {
        let value = mavkit::RcOverrideChannelValue::try_from(channel.value)
            .map_err(LiveCommandError::vehicle)?;
        overrides
            .set(channel.channel, value)
            .map_err(LiveCommandError::vehicle)?;
    }

    vehicle
        .rc_override(overrides)
        .await
        .map_err(LiveCommandError::vehicle)
}

pub async fn calibrate_compass_start(
    vehicle: &mavkit::Vehicle,
    compass_mask: u8,
) -> LiveCommandResult<()> {
    vehicle
        .ardupilot()
        .start_mag_cal(compass_mask)
        .await
        .map_err(LiveCommandError::vehicle)
}

pub async fn calibrate_compass_accept(vehicle: &mavkit::Vehicle) -> LiveCommandResult<()> {
    vehicle
        .ardupilot()
        .accept_mag_cal()
        .await
        .map_err(LiveCommandError::vehicle)
}

pub async fn calibrate_compass_cancel(vehicle: &mavkit::Vehicle) -> LiveCommandResult<()> {
    vehicle
        .ardupilot()
        .cancel_mag_cal()
        .await
        .map_err(LiveCommandError::vehicle)
}

pub async fn request_prearm_checks(vehicle: &mavkit::Vehicle) -> LiveCommandResult<()> {
    vehicle
        .ardupilot()
        .request_prearm_checks()
        .await
        .map_err(LiveCommandError::vehicle)
}

pub fn message_rate_interval_usec(rate_hz: f32) -> LiveCommandResult<i32> {
    if !(crate::telemetry::MIN_MESSAGE_RATE_HZ..=crate::telemetry::MAX_MESSAGE_RATE_HZ)
        .contains(&rate_hz)
    {
        return Err(LiveCommandError::invalid_input(
            crate::telemetry::MESSAGE_RATE_RANGE_ERROR,
        ));
    }

    Ok((1_000_000.0 / rate_hz) as i32)
}

pub async fn set_message_rate(
    vehicle: &mavkit::Vehicle,
    message_id: u32,
    rate_hz: f32,
) -> LiveCommandResult<()> {
    let interval_usec = message_rate_interval_usec(rate_hz)?;
    vehicle
        .raw()
        .set_message_interval(message_id, interval_usec)
        .await
        .map_err(LiveCommandError::vehicle)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn message_rate_validation_is_shared() {
        assert_eq!(
            message_rate_interval_usec(4.0).expect("valid rate"),
            250_000
        );
        assert!(matches!(
            message_rate_interval_usec(0.0),
            Err(LiveCommandError::InvalidInput(_))
        ));
        assert!(matches!(
            message_rate_interval_usec(60.0),
            Err(LiveCommandError::InvalidInput(_))
        ));
    }
}

use std::fmt;

use mavkit::dialect::MavCmd;

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

pub fn get_available_modes(vehicle: &mavkit::Vehicle) -> Vec<mavkit::FlightMode> {
    vehicle.available_modes().iter().collect()
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

pub fn message_rate_interval_usec(rate_hz: f32) -> LiveCommandResult<i32> {
    if !(0.1..=50.0).contains(&rate_hz) {
        return Err(LiveCommandError::invalid_input(
            "rate_hz must be between 0.1 and 50.0",
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

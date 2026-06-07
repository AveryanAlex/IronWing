use std::time::Duration;

/// Build a MAVKit vehicle config for normal live links.
///
/// This helper intentionally keeps MAVKit's init policy defaults intact. In
/// particular, IronWing should not disable MAVKit's default startup requests
/// such as AUTOPILOT_VERSION, available modes, home, or origin here.
pub fn live_vehicle_config(connect_timeout: Duration) -> mavkit::VehicleConfig {
    mavkit::VehicleConfig {
        connect_timeout,
        ..mavkit::VehicleConfig::default()
    }
}

/// Build a MAVKit vehicle config with longer operation timeouts for browser and
/// demo transports that run command/transfer flows through an extra adapter.
///
/// Like [`live_vehicle_config`], this preserves MAVKit's default init policy.
pub fn adapter_vehicle_config(
    connect_timeout: Duration,
    command_timeout: Duration,
    command_completion_timeout: Duration,
    transfer_timeout: Duration,
) -> mavkit::VehicleConfig {
    mavkit::VehicleConfig {
        connect_timeout,
        command_timeout,
        command_completion_timeout,
        transfer_timeout,
        ..mavkit::VehicleConfig::default()
    }
}

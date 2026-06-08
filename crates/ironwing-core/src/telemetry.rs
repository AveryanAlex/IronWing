pub const DEFAULT_TELEMETRY_INTERVAL_MS: u64 = 200;
pub const MIN_TELEMETRY_RATE_HZ: u32 = 1;
pub const MAX_TELEMETRY_RATE_HZ: u32 = 20;
pub const TELEMETRY_RATE_RANGE_ERROR: &str = "rate_hz must be between 1 and 20";
pub const MIN_MESSAGE_RATE_HZ: f32 = 0.1;
pub const MAX_MESSAGE_RATE_HZ: f32 = 50.0;
pub const MESSAGE_RATE_RANGE_ERROR: &str = "rate_hz must be between 0.1 and 50.0";

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Copy, serde::Serialize, PartialEq)]
pub struct MessageRateInfo {
    pub id: u32,
    pub name: &'static str,
    pub default_rate_hz: f32,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MessageIntervalRequest {
    pub message_id: u32,
    pub interval_usec: i32,
}

pub const AVAILABLE_MESSAGE_RATES: &[MessageRateInfo] = &[
    MessageRateInfo {
        id: 33,
        name: "Global Position",
        default_rate_hz: 4.0,
    },
    MessageRateInfo {
        id: 30,
        name: "Attitude",
        default_rate_hz: 4.0,
    },
    MessageRateInfo {
        id: 24,
        name: "GPS Raw",
        default_rate_hz: 2.0,
    },
    MessageRateInfo {
        id: 1,
        name: "System Status",
        default_rate_hz: 1.0,
    },
    MessageRateInfo {
        id: 65,
        name: "RC Channels",
        default_rate_hz: 2.0,
    },
    MessageRateInfo {
        id: 36,
        name: "Servo Output",
        default_rate_hz: 2.0,
    },
    MessageRateInfo {
        id: 74,
        name: "VFR HUD",
        default_rate_hz: 4.0,
    },
    MessageRateInfo {
        id: 62,
        name: "Nav Controller",
        default_rate_hz: 2.0,
    },
];

pub const DEFAULT_TELEMETRY_STREAM_REQUESTS: &[MessageIntervalRequest] = &[
    MessageIntervalRequest {
        message_id: 33,
        interval_usec: 200_000,
    },
    MessageIntervalRequest {
        message_id: 30,
        interval_usec: 200_000,
    },
    MessageIntervalRequest {
        message_id: 24,
        interval_usec: 500_000,
    },
    MessageIntervalRequest {
        message_id: 1,
        interval_usec: 1_000_000,
    },
];

pub fn available_message_rates() -> Vec<MessageRateInfo> {
    AVAILABLE_MESSAGE_RATES.to_vec()
}

pub fn telemetry_interval_ms_for_rate(rate_hz: u32) -> Result<u64, &'static str> {
    if !(MIN_TELEMETRY_RATE_HZ..=MAX_TELEMETRY_RATE_HZ).contains(&rate_hz) {
        return Err(TELEMETRY_RATE_RANGE_ERROR);
    }

    Ok(1000 / u64::from(rate_hz))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn telemetry_rate_validation_accepts_bounds() {
        assert_eq!(
            telemetry_interval_ms_for_rate(MIN_TELEMETRY_RATE_HZ),
            Ok(1000)
        );
        assert_eq!(
            telemetry_interval_ms_for_rate(MAX_TELEMETRY_RATE_HZ),
            Ok(50)
        );
    }

    #[test]
    fn telemetry_rate_validation_rejects_out_of_range_values() {
        assert_eq!(
            telemetry_interval_ms_for_rate(0),
            Err(TELEMETRY_RATE_RANGE_ERROR)
        );
        assert_eq!(
            telemetry_interval_ms_for_rate(MAX_TELEMETRY_RATE_HZ + 1),
            Err(TELEMETRY_RATE_RANGE_ERROR)
        );
    }
}

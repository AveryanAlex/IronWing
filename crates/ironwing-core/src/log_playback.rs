use serde_json::Value;

use crate::ipc::playback::PlaybackState;
use crate::ipc::{
    DomainProvenance, DomainValue, OperationId, PlaybackSnapshot, ReplayStatus, SessionConnection,
    SessionSnapshot, StatusTextSnapshot, SupportSnapshot, TelemetrySnapshot, VehicleState,
    status_text_snapshot_from_entries, telemetry_snapshot_from_value,
};

pub const DEFAULT_PLAYBACK_SPEED: f32 = 1.0;
pub const AVAILABLE_PLAYBACK_SPEEDS: [f32; 6] = [0.5, 1.0, 2.0, 4.0, 8.0, 16.0];

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PlaybackLogBounds {
    pub cursor_usec: Option<u64>,
    pub start_usec: u64,
    pub end_usec: u64,
    pub duration_secs: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct PlaybackFrame {
    pub session: DomainValue<SessionSnapshot>,
    pub telemetry: TelemetrySnapshot,
    pub support: SupportSnapshot,
    pub status_text: StatusTextSnapshot,
    pub playback: PlaybackSnapshot,
}

pub fn available_playback_speeds() -> Vec<f32> {
    AVAILABLE_PLAYBACK_SPEEDS.to_vec()
}

pub fn validate_playback_speed(speed: f32) -> Result<(), String> {
    if AVAILABLE_PLAYBACK_SPEEDS
        .iter()
        .any(|candidate| (*candidate - speed).abs() < f32::EPSILON)
    {
        Ok(())
    } else {
        Err(format!(
            "unsupported playback speed {speed}; expected one of {:?}",
            AVAILABLE_PLAYBACK_SPEEDS
        ))
    }
}

pub fn idle_playback_state() -> PlaybackState {
    PlaybackState {
        status: ReplayStatus::Idle,
        entry_id: None,
        operation_id: None,
        cursor_usec: None,
        start_usec: None,
        end_usec: None,
        duration_secs: None,
        speed: DEFAULT_PLAYBACK_SPEED,
        available_speeds: available_playback_speeds(),
        barrier_ready: false,
        readonly: true,
        diagnostic: None,
    }
}

pub fn playback_state_for_log(
    status: ReplayStatus,
    operation_id: Option<OperationId>,
    bounds: PlaybackLogBounds,
    speed: f32,
    barrier_ready: bool,
) -> PlaybackState {
    PlaybackState {
        status,
        entry_id: None,
        operation_id,
        cursor_usec: bounds.cursor_usec,
        start_usec: Some(bounds.start_usec),
        end_usec: Some(bounds.end_usec),
        duration_secs: Some(bounds.duration_secs),
        speed,
        available_speeds: available_playback_speeds(),
        barrier_ready,
        readonly: true,
        diagnostic: None,
    }
}

pub fn resolve_playback_cursor_usec(
    has_entries: bool,
    start_usec: u64,
    end_usec: u64,
    cursor_usec: Option<u64>,
) -> Option<u64> {
    has_entries.then(|| {
        cursor_usec
            .unwrap_or(start_usec)
            .clamp(start_usec, end_usec)
    })
}

pub fn playback_frame_from_parts(
    vehicle_state: Option<VehicleState>,
    telemetry_value: &Value,
    cursor_usec: Option<u64>,
) -> PlaybackFrame {
    PlaybackFrame {
        session: DomainValue::present(
            SessionSnapshot {
                status: crate::ipc::SessionStatus::Active,
                connection: SessionConnection::Disconnected,
                vehicle_state,
                home_position: None,
            },
            DomainProvenance::Playback,
        ),
        telemetry: telemetry_snapshot_from_value(telemetry_value, DomainProvenance::Playback),
        support: DomainValue::missing(DomainProvenance::Playback),
        status_text: status_text_snapshot_from_entries(Vec::new(), DomainProvenance::Playback),
        playback: PlaybackSnapshot { cursor_usec },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_only_declared_playback_speeds() {
        assert!(validate_playback_speed(0.5).is_ok());
        assert!(validate_playback_speed(16.0).is_ok());

        let error = validate_playback_speed(3.0).expect_err("unsupported speed");
        assert!(error.contains("unsupported playback speed 3"));
        assert!(error.contains("[0.5, 1.0, 2.0, 4.0, 8.0, 16.0]"));
    }

    #[test]
    fn idle_state_uses_default_speed_and_no_log_bounds() {
        let state = idle_playback_state();

        assert_eq!(state.status, ReplayStatus::Idle);
        assert_eq!(state.cursor_usec, None);
        assert_eq!(state.start_usec, None);
        assert_eq!(state.end_usec, None);
        assert_eq!(state.speed, DEFAULT_PLAYBACK_SPEED);
        assert_eq!(state.available_speeds, AVAILABLE_PLAYBACK_SPEEDS.to_vec());
        assert!(state.readonly);
        assert!(!state.barrier_ready);
    }

    #[test]
    fn playback_state_for_log_preserves_bounds_and_runtime_flags() {
        let state = playback_state_for_log(
            ReplayStatus::Playing,
            Some(OperationId::ReplayPlay),
            PlaybackLogBounds {
                cursor_usec: Some(150),
                start_usec: 100,
                end_usec: 200,
                duration_secs: 0.1,
            },
            4.0,
            true,
        );

        assert_eq!(state.status, ReplayStatus::Playing);
        assert_eq!(state.operation_id, Some(OperationId::ReplayPlay));
        assert_eq!(state.cursor_usec, Some(150));
        assert_eq!(state.start_usec, Some(100));
        assert_eq!(state.end_usec, Some(200));
        assert_eq!(state.duration_secs, Some(0.1));
        assert_eq!(state.speed, 4.0);
        assert!(state.barrier_ready);
        assert!(state.readonly);
    }

    #[test]
    fn resolve_cursor_defaults_and_clamps_when_entries_exist() {
        assert_eq!(
            resolve_playback_cursor_usec(true, 100, 200, None),
            Some(100)
        );
        assert_eq!(
            resolve_playback_cursor_usec(true, 100, 200, Some(50)),
            Some(100)
        );
        assert_eq!(
            resolve_playback_cursor_usec(true, 100, 200, Some(250)),
            Some(200)
        );
        assert_eq!(
            resolve_playback_cursor_usec(false, 100, 200, Some(150)),
            None
        );
    }

    #[test]
    fn playback_frame_from_parts_builds_playback_domain_snapshots() {
        let telemetry = serde_json::json!({
            "altitude_m": 12.3,
            "latitude_deg": 37.42,
            "longitude_deg": -122.08,
            "gps_fix_type": "fix_3d",
            "gps_satellites": 12
        });

        let frame = playback_frame_from_parts(None, &telemetry, Some(123));

        assert_eq!(frame.playback.cursor_usec, Some(123));
        assert!(frame.session.available);
        assert_eq!(frame.session.provenance, DomainProvenance::Playback);
        assert_eq!(
            frame
                .session
                .value
                .as_ref()
                .map(|value| value.connection.clone()),
            Some(SessionConnection::Disconnected)
        );
        assert!(!frame.support.available);
        assert!(frame.status_text.available);

        let telemetry = frame.telemetry.value.expect("telemetry state");
        assert_eq!(telemetry.flight.altitude_m, Some(12.3));
        assert_eq!(telemetry.navigation.latitude_deg, Some(37.42));
        assert_eq!(telemetry.navigation.longitude_deg, Some(-122.08));
        assert_eq!(telemetry.gps.fix_type.as_deref(), Some("fix_3d"));
        assert_eq!(telemetry.gps.satellites, Some(12));
    }
}

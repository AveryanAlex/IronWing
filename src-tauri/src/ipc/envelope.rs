#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum SourceKind {
    Live,
    Playback,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub(crate) struct SessionEnvelope {
    pub session_id: String,
    pub source_kind: SourceKind,
    pub seek_epoch: u64,
    pub reset_revision: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum OperationId {
    OpenSessionSnapshot,
    AckSessionSnapshot,
    ArmVehicle,
    DisarmVehicle,
    SetFlightMode,
    VehicleTakeoff,
    StartGuidedSession,
    UpdateGuidedSession,
    StopGuidedSession,
    SetMessageRate,
    MissionUpload,
    MissionDownload,
    MissionClear,
    FenceUpload,
    FenceDownload,
    FenceClear,
    RallyUpload,
    RallyDownload,
    RallyClear,
    MissionSetCurrent,
    CalibrateAccel,
    CalibrateGyro,
    ParamWrite,
    ParamWriteBatch,
    RebootVehicle,
    MotorTest,
    SetServo,
    RcOverride,
    CalibrateCompassStart,
    CalibrateCompassAccept,
    CalibrateCompassCancel,
    RequestPrearmChecks,
    LogOpen,
    LogLibraryList,
    LogLibraryRegister,
    LogLibraryRelink,
    LogLibraryRemove,
    LogLibraryReindex,
    LogLibraryCancel,
    LogRawMessagesQuery,
    LogChartSeriesQuery,
    LogExport,
    ReplayOpen,
    ReplayPlay,
    ReplayPause,
    ReplaySeek,
    ReplaySetSpeed,
    ReplayStop,
    RecordingStart,
    RecordingStop,
    RecordingStatus,
    RecordingSettingsRead,
    RecordingSettingsWrite,
    FirmwareFlashSerial,
    FirmwareFlashDfuRecovery,
}

impl OperationId {
    #[cfg(test)]
    pub(crate) const fn as_str(self) -> &'static str {
        match self {
            Self::OpenSessionSnapshot => "open_session_snapshot",
            Self::AckSessionSnapshot => "ack_session_snapshot",
            Self::ArmVehicle => "arm_vehicle",
            Self::DisarmVehicle => "disarm_vehicle",
            Self::SetFlightMode => "set_flight_mode",
            Self::VehicleTakeoff => "vehicle_takeoff",
            Self::StartGuidedSession => "start_guided_session",
            Self::UpdateGuidedSession => "update_guided_session",
            Self::StopGuidedSession => "stop_guided_session",
            Self::SetMessageRate => "set_message_rate",
            Self::MissionUpload => "mission_upload",
            Self::MissionDownload => "mission_download",
            Self::MissionClear => "mission_clear",
            Self::FenceUpload => "fence_upload",
            Self::FenceDownload => "fence_download",
            Self::FenceClear => "fence_clear",
            Self::RallyUpload => "rally_upload",
            Self::RallyDownload => "rally_download",
            Self::RallyClear => "rally_clear",
            Self::MissionSetCurrent => "mission_set_current",
            Self::CalibrateAccel => "calibrate_accel",
            Self::CalibrateGyro => "calibrate_gyro",
            Self::ParamWrite => "param_write",
            Self::ParamWriteBatch => "param_write_batch",
            Self::RebootVehicle => "reboot_vehicle",
            Self::MotorTest => "motor_test",
            Self::SetServo => "set_servo",
            Self::RcOverride => "rc_override",
            Self::CalibrateCompassStart => "calibrate_compass_start",
            Self::CalibrateCompassAccept => "calibrate_compass_accept",
            Self::CalibrateCompassCancel => "calibrate_compass_cancel",
            Self::RequestPrearmChecks => "request_prearm_checks",
            Self::LogOpen => "log_open",
            Self::LogLibraryList => "log_library_list",
            Self::LogLibraryRegister => "log_library_register",
            Self::LogLibraryRelink => "log_library_relink",
            Self::LogLibraryRemove => "log_library_remove",
            Self::LogLibraryReindex => "log_library_reindex",
            Self::LogLibraryCancel => "log_library_cancel",
            Self::LogRawMessagesQuery => "log_raw_messages_query",
            Self::LogChartSeriesQuery => "log_chart_series_query",
            Self::LogExport => "log_export",
            Self::ReplayOpen => "replay_open",
            Self::ReplayPlay => "replay_play",
            Self::ReplayPause => "replay_pause",
            Self::ReplaySeek => "replay_seek",
            Self::ReplaySetSpeed => "replay_set_speed",
            Self::ReplayStop => "replay_stop",
            Self::RecordingStart => "recording_start",
            Self::RecordingStop => "recording_stop",
            Self::RecordingStatus => "recording_status",
            Self::RecordingSettingsRead => "recording_settings_read",
            Self::RecordingSettingsWrite => "recording_settings_write",
            Self::FirmwareFlashSerial => "firmware_flash_serial",
            Self::FirmwareFlashDfuRecovery => "firmware_flash_dfu_recovery",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum ReasonKind {
    Unsupported,
    Unavailable,
    Conflict,
    InvalidInput,
    Cancelled,
    Failed,
    Timeout,
    PermissionDenied,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub(crate) struct Reason {
    pub kind: ReasonKind,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub(crate) struct OperationFailure {
    pub operation_id: OperationId,
    pub reason: Reason,
}

/// Wraps a value with its session envelope for scoped IPC emission.
// contract_fixtures.rs textually includes this file; the struct is only
// constructed in runtime code, so suppress the dead_code lint for tests.
#[cfg_attr(test, allow(dead_code))]
#[derive(Debug, Clone, serde::Serialize)]
pub(crate) struct ScopedEvent<T> {
    pub envelope: SessionEnvelope,
    pub value: T,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn operation_ids_are_stable_and_reason_payloads_are_typed() {
        let failure = OperationFailure {
            operation_id: OperationId::AckSessionSnapshot,
            reason: Reason {
                kind: ReasonKind::Conflict,
                message: "snapshot barrier active".to_string(),
            },
        };

        assert_eq!(
            OperationId::OpenSessionSnapshot.as_str(),
            "open_session_snapshot"
        );
        assert_eq!(
            OperationId::AckSessionSnapshot.as_str(),
            "ack_session_snapshot"
        );
        assert_eq!(
            OperationId::StartGuidedSession.as_str(),
            "start_guided_session"
        );
        assert_eq!(
            OperationId::UpdateGuidedSession.as_str(),
            "update_guided_session"
        );
        assert_eq!(
            OperationId::StopGuidedSession.as_str(),
            "stop_guided_session"
        );

        let value = serde_json::to_value(&failure).expect("serialize operation failure");
        assert_eq!(value["operation_id"], "ack_session_snapshot");
        assert_eq!(value["reason"]["kind"], "conflict");
        assert_eq!(value["reason"]["message"], "snapshot barrier active");
    }
}

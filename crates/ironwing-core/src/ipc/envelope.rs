#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SourceKind {
    Live,
    Playback,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct SessionEnvelope {
    pub session_id: String,
    pub source_kind: SourceKind,
    pub seek_epoch: u64,
    pub reset_revision: u64,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OperationId {
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
    MissionCancel,
    FenceUpload,
    FenceDownload,
    FenceClear,
    RallyUpload,
    RallyDownload,
    RallyClear,
    MissionSetCurrent,
    CalibrateAccel,
    CalibrateGyro,
    ParamDownloadAll,
    ParamWrite,
    ParamWriteBatch,
    ParamCancel,
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
    FirmwareInstallUpdate,
    FirmwareBootloaderInstallation,
}

impl OperationId {
    pub const ALL: &'static [Self] = &[
        Self::OpenSessionSnapshot,
        Self::AckSessionSnapshot,
        Self::ArmVehicle,
        Self::DisarmVehicle,
        Self::SetFlightMode,
        Self::VehicleTakeoff,
        Self::StartGuidedSession,
        Self::UpdateGuidedSession,
        Self::StopGuidedSession,
        Self::SetMessageRate,
        Self::MissionUpload,
        Self::MissionDownload,
        Self::MissionClear,
        Self::MissionCancel,
        Self::FenceUpload,
        Self::FenceDownload,
        Self::FenceClear,
        Self::RallyUpload,
        Self::RallyDownload,
        Self::RallyClear,
        Self::MissionSetCurrent,
        Self::CalibrateAccel,
        Self::CalibrateGyro,
        Self::ParamDownloadAll,
        Self::ParamWrite,
        Self::ParamWriteBatch,
        Self::ParamCancel,
        Self::RebootVehicle,
        Self::MotorTest,
        Self::SetServo,
        Self::RcOverride,
        Self::CalibrateCompassStart,
        Self::CalibrateCompassAccept,
        Self::CalibrateCompassCancel,
        Self::RequestPrearmChecks,
        Self::LogOpen,
        Self::LogLibraryList,
        Self::LogLibraryRegister,
        Self::LogLibraryRelink,
        Self::LogLibraryRemove,
        Self::LogLibraryReindex,
        Self::LogLibraryCancel,
        Self::LogRawMessagesQuery,
        Self::LogChartSeriesQuery,
        Self::LogExport,
        Self::ReplayOpen,
        Self::ReplayPlay,
        Self::ReplayPause,
        Self::ReplaySeek,
        Self::ReplaySetSpeed,
        Self::ReplayStop,
        Self::RecordingStart,
        Self::RecordingStop,
        Self::RecordingStatus,
        Self::RecordingSettingsRead,
        Self::RecordingSettingsWrite,
        Self::FirmwareInstallUpdate,
        Self::FirmwareBootloaderInstallation,
    ];

    pub const fn as_str(self) -> &'static str {
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
            Self::MissionCancel => "mission_cancel",
            Self::FenceUpload => "fence_upload",
            Self::FenceDownload => "fence_download",
            Self::FenceClear => "fence_clear",
            Self::RallyUpload => "rally_upload",
            Self::RallyDownload => "rally_download",
            Self::RallyClear => "rally_clear",
            Self::MissionSetCurrent => "mission_set_current",
            Self::CalibrateAccel => "calibrate_accel",
            Self::CalibrateGyro => "calibrate_gyro",
            Self::ParamDownloadAll => "param_download_all",
            Self::ParamWrite => "param_write",
            Self::ParamWriteBatch => "param_write_batch",
            Self::ParamCancel => "param_cancel",
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
            Self::FirmwareInstallUpdate => "firmware_install_update",
            Self::FirmwareBootloaderInstallation => "firmware_bootloader_installation",
        }
    }
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReasonKind {
    Unsupported,
    Unavailable,
    Conflict,
    InvalidInput,
    Cancelled,
    Failed,
    Timeout,
    PermissionDenied,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct Reason {
    pub kind: ReasonKind,
    pub message: String,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct OperationFailure {
    pub operation_id: OperationId,
    pub reason: Reason,
}

pub fn operation_failure_json(failure: OperationFailure) -> String {
    match serde_json::to_string(&failure) {
        Ok(json) => json,
        Err(_) => failure.reason.message,
    }
}

#[cfg_attr(test, allow(dead_code))]
#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, serde::Serialize)]
pub struct ScopedEvent<T> {
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

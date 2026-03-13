use serde::{Deserialize, Serialize};

// ── Session status (top-level discriminant: which path is active) ──

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub(crate) enum FirmwareSessionStatus {
    Idle,
    SerialPrimary { phase: SerialFlashPhase },
    DfuRecovery { phase: DfuRecoveryPhase },
    Completed { outcome: FirmwareOutcome },
}

// ── Serial primary path ──

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum SerialFlashPhase {
    Idle,
    Probing,
    Erasing,
    Programming,
    Verifying,
    Rebooting,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "result", rename_all = "snake_case")]
pub(crate) enum SerialFlashOutcome {
    Verified,
    FlashedButUnverified,
    Failed { reason: String },
    RecoveryNeeded { reason: String },
}

// ── DFU recovery path (separate product path, not a branch of serial) ──

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum DfuRecoveryPhase {
    Idle,
    Detecting,
    Downloading,
    Verifying,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "result", rename_all = "snake_case")]
pub(crate) enum DfuRecoveryOutcome {
    Verified,
    Failed { reason: String },
    UnsupportedRecoveryPath { guidance: String },
}

// ── Unified terminal outcome (wraps path-specific outcomes) ──

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "path", rename_all = "snake_case")]
pub(crate) enum FirmwareOutcome {
    SerialPrimary { outcome: SerialFlashOutcome },
    DfuRecovery { outcome: DfuRecoveryOutcome },
}

// ── Firmware source (path-specific: catalog + local_apj for serial, local_bin for DFU) ──

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub(crate) enum FirmwareSource {
    OfficialCatalog {
        board_id: u32,
        url: String,
        version: String,
    },
    LocalApj {
        path: String,
    },
    LocalBin {
        path: String,
    },
}

// ── Serial-board identity (detected during serial-path probing) ──

#[derive(Debug, Clone, Serialize)]
pub(crate) struct SerialBoardIdentity {
    pub(crate) board_id: u32,
    pub(crate) bootloader_rev: u8,
    pub(crate) flash_size: u32,
    pub(crate) board_name: String,
    pub(crate) port: String,
}

// ── DFU recovery identity (detected during DFU-path device enumeration) ──

#[derive(Debug, Clone, Serialize)]
pub(crate) struct DfuRecoveryIdentity {
    pub(crate) vendor_id: u16,
    pub(crate) product_id: u16,
    pub(crate) device_label: String,
}

// ── Action-required prompts (firmware flow pauses for user decision) ──

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub(crate) enum ActionRequired {
    /// Serial path: prompt user to back up parameters before disconnect + flash.
    ConfirmParameterBackup,
    /// Serial path: board detected, user must confirm destructive erase + flash.
    ConfirmSerialFlash {
        board: SerialBoardIdentity,
        source: FirmwareSource,
    },
    /// DFU path: user must explicitly confirm recovery-mode flash (stronger warning).
    ConfirmDfuRecovery { device: DfuRecoveryIdentity },
    /// DFU path (Windows): driver not installed, show guidance.
    InstallUsbDriver { guidance: String },
}

// ── Progress snapshot ──

#[derive(Debug, Clone, Serialize)]
pub(crate) struct FirmwareProgress {
    pub(crate) phase_label: String,
    pub(crate) bytes_written: u64,
    pub(crate) bytes_total: u64,
    pub(crate) pct: f32,
}

// ── Port inventory (firmware-specific, separate from connection dropdown) ──

/// Structured serial/USB port metadata for firmware device discovery.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub(crate) struct PortInfo {
    pub(crate) port_name: String,
    pub(crate) vid: Option<u16>,
    pub(crate) pid: Option<u16>,
    pub(crate) serial_number: Option<String>,
    pub(crate) manufacturer: Option<String>,
    pub(crate) product: Option<String>,
    pub(crate) location: Option<String>,
}

/// Result of a firmware port inventory scan.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub(crate) enum InventoryResult {
    /// Desktop: structured port list with USB metadata.
    Available { ports: Vec<PortInfo> },
    /// Android/unsupported: typed refusal, not fake data.
    Unsupported,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub(crate) struct DfuDeviceInfo {
    pub(crate) vid: u16,
    pub(crate) pid: u16,
    pub(crate) serial_number: Option<String>,
    pub(crate) manufacturer: Option<String>,
    pub(crate) product: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub(crate) enum DfuScanResult {
    Available { devices: Vec<DfuDeviceInfo> },
    Unsupported,
}

// ── Catalog entry (normalized from ArduPilot manifest) ──

/// A normalized firmware catalog entry from the official ArduPilot manifest.
#[derive(Debug, Clone, Serialize)]
pub(crate) struct CatalogEntry {
    pub(crate) board_id: u32,
    pub(crate) platform: String,
    pub(crate) vehicle_type: String,
    pub(crate) version: String,
    pub(crate) version_type: String,
    pub(crate) format: String,
    pub(crate) url: String,
    pub(crate) image_size: u64,
    pub(crate) latest: bool,
    pub(crate) git_sha: String,
    pub(crate) brand_name: Option<String>,
    pub(crate) manufacturer: Option<String>,
}

// ── Catalog target summary (grouped for recovery-mode manual board selection) ──

/// A grouped recovery target keyed by `board_id + platform`.
/// Contains enough fields for a manual board selector in recovery mode.
#[derive(Debug, Clone, Serialize)]
pub(crate) struct CatalogTargetSummary {
    pub(crate) board_id: u32,
    pub(crate) platform: String,
    pub(crate) brand_name: Option<String>,
    pub(crate) manufacturer: Option<String>,
    pub(crate) vehicle_types: Vec<String>,
    pub(crate) latest_version: Option<String>,
}

// ── Serial preflight info (returned by the preflight command before flashing) ──

#[derive(Debug, Clone, Serialize)]
pub(crate) struct SerialPreflightInfo {
    pub(crate) vehicle_connected: bool,
    pub(crate) param_count: u32,
    pub(crate) has_params_to_backup: bool,
    pub(crate) available_ports: Vec<PortInfo>,
    pub(crate) detected_board_id: Option<u32>,
    pub(crate) session_ready: bool,
    pub(crate) session_status: FirmwareSessionStatus,
}

// ── Serial flash source (command-level: what the frontend sends) ──

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub(crate) enum SerialFlashSource {
    CatalogUrl { url: String },
    LocalApjBytes { data: Vec<u8> },
}

// ── DFU recovery source (command-level: what the frontend sends) ──

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub(crate) enum DfuRecoverySource {
    /// Download APJ from the official catalog URL, extract internal image for DFU.
    CatalogUrl { url: String },
    /// User-provided APJ file bytes, extract internal image for DFU.
    LocalApjBytes { data: Vec<u8> },
    /// User-provided raw BIN file bytes, pass directly to DFU executor.
    LocalBinBytes { data: Vec<u8> },
}

// ── Serial flow terminal result (produced by the serial executor) ──

/// Terminal result of a serial flash flow execution.
/// Distinguishes verified from unverified outcomes explicitly.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "result", rename_all = "snake_case")]
pub(crate) enum SerialFlowResult {
    /// Flash succeeded and CRC verification passed.
    Verified {
        board_id: u32,
        bootloader_rev: u8,
        port: String,
    },
    /// Flash completed but CRC verification was unavailable (BL_REV < 3).
    FlashedButUnverified {
        board_id: u32,
        bootloader_rev: u8,
        port: String,
    },
    /// Flash completed and verified/unverified, plus reconnect succeeded.
    ReconnectVerified {
        board_id: u32,
        bootloader_rev: u8,
        flash_verified: bool,
    },
    /// Flash completed but reconnect verification failed or timed out.
    ReconnectFailed {
        board_id: u32,
        bootloader_rev: u8,
        flash_verified: bool,
        reconnect_error: String,
    },
    /// Serial flow failed and may need manual recovery. Never auto-enters DFU.
    Failed { reason: String },
    /// Board detection during bootloader phase failed.
    BoardDetectionFailed { reason: String },
    /// Board lacks sufficient external-flash capacity for the firmware artifact.
    ExtfCapacityInsufficient { reason: String },
}

impl SerialFlowResult {
    /// Convert to a `SerialFlashOutcome` for the session status.
    pub(crate) fn to_outcome(&self) -> SerialFlashOutcome {
        match self {
            Self::Verified { .. }
            | Self::ReconnectVerified {
                flash_verified: true,
                ..
            } => SerialFlashOutcome::Verified,
            Self::FlashedButUnverified { .. }
            | Self::ReconnectVerified {
                flash_verified: false,
                ..
            }
            | Self::ReconnectFailed { .. } => SerialFlashOutcome::FlashedButUnverified,
            Self::Failed { reason } => SerialFlashOutcome::Failed {
                reason: reason.clone(),
            },
            Self::BoardDetectionFailed { reason } => SerialFlashOutcome::RecoveryNeeded {
                reason: reason.clone(),
            },
            Self::ExtfCapacityInsufficient { reason } => SerialFlashOutcome::Failed {
                reason: reason.clone(),
            },
        }
    }
}

// ── Typed errors ──

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "code", rename_all = "snake_case")]
pub(crate) enum FirmwareError {
    VehicleConnected,
    SessionBusy {
        current_session: String,
    },
    PortNotFound,
    BoardMismatch {
        expected: u32,
        actual: u32,
    },
    ArtifactInvalid {
        reason: String,
    },
    ProtocolError {
        detail: String,
    },
    UsbAccessDenied {
        guidance: String,
    },
    PlatformUnsupported,
    CatalogUnavailable {
        reason: String,
    },
    ExtfCapacityInsufficient {
        board_capacity: u32,
        firmware_needs: u32,
    },
}

impl std::fmt::Display for FirmwareError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::VehicleConnected => write!(f, "vehicle is connected; disconnect before flashing"),
            Self::SessionBusy { current_session } => {
                write!(f, "firmware session already active: {current_session}")
            }
            Self::PortNotFound => write!(f, "serial port not found"),
            Self::BoardMismatch { expected, actual } => {
                write!(f, "board mismatch: expected {expected}, got {actual}")
            }
            Self::ArtifactInvalid { reason } => write!(f, "invalid firmware artifact: {reason}"),
            Self::ProtocolError { detail } => write!(f, "protocol error: {detail}"),
            Self::UsbAccessDenied { guidance } => write!(f, "USB access denied: {guidance}"),
            Self::PlatformUnsupported => {
                write!(f, "firmware flashing not supported on this platform")
            }
            Self::CatalogUnavailable { reason } => {
                write!(f, "firmware catalog unavailable: {reason}")
            }
            Self::ExtfCapacityInsufficient {
                board_capacity,
                firmware_needs,
            } => {
                write!(
                    f,
                    "external-flash capacity insufficient: board reports {board_capacity} bytes, firmware needs {firmware_needs} bytes"
                )
            }
        }
    }
}

#[cfg(not(target_os = "android"))]
impl From<dfu_core::Error> for FirmwareError {
    fn from(e: dfu_core::Error) -> Self {
        Self::ProtocolError {
            detail: e.to_string(),
        }
    }
}

#[cfg(not(target_os = "android"))]
impl From<std::io::Error> for FirmwareError {
    fn from(e: std::io::Error) -> Self {
        Self::ProtocolError {
            detail: e.to_string(),
        }
    }
}

// ── Session handle (mirrors TlogRecorderHandle pattern: internal std::sync::Mutex) ──

enum SessionState {
    Idle,
    SerialPrimary,
    DfuRecovery,
}

pub(crate) struct FirmwareSessionHandle {
    state: std::sync::Mutex<SessionState>,
}

impl FirmwareSessionHandle {
    pub(crate) fn new() -> Self {
        Self {
            state: std::sync::Mutex::new(SessionState::Idle),
        }
    }

    /// Attempt to start a serial primary session.
    /// Accepts connected state (the command handles reboot-then-disconnect).
    /// Fails only if another firmware session is already active.
    pub(crate) fn try_start_serial(&self) -> Result<(), FirmwareError> {
        let mut guard = self.state.lock().unwrap_or_else(|e| e.into_inner());
        match *guard {
            SessionState::Idle => {
                *guard = SessionState::SerialPrimary;
                Ok(())
            }
            SessionState::SerialPrimary => Err(FirmwareError::SessionBusy {
                current_session: "serial_primary".into(),
            }),
            SessionState::DfuRecovery => Err(FirmwareError::SessionBusy {
                current_session: "dfu_recovery".into(),
            }),
        }
    }

    /// Attempt to start a DFU recovery session.
    /// Fails if a vehicle is connected or another firmware session is active.
    pub(crate) fn try_start_dfu(&self, vehicle_connected: bool) -> Result<(), FirmwareError> {
        if vehicle_connected {
            return Err(FirmwareError::VehicleConnected);
        }
        let mut guard = self.state.lock().unwrap_or_else(|e| e.into_inner());
        match *guard {
            SessionState::Idle => {
                *guard = SessionState::DfuRecovery;
                Ok(())
            }
            SessionState::SerialPrimary => Err(FirmwareError::SessionBusy {
                current_session: "serial_primary".into(),
            }),
            SessionState::DfuRecovery => Err(FirmwareError::SessionBusy {
                current_session: "dfu_recovery".into(),
            }),
        }
    }

    /// Stop the current firmware session, returning to idle.
    pub(crate) fn stop(&self) {
        let mut guard = self.state.lock().unwrap_or_else(|e| e.into_inner());
        *guard = SessionState::Idle;
    }

    /// Get the current session status.
    pub(crate) fn status(&self) -> FirmwareSessionStatus {
        let guard = self.state.lock().unwrap_or_else(|e| e.into_inner());
        match *guard {
            SessionState::Idle => FirmwareSessionStatus::Idle,
            SessionState::SerialPrimary => FirmwareSessionStatus::SerialPrimary {
                phase: SerialFlashPhase::Idle,
            },
            SessionState::DfuRecovery => FirmwareSessionStatus::DfuRecovery {
                phase: DfuRecoveryPhase::Idle,
            },
        }
    }
}

use serde::{Deserialize, Serialize};

// ── Session status (top-level discriminant: which path is active) ──

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub(crate) enum FirmwareSessionStatus {
    Idle,
    SerialPrimary { phase: SerialFlashPhase },
    DfuRecovery { phase: DfuRecoveryPhase },
    Cancelling { path: FirmwareSessionPath },
    Completed { outcome: FirmwareOutcome },
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum FirmwareSessionPath {
    SerialPrimary,
    DfuRecovery,
}

// ── Serial primary path ──

#[derive(Debug, Clone, Copy, Serialize)]
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
    Verified {
        board_id: u32,
        bootloader_rev: u8,
        port: String,
    },
    Cancelled,
    FlashedButUnverified {
        board_id: u32,
        bootloader_rev: u8,
        port: String,
    },
    ReconnectVerified {
        board_id: u32,
        bootloader_rev: u8,
        flash_verified: bool,
    },
    ReconnectFailed {
        board_id: u32,
        bootloader_rev: u8,
        flash_verified: bool,
        reconnect_error: String,
    },
    Failed {
        reason: String,
    },
    BoardDetectionFailed {
        reason: String,
    },
    ExtfCapacityInsufficient {
        reason: String,
    },
}

// ── DFU recovery path (separate product path, not a branch of serial) ──

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum DfuRecoveryPhase {
    Idle,
    Detecting,
    Downloading,
    Erasing,
    Verifying,
    ManifestingOrResetting,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "result", rename_all = "snake_case")]
pub(crate) enum DfuRecoveryOutcome {
    Verified,
    Cancelled,
    ResetUnconfirmed,
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
    pub(crate) unique_id: String,
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
    pub(crate) unique_id: String,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub(crate) enum SerialFlashSource {
    CatalogUrl { url: String },
    LocalApjBytes { data: Vec<u8> },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub(crate) struct SerialFlashOptions {
    pub(crate) full_chip_erase: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct SerialReadinessRequest {
    pub(crate) port: String,
    pub(crate) source: SerialFlashSource,
    pub(crate) options: Option<SerialFlashOptions>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub(crate) enum SerialReadiness {
    Advisory,
    Blocked {
        reason: SerialReadinessBlockedReason,
    },
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct SerialReadinessResponse {
    pub(crate) request_token: String,
    pub(crate) session_status: FirmwareSessionStatus,
    pub(crate) readiness: SerialReadiness,
    pub(crate) target_hint: Option<SerialReadinessTargetHint>,
    pub(crate) validation_pending: bool,
    pub(crate) bootloader_transition: SerialBootloaderTransition,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub(crate) enum SerialBootloaderTransition {
    AutoRebootSupported,
    AlreadyInBootloader,
    AutoRebootAttemptable,
    ManualBootloaderEntryRequired,
    TargetMismatch,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum SerialReadinessBlockedReason {
    SessionBusy,
    PortUnselected,
    PortUnavailable,
    SourceMissing,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct SerialReadinessTargetHint {
    pub(crate) detected_board_id: Option<u32>,
}

// ── DFU recovery source (command-level: what the frontend sends) ──

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub(crate) enum DfuRecoverySource {
    /// Resolve the official recovery bootloader image for a board target.
    OfficialBootloader { board_target: String },
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
    /// Flash was cancelled before completion.
    Cancelled,
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
            Self::Verified {
                board_id,
                bootloader_rev,
                port,
            } => SerialFlashOutcome::Verified {
                board_id: *board_id,
                bootloader_rev: *bootloader_rev,
                port: port.clone(),
            },
            Self::Cancelled => SerialFlashOutcome::Cancelled,
            Self::FlashedButUnverified {
                board_id,
                bootloader_rev,
                port,
            } => SerialFlashOutcome::FlashedButUnverified {
                board_id: *board_id,
                bootloader_rev: *bootloader_rev,
                port: port.clone(),
            },
            Self::ReconnectVerified {
                board_id,
                bootloader_rev,
                flash_verified,
            } => SerialFlashOutcome::ReconnectVerified {
                board_id: *board_id,
                bootloader_rev: *bootloader_rev,
                flash_verified: *flash_verified,
            },
            Self::ReconnectFailed {
                board_id,
                bootloader_rev,
                flash_verified,
                reconnect_error,
            } => SerialFlashOutcome::ReconnectFailed {
                board_id: *board_id,
                bootloader_rev: *bootloader_rev,
                flash_verified: *flash_verified,
                reconnect_error: reconnect_error.clone(),
            },
            Self::Failed { reason } => SerialFlashOutcome::Failed {
                reason: reason.clone(),
            },
            Self::BoardDetectionFailed { reason } => SerialFlashOutcome::BoardDetectionFailed {
                reason: reason.clone(),
            },
            Self::ExtfCapacityInsufficient { reason } => {
                SerialFlashOutcome::ExtfCapacityInsufficient {
                    reason: reason.clone(),
                }
            }
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
    PortOpenTransient {
        detail: String,
    },
    PortOpenFailed {
        detail: String,
    },
    BootloaderSyncMismatch {
        received: u8,
    },
    IoTransient {
        detail: String,
    },
    ArtifactInvalid {
        reason: String,
    },
    Cancelled,
    Timeout {
        context: String,
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
    UnsupportedDfuBootloaderTarget {
        guidance: String,
    },
    ManualDfuRecoveryRequiresSerialPath {
        guidance: String,
    },
    DfuExactTargetingUnavailable {
        guidance: String,
    },
    InternalFlashCapacityInsufficient {
        board_capacity: u32,
        firmware_needs: u32,
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
            Self::PortOpenTransient { detail } => {
                write!(f, "transient port open failure: {detail}")
            }
            Self::PortOpenFailed { detail } => write!(f, "port open failure: {detail}"),
            Self::BootloaderSyncMismatch { received } => {
                write!(f, "bootloader sync mismatch: got 0x{received:02X}")
            }
            Self::IoTransient { detail } => write!(f, "transient I/O failure: {detail}"),
            Self::ArtifactInvalid { reason } => write!(f, "invalid firmware artifact: {reason}"),
            Self::Cancelled => write!(f, "flash cancellation requested"),
            Self::Timeout { context } => write!(f, "timed out waiting for {context}"),
            Self::ProtocolError { detail } => write!(f, "protocol error: {detail}"),
            Self::UsbAccessDenied { guidance } => write!(f, "USB access denied: {guidance}"),
            Self::PlatformUnsupported => {
                write!(f, "firmware flashing not supported on this platform")
            }
            Self::CatalogUnavailable { reason } => {
                write!(f, "firmware catalog unavailable: {reason}")
            }
            Self::UnsupportedDfuBootloaderTarget { guidance } => {
                write!(f, "unsupported DFU official bootloader target: {guidance}")
            }
            Self::ManualDfuRecoveryRequiresSerialPath { guidance } => {
                write!(f, "manual DFU recovery requires serial path: {guidance}")
            }
            Self::DfuExactTargetingUnavailable { guidance } => {
                write!(f, "DFU exact targeting unavailable: {guidance}")
            }
            Self::InternalFlashCapacityInsufficient {
                board_capacity,
                firmware_needs,
            } => {
                write!(
                    f,
                    "internal-flash capacity insufficient: board reports {board_capacity} bytes, firmware needs {firmware_needs} bytes"
                )
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
    SerialPrimary { phase: SerialFlashPhase },
    DfuRecovery { phase: DfuRecoveryPhase },
    Cancelling { path: FirmwareSessionPath },
    Completed { outcome: FirmwareOutcome },
}

#[derive(Clone)]
pub(crate) struct FirmwareSessionHandle {
    state: std::sync::Arc<std::sync::Mutex<SessionState>>,
}

impl FirmwareSessionHandle {
    pub(crate) fn new() -> Self {
        Self {
            state: std::sync::Arc::new(std::sync::Mutex::new(SessionState::Idle)),
        }
    }

    /// Attempt to start a serial primary session.
    /// Accepts connected state (the command handles reboot-then-disconnect).
    /// Fails only if another firmware session is already active.
    pub(crate) fn try_start_serial(&self) -> Result<(), FirmwareError> {
        let mut guard = self.state.lock().unwrap_or_else(|e| e.into_inner());
        match *guard {
            SessionState::Idle => {
                *guard = SessionState::SerialPrimary {
                    phase: SerialFlashPhase::Idle,
                };
                Ok(())
            }
            SessionState::Completed { .. } => {
                *guard = SessionState::SerialPrimary {
                    phase: SerialFlashPhase::Idle,
                };
                Ok(())
            }
            SessionState::SerialPrimary { .. } => Err(FirmwareError::SessionBusy {
                current_session: "serial_primary".into(),
            }),
            SessionState::DfuRecovery { .. } => Err(FirmwareError::SessionBusy {
                current_session: "dfu_recovery".into(),
            }),
            SessionState::Cancelling { .. } => Err(FirmwareError::SessionBusy {
                current_session: "cancelling".into(),
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
                *guard = SessionState::DfuRecovery {
                    phase: DfuRecoveryPhase::Idle,
                };
                Ok(())
            }
            SessionState::Completed { .. } => {
                *guard = SessionState::DfuRecovery {
                    phase: DfuRecoveryPhase::Idle,
                };
                Ok(())
            }
            SessionState::SerialPrimary { .. } => Err(FirmwareError::SessionBusy {
                current_session: "serial_primary".into(),
            }),
            SessionState::DfuRecovery { .. } => Err(FirmwareError::SessionBusy {
                current_session: "dfu_recovery".into(),
            }),
            SessionState::Cancelling { .. } => Err(FirmwareError::SessionBusy {
                current_session: "cancelling".into(),
            }),
        }
    }

    /// Mark the session as cancelling while async task shutdown is in progress.
    pub(crate) fn mark_cancelling(&self) {
        let mut guard = self.state.lock().unwrap_or_else(|e| e.into_inner());
        match *guard {
            SessionState::SerialPrimary { .. } => {
                *guard = SessionState::Cancelling {
                    path: FirmwareSessionPath::SerialPrimary,
                };
            }
            SessionState::DfuRecovery { .. } => {
                *guard = SessionState::Cancelling {
                    path: FirmwareSessionPath::DfuRecovery,
                };
            }
            SessionState::Idle
            | SessionState::Cancelling { .. }
            | SessionState::Completed { .. } => {}
        }
    }

    /// Record the terminal outcome so polling can report it honestly.
    pub(crate) fn complete(&self, outcome: FirmwareOutcome) {
        let mut guard = self.state.lock().unwrap_or_else(|e| e.into_inner());
        *guard = SessionState::Completed { outcome };
    }

    /// Clear a completed session back to idle without disturbing active work.
    pub(crate) fn clear_completed(&self) {
        let mut guard = self.state.lock().unwrap_or_else(|e| e.into_inner());
        if matches!(*guard, SessionState::Completed { .. }) {
            *guard = SessionState::Idle;
        }
    }

    /// Update the current serial phase while flashing is active.
    pub(crate) fn set_serial_phase(&self, phase: SerialFlashPhase) {
        let mut guard = self.state.lock().unwrap_or_else(|e| e.into_inner());
        if matches!(*guard, SessionState::SerialPrimary { .. }) {
            *guard = SessionState::SerialPrimary { phase };
        }
    }

    /// Update the current DFU phase while recovery is active.
    pub(crate) fn set_dfu_phase(&self, phase: DfuRecoveryPhase) {
        let mut guard = self.state.lock().unwrap_or_else(|e| e.into_inner());
        if matches!(*guard, SessionState::DfuRecovery { .. }) {
            *guard = SessionState::DfuRecovery { phase };
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
            SessionState::SerialPrimary { phase } => FirmwareSessionStatus::SerialPrimary { phase },
            SessionState::DfuRecovery { phase } => FirmwareSessionStatus::DfuRecovery { phase },
            SessionState::Cancelling { path } => FirmwareSessionStatus::Cancelling { path },
            SessionState::Completed { ref outcome } => FirmwareSessionStatus::Completed {
                outcome: outcome.clone(),
            },
        }
    }
}

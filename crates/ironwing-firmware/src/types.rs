use serde::{Deserialize, Serialize};

pub const FIRMWARE_INSTALL_UPDATE_PATH: &str = "firmware_install_update";
pub const BOOTLOADER_INSTALLATION_PATH: &str = "bootloader_installation";

// ── Session status (top-level discriminant: which path is active) ──

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum FirmwareSessionStatus {
    Idle,
    /// Firmware install/update path.
    FirmwareInstallUpdate {
        phase: SerialFlashPhase,
    },
    /// Bootloader installation path.
    BootloaderInstallation {
        phase: DfuRecoveryPhase,
    },
    Cancelling {
        path: FirmwareSessionPath,
    },
    Completed {
        outcome: FirmwareOutcome,
    },
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FirmwareSessionPath {
    FirmwareInstallUpdate,
    BootloaderInstallation,
}

// ── Firmware install/update path ──

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SerialFlashPhase {
    Idle,
    Probing,
    Erasing,
    Programming,
    Verifying,
    Rebooting,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "result", rename_all = "snake_case")]
pub enum SerialFlashOutcome {
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

// ── Bootloader installation path (implemented via USB DFU) ──

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DfuRecoveryPhase {
    Idle,
    Detecting,
    Downloading,
    Erasing,
    Verifying,
    ManifestingOrResetting,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "result", rename_all = "snake_case")]
pub enum DfuRecoveryOutcome {
    Verified,
    Cancelled,
    ResetUnconfirmed,
    Failed { reason: String },
    UnsupportedBootloaderInstallationPath { guidance: String },
}

// ── Unified terminal outcome (wraps path-specific outcomes) ──

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "path", rename_all = "snake_case")]
pub enum FirmwareOutcome {
    FirmwareInstallUpdate { outcome: SerialFlashOutcome },
    BootloaderInstallation { outcome: DfuRecoveryOutcome },
}

pub type FirmwareInstallUpdatePhase = SerialFlashPhase;
pub type FirmwareInstallUpdateOutcome = SerialFlashOutcome;
pub type FirmwareInstallUpdateSource = SerialFlashSource;
pub type FirmwareInstallUpdateOptions = SerialFlashOptions;
pub type FirmwareInstallUpdateResult = SerialFlowResult;
pub type BootloaderInstallationPhase = DfuRecoveryPhase;
pub type BootloaderInstallationOutcome = DfuRecoveryOutcome;
pub type BootloaderInstallationSource = DfuRecoverySource;

// ── Firmware source (path-specific: catalog + local_apj for serial, local_bin for DFU) ──

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum FirmwareSource {
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

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Serialize)]
pub struct SerialBoardIdentity {
    pub board_id: u32,
    pub bootloader_rev: u8,
    pub flash_size: u32,
    pub board_name: String,
    pub port: String,
}

// ── DFU recovery identity (detected during DFU-path device enumeration) ──

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Serialize)]
pub struct DfuRecoveryIdentity {
    pub vendor_id: u16,
    pub product_id: u16,
    pub device_label: String,
    pub unique_id: String,
}

// ── Action-required prompts (firmware flow pauses for user decision) ──

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ActionRequired {
    /// Serial path: prompt user to back up parameters before disconnect + flash.
    ConfirmParameterBackup,
    /// Serial path: board detected, user must confirm destructive erase + flash.
    ConfirmSerialFlash {
        board: SerialBoardIdentity,
        source: FirmwareSource,
    },
    /// Bootloader installation path: user must explicitly confirm recovery-mode flash (stronger warning).
    ConfirmBootloaderInstallation { device: DfuRecoveryIdentity },
    /// DFU path (Windows): driver not installed, show guidance.
    InstallUsbDriver { guidance: String },
}

// ── Progress snapshot ──

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Serialize)]
pub struct FirmwareProgress {
    pub phase_label: String,
    pub bytes_written: u64,
    pub bytes_total: u64,
    pub pct: f32,
}

// ── Port inventory (firmware-specific, separate from connection dropdown) ──

/// Structured serial/USB port metadata for firmware device discovery.
#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct PortInfo {
    pub port_name: String,
    pub vid: Option<u16>,
    pub pid: Option<u16>,
    pub serial_number: Option<String>,
    pub manufacturer: Option<String>,
    pub product: Option<String>,
    pub location: Option<String>,
}

/// Result of a firmware port inventory scan.
#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum InventoryResult {
    /// Desktop: structured port list with USB metadata.
    Available { ports: Vec<PortInfo> },
    /// Android/unsupported: typed refusal, not fake data.
    Unsupported,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DfuDeviceInfo {
    pub vid: u16,
    pub pid: u16,
    pub unique_id: String,
    pub serial_number: Option<String>,
    pub manufacturer: Option<String>,
    pub product: Option<String>,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum DfuScanResult {
    Available { devices: Vec<DfuDeviceInfo> },
    Unsupported,
}

// ── Catalog entry (normalized from ArduPilot manifest) ──

/// A normalized firmware catalog entry from the official ArduPilot manifest.
#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Serialize)]
pub struct CatalogEntry {
    pub board_id: u32,
    pub platform: String,
    pub vehicle_type: String,
    pub version: String,
    pub version_type: String,
    pub format: String,
    pub url: String,
    pub image_size: u64,
    pub latest: bool,
    pub git_sha: String,
    pub brand_name: Option<String>,
    pub manufacturer: Option<String>,
}

// ── Catalog target summary (grouped for recovery-mode manual board selection) ──

/// A grouped recovery target keyed by `board_id + platform`.
/// Contains enough fields for a manual board selector in recovery mode.
#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Serialize)]
pub struct CatalogTargetSummary {
    pub board_id: u32,
    pub platform: String,
    pub brand_name: Option<String>,
    pub manufacturer: Option<String>,
    pub vehicle_types: Vec<String>,
    pub latest_version: Option<String>,
}

// ── Serial preflight info (returned by the preflight command before flashing) ──

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Serialize)]
pub struct SerialPreflightInfo {
    pub vehicle_connected: bool,
    pub param_count: u32,
    pub has_params_to_backup: bool,
    pub available_ports: Vec<PortInfo>,
    pub session_ready: bool,
    pub session_status: FirmwareSessionStatus,
}

// ── Serial flash source (command-level: what the frontend sends) ──

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum SerialFlashSource {
    CatalogUrl { url: String },
    LocalApjBytes { data: Vec<u8> },
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SerialFlashOptions {
    pub full_chip_erase: bool,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SerialReadinessRequest {
    pub port: String,
    pub source: SerialFlashSource,
    pub options: Option<SerialFlashOptions>,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum SerialReadiness {
    Advisory,
    Blocked {
        reason: SerialReadinessBlockedReason,
    },
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Serialize)]
pub struct SerialReadinessResponse {
    pub request_token: String,
    pub session_status: FirmwareSessionStatus,
    pub readiness: SerialReadiness,
    pub bootloader_status: FirmwareInstallBootloaderStatus,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum FirmwareInstallBootloaderStatus {
    AlreadyInBootloader,
    NotInBootloader { can_reboot: bool },
    Unknown,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SerialReadinessBlockedReason {
    SessionBusy,
    PortUnselected,
    PortUnavailable,
    SourceMissing,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Serialize)]
pub struct FirmwareBootloaderBoardInfo {
    pub port: String,
    pub board_id: u32,
    pub board_rev: u32,
    pub bootloader_rev: u8,
    pub flash_size: u32,
    pub extf_size: Option<u32>,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "result", rename_all = "snake_case")]
pub enum FirmwareRebootToBootloaderResult {
    Requested,
    Unsupported { reason: String },
    Failed { error: String },
}

// ── DFU recovery source (command-level: what the frontend sends) ──

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum DfuRecoverySource {
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
#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "result", rename_all = "snake_case")]
pub enum SerialFlowResult {
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
    pub fn to_outcome(&self) -> SerialFlashOutcome {
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

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum FirmwareError {
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

#[cfg(feature = "dfu-core")]
impl From<dfu_core::Error> for FirmwareError {
    fn from(e: dfu_core::Error) -> Self {
        Self::ProtocolError {
            detail: e.to_string(),
        }
    }
}

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
    FirmwareInstallUpdate { phase: SerialFlashPhase },
    BootloaderInstallation { phase: DfuRecoveryPhase },
    Cancelling { path: FirmwareSessionPath },
    Completed { outcome: FirmwareOutcome },
}

#[derive(Clone)]
pub struct FirmwareSessionHandle {
    state: std::sync::Arc<std::sync::Mutex<SessionState>>,
}

impl FirmwareSessionHandle {
    pub fn new() -> Self {
        Self {
            state: std::sync::Arc::new(std::sync::Mutex::new(SessionState::Idle)),
        }
    }

    /// Attempt to start a firmware install/update session.
    /// Accepts connected state; command-level readiness/reboot controls decide whether start is safe.
    /// Fails only if another firmware session is already active.
    pub fn try_start_firmware_install_update(&self) -> Result<(), FirmwareError> {
        let mut guard = self.state.lock().unwrap_or_else(|e| e.into_inner());
        match *guard {
            SessionState::Idle => {
                *guard = SessionState::FirmwareInstallUpdate {
                    phase: SerialFlashPhase::Idle,
                };
                Ok(())
            }
            SessionState::Completed { .. } => {
                *guard = SessionState::FirmwareInstallUpdate {
                    phase: SerialFlashPhase::Idle,
                };
                Ok(())
            }
            SessionState::FirmwareInstallUpdate { .. } => Err(FirmwareError::SessionBusy {
                current_session: FIRMWARE_INSTALL_UPDATE_PATH.into(),
            }),
            SessionState::BootloaderInstallation { .. } => Err(FirmwareError::SessionBusy {
                current_session: BOOTLOADER_INSTALLATION_PATH.into(),
            }),
            SessionState::Cancelling { .. } => Err(FirmwareError::SessionBusy {
                current_session: "cancelling".into(),
            }),
        }
    }

    /// Attempt to start a bootloader installation session.
    /// Fails if a vehicle is connected or another firmware session is active.
    pub fn try_start_bootloader_installation(
        &self,
        vehicle_connected: bool,
    ) -> Result<(), FirmwareError> {
        if vehicle_connected {
            return Err(FirmwareError::VehicleConnected);
        }
        let mut guard = self.state.lock().unwrap_or_else(|e| e.into_inner());
        match *guard {
            SessionState::Idle => {
                *guard = SessionState::BootloaderInstallation {
                    phase: DfuRecoveryPhase::Idle,
                };
                Ok(())
            }
            SessionState::Completed { .. } => {
                *guard = SessionState::BootloaderInstallation {
                    phase: DfuRecoveryPhase::Idle,
                };
                Ok(())
            }
            SessionState::FirmwareInstallUpdate { .. } => Err(FirmwareError::SessionBusy {
                current_session: FIRMWARE_INSTALL_UPDATE_PATH.into(),
            }),
            SessionState::BootloaderInstallation { .. } => Err(FirmwareError::SessionBusy {
                current_session: BOOTLOADER_INSTALLATION_PATH.into(),
            }),
            SessionState::Cancelling { .. } => Err(FirmwareError::SessionBusy {
                current_session: "cancelling".into(),
            }),
        }
    }

    /// Mark the session as cancelling while async task shutdown is in progress.
    pub fn mark_cancelling(&self) {
        let mut guard = self.state.lock().unwrap_or_else(|e| e.into_inner());
        match *guard {
            SessionState::FirmwareInstallUpdate { .. } => {
                *guard = SessionState::Cancelling {
                    path: FirmwareSessionPath::FirmwareInstallUpdate,
                };
            }
            SessionState::BootloaderInstallation { .. } => {
                *guard = SessionState::Cancelling {
                    path: FirmwareSessionPath::BootloaderInstallation,
                };
            }
            SessionState::Idle
            | SessionState::Cancelling { .. }
            | SessionState::Completed { .. } => {}
        }
    }

    /// Record the terminal outcome so polling can report it honestly.
    pub fn complete(&self, outcome: FirmwareOutcome) {
        let mut guard = self.state.lock().unwrap_or_else(|e| e.into_inner());
        *guard = SessionState::Completed { outcome };
    }

    /// Clear a completed session back to idle without disturbing active work.
    pub fn clear_completed(&self) {
        let mut guard = self.state.lock().unwrap_or_else(|e| e.into_inner());
        if matches!(*guard, SessionState::Completed { .. }) {
            *guard = SessionState::Idle;
        }
    }

    /// Update the current firmware install/update phase while flashing is active.
    pub fn set_firmware_install_update_phase(&self, phase: SerialFlashPhase) {
        let mut guard = self.state.lock().unwrap_or_else(|e| e.into_inner());
        if matches!(*guard, SessionState::FirmwareInstallUpdate { .. }) {
            *guard = SessionState::FirmwareInstallUpdate { phase };
        }
    }

    /// Update the current bootloader installation phase while recovery is active.
    pub fn set_bootloader_installation_phase(&self, phase: DfuRecoveryPhase) {
        let mut guard = self.state.lock().unwrap_or_else(|e| e.into_inner());
        if matches!(*guard, SessionState::BootloaderInstallation { .. }) {
            *guard = SessionState::BootloaderInstallation { phase };
        }
    }

    /// Stop the current firmware session, returning to idle.
    pub fn stop(&self) {
        let mut guard = self.state.lock().unwrap_or_else(|e| e.into_inner());
        *guard = SessionState::Idle;
    }

    /// Get the current session status.
    pub fn status(&self) -> FirmwareSessionStatus {
        let guard = self.state.lock().unwrap_or_else(|e| e.into_inner());
        match *guard {
            SessionState::Idle => FirmwareSessionStatus::Idle,
            SessionState::FirmwareInstallUpdate { phase } => {
                FirmwareSessionStatus::FirmwareInstallUpdate { phase }
            }
            SessionState::BootloaderInstallation { phase } => {
                FirmwareSessionStatus::BootloaderInstallation { phase }
            }
            SessionState::Cancelling { path } => FirmwareSessionStatus::Cancelling { path },
            SessionState::Completed { ref outcome } => FirmwareSessionStatus::Completed {
                outcome: outcome.clone(),
            },
        }
    }
}

impl Default for FirmwareSessionHandle {
    fn default() -> Self {
        Self::new()
    }
}

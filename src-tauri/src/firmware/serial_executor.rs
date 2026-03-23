use crate::firmware::artifact::SerialArtifact;
use crate::firmware::serial_uploader::{self, BootloaderInfo, SerialIo, SerialReadError};
use crate::firmware::types::{
    FirmwareError, PortInfo, SerialBoardIdentity, SerialFlashOptions, SerialFlowResult,
};

// ── Trait for external dependencies (testable seam) ──

pub(crate) trait SerialFlowDeps {
    fn list_ports(&self) -> Vec<PortInfo>;
    fn open_serial(&self, port: &str, baud: u32) -> Result<Box<dyn SerialIo>, FirmwareError>;
    fn sleep_ms(&self, ms: u64);
    fn try_reconnect(&self, port: &str, baud: u32) -> Result<(), FirmwareError>;
}

// ── Preflight snapshot (captured while vehicle is still connected) ──

#[derive(Debug, Clone)]
pub(crate) struct PreflightSnapshot {
    pub(crate) port: String,
    pub(crate) baud: u32,
    pub(crate) ports_before: Vec<PortInfo>,
}

// ── Serial flow executor ──

const BOOTLOADER_DETECT_DELAY_MS: u64 = 2000;
const BOOTLOADER_DETECT_RETRIES: usize = 5;
const RECONNECT_ATTEMPTS: usize = 10;
const RECONNECT_DELAY_MS: u64 = 2000;
const BOOTLOADER_BAUD: u32 = 115200;

#[derive(Debug, Clone)]
struct BootloaderCandidate {
    port: PortInfo,
    observed_transition: bool,
}

enum ProbeBootloaderError {
    TransitionWindow(FirmwareError),
    Fatal(FirmwareError),
}

enum DeferredFatalError {
    ObservedTransition(FirmwareError),
    SelectedPortFallback(FirmwareError),
}

fn candidate_bootloader_ports(
    deps: &dyn SerialFlowDeps,
    preflight: &PreflightSnapshot,
) -> Vec<BootloaderCandidate> {
    let ports_after = deps.list_ports();
    let mut candidates: Vec<BootloaderCandidate> = Vec::new();

    for candidate in
        crate::firmware::discovery::detect_bootloader_port(&preflight.ports_before, &ports_after)
    {
        if let Some(existing) = candidates
            .iter_mut()
            .find(|existing| existing.port.port_name == candidate.port_name)
        {
            existing.observed_transition = true;
        } else {
            candidates.push(BootloaderCandidate {
                port: candidate.clone(),
                observed_transition: true,
            });
        }
    }

    if let Some(selected_port) = ports_after
        .iter()
        .find(|port| port.port_name == preflight.port)
        && !candidates
            .iter()
            .any(|candidate| candidate.port.port_name == selected_port.port_name)
    {
        candidates.push(BootloaderCandidate {
            port: selected_port.clone(),
            observed_transition: false,
        });
    }

    candidates
}

fn retryable_transition_error(error: &FirmwareError, _observed_transition: bool) -> bool {
    match error {
        FirmwareError::PortNotFound => true,
        FirmwareError::Timeout { .. } => true,
        FirmwareError::PortOpenTransient { .. } => true,
        FirmwareError::IoTransient { .. } => true,
        FirmwareError::BootloaderSyncMismatch { .. } => true,
        FirmwareError::Cancelled => false,
        _ => false,
    }
}

fn is_cancelled_error(error: &FirmwareError) -> bool {
    matches!(error, FirmwareError::Cancelled)
}

fn probe_bootloader_candidates(
    deps: &dyn SerialFlowDeps,
    preflight: &PreflightSnapshot,
    is_cancelled: &dyn Fn() -> bool,
) -> Result<(PortInfo, Box<dyn SerialIo>, BootloaderInfo), ProbeBootloaderError> {
    let mut last_transition_error = None;

    for attempt in 0..BOOTLOADER_DETECT_RETRIES {
        let mut deferred_fatal_error = None;
        check_cancel(is_cancelled).map_err(ProbeBootloaderError::Fatal)?;
        if attempt > 0 {
            deps.sleep_ms(BOOTLOADER_DETECT_DELAY_MS);
        }
        check_cancel(is_cancelled).map_err(ProbeBootloaderError::Fatal)?;
        let candidates = candidate_bootloader_ports(deps, preflight);
        if candidates.is_empty() {
            continue;
        }

        let has_transition_candidate = candidates
            .iter()
            .any(|candidate| candidate.observed_transition);

        for candidate in candidates {
            match try_probe_on_port(deps, &candidate.port, is_cancelled) {
                Ok((io, info)) => return Ok((candidate.port, io, info)),
                Err(error) if retryable_transition_error(&error, candidate.observed_transition) => {
                    last_transition_error = Some(error);
                    continue;
                }
                Err(error) if candidate.observed_transition => {
                    if deferred_fatal_error.is_none() {
                        deferred_fatal_error = Some(DeferredFatalError::ObservedTransition(error));
                    }
                    continue;
                }
                Err(error) if !candidate.observed_transition && has_transition_candidate => {
                    deferred_fatal_error = Some(DeferredFatalError::SelectedPortFallback(error));
                    continue;
                }
                Err(error) => return Err(ProbeBootloaderError::Fatal(error)),
            }
        }

        if let Some(error) = deferred_fatal_error {
            match error {
                DeferredFatalError::ObservedTransition(error) => {
                    return Err(ProbeBootloaderError::Fatal(error));
                }
                DeferredFatalError::SelectedPortFallback(error) => {
                    last_transition_error = Some(error);
                }
            }
        }
    }

    Err(ProbeBootloaderError::TransitionWindow(
        last_transition_error.unwrap_or(FirmwareError::PortNotFound),
    ))
}

fn try_probe_on_port(
    deps: &dyn SerialFlowDeps,
    bootloader_port: &PortInfo,
    is_cancelled: &dyn Fn() -> bool,
) -> Result<(Box<dyn SerialIo>, BootloaderInfo), FirmwareError> {
    let mut io = deps.open_serial(&bootloader_port.port_name, BOOTLOADER_BAUD)?;
    check_cancel(is_cancelled)?;
    let info = serial_uploader::probe_for_detection_with_cancel(io.as_mut(), is_cancelled)?;
    Ok((io, info))
}

fn upload_on_confirmed_bootloader_port(
    mut io: Box<dyn SerialIo>,
    info: &BootloaderInfo,
    artifact: &SerialArtifact,
    options: &SerialFlashOptions,
    is_cancelled: &dyn Fn() -> bool,
    on_progress: &mut impl FnMut(&str, usize, usize),
) -> Result<BootloaderInfo, FirmwareError> {
    check_cancel(is_cancelled)?;
    serial_uploader::upload_after_probe(
        io.as_mut(),
        info,
        artifact,
        options,
        is_cancelled,
        on_progress,
    )?;
    Ok(info.clone())
}

fn map_upload_error(error: FirmwareError) -> SerialFlowResult {
    match error {
        FirmwareError::ExtfCapacityInsufficient { .. } => {
            SerialFlowResult::ExtfCapacityInsufficient {
                reason: error.to_string(),
            }
        }
        FirmwareError::Cancelled => SerialFlowResult::Cancelled,
        other => SerialFlowResult::Failed {
            reason: other.to_string(),
        },
    }
}

pub(crate) fn execute_serial_flash(
    deps: &dyn SerialFlowDeps,
    preflight: &PreflightSnapshot,
    artifact: &SerialArtifact,
    is_cancelled: &dyn Fn() -> bool,
    on_progress: impl FnMut(&str, usize, usize),
) -> SerialFlowResult {
    execute_serial_flash_with_options(
        deps,
        preflight,
        artifact,
        &SerialFlashOptions {
            full_chip_erase: false,
        },
        is_cancelled,
        on_progress,
    )
}

pub(crate) fn execute_serial_flash_with_options(
    deps: &dyn SerialFlowDeps,
    preflight: &PreflightSnapshot,
    artifact: &SerialArtifact,
    options: &SerialFlashOptions,
    is_cancelled: &dyn Fn() -> bool,
    mut on_progress: impl FnMut(&str, usize, usize),
) -> SerialFlowResult {
    if let Err(e) = check_cancel(is_cancelled) {
        return if is_cancelled_error(&e) {
            SerialFlowResult::Cancelled
        } else {
            SerialFlowResult::Failed {
                reason: e.to_string(),
            }
        };
    }

    let (_bootloader_port, bootloader_io, info) =
        match probe_bootloader_candidates(deps, preflight, is_cancelled) {
            Ok(value) => value,
            Err(ProbeBootloaderError::Fatal(error)) if is_cancelled_error(&error) => {
                return SerialFlowResult::Cancelled;
            }
            Err(ProbeBootloaderError::TransitionWindow(error)) => {
                return SerialFlowResult::BoardDetectionFailed {
                    reason: error.to_string(),
                };
            }
            Err(ProbeBootloaderError::Fatal(error)) => return map_upload_error(error),
        };

    let info = match upload_on_confirmed_bootloader_port(
        bootloader_io,
        &info,
        artifact,
        options,
        is_cancelled,
        &mut on_progress,
    ) {
        Ok(info) => info,
        Err(error) if is_cancelled_error(&error) => {
            return SerialFlowResult::Cancelled;
        }
        Err(error) => return map_upload_error(error),
    };

    let flash_verified = info.bl_rev >= 3;

    // Step 4: Attempt bounded reconnect verification
    let reconnect_port = &preflight.port;
    let reconnect_result =
        try_bounded_reconnect(deps, reconnect_port, preflight.baud, is_cancelled);

    match reconnect_result {
        Ok(()) => SerialFlowResult::ReconnectVerified {
            board_id: info.board_id,
            bootloader_rev: info.bl_rev,
            flash_verified,
        },
        Err(error) if is_cancelled_error(&error) => SerialFlowResult::Cancelled,
        Err(error) => SerialFlowResult::ReconnectFailed {
            board_id: info.board_id,
            bootloader_rev: info.bl_rev,
            flash_verified,
            reconnect_error: error.to_string(),
        },
    }
}

fn try_bounded_reconnect(
    deps: &dyn SerialFlowDeps,
    port: &str,
    baud: u32,
    is_cancelled: &dyn Fn() -> bool,
) -> Result<(), FirmwareError> {
    for attempt in 0..RECONNECT_ATTEMPTS {
        check_cancel(is_cancelled)?;
        if attempt > 0 {
            deps.sleep_ms(RECONNECT_DELAY_MS);
        }
        match deps.try_reconnect(port, baud) {
            Ok(()) => return Ok(()),
            Err(_) if attempt < RECONNECT_ATTEMPTS - 1 => continue,
            Err(e) => return Err(e),
        }
    }
    Err(FirmwareError::ProtocolError {
        detail: "reconnect attempts exhausted".into(),
    })
}

fn check_cancel(is_cancelled: &dyn Fn() -> bool) -> Result<(), FirmwareError> {
    if is_cancelled() {
        return Err(FirmwareError::Cancelled);
    }
    Ok(())
}

pub(crate) fn build_board_identity(info: &BootloaderInfo, port: &str) -> SerialBoardIdentity {
    SerialBoardIdentity {
        board_id: info.board_id,
        bootloader_rev: info.bl_rev,
        flash_size: info.flash_size,
        board_name: format!("board_{}", info.board_id),
        port: port.to_string(),
    }
}

// ── Production deps (desktop only) ──

#[cfg(not(target_os = "android"))]
pub(crate) struct RealSerialDeps;

#[cfg(not(target_os = "android"))]
impl RealSerialDeps {
    fn classify_serial_io_kind(&self, detail: String, kind: std::io::ErrorKind) -> FirmwareError {
        match kind {
            std::io::ErrorKind::TimedOut
            | std::io::ErrorKind::WouldBlock
            | std::io::ErrorKind::BrokenPipe
            | std::io::ErrorKind::NotConnected
            | std::io::ErrorKind::ConnectionAborted
            | std::io::ErrorKind::ConnectionReset
            | std::io::ErrorKind::UnexpectedEof => FirmwareError::IoTransient { detail },
            _ => FirmwareError::ProtocolError { detail },
        }
    }

    fn list_ports_inner(&self) -> Vec<PortInfo> {
        match crate::firmware::discovery::list_firmware_ports() {
            crate::firmware::types::InventoryResult::Available { ports } => ports,
            _ => vec![],
        }
    }

    fn classify_port_open_error(&self, port: &str, error: serialport::Error) -> FirmwareError {
        let detail = format!("open serial port {port}: {error}");
        match error.kind() {
            serialport::ErrorKind::NoDevice => FirmwareError::PortNotFound,
            serialport::ErrorKind::Io(std::io::ErrorKind::PermissionDenied) => {
                FirmwareError::PortOpenFailed { detail }
            }
            serialport::ErrorKind::Io(
                std::io::ErrorKind::TimedOut
                | std::io::ErrorKind::WouldBlock
                | std::io::ErrorKind::BrokenPipe
                | std::io::ErrorKind::NotConnected
                | std::io::ErrorKind::ConnectionAborted
                | std::io::ErrorKind::ConnectionReset
                | std::io::ErrorKind::UnexpectedEof,
            ) => FirmwareError::PortOpenTransient { detail },
            _ => FirmwareError::PortOpenFailed { detail },
        }
    }
}

#[cfg(not(target_os = "android"))]
struct RealSerialPort {
    port: Box<dyn serialport::SerialPort>,
}

#[cfg(not(target_os = "android"))]
impl SerialIo for RealSerialPort {
    fn write_all(&mut self, data: &[u8]) -> Result<(), FirmwareError> {
        std::io::Write::write_all(&mut self.port, data).map_err(|error| {
            RealSerialDeps.classify_serial_io_kind(format!("serial write: {error}"), error.kind())
        })
    }

    fn read(&mut self, buf: &mut [u8]) -> Result<usize, SerialReadError> {
        std::io::Read::read(&mut self.port, buf).map_err(|e| match e.kind() {
            std::io::ErrorKind::TimedOut | std::io::ErrorKind::WouldBlock => {
                SerialReadError::Timeout
            }
            std::io::ErrorKind::BrokenPipe
            | std::io::ErrorKind::NotConnected
            | std::io::ErrorKind::ConnectionAborted
            | std::io::ErrorKind::ConnectionReset
            | std::io::ErrorKind::UnexpectedEof => {
                SerialReadError::Other(FirmwareError::IoTransient {
                    detail: format!("serial read: {e}"),
                })
            }
            _ => SerialReadError::Other(FirmwareError::ProtocolError {
                detail: format!("serial read: {e}"),
            }),
        })
    }

    fn flush_input(&mut self) -> Result<(), FirmwareError> {
        self.port
            .clear(serialport::ClearBuffer::Input)
            .map_err(|error| {
                let detail = format!("serial flush: {error}");
                match error.kind() {
                    serialport::ErrorKind::Io(kind) => {
                        RealSerialDeps.classify_serial_io_kind(detail, kind)
                    }
                    _ => FirmwareError::ProtocolError { detail },
                }
            })
    }
}

#[cfg(not(target_os = "android"))]
impl SerialFlowDeps for RealSerialDeps {
    fn list_ports(&self) -> Vec<PortInfo> {
        self.list_ports_inner()
    }

    fn open_serial(&self, port: &str, baud: u32) -> Result<Box<dyn SerialIo>, FirmwareError> {
        let sp = serialport::new(port, baud)
            .timeout(std::time::Duration::from_secs(5))
            .open()
            .map_err(|e| self.classify_port_open_error(port, e))?;
        Ok(Box::new(RealSerialPort { port: sp }))
    }

    fn sleep_ms(&self, ms: u64) {
        std::thread::sleep(std::time::Duration::from_millis(ms));
    }

    fn try_reconnect(&self, port: &str, baud: u32) -> Result<(), FirmwareError> {
        let sp = serialport::new(port, baud)
            .timeout(std::time::Duration::from_secs(2))
            .open()
            .map_err(|e| self.classify_port_open_error(port, e))?;
        drop(sp);
        Ok(())
    }
}

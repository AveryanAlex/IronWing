use crate::firmware::artifact::SerialArtifact;
use crate::firmware::serial_uploader::{self, BootloaderInfo, SerialIo, SerialReadError};
use crate::firmware::types::{
    FirmwareError, PortInfo, SerialBoardIdentity, SerialFlashOptions, SerialFlowResult,
};
use std::cmp::Reverse;

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
    source: BootloaderCandidateSource,
    selected_port_fallback: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum BootloaderCandidateSource {
    ObservedTransition,
    PostRebootBootloaderLike,
    SelectedPortFallback,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum BootloaderCandidatePriority {
    SelectedPortFallback,
    PostRebootBootloaderLike,
    ObservedTransition,
}

impl BootloaderCandidateSource {
    fn priority(self) -> BootloaderCandidatePriority {
        match self {
            Self::SelectedPortFallback => BootloaderCandidatePriority::SelectedPortFallback,
            Self::PostRebootBootloaderLike => BootloaderCandidatePriority::PostRebootBootloaderLike,
            Self::ObservedTransition => BootloaderCandidatePriority::ObservedTransition,
        }
    }

    fn is_post_reboot_bootloader_like(self) -> bool {
        matches!(self, Self::PostRebootBootloaderLike)
    }

    fn is_selected_port_fallback(self) -> bool {
        matches!(self, Self::SelectedPortFallback)
    }

    fn suppresses_selected_port_fallback(self) -> bool {
        matches!(self, Self::ObservedTransition)
    }
}

impl BootloaderCandidate {
    fn new(port: &PortInfo, source: BootloaderCandidateSource) -> Self {
        Self {
            port: port.clone(),
            source,
            selected_port_fallback: source.is_selected_port_fallback(),
        }
    }

    fn register_source(&mut self, port: &PortInfo, source: BootloaderCandidateSource) {
        if source.priority() > self.source.priority() {
            self.port = port.clone();
            self.source = source;
        }

        if source.is_selected_port_fallback() {
            self.selected_port_fallback = true;
        }
    }

    fn fatal_error_source(&self) -> Option<BootloaderCandidateSource> {
        if self.source.suppresses_selected_port_fallback() {
            Some(BootloaderCandidateSource::ObservedTransition)
        } else if self.selected_port_fallback {
            Some(BootloaderCandidateSource::SelectedPortFallback)
        } else {
            None
        }
    }

    fn detection_outcome_source(&self) -> BootloaderCandidateSource {
        self.fatal_error_source().unwrap_or(self.source)
    }
}

enum ProbeBootloaderError {
    TransitionWindow(FirmwareError),
    Fatal(FirmwareError),
}

enum DeferredFatalError {
    ObservedTransition(FirmwareError),
}

struct DetectionOutcomeError {
    source: BootloaderCandidateSource,
    error: FirmwareError,
}

fn push_bootloader_candidate(
    candidates: &mut Vec<BootloaderCandidate>,
    port: &PortInfo,
    source: BootloaderCandidateSource,
) {
    if let Some(existing) = candidates
        .iter_mut()
        .find(|candidate| candidate.port.port_name == port.port_name)
    {
        existing.register_source(port, source);
        return;
    }

    candidates.push(BootloaderCandidate::new(port, source));
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
        push_bootloader_candidate(
            &mut candidates,
            candidate,
            BootloaderCandidateSource::ObservedTransition,
        );
    }

    for candidate in ports_after
        .iter()
        .filter(|port| crate::firmware::discovery::is_bootloader_candidate_port(port))
    {
        push_bootloader_candidate(
            &mut candidates,
            candidate,
            BootloaderCandidateSource::PostRebootBootloaderLike,
        );
    }

    if let Some(selected_port) = ports_after
        .iter()
        .find(|port| port.port_name == preflight.port)
    {
        push_bootloader_candidate(
            &mut candidates,
            selected_port,
            BootloaderCandidateSource::SelectedPortFallback,
        );
    }

    candidates.sort_by_key(|candidate| Reverse(candidate.source.priority()));

    candidates
}

fn record_detection_error(
    last_error: &mut Option<DetectionOutcomeError>,
    source: BootloaderCandidateSource,
    error: FirmwareError,
) {
    if last_error
        .as_ref()
        .is_some_and(|existing| existing.source.priority() > source.priority())
    {
        return;
    }

    *last_error = Some(DetectionOutcomeError { source, error });
}

fn retryable_detection_error(error: &FirmwareError) -> bool {
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
    artifact: &SerialArtifact,
    is_cancelled: &dyn Fn() -> bool,
) -> Result<(PortInfo, Box<dyn SerialIo>, BootloaderInfo), ProbeBootloaderError> {
    let mut last_detection_error = None;

    for attempt in 0..BOOTLOADER_DETECT_RETRIES {
        let mut deferred_fatal_error = None;
        let mut observed_transition_outcome_seen = false;
        check_cancel(is_cancelled).map_err(ProbeBootloaderError::Fatal)?;
        if attempt > 0 {
            deps.sleep_ms(BOOTLOADER_DETECT_DELAY_MS);
        }
        check_cancel(is_cancelled).map_err(ProbeBootloaderError::Fatal)?;
        let candidates = candidate_bootloader_ports(deps, preflight);
        if candidates.is_empty() {
            continue;
        }

        for candidate in candidates {
            match try_probe_on_port(deps, &candidate.port, is_cancelled) {
                Ok((io, info)) => match serial_uploader::validate_board(artifact, &info) {
                    Ok(()) => return Ok((candidate.port, io, info)),
                    Err(error @ FirmwareError::BoardMismatch { .. }) => {
                        if candidate.source.suppresses_selected_port_fallback() {
                            observed_transition_outcome_seen = true;
                        }
                        record_detection_error(
                            &mut last_detection_error,
                            candidate.detection_outcome_source(),
                            error,
                        );
                        continue;
                    }
                    Err(error) => return Err(ProbeBootloaderError::Fatal(error)),
                },
                Err(error) if retryable_detection_error(&error) => {
                    if candidate.source.suppresses_selected_port_fallback() {
                        observed_transition_outcome_seen = true;
                    }
                    record_detection_error(
                        &mut last_detection_error,
                        candidate.detection_outcome_source(),
                        error,
                    );
                    continue;
                }
                Err(error) => match candidate.fatal_error_source() {
                    None => continue,
                    Some(source) if source.suppresses_selected_port_fallback() => {
                        observed_transition_outcome_seen = true;
                        if deferred_fatal_error.is_none() {
                            deferred_fatal_error =
                                Some(DeferredFatalError::ObservedTransition(error));
                        }
                        continue;
                    }
                    Some(_) if observed_transition_outcome_seen => {
                        record_detection_error(
                            &mut last_detection_error,
                            candidate.detection_outcome_source(),
                            error,
                        );
                        continue;
                    }
                    Some(_) => return Err(ProbeBootloaderError::Fatal(error)),
                },
            }
        }

        if let Some(error) = deferred_fatal_error {
            match error {
                DeferredFatalError::ObservedTransition(error) => {
                    return Err(ProbeBootloaderError::Fatal(error));
                }
            }
        }
    }

    Err(ProbeBootloaderError::TransitionWindow(
        last_detection_error
            .map(|outcome| outcome.error)
            .unwrap_or(FirmwareError::PortNotFound),
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
        match probe_bootloader_candidates(deps, preflight, artifact, is_cancelled) {
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

#[cfg(test)]
mod tests {
    use super::*;

    struct StaticPortDeps {
        ports: Vec<PortInfo>,
    }

    impl SerialFlowDeps for StaticPortDeps {
        fn list_ports(&self) -> Vec<PortInfo> {
            self.ports.clone()
        }

        fn open_serial(&self, _port: &str, _baud: u32) -> Result<Box<dyn SerialIo>, FirmwareError> {
            unreachable!("candidate list tests should not open serial ports")
        }

        fn sleep_ms(&self, _ms: u64) {}

        fn try_reconnect(&self, _port: &str, _baud: u32) -> Result<(), FirmwareError> {
            unreachable!("candidate list tests should not reconnect")
        }
    }

    fn make_normal_port(port_name: &str) -> PortInfo {
        PortInfo {
            port_name: port_name.into(),
            vid: Some(0x2DAE),
            pid: Some(0x1058),
            serial_number: Some("APP123".into()),
            manufacturer: Some("CubePilot".into()),
            product: Some("CubeOrange".into()),
            location: None,
        }
    }

    fn make_bootloader_port(port_name: &str) -> PortInfo {
        PortInfo {
            port_name: port_name.into(),
            vid: Some(0x2DAE),
            pid: Some(0x1059),
            serial_number: Some("BL123".into()),
            manufacturer: Some("CubePilot".into()),
            product: Some("Cube Bootloader".into()),
            location: None,
        }
    }

    #[test]
    fn candidate_bootloader_ports_keeps_strongest_source_for_same_port() {
        let selected_port = make_bootloader_port("/dev/ttyACM0");
        let deps = StaticPortDeps {
            ports: vec![selected_port.clone()],
        };
        let preflight = PreflightSnapshot {
            port: selected_port.port_name.clone(),
            baud: 57600,
            ports_before: vec![make_normal_port("/dev/ttyACM0")],
        };

        let candidates = candidate_bootloader_ports(&deps, &preflight);

        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].port.port_name, selected_port.port_name);
        assert_eq!(
            candidates[0].source,
            BootloaderCandidateSource::ObservedTransition,
            "a port that qualifies from multiple sources must retain the strongest explicit source"
        );
    }
}

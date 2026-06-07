use crate::artifact::SerialArtifact;
use crate::serial_uploader::{self, BootloaderInfo, SerialIo};
use crate::types::{
    FirmwareBootloaderBoardInfo, FirmwareError, PortInfo, SerialBoardIdentity, SerialFlashOptions,
    SerialFlowResult,
};

pub trait SerialFlowDeps {
    fn list_ports(&self) -> Vec<PortInfo>;
    fn open_serial(&self, port: &str, baud: u32) -> Result<Box<dyn SerialIo>, FirmwareError>;
    fn sleep_ms(&self, ms: u64);
    fn try_reconnect(&self, port: &str, baud: u32) -> Result<(), FirmwareError>;
}

#[derive(Debug, Clone)]
pub struct PreflightSnapshot {
    pub port: String,
    pub baud: u32,
    pub ports_before: Vec<PortInfo>,
}

const RECONNECT_ATTEMPTS: usize = 10;
const RECONNECT_DELAY_MS: u64 = 2000;
const BOOTLOADER_BAUD: u32 = 115200;

fn is_cancelled_error(error: &FirmwareError) -> bool {
    matches!(error, FirmwareError::Cancelled)
}

pub fn build_bootloader_board_info(
    port: &str,
    info: &BootloaderInfo,
) -> FirmwareBootloaderBoardInfo {
    FirmwareBootloaderBoardInfo {
        port: port.to_string(),
        board_id: info.board_id,
        board_rev: info.board_rev,
        bootloader_rev: info.bl_rev,
        flash_size: info.flash_size,
        extf_size: (info.extf_size > 0).then_some(info.extf_size),
    }
}

pub fn detect_bootloader_board(
    deps: &dyn SerialFlowDeps,
    port: &str,
    is_cancelled: &dyn Fn() -> bool,
) -> Result<(Box<dyn SerialIo>, BootloaderInfo), FirmwareError> {
    check_cancel(is_cancelled)?;
    let mut io = deps.open_serial(port, BOOTLOADER_BAUD)?;
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

pub fn execute_serial_flash(
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

pub fn execute_serial_flash_with_options(
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

    let (bootloader_io, info) = match detect_bootloader_board(deps, &preflight.port, is_cancelled)
        .and_then(|(io, info)| {
            serial_uploader::validate_board(artifact, &info)?;
            Ok((io, info))
        }) {
        Ok(value) => value,
        Err(error) if is_cancelled_error(&error) => return SerialFlowResult::Cancelled,
        Err(error) => {
            return SerialFlowResult::BoardDetectionFailed {
                reason: error.to_string(),
            };
        }
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
    let reconnect_result =
        try_bounded_reconnect(deps, &preflight.port, preflight.baud, is_cancelled);

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

pub fn build_board_identity(info: &BootloaderInfo, port: &str) -> SerialBoardIdentity {
    SerialBoardIdentity {
        board_id: info.board_id,
        bootloader_rev: info.bl_rev,
        flash_size: info.flash_size,
        board_name: format!("board_{}", info.board_id),
        port: port.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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

    struct FailingOpenDeps;

    impl SerialFlowDeps for FailingOpenDeps {
        fn list_ports(&self) -> Vec<PortInfo> {
            vec![make_bootloader_port("/dev/ttyACM0")]
        }

        fn open_serial(&self, _port: &str, _baud: u32) -> Result<Box<dyn SerialIo>, FirmwareError> {
            Err(FirmwareError::PortOpenTransient {
                detail: "busy".into(),
            })
        }

        fn sleep_ms(&self, _ms: u64) {}

        fn try_reconnect(&self, _port: &str, _baud: u32) -> Result<(), FirmwareError> {
            Ok(())
        }
    }

    #[test]
    fn retryable_probe_failures_report_board_detection_failure() {
        let artifact = SerialArtifact {
            board_id: 140,
            image: vec![1, 2, 3, 4],
            image_size: 4,
            summary: String::new(),
            extf: None,
        };
        let preflight = PreflightSnapshot {
            port: "/dev/ttyACM0".into(),
            baud: 115200,
            ports_before: vec![],
        };

        let result = execute_serial_flash(
            &FailingOpenDeps,
            &preflight,
            &artifact,
            &|| false,
            |_, _, _| {},
        );

        assert!(matches!(
            result,
            SerialFlowResult::BoardDetectionFailed { .. }
        ));
    }
}

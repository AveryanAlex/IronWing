use crate::firmware::artifact::SerialArtifact;
use crate::firmware::serial_uploader::{self, BootloaderInfo, SerialIo};
use crate::firmware::types::{FirmwareError, PortInfo, SerialBoardIdentity, SerialFlowResult};

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

pub(crate) fn poll_for_bootloader_port(
    deps: &dyn SerialFlowDeps,
    ports_before: &[PortInfo],
) -> Result<PortInfo, FirmwareError> {
    for _ in 0..BOOTLOADER_DETECT_RETRIES {
        deps.sleep_ms(BOOTLOADER_DETECT_DELAY_MS);
        let ports_after = deps.list_ports();
        let candidates =
            crate::firmware::discovery::detect_bootloader_port(ports_before, &ports_after);
        if let Some(port) = candidates.into_iter().next() {
            return Ok(port.clone());
        }
    }
    Err(FirmwareError::PortNotFound)
}

pub(crate) fn execute_serial_flash(
    deps: &dyn SerialFlowDeps,
    preflight: &PreflightSnapshot,
    artifact: &SerialArtifact,
    mut on_progress: impl FnMut(&str, usize, usize),
) -> SerialFlowResult {
    let bootloader_port = match poll_for_bootloader_port(deps, &preflight.ports_before) {
        Ok(port) => port,
        Err(e) => {
            return SerialFlowResult::BoardDetectionFailed {
                reason: e.to_string(),
            };
        }
    };

    let mut io = match deps.open_serial(&bootloader_port.port_name, BOOTLOADER_BAUD) {
        Ok(io) => io,
        Err(e) => {
            return SerialFlowResult::Failed {
                reason: format!("failed to open bootloader port: {e}"),
            };
        }
    };

    let info = match serial_uploader::upload(io.as_mut(), artifact, &mut on_progress) {
        Ok(info) => info,
        Err(e @ FirmwareError::ArtifactInvalid { .. })
            if e.to_string().contains("external-flash capacity") =>
        {
            return SerialFlowResult::ExtfCapacityInsufficient {
                reason: e.to_string(),
            };
        }
        Err(e) => {
            return SerialFlowResult::Failed {
                reason: e.to_string(),
            };
        }
    };

    let flash_verified = info.bl_rev >= 3;
    let port = bootloader_port.port_name.clone();

    // Step 4: Attempt bounded reconnect verification
    let reconnect_port = &preflight.port;
    let reconnect_result = try_bounded_reconnect(deps, reconnect_port, preflight.baud);

    match reconnect_result {
        Ok(()) => SerialFlowResult::ReconnectVerified {
            board_id: info.board_id,
            bootloader_rev: info.bl_rev,
            flash_verified,
        },
        Err(_) => {
            if flash_verified {
                SerialFlowResult::Verified {
                    board_id: info.board_id,
                    bootloader_rev: info.bl_rev,
                    port,
                }
            } else {
                SerialFlowResult::FlashedButUnverified {
                    board_id: info.board_id,
                    bootloader_rev: info.bl_rev,
                    port,
                }
            }
        }
    }
}

fn try_bounded_reconnect(
    deps: &dyn SerialFlowDeps,
    port: &str,
    baud: u32,
) -> Result<(), FirmwareError> {
    for attempt in 0..RECONNECT_ATTEMPTS {
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
    fn list_ports_inner(&self) -> Vec<PortInfo> {
        match crate::firmware::discovery::list_firmware_ports() {
            crate::firmware::types::InventoryResult::Available { ports } => ports,
            _ => vec![],
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
        std::io::Write::write_all(&mut self.port, data).map_err(|e| FirmwareError::ProtocolError {
            detail: format!("serial write: {e}"),
        })
    }

    fn read_exact(&mut self, buf: &mut [u8]) -> Result<(), FirmwareError> {
        std::io::Read::read_exact(&mut self.port, buf).map_err(|e| FirmwareError::ProtocolError {
            detail: format!("serial read (timeout): {e}"),
        })
    }

    fn flush_input(&mut self) -> Result<(), FirmwareError> {
        self.port
            .clear(serialport::ClearBuffer::Input)
            .map_err(|e| FirmwareError::ProtocolError {
                detail: format!("serial flush: {e}"),
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
            .map_err(|e| FirmwareError::ProtocolError {
                detail: format!("open serial port {port}: {e}"),
            })?;
        Ok(Box::new(RealSerialPort { port: sp }))
    }

    fn sleep_ms(&self, ms: u64) {
        std::thread::sleep(std::time::Duration::from_millis(ms));
    }

    fn try_reconnect(&self, port: &str, baud: u32) -> Result<(), FirmwareError> {
        let sp = serialport::new(port, baud)
            .timeout(std::time::Duration::from_secs(2))
            .open()
            .map_err(|e| FirmwareError::ProtocolError {
                detail: format!("reconnect open {port}: {e}"),
            })?;
        drop(sp);
        Ok(())
    }
}

use crate::firmware::serial_uploader::{SerialIo, SerialReadError};
use crate::firmware::types::{FirmwareError, InventoryResult, PortInfo};

pub(crate) use ironwing_firmware::serial_flow::{
    PreflightSnapshot, SerialFlowDeps, build_bootloader_board_info, detect_bootloader_board,
    execute_serial_flash_with_options,
};
#[cfg(test)]
pub(crate) use ironwing_firmware::serial_flow::{build_board_identity, execute_serial_flash};

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
            InventoryResult::Available { ports } => ports,
            InventoryResult::Unsupported => vec![],
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

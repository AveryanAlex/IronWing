use serde::Serialize;

#[cfg(not(target_os = "android"))]
use std::time::Duration;

use crate::firmware::types::{DfuDeviceInfo, DfuRecoveryOutcome, DfuRecoveryPhase, FirmwareError};

const STM32_DFU_VID: u16 = 0x0483;
const STM32_DFU_PID: u16 = 0xdf11;

// ── DFU USB access trait (mockable for tests) ──

pub(crate) trait DfuUsbAccess {
    fn open_device(&self, device: &DfuDeviceInfo) -> Result<(), FirmwareError>;

    fn download(
        &self,
        data: &[u8],
        progress: Box<dyn FnMut(usize, usize) + Send + '_>,
    ) -> Result<(), FirmwareError>;

    fn detach_and_reset(&self) -> Result<ResetDisposition, FirmwareError>;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ResetDisposition {
    Confirmed,
    Unconfirmed,
}

#[cfg(not(target_os = "android"))]
const RESET_CONFIRMATION_TIMEOUT: Duration = Duration::from_secs(3);
#[cfg(not(target_os = "android"))]
const RESET_CONFIRMATION_POLL_INTERVAL: Duration = Duration::from_millis(100);

#[cfg(not(target_os = "android"))]
fn reset_confirmation_attempts(timeout: Duration, poll_interval: Duration) -> usize {
    if poll_interval.is_zero() {
        return 1;
    }

    timeout.as_millis().div_ceil(poll_interval.as_millis()) as usize + 1
}

#[cfg(not(target_os = "android"))]
fn confirm_reset_with_presence_check(
    timeout: Duration,
    poll_interval: Duration,
    is_target_present: impl FnMut() -> Result<bool, FirmwareError>,
    sleep: impl FnMut(Duration),
) -> ResetDisposition {
    confirm_reset_with_device_checks(
        timeout,
        poll_interval,
        is_target_present,
        || Ok(false),
        sleep,
    )
}

#[cfg(not(target_os = "android"))]
pub(crate) fn confirm_reset_with_device_checks(
    timeout: Duration,
    poll_interval: Duration,
    mut is_dfu_target_present: impl FnMut() -> Result<bool, FirmwareError>,
    mut is_app_target_present: impl FnMut() -> Result<bool, FirmwareError>,
    mut sleep: impl FnMut(Duration),
) -> ResetDisposition {
    let attempts = reset_confirmation_attempts(timeout, poll_interval);

    for attempt in 0..attempts {
        match is_dfu_target_present() {
            Ok(false) => return ResetDisposition::Confirmed,
            Ok(true) => {}
            Err(_) => return ResetDisposition::Unconfirmed,
        }

        match is_app_target_present() {
            Ok(true) => return ResetDisposition::Confirmed,
            Ok(false) => {}
            Err(_) => return ResetDisposition::Unconfirmed,
        }

        if attempt + 1 < attempts {
            sleep(poll_interval);
        }
    }

    ResetDisposition::Unconfirmed
}

// ── Validation ──

pub(crate) fn validate_stm32_dfu_device(device: &DfuDeviceInfo) -> Result<(), FirmwareError> {
    if device.vid != STM32_DFU_VID || device.pid != STM32_DFU_PID {
        return Err(FirmwareError::ArtifactInvalid {
            reason: format!(
                "device {:04x}:{:04x} is not an STM32 DFU device (expected {:04x}:{:04x}); \
                 only STM32 DFU-mode recovery is supported",
                device.vid, device.pid, STM32_DFU_VID, STM32_DFU_PID
            ),
        });
    }
    Ok(())
}

pub(crate) fn classify_usb_error(error: &FirmwareError) -> FirmwareError {
    match error {
        FirmwareError::UsbAccessDenied { .. } => FirmwareError::UsbAccessDenied {
            guidance: windows_driver_guidance().to_string(),
        },
        other => other.clone(),
    }
}

pub(crate) fn windows_driver_guidance() -> &'static str {
    "STM32 DFU device is not accessible. On Windows, install the WinUSB driver \
     using Zadig (https://zadig.akeo.ie): select the STM32 BOOTLOADER device \
     and replace its driver with WinUSB. On Linux, ensure your user has USB \
     permissions (udev rules). On macOS, no extra driver is needed."
}

// ── Terminal result ──

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "result", rename_all = "snake_case")]
pub(crate) enum DfuRecoveryResult {
    Verified,
    Cancelled,
    ResetUnconfirmed,
    Failed { reason: String },
    DriverGuidance { guidance: String },
    PlatformUnsupported,
}

impl DfuRecoveryResult {
    pub(crate) fn to_outcome(&self) -> DfuRecoveryOutcome {
        match self {
            Self::Verified => DfuRecoveryOutcome::Verified,
            Self::Cancelled => DfuRecoveryOutcome::Cancelled,
            Self::ResetUnconfirmed => DfuRecoveryOutcome::ResetUnconfirmed,
            Self::Failed { reason } => DfuRecoveryOutcome::Failed {
                reason: reason.clone(),
            },
            Self::DriverGuidance { guidance } => DfuRecoveryOutcome::UnsupportedRecoveryPath {
                guidance: guidance.clone(),
            },
            Self::PlatformUnsupported => DfuRecoveryOutcome::UnsupportedRecoveryPath {
                guidance: "DFU recovery is not supported on this platform".into(),
            },
        }
    }
}

// ── Executor ──

pub(crate) fn execute_dfu_recovery<D: DfuUsbAccess>(
    usb: &D,
    device: &DfuDeviceInfo,
    bin_data: &[u8],
    is_cancelled: &dyn Fn() -> bool,
    progress: impl FnMut(usize, usize) + Send,
) -> DfuRecoveryResult {
    execute_dfu_recovery_with_phases(usb, device, bin_data, is_cancelled, |_| {}, progress)
}

pub(crate) fn execute_dfu_recovery_with_phases<D: DfuUsbAccess>(
    usb: &D,
    device: &DfuDeviceInfo,
    bin_data: &[u8],
    is_cancelled: &dyn Fn() -> bool,
    mut on_phase: impl FnMut(DfuRecoveryPhase) + Send,
    mut progress: impl FnMut(usize, usize) + Send,
) -> DfuRecoveryResult {
    if is_cancelled() {
        return DfuRecoveryResult::Cancelled;
    }

    on_phase(DfuRecoveryPhase::Detecting);

    if let Err(e) = validate_stm32_dfu_device(device) {
        return DfuRecoveryResult::Failed {
            reason: e.to_string(),
        };
    }

    if bin_data.is_empty() {
        return DfuRecoveryResult::Failed {
            reason: "recovery binary is empty".into(),
        };
    }

    if let Err(e) = usb.open_device(device) {
        let classified = classify_usb_error(&e);
        return match classified {
            FirmwareError::UsbAccessDenied { guidance } => {
                DfuRecoveryResult::DriverGuidance { guidance }
            }
            other => DfuRecoveryResult::Failed {
                reason: other.to_string(),
            },
        };
    }

    if is_cancelled() {
        return DfuRecoveryResult::Cancelled;
    }

    on_phase(DfuRecoveryPhase::Erasing);

    let mut download_started = false;

    if let Err(e) = usb.download(
        bin_data,
        Box::new(|written, total| {
            if !download_started {
                download_started = true;
                on_phase(DfuRecoveryPhase::Downloading);
            }
            progress(written, total);
        }),
    ) {
        return DfuRecoveryResult::Failed {
            reason: format!("DFU download failed: {e}"),
        };
    }

    if !download_started {
        on_phase(DfuRecoveryPhase::Downloading);
    }

    if is_cancelled() {
        return DfuRecoveryResult::Cancelled;
    }

    on_phase(DfuRecoveryPhase::ManifestingOrResetting);

    match usb.detach_and_reset() {
        Ok(ResetDisposition::Confirmed) => DfuRecoveryResult::Verified,
        Ok(ResetDisposition::Unconfirmed) => DfuRecoveryResult::ResetUnconfirmed,
        Err(e) => DfuRecoveryResult::Failed {
            reason: format!("DFU reset failed after download: {e}"),
        },
    }
}

// ── Real nusb-based DFU access (desktop only) ──
// Uses dfu-core for the DFU state machine and protocol logic.
// DfuSe extensions (erase, set_address) are handled via dfu-core's DfuIo trait.

#[cfg(not(target_os = "android"))]
mod dfuse {
    use super::FirmwareError;
    use nusb::MaybeFuture;
    use nusb::transfer::{ControlIn, ControlOut, ControlType, Recipient};
    use std::time::Duration;

    const STM32_FLASH_BASE: u32 = 0x0800_0000;
    const TRANSFER_SIZE: u16 = 2048;
    // 16KB erase granularity covers all ArduPilot-relevant STM32 families
    // (F4 min sector = 16KB, F7 = 32KB, H7 = 128KB). Extra erases for
    // addresses within an already-erased sector are harmless no-ops.
    const ERASE_GRANULARITY: u32 = 16 * 1024;
    const FLASH_SIZE_2MB: u32 = 2 * 1024 * 1024;

    const CTRL_TIMEOUT: Duration = Duration::from_secs(10);
    const ERASE_TIMEOUT: Duration = Duration::from_secs(30);

    // DfuSe special commands (sent via DFU_DNLOAD block 0)
    const DFUSE_CMD_SET_ADDRESS: u8 = 0x21;
    const DFUSE_CMD_ERASE: u8 = 0x41;

    const DFU_DNLOAD: u8 = 1;
    const DFU_GETSTATUS: u8 = 3;
    const DFU_CLRSTATUS: u8 = 4;

    fn proto_err(msg: &str) -> FirmwareError {
        FirmwareError::ProtocolError {
            detail: msg.to_string(),
        }
    }

    fn is_target_device_present(unique_id: &str) -> Result<bool, FirmwareError> {
        let mut devices =
            nusb::list_devices()
                .wait()
                .map_err(|e| FirmwareError::UsbAccessDenied {
                    guidance: format!(
                        "failed to enumerate USB devices during DFU reset confirmation: {e}"
                    ),
                })?;

        Ok(devices.any(|device| {
            crate::firmware::discovery::build_dfu_unique_id(
                device.bus_id(),
                device.port_chain(),
                device.serial_number(),
            ) == unique_id
        }))
    }

    fn parse_unique_id_topology(unique_id: &str) -> Option<(&str, &str)> {
        let mut parts = unique_id.splitn(4, ':');
        let bus_id = parts.next()?;
        let topology = parts.next()?;
        Some((bus_id, topology))
    }

    fn topology_string(port_chain: &[u8]) -> String {
        if port_chain.is_empty() {
            "root".to_string()
        } else {
            port_chain
                .iter()
                .map(u8::to_string)
                .collect::<Vec<_>>()
                .join(".")
        }
    }

    fn is_target_reenumerated_in_app_mode(unique_id: &str) -> Result<bool, FirmwareError> {
        let Some((expected_bus_id, expected_topology)) = parse_unique_id_topology(unique_id) else {
            return Ok(false);
        };

        let mut devices =
            nusb::list_devices()
                .wait()
                .map_err(|e| FirmwareError::UsbAccessDenied {
                    guidance: format!(
                        "failed to enumerate USB devices during DFU app-mode confirmation: {e}"
                    ),
                })?;

        Ok(devices.any(|device| {
            device.bus_id() == expected_bus_id
                && topology_string(device.port_chain()) == expected_topology
                && !(device.vendor_id() == super::STM32_DFU_VID
                    && device.product_id() == super::STM32_DFU_PID)
        }))
    }

    pub(super) fn open_and_claim(
        vid: u16,
        pid: u16,
        unique_id: &str,
    ) -> Result<nusb::Interface, FirmwareError> {
        let mut devices =
            nusb::list_devices()
                .wait()
                .map_err(|e| FirmwareError::UsbAccessDenied {
                    guidance: format!("failed to enumerate USB devices: {e}"),
                })?;

        let dev_info = devices
            .find(|d| {
                d.vendor_id() == vid
                    && d.product_id() == pid
                    && crate::firmware::discovery::build_dfu_unique_id(
                        d.bus_id(),
                        d.port_chain(),
                        d.serial_number(),
                    ) == unique_id
            })
            .ok_or_else(|| FirmwareError::UsbAccessDenied {
                guidance: format!(
                    "STM32 DFU device {:04x}:{:04x} with unique_id '{unique_id}' not found on USB bus",
                    vid, pid,
                ),
            })?;

        let device = dev_info
            .open()
            .wait()
            .map_err(|e| FirmwareError::UsbAccessDenied {
                guidance: format!("cannot open USB device: {e}"),
            })?;

        device
            .claim_interface(0)
            .wait()
            .map_err(|e| FirmwareError::UsbAccessDenied {
                guidance: format!("cannot claim DFU interface: {e}"),
            })
    }

    /// dfu-core DfuIo implementation over nusb, bridging the dfu-core state
    /// machine to our nusb control transfers.
    pub(super) struct NusbDfuIo<'a> {
        iface: &'a nusb::Interface,
        protocol: dfu_core::DfuProtocol<dfu_core::memory_layout::MemoryLayout>,
        func_desc: dfu_core::functional_descriptor::FunctionalDescriptor,
    }

    impl<'a> NusbDfuIo<'a> {
        pub(super) fn new(iface: &'a nusb::Interface) -> Self {
            let page_count = (FLASH_SIZE_2MB / ERASE_GRANULARITY) as usize;
            let pages: Vec<dfu_core::memory_layout::MemoryPage> =
                (0..page_count).map(|_| ERASE_GRANULARITY).collect();
            let memory_layout = dfu_core::memory_layout::MemoryLayout::from(pages);

            Self {
                iface,
                protocol: dfu_core::DfuProtocol::Dfuse {
                    address: STM32_FLASH_BASE,
                    memory_layout,
                },
                func_desc: dfu_core::functional_descriptor::FunctionalDescriptor {
                    can_download: true,
                    can_upload: false,
                    manifestation_tolerant: false,
                    will_detach: true,
                    detach_timeout: 5000,
                    transfer_size: TRANSFER_SIZE,
                    dfu_version: (1, 1),
                },
            }
        }
    }

    impl dfu_core::DfuIo for NusbDfuIo<'_> {
        type Read = usize;
        type Write = usize;
        type Reset = ();
        type Error = FirmwareError;
        type MemoryLayout = dfu_core::memory_layout::MemoryLayout;

        fn read_control(
            &self,
            request_type: u8,
            request: u8,
            value: u16,
            buffer: &mut [u8],
        ) -> Result<usize, FirmwareError> {
            let control_type = match request_type & 0x60 {
                0x20 => ControlType::Class,
                0x40 => ControlType::Vendor,
                _ => ControlType::Standard,
            };
            let recipient = match request_type & 0x1F {
                1 => Recipient::Interface,
                2 => Recipient::Endpoint,
                _ => Recipient::Device,
            };

            let data = self
                .iface
                .control_in(
                    ControlIn {
                        control_type,
                        recipient,
                        request,
                        value,
                        index: 0,
                        length: buffer.len() as u16,
                    },
                    if request == DFU_GETSTATUS {
                        ERASE_TIMEOUT
                    } else {
                        CTRL_TIMEOUT
                    },
                )
                .wait()
                .map_err(|e| proto_err(&format!("DFU read_control failed: {e}")))?;

            let len = data.len().min(buffer.len());
            buffer[..len].copy_from_slice(&data[..len]);
            Ok(len)
        }

        fn write_control(
            &self,
            request_type: u8,
            request: u8,
            value: u16,
            buffer: &[u8],
        ) -> Result<usize, FirmwareError> {
            let control_type = match request_type & 0x60 {
                0x20 => ControlType::Class,
                0x40 => ControlType::Vendor,
                _ => ControlType::Standard,
            };
            let recipient = match request_type & 0x1F {
                1 => Recipient::Interface,
                2 => Recipient::Endpoint,
                _ => Recipient::Device,
            };

            let timeout = if request == DFU_DNLOAD || request == DFU_CLRSTATUS {
                ERASE_TIMEOUT
            } else {
                CTRL_TIMEOUT
            };

            self.iface
                .control_out(
                    ControlOut {
                        control_type,
                        recipient,
                        request,
                        value,
                        index: 0,
                        data: buffer,
                    },
                    timeout,
                )
                .wait()
                .map_err(|e| proto_err(&format!("DFU write_control failed: {e}")))?;

            Ok(buffer.len())
        }

        fn usb_reset(&mut self) -> Result<(), FirmwareError> {
            Ok(())
        }

        fn protocol(&self) -> &dfu_core::DfuProtocol<dfu_core::memory_layout::MemoryLayout> {
            &self.protocol
        }

        fn functional_descriptor(&self) -> &dfu_core::functional_descriptor::FunctionalDescriptor {
            &self.func_desc
        }
    }

    pub(super) fn download_firmware(
        iface: &nusb::Interface,
        data: &[u8],
        mut progress: Box<dyn FnMut(usize, usize) + Send + '_>,
    ) -> Result<(), FirmwareError> {
        let total = data.len();
        let (tx, rx) = std::sync::mpsc::channel::<usize>();
        std::thread::scope(|scope| {
            let consumer = scope.spawn(move || {
                let mut written = 0usize;
                while let Ok(bytes_sent) = rx.recv() {
                    written += bytes_sent;
                    progress(written, total);
                }
            });

            let io = NusbDfuIo::new(iface);
            let mut dfu = dfu_core::sync::DfuSync::new(io);
            dfu.override_address(STM32_FLASH_BASE);

            dfu.with_progress(move |bytes_sent| {
                let _ = tx.send(bytes_sent);
            });

            let result = dfu
                .download_from_slice(data)
                .map_err(|e| proto_err(&format!("dfu-core download failed: {e}")));
            drop(dfu);
            consumer
                .join()
                .map_err(|_| proto_err("DFU progress worker panicked"))?;
            result
        })
    }

    pub(super) fn leave_dfu(
        iface: &nusb::Interface,
        unique_id: &str,
    ) -> Result<super::ResetDisposition, FirmwareError> {
        let io = NusbDfuIo::new(iface);
        let mut dfu = dfu_core::sync::DfuSync::new(io);
        dfu.override_address(STM32_FLASH_BASE);
        dfu.download_from_slice(&[])
            .map_err(|e| proto_err(&format!("dfu-core leave/reset failed: {e}")))?;

        Ok(super::confirm_reset_with_device_checks(
            super::RESET_CONFIRMATION_TIMEOUT,
            super::RESET_CONFIRMATION_POLL_INTERVAL,
            || is_target_device_present(unique_id),
            || is_target_reenumerated_in_app_mode(unique_id),
            std::thread::sleep,
        ))
    }
}

#[cfg(not(target_os = "android"))]
pub(crate) struct NusbDfuAccess {
    interface: std::cell::RefCell<Option<nusb::Interface>>,
    device_unique_id: std::cell::RefCell<Option<String>>,
}

#[cfg(not(target_os = "android"))]
impl NusbDfuAccess {
    pub(crate) fn new() -> Self {
        Self {
            interface: std::cell::RefCell::new(None),
            device_unique_id: std::cell::RefCell::new(None),
        }
    }
}

#[cfg(not(target_os = "android"))]
impl DfuUsbAccess for NusbDfuAccess {
    fn open_device(&self, device: &DfuDeviceInfo) -> Result<(), FirmwareError> {
        let iface = dfuse::open_and_claim(device.vid, device.pid, &device.unique_id)?;
        *self.interface.borrow_mut() = Some(iface);
        *self.device_unique_id.borrow_mut() = Some(device.unique_id.clone());
        Ok(())
    }

    fn download(
        &self,
        data: &[u8],
        progress: Box<dyn FnMut(usize, usize) + Send + '_>,
    ) -> Result<(), FirmwareError> {
        let guard = self.interface.borrow();
        let iface = guard.as_ref().ok_or_else(|| FirmwareError::ProtocolError {
            detail: "DFU device not opened".into(),
        })?;
        dfuse::download_firmware(iface, data, progress)
    }

    fn detach_and_reset(&self) -> Result<ResetDisposition, FirmwareError> {
        let guard = self.interface.borrow();
        let iface = guard.as_ref().ok_or_else(|| FirmwareError::ProtocolError {
            detail: "DFU device not opened".into(),
        })?;
        let device_unique_id =
            self.device_unique_id
                .borrow()
                .clone()
                .ok_or_else(|| FirmwareError::ProtocolError {
                    detail: "DFU device identity not recorded".into(),
                })?;
        dfuse::leave_dfu(iface, &device_unique_id)
    }
}

#[cfg(all(test, not(target_os = "android")))]
mod tests {
    use super::*;

    #[test]
    fn reset_confirmation_confirms_when_device_disappears_before_timeout() {
        let mut polls = vec![Ok(true), Ok(true), Ok(false)].into_iter();
        let mut sleeps = Vec::new();

        let disposition = confirm_reset_with_presence_check(
            Duration::from_millis(200),
            Duration::from_millis(100),
            || polls.next().expect("poll available"),
            |duration| sleeps.push(duration),
        );

        assert_eq!(disposition, ResetDisposition::Confirmed);
        assert_eq!(
            sleeps,
            vec![Duration::from_millis(100), Duration::from_millis(100)]
        );
    }

    #[test]
    fn reset_confirmation_stays_unconfirmed_when_device_never_disappears() {
        let mut checks = 0;

        let disposition = confirm_reset_with_presence_check(
            Duration::from_millis(200),
            Duration::from_millis(100),
            || {
                checks += 1;
                Ok(true)
            },
            |_| {},
        );

        assert_eq!(disposition, ResetDisposition::Unconfirmed);
        assert_eq!(checks, 3);
    }

    #[test]
    fn reset_confirmation_treats_presence_probe_errors_as_unconfirmed() {
        let disposition = confirm_reset_with_presence_check(
            Duration::from_millis(200),
            Duration::from_millis(100),
            || {
                Err(FirmwareError::ProtocolError {
                    detail: "enumeration failed".into(),
                })
            },
            |_| panic!("should not sleep after probe failure"),
        );

        assert_eq!(disposition, ResetDisposition::Unconfirmed);
    }
}

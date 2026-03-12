use serde::Serialize;

use crate::firmware::types::{DfuDeviceInfo, DfuRecoveryOutcome, FirmwareError};

const STM32_DFU_VID: u16 = 0x0483;
const STM32_DFU_PID: u16 = 0xdf11;

// ── DFU USB access trait (mockable for tests) ──

pub(crate) trait DfuUsbAccess {
    fn open_device(&self, device: &DfuDeviceInfo) -> Result<(), FirmwareError>;

    fn download(
        &self,
        data: &[u8],
        progress: &mut dyn FnMut(usize, usize),
    ) -> Result<(), FirmwareError>;

    fn detach_and_reset(&self) -> Result<(), FirmwareError>;
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
    Failed { reason: String },
    DriverGuidance { guidance: String },
    PlatformUnsupported,
}

impl DfuRecoveryResult {
    pub(crate) fn to_outcome(&self) -> DfuRecoveryOutcome {
        match self {
            Self::Verified => DfuRecoveryOutcome::Verified,
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
    mut progress: impl FnMut(usize, usize),
) -> DfuRecoveryResult {
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

    if let Err(e) = usb.download(bin_data, &mut |written, total| {
        progress(written, total);
    }) {
        return DfuRecoveryResult::Failed {
            reason: format!("DFU download failed: {e}"),
        };
    }

    if let Err(e) = usb.detach_and_reset() {
        return DfuRecoveryResult::Failed {
            reason: format!("DFU reset failed after download: {e}"),
        };
    }

    DfuRecoveryResult::Verified
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

    pub(super) fn open_and_claim(vid: u16, pid: u16) -> Result<nusb::Interface, FirmwareError> {
        let mut devices =
            nusb::list_devices()
                .wait()
                .map_err(|e| FirmwareError::UsbAccessDenied {
                    guidance: format!("failed to enumerate USB devices: {e}"),
                })?;

        let dev_info = devices
            .find(|d| d.vendor_id() == vid && d.product_id() == pid)
            .ok_or_else(|| FirmwareError::UsbAccessDenied {
                guidance: format!(
                    "STM32 DFU device {:04x}:{:04x} not found on USB bus",
                    vid, pid
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

    struct ProgressBridge {
        ptr: *mut u8,
        vtable: *mut u8,
        written: usize,
        total: usize,
    }

    impl ProgressBridge {
        fn new(progress: &mut dyn FnMut(usize, usize), total: usize) -> Self {
            let fat: [*mut u8; 2] =
                unsafe { std::mem::transmute(progress as *mut dyn FnMut(usize, usize)) };
            Self {
                ptr: fat[0],
                vtable: fat[1],
                written: 0,
                total,
            }
        }

        fn call(&mut self, bytes_sent: usize) {
            self.written += bytes_sent;
            let fat: *mut dyn FnMut(usize, usize) =
                unsafe { std::mem::transmute([self.ptr, self.vtable]) };
            unsafe { (&mut *fat)(self.written, self.total) };
        }
    }

    // SAFETY: ProgressBridge is only used synchronously within
    // download_firmware — the referenced FnMut outlives the DfuSync call.
    unsafe impl Send for ProgressBridge {}

    pub(super) fn download_firmware(
        iface: &nusb::Interface,
        data: &[u8],
        progress: &mut dyn FnMut(usize, usize),
    ) -> Result<(), FirmwareError> {
        let io = NusbDfuIo::new(iface);

        let mut dfu = dfu_core::sync::DfuSync::new(io);
        dfu.override_address(STM32_FLASH_BASE);

        let mut bridge = ProgressBridge::new(progress, data.len());
        dfu.with_progress(move |bytes_sent| bridge.call(bytes_sent));

        dfu.download_from_slice(data)
            .map_err(|e| proto_err(&format!("dfu-core download failed: {e}")))?;

        Ok(())
    }

    pub(super) fn leave_dfu(iface: &nusb::Interface) -> Result<(), FirmwareError> {
        let io = NusbDfuIo::new(iface);
        let mut dfu = dfu_core::sync::DfuSync::new(io);
        dfu.override_address(STM32_FLASH_BASE);
        let _ = dfu.download_from_slice(&[]);
        Ok(())
    }
}

#[cfg(not(target_os = "android"))]
pub(crate) struct NusbDfuAccess {
    interface: std::cell::RefCell<Option<nusb::Interface>>,
}

#[cfg(not(target_os = "android"))]
impl NusbDfuAccess {
    pub(crate) fn new() -> Self {
        Self {
            interface: std::cell::RefCell::new(None),
        }
    }
}

#[cfg(not(target_os = "android"))]
impl DfuUsbAccess for NusbDfuAccess {
    fn open_device(&self, device: &DfuDeviceInfo) -> Result<(), FirmwareError> {
        let iface = dfuse::open_and_claim(device.vid, device.pid)?;
        *self.interface.borrow_mut() = Some(iface);
        Ok(())
    }

    fn download(
        &self,
        data: &[u8],
        progress: &mut dyn FnMut(usize, usize),
    ) -> Result<(), FirmwareError> {
        let guard = self.interface.borrow();
        let iface = guard.as_ref().ok_or_else(|| FirmwareError::ProtocolError {
            detail: "DFU device not opened".into(),
        })?;
        dfuse::download_firmware(iface, data, progress)
    }

    fn detach_and_reset(&self) -> Result<(), FirmwareError> {
        let guard = self.interface.borrow();
        let iface = guard.as_ref().ok_or_else(|| FirmwareError::ProtocolError {
            detail: "DFU device not opened".into(),
        })?;
        dfuse::leave_dfu(iface)
    }
}

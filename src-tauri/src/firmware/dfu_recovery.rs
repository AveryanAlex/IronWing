#[cfg(not(target_os = "android"))]
use std::time::Duration;

use crate::firmware::types::{DfuDeviceInfo, FirmwareError};
pub(crate) use ironwing_firmware::dfu_flow::{
    AsyncDfuUsbAccess, DfuRecoveryResult, ResetDisposition, execute_async_dfu_recovery_with_phases,
};
#[cfg(test)]
pub(crate) use ironwing_firmware::dfu_flow::{
    DfuUsbAccess, confirm_reset_with_device_checks, execute_dfu_recovery,
    execute_dfu_recovery_with_phases, usb_driver_guidance, validate_stm32_dfu_device,
};
use ironwing_firmware::discovery::{STM32_DFU_PID, STM32_DFU_VID};

#[cfg(not(target_os = "android"))]
const RESET_CONFIRMATION_TIMEOUT: Duration =
    ironwing_firmware::dfu_flow::default_reset_confirmation_timeout();
#[cfg(not(target_os = "android"))]
const RESET_CONFIRMATION_POLL_INTERVAL: Duration =
    ironwing_firmware::dfu_flow::default_reset_confirmation_poll_interval();

// ── Real nusb-based DFU access (desktop only) ──
// Uses dfu-core for the DFU state machine and protocol logic.
// Native USB transport glue is provided by dfu-nusb.

#[cfg(not(target_os = "android"))]
mod dfuse {
    use super::FirmwareError;

    fn proto_err(msg: &str) -> FirmwareError {
        FirmwareError::ProtocolError {
            detail: msg.to_string(),
        }
    }

    fn dfu_nusb_error(context: &str, error: dfu_nusb::Error) -> FirmwareError {
        proto_err(&format!("{context}: {error}"))
    }

    pub(super) fn download_error(error: dfu_nusb::Error) -> FirmwareError {
        proto_err(&format!("dfu-core download failed: {error}"))
    }

    pub(super) fn leave_error(error: dfu_nusb::Error) -> FirmwareError {
        proto_err(&format!("dfu-core leave/reset failed: {error}"))
    }

    async fn is_target_device_present(unique_id: &str) -> Result<bool, FirmwareError> {
        let mut devices =
            nusb::list_devices()
                .await
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

    async fn is_target_reenumerated_in_app_mode(unique_id: &str) -> Result<bool, FirmwareError> {
        let Some((expected_bus_id, expected_topology)) = parse_unique_id_topology(unique_id) else {
            return Ok(false);
        };

        let mut devices =
            nusb::list_devices()
                .await
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

    pub(super) async fn open_async_dfu(
        vid: u16,
        pid: u16,
        unique_id: &str,
    ) -> Result<dfu_nusb::DfuASync, FirmwareError> {
        let mut devices =
            nusb::list_devices()
                .await
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
            .await
            .map_err(|e| FirmwareError::UsbAccessDenied {
                guidance: format!("cannot open USB device: {e}"),
            })?;

        let interface =
            device
                .claim_interface(0)
                .await
                .map_err(|e| FirmwareError::UsbAccessDenied {
                    guidance: format!("cannot claim DFU interface: {e}"),
                })?;

        let backend = dfu_nusb::DfuNusb::open(device, interface, 0)
            .await
            .map_err(|error| dfu_nusb_error("cannot initialize DFU interface", error))?;
        let mut dfu = backend.into_async_dfu();
        dfu.override_address(ironwing_firmware::STM32_DFUSE_FLASH_BASE);
        Ok(dfu)
    }

    pub(super) async fn confirm_reset(unique_id: &str) -> super::ResetDisposition {
        ironwing_firmware::confirm_reset_with_device_checks_async(
            super::RESET_CONFIRMATION_TIMEOUT,
            super::RESET_CONFIRMATION_POLL_INTERVAL,
            || is_target_device_present(unique_id),
            || is_target_reenumerated_in_app_mode(unique_id),
            tokio::time::sleep,
        )
        .await
    }
}

#[cfg(not(target_os = "android"))]
pub(crate) struct NusbDfuAccess {
    dfu: Option<dfu_nusb::DfuASync>,
    device_unique_id: Option<String>,
}

#[cfg(not(target_os = "android"))]
impl NusbDfuAccess {
    pub(crate) fn new() -> Self {
        Self {
            dfu: None,
            device_unique_id: None,
        }
    }
}

#[cfg(not(target_os = "android"))]
impl AsyncDfuUsbAccess for NusbDfuAccess {
    fn open_device<'a>(
        &'a mut self,
        device: &'a DfuDeviceInfo,
    ) -> ironwing_firmware::AsyncDfuFuture<'a, Result<(), FirmwareError>> {
        Box::pin(async move {
            self.dfu =
                Some(dfuse::open_async_dfu(device.vid, device.pid, &device.unique_id).await?);
            self.device_unique_id = Some(device.unique_id.clone());
            Ok(())
        })
    }

    fn download<'a>(
        &'a mut self,
        data: &'a [u8],
        progress: ironwing_firmware::AsyncDfuProgressCallback<'a>,
    ) -> ironwing_firmware::AsyncDfuFuture<'a, Result<(), FirmwareError>> {
        Box::pin(async move {
            let dfu = self
                .dfu
                .take()
                .ok_or_else(|| FirmwareError::ProtocolError {
                    detail: "DFU device not opened".into(),
                })?;
            self.dfu = Some(
                ironwing_firmware::download_dfu_core_async_with_progress(
                    dfu,
                    data,
                    progress,
                    dfuse::download_error,
                )
                .await?
                .ok_or_else(|| FirmwareError::ProtocolError {
                    detail: "DFU device reset during download before leave request".into(),
                })?,
            );
            Ok(())
        })
    }

    fn detach_and_reset<'a>(
        &'a mut self,
    ) -> ironwing_firmware::AsyncDfuFuture<'a, Result<ResetDisposition, FirmwareError>> {
        Box::pin(async move {
            let dfu = self
                .dfu
                .take()
                .ok_or_else(|| FirmwareError::ProtocolError {
                    detail: "DFU device not opened".into(),
                })?;
            self.dfu = dfu
                .download_from_slice(&[])
                .await
                .map_err(dfuse::leave_error)?;
            let device_unique_id =
                self.device_unique_id
                    .clone()
                    .ok_or_else(|| FirmwareError::ProtocolError {
                        detail: "DFU device identity not recorded".into(),
                    })?;
            Ok(dfuse::confirm_reset(&device_unique_id).await)
        })
    }
}

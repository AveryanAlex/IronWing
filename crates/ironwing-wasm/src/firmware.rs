use std::future::Future;
use std::pin::Pin;
#[cfg(target_arch = "wasm32")]
use std::{cell::Cell, rc::Rc};

#[cfg(target_arch = "wasm32")]
use ironwing_firmware::DfuDeviceInfo;
#[cfg(target_arch = "wasm32")]
use ironwing_firmware::{
    AsyncDfuFuture, AsyncDfuProgressCallback, AsyncDfuUsbAccess, DfuRecoveryPhase,
    DfuUsbDeviceIdentity, ResetDisposition, download_dfu_core_async_with_progress,
    execute_async_dfu_recovery_with_phases, is_unambiguous_reset_confirmation_match,
    resolve_preloaded_dfu_source,
};
use ironwing_firmware::{
    AsyncSerialIo, FirmwareError, SerialFlashOptions, SerialFlashSource, SerialFlowResult,
    SerialReadError, async_probe_for_detection_with_cancel, async_upload_with_options,
    build_bootloader_board_info, parse_apj,
};
use wasm_bindgen::JsCast;
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::JsFuture;

use crate::error::WasmError;
use crate::js_value::{from_js, to_js};

#[cfg(target_arch = "wasm32")]
const WEBUSB_RESET_CONFIRMATION_ATTEMPTS: usize = 31;
#[cfg(target_arch = "wasm32")]
const WEBUSB_RESET_CONFIRMATION_POLL_MS: u32 = 100;

struct JsSerialIo {
    adapter: JsValue,
}

impl JsSerialIo {
    fn new(adapter: JsValue) -> Self {
        Self { adapter }
    }

    async fn call_promise(&self, name: &str, args: &[JsValue]) -> Result<JsValue, FirmwareError> {
        let method = js_sys::Reflect::get(&self.adapter, &JsValue::from_str(name))
            .map_err(|error| js_error("read serial adapter method", error))?
            .dyn_into::<js_sys::Function>()
            .map_err(|_| FirmwareError::ProtocolError {
                detail: format!("serial adapter method {name} is not a function"),
            })?;
        let value = match args {
            [] => method.call0(&self.adapter),
            [a] => method.call1(&self.adapter, a),
            [a, b] => method.call2(&self.adapter, a, b),
            _ => {
                return Err(FirmwareError::ProtocolError {
                    detail: "serial adapter method called with too many arguments".into(),
                });
            }
        }
        .map_err(|error| js_error(name, error))?;

        JsFuture::from(js_sys::Promise::from(value))
            .await
            .map_err(|error| js_error(name, error))
    }
}

impl AsyncSerialIo for JsSerialIo {
    fn write_all<'a>(
        &'a mut self,
        data: &'a [u8],
    ) -> Pin<Box<dyn Future<Output = Result<(), FirmwareError>> + 'a>> {
        Box::pin(async move {
            let bytes = js_sys::Uint8Array::from(data);
            self.call_promise("write", &[bytes.into()]).await?;
            Ok(())
        })
    }

    fn read<'a>(
        &'a mut self,
        buf: &'a mut [u8],
    ) -> Pin<Box<dyn Future<Output = Result<usize, SerialReadError>> + 'a>> {
        Box::pin(async move {
            let value = self
                .call_promise(
                    "read",
                    &[
                        JsValue::from_f64(buf.len() as f64),
                        JsValue::from_f64(5_000.0),
                    ],
                )
                .await
                .map_err(SerialReadError::Other)?;

            if value.is_null() || value.is_undefined() {
                return Err(SerialReadError::Timeout);
            }

            let bytes = js_sys::Uint8Array::new(&value).to_vec();
            if bytes.is_empty() {
                return Err(SerialReadError::Timeout);
            }

            let n = bytes.len().min(buf.len());
            buf[..n].copy_from_slice(&bytes[..n]);
            Ok(n)
        })
    }

    fn flush_input<'a>(
        &'a mut self,
    ) -> Pin<Box<dyn Future<Output = Result<(), FirmwareError>> + 'a>> {
        Box::pin(async move {
            self.call_promise("flushInput", &[]).await?;
            Ok(())
        })
    }
}

#[wasm_bindgen(js_name = webSerialFirmwareInstallUpdate)]
pub async fn web_serial_firmware_install_update(
    port_name: String,
    serial_adapter: JsValue,
    source: JsValue,
    options: JsValue,
    progress_sink: js_sys::Function,
    is_cancelled: js_sys::Function,
) -> Result<JsValue, JsValue> {
    let source: SerialFlashSource = from_js(source)?;
    let options = if options.is_null() || options.is_undefined() {
        SerialFlashOptions {
            full_chip_erase: false,
        }
    } else {
        from_js::<SerialFlashOptions>(options)?
    };

    let SerialFlashSource::LocalApjBytes { data } = source else {
        return Err(WasmError::unsupported(
            "catalog firmware sources must be resolved by the browser before WebSerial install/update",
        )
        .into());
    };

    let artifact = parse_apj(&data).map_err(|error| JsValue::from_str(&error.to_string()))?;
    let mut io = JsSerialIo::new(serial_adapter);
    let cancellation = || js_cancelled(&is_cancelled);
    let result = match async_upload_with_options(
        &mut io,
        &artifact,
        &options,
        &cancellation,
        |phase, written, total| {
            let _ = progress_sink.call3(
                &JsValue::NULL,
                &JsValue::from_str(phase),
                &JsValue::from_f64(written as f64),
                &JsValue::from_f64(total as f64),
            );
        },
    )
    .await
    {
        Ok(info) if info.bl_rev >= 3 => SerialFlowResult::Verified {
            board_id: info.board_id,
            bootloader_rev: info.bl_rev,
            port: port_name,
        },
        Ok(info) => SerialFlowResult::FlashedButUnverified {
            board_id: info.board_id,
            bootloader_rev: info.bl_rev,
            port: port_name,
        },
        Err(FirmwareError::Cancelled) => SerialFlowResult::Cancelled,
        Err(error @ FirmwareError::ExtfCapacityInsufficient { .. }) => {
            SerialFlowResult::ExtfCapacityInsufficient {
                reason: error.to_string(),
            }
        }
        Err(error) => SerialFlowResult::Failed {
            reason: error.to_string(),
        },
    };

    to_js(&result)
}

#[wasm_bindgen(js_name = webSerialDetectBootloaderBoard)]
pub async fn web_serial_detect_bootloader_board(
    port_name: String,
    serial_adapter: JsValue,
    is_cancelled: js_sys::Function,
) -> Result<JsValue, JsValue> {
    let mut io = JsSerialIo::new(serial_adapter);
    let cancellation = || js_cancelled(&is_cancelled);
    let info = async_probe_for_detection_with_cancel(&mut io, &cancellation)
        .await
        .map_err(|error| JsValue::from_str(&error.to_string()))?;

    to_js(&build_bootloader_board_info(&port_name, &info))
}

#[wasm_bindgen(js_name = webUsbBootloaderInstallation)]
pub async fn web_usb_bootloader_installation(
    usb_device: JsValue,
    device_info: JsValue,
    source: JsValue,
    progress_sink: js_sys::Function,
    is_cancelled: js_sys::Function,
) -> Result<JsValue, JsValue> {
    #[cfg(target_arch = "wasm32")]
    {
        web_usb_bootloader_installation_impl(
            usb_device,
            device_info,
            source,
            progress_sink,
            is_cancelled,
        )
        .await
    }

    #[cfg(not(target_arch = "wasm32"))]
    {
        let _ = (usb_device, device_info, source, progress_sink, is_cancelled);
        Err(WasmError::unsupported("WebUSB DFU is only available in wasm builds").into())
    }
}

#[cfg(target_arch = "wasm32")]
async fn web_usb_bootloader_installation_impl(
    usb_device: JsValue,
    device_info: JsValue,
    source: JsValue,
    progress_sink: js_sys::Function,
    is_cancelled: js_sys::Function,
) -> Result<JsValue, JsValue> {
    let device_info: DfuDeviceInfo = from_js(device_info)?;
    let image = resolve_preloaded_dfu_source(from_js(source)?)
        .map_err(|error| JsValue::from_str(&error.to_string()))?;
    let usb_device = usb_device
        .dyn_into::<web_sys::UsbDevice>()
        .map_err(|_| JsValue::from_str("expected a WebUSB UsbDevice"))?;

    let reset_monitor = WebUsbResetMonitor::attach(&usb_device, &device_info).await;
    let mut access = WebUsbDfuAccess::new(usb_device, reset_monitor);
    let cancellation = || js_cancelled(&is_cancelled);
    let result = execute_async_dfu_recovery_with_phases(
        &mut access,
        &device_info,
        &image,
        &cancellation,
        |phase| {
            let _ = progress_sink.call3(
                &JsValue::NULL,
                &JsValue::from_str(dfu_phase_label(phase)),
                &JsValue::from_f64(0.0),
                &JsValue::from_f64(0.0),
            );
        },
        |written, total| {
            let _ = progress_sink.call3(
                &JsValue::NULL,
                &JsValue::from_str("downloading"),
                &JsValue::from_f64(written as f64),
                &JsValue::from_f64(total as f64),
            );
        },
    )
    .await;

    to_js(&result)
}

#[cfg(target_arch = "wasm32")]
fn dfu_phase_label(phase: DfuRecoveryPhase) -> &'static str {
    match phase {
        DfuRecoveryPhase::Idle => "idle",
        DfuRecoveryPhase::Detecting => "detecting",
        DfuRecoveryPhase::Downloading => "downloading",
        DfuRecoveryPhase::Erasing => "erasing",
        DfuRecoveryPhase::Verifying => "verifying",
        DfuRecoveryPhase::ManifestingOrResetting => "manifesting_or_resetting",
    }
}

#[cfg(target_arch = "wasm32")]
struct WebUsbResetMonitor {
    usb: Option<web_sys::Usb>,
    identity: DfuUsbDeviceIdentity,
    disconnected: Rc<Cell<bool>>,
    disconnect_listener: Option<Closure<dyn FnMut(JsValue)>>,
    polling_eligible: bool,
}

#[cfg(target_arch = "wasm32")]
impl WebUsbResetMonitor {
    async fn attach(selected_device: &web_sys::UsbDevice, device_info: &DfuDeviceInfo) -> Self {
        let usb = web_sys::window().map(|window| window.navigator().usb());
        let identity = DfuUsbDeviceIdentity::from_device_info(device_info).with_missing_metadata(
            selected_device.serial_number().as_deref(),
            selected_device.product_name().as_deref(),
        );
        let disconnected = Rc::new(Cell::new(false));
        let disconnect_listener = usb.as_ref().and_then(|usb| {
            let selected_device = selected_device.clone();
            let disconnected = Rc::clone(&disconnected);
            let listener = Closure::<dyn FnMut(JsValue)>::new(move |event: JsValue| {
                if let Ok(event) = event.dyn_into::<web_sys::UsbConnectionEvent>()
                    && event.device() == selected_device
                {
                    disconnected.set(true);
                }
            });

            usb.add_event_listener_with_callback("disconnect", listener.as_ref().unchecked_ref())
                .ok()
                .map(|()| listener)
        });

        let polling_eligible = match usb.as_ref() {
            Some(usb) => count_matching_webusb_dfu_devices(usb, &identity)
                .await
                .map(is_unambiguous_reset_confirmation_match)
                .unwrap_or(false),
            None => false,
        };

        Self {
            usb,
            identity,
            disconnected,
            disconnect_listener,
            polling_eligible,
        }
    }

    async fn confirm_reset(&self) -> ResetDisposition {
        if self.disconnect_listener.is_none() && !self.polling_eligible {
            return ResetDisposition::Unconfirmed;
        }

        let mut polling_failed_or_ambiguous = !self.polling_eligible;

        for attempt in 0..WEBUSB_RESET_CONFIRMATION_ATTEMPTS {
            if self.disconnected.get() {
                return ResetDisposition::Confirmed;
            }

            if !polling_failed_or_ambiguous {
                match self.matching_dfu_device_count().await {
                    Ok(0) => return ResetDisposition::Confirmed,
                    Ok(1) => {}
                    Ok(_) | Err(_) => {
                        polling_failed_or_ambiguous = true;
                    }
                }
            }

            if attempt + 1 < WEBUSB_RESET_CONFIRMATION_ATTEMPTS {
                gloo_timers::future::TimeoutFuture::new(WEBUSB_RESET_CONFIRMATION_POLL_MS).await;
            }
        }

        if self.disconnected.get() {
            ResetDisposition::Confirmed
        } else {
            ResetDisposition::Unconfirmed
        }
    }

    async fn matching_dfu_device_count(&self) -> Result<usize, JsValue> {
        let usb = self
            .usb
            .as_ref()
            .ok_or_else(|| JsValue::from_str("WebUSB is unavailable"))?;
        count_matching_webusb_dfu_devices(usb, &self.identity).await
    }
}

#[cfg(target_arch = "wasm32")]
impl Drop for WebUsbResetMonitor {
    fn drop(&mut self) {
        if let (Some(usb), Some(listener)) = (&self.usb, &self.disconnect_listener) {
            let _ = usb.remove_event_listener_with_callback(
                "disconnect",
                listener.as_ref().unchecked_ref(),
            );
        }
    }
}

#[cfg(target_arch = "wasm32")]
async fn count_matching_webusb_dfu_devices(
    usb: &web_sys::Usb,
    identity: &DfuUsbDeviceIdentity,
) -> Result<usize, JsValue> {
    let devices = JsFuture::from(usb.get_devices()).await?;
    let devices = js_sys::Array::from(&devices);
    let mut count = 0usize;

    for value in devices.iter() {
        let device = value.dyn_into::<web_sys::UsbDevice>()?;
        let candidate = DfuUsbDeviceIdentity::new(
            device.vendor_id(),
            device.product_id(),
            device.serial_number().as_deref(),
            device.product_name().as_deref(),
        );
        if identity.matches(&candidate) {
            count += 1;
        }
    }

    Ok(count)
}

#[cfg(target_arch = "wasm32")]
struct WebUsbDfuAccess {
    device: web_sys::UsbDevice,
    dfu: Option<dfu_webusb::DfuASync>,
    reset_monitor: WebUsbResetMonitor,
}

#[cfg(target_arch = "wasm32")]
impl WebUsbDfuAccess {
    fn new(device: web_sys::UsbDevice, reset_monitor: WebUsbResetMonitor) -> Self {
        Self {
            device,
            dfu: None,
            reset_monitor,
        }
    }
}

#[cfg(target_arch = "wasm32")]
impl AsyncDfuUsbAccess for WebUsbDfuAccess {
    fn open_device<'a>(
        &'a mut self,
        _device: &'a DfuDeviceInfo,
    ) -> AsyncDfuFuture<'a, Result<(), FirmwareError>> {
        Box::pin(async move {
            let backend = dfu_webusb::DfuWebUsb::from_usb_device(
                self.device.clone(),
                dfu_webusb::DfuWebUsbOptions::stm32_dfuse(0, 0),
            )
            .await
            .map_err(webusb_dfu_error)?;
            let dfu = backend.into_async_dfu();
            self.dfu = Some(dfu);
            Ok(())
        })
    }

    fn download<'a>(
        &'a mut self,
        data: &'a [u8],
        progress: AsyncDfuProgressCallback<'a>,
    ) -> AsyncDfuFuture<'a, Result<(), FirmwareError>> {
        Box::pin(async move {
            let dfu = self
                .dfu
                .take()
                .ok_or_else(|| FirmwareError::ProtocolError {
                    detail: "WebUSB DFU device not opened".into(),
                })?;
            self.dfu = download_dfu_core_async_with_progress(dfu, data, progress, webusb_dfu_error)
                .await?;
            Ok(())
        })
    }

    fn detach_and_reset<'a>(
        &'a mut self,
    ) -> AsyncDfuFuture<'a, Result<ResetDisposition, FirmwareError>> {
        Box::pin(async move {
            let dfu = self
                .dfu
                .take()
                .ok_or_else(|| FirmwareError::ProtocolError {
                    detail: "WebUSB DFU device not opened".into(),
                })?;
            self.dfu = dfu
                .download_from_slice(&[])
                .await
                .map_err(webusb_dfu_error)?;
            Ok(self.reset_monitor.confirm_reset().await)
        })
    }
}

#[cfg(target_arch = "wasm32")]
fn webusb_dfu_error(error: dfu_webusb::Error) -> FirmwareError {
    FirmwareError::ProtocolError {
        detail: format!("WebUSB DFU operation failed: {error}"),
    }
}

fn js_cancelled(is_cancelled: &js_sys::Function) -> bool {
    is_cancelled
        .call0(&JsValue::NULL)
        .ok()
        .and_then(|value| value.as_bool())
        .unwrap_or(false)
}

fn js_error(context: &str, error: JsValue) -> FirmwareError {
    FirmwareError::ProtocolError {
        detail: format!("{context}: {}", js_error_message(error)),
    }
}

fn js_error_message(error: JsValue) -> String {
    error
        .dyn_ref::<js_sys::Error>()
        .map(|error| error.message().into())
        .or_else(|| error.as_string())
        .unwrap_or_else(|| "unknown JavaScript error".into())
}

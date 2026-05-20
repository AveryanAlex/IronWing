use std::future::Future;
use std::pin::Pin;

use ironwing_firmware::{
    AsyncSerialIo, FirmwareError, SerialFlashOptions, SerialFlashSource, SerialFlowResult,
    SerialReadError, async_upload_with_options, build_catalog_targets,
    filter_by_board_and_platform, filter_catalog_targets_to_supported_official_bootloaders,
    parse_apj, parse_manifest_gz, parse_supported_official_bootloader_targets,
};
use wasm_bindgen::JsCast;
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::JsFuture;

use crate::error::WasmError;
use crate::js_value::{from_js, to_js};

#[wasm_bindgen(js_name = firmwareCatalogEntriesFromManifest)]
pub fn firmware_catalog_entries_from_manifest(
    manifest_gz: &[u8],
    board_id: u32,
    platform: Option<String>,
) -> Result<JsValue, JsValue> {
    let entries = parse_manifest_gz(manifest_gz).map_err(firmware_error_js)?;
    to_js(&filter_by_board_and_platform(
        &entries,
        board_id,
        platform.as_deref(),
    ))
}

#[wasm_bindgen(js_name = firmwareCatalogTargetsFromManifest)]
pub fn firmware_catalog_targets_from_manifest(manifest_gz: &[u8]) -> Result<JsValue, JsValue> {
    let entries = parse_manifest_gz(manifest_gz).map_err(firmware_error_js)?;
    to_js(&build_catalog_targets(&entries))
}

#[wasm_bindgen(js_name = firmwareBootloaderCatalogTargetsFromManifest)]
pub fn firmware_bootloader_catalog_targets_from_manifest(
    manifest_gz: &[u8],
    bootloader_index_html: &str,
) -> Result<JsValue, JsValue> {
    let entries = parse_manifest_gz(manifest_gz).map_err(firmware_error_js)?;
    let targets = build_catalog_targets(&entries);
    let supported = parse_supported_official_bootloader_targets(bootloader_index_html);
    to_js(&filter_catalog_targets_to_supported_official_bootloaders(
        &targets, &supported,
    ))
}

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

fn js_cancelled(is_cancelled: &js_sys::Function) -> bool {
    is_cancelled
        .call0(&JsValue::NULL)
        .ok()
        .and_then(|value| value.as_bool())
        .unwrap_or(false)
}

fn firmware_error_js(error: FirmwareError) -> JsValue {
    JsValue::from_str(&error.to_string())
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

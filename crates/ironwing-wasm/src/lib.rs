#![allow(dead_code)]

mod app;
mod bridge;
mod error;
mod event_sink;
mod firmware;
mod js_value;
mod task;

use ironwing_core::telemetry;
use ironwing_core::transport::{self, TransportAvailability, WebTransportOptions};
use wasm_bindgen::prelude::*;

use crate::js_value::to_js;

pub use app::IronwingWasmRuntime;
pub use bridge::WasmByteBridge;

const WEBSOCKET_UNAVAILABLE: &str = "WebSocket is not available in this browser";
const WEB_SERIAL_UNAVAILABLE: &str = "Web Serial is not available in this browser";
const WEB_BLUETOOTH_UNAVAILABLE: &str = "Web Bluetooth is not available in this browser";

#[wasm_bindgen(start)]
pub fn start() {
    console_error_panic_hook::set_once();
}

#[wasm_bindgen(js_name = availableMessageRates)]
pub fn available_message_rates() -> Result<JsValue, JsValue> {
    to_js(&telemetry::available_message_rates())
}

#[wasm_bindgen(js_name = webTransportDescriptors)]
pub fn web_transport_descriptors(
    websocket_available: bool,
    web_serial_available: bool,
    web_bluetooth_available: bool,
) -> Result<JsValue, JsValue> {
    to_js(&transport::web_transport_descriptors(WebTransportOptions {
        websocket: browser_availability(websocket_available, WEBSOCKET_UNAVAILABLE),
        web_serial: browser_availability(web_serial_available, WEB_SERIAL_UNAVAILABLE),
        web_bluetooth: browser_availability(web_bluetooth_available, WEB_BLUETOOTH_UNAVAILABLE),
    }))
}

fn browser_availability(
    available: bool,
    unavailable_reason: &'static str,
) -> TransportAvailability {
    if available {
        TransportAvailability::available()
    } else {
        TransportAvailability::unavailable(unavailable_reason)
    }
}

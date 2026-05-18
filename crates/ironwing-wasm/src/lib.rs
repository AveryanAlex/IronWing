#![allow(dead_code)]

mod app;
mod bridge;
mod error;
mod event_sink;
mod js_value;
mod task;

pub use app::IronwingWasmRuntime;
pub use bridge::WasmByteBridge;

#[wasm_bindgen::prelude::wasm_bindgen(start)]
pub fn start() {
    console_error_panic_hook::set_once();
}

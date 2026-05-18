use std::cell::Cell;
use std::rc::Rc;

use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct WasmByteBridge {
    closed: Rc<Cell<bool>>,
}

impl WasmByteBridge {
    pub fn new() -> Self {
        Self {
            closed: Rc::new(Cell::new(false)),
        }
    }
}

impl Default for WasmByteBridge {
    fn default() -> Self {
        Self::new()
    }
}

#[wasm_bindgen]
impl WasmByteBridge {
    #[wasm_bindgen(js_name = pushInbound)]
    pub async fn push_inbound(&self, _bytes: js_sys::Uint8Array) -> Result<(), JsValue> {
        Ok(())
    }

    #[wasm_bindgen(js_name = nextOutbound)]
    pub async fn next_outbound(&self) -> Result<JsValue, JsValue> {
        Ok(JsValue::NULL)
    }

    pub fn close(&self) {
        self.closed.set(true);
    }

    #[wasm_bindgen(js_name = isClosed)]
    pub fn is_closed(&self) -> bool {
        self.closed.get()
    }
}

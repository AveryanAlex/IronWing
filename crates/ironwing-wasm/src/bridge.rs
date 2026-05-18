use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct WasmByteBridge {
    inner: mavkit::byte_connection::ByteBridge,
}

impl WasmByteBridge {
    pub fn new(inner: mavkit::byte_connection::ByteBridge) -> Self {
        Self { inner }
    }
}

#[wasm_bindgen]
impl WasmByteBridge {
    #[wasm_bindgen(js_name = pushInbound)]
    pub async fn push_inbound(&self, bytes: js_sys::Uint8Array) -> Result<(), JsValue> {
        self.inner
            .push_inbound(bytes.to_vec())
            .await
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }

    #[wasm_bindgen(js_name = nextOutbound)]
    pub async fn next_outbound(&self) -> Result<JsValue, JsValue> {
        Ok(match self.inner.next_outbound().await {
            Some(bytes) => js_sys::Uint8Array::from(bytes.as_slice()).into(),
            None => JsValue::NULL,
        })
    }

    pub fn close(&self) {
        self.inner.close();
    }

    #[wasm_bindgen(js_name = isClosed)]
    pub fn is_closed(&self) -> bool {
        self.inner.is_closed()
    }
}

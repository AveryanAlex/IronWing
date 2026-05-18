#[derive(Clone)]
pub struct EventSink {
    callback: js_sys::Function,
}

impl EventSink {
    pub fn new(callback: js_sys::Function) -> Self {
        Self { callback }
    }

    pub fn emit<T: serde::Serialize>(
        &self,
        event: &str,
        payload: &T,
    ) -> Result<(), wasm_bindgen::JsValue> {
        let event_value = wasm_bindgen::JsValue::from_str(event);
        let payload_value = crate::js_value::to_js(payload)?;
        self.callback
            .call2(&wasm_bindgen::JsValue::NULL, &event_value, &payload_value)
            .map(|_| ())
    }
}

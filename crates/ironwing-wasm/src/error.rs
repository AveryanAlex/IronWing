#[derive(Debug, Clone)]
pub struct WasmError {
    pub kind: WasmErrorKind,
    pub message: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WasmErrorKind {
    InvalidInput,
    Unsupported,
}

impl WasmError {
    pub fn invalid_input(message: impl Into<String>) -> Self {
        Self {
            kind: WasmErrorKind::InvalidInput,
            message: message.into(),
        }
    }

    pub fn unsupported(message: impl Into<String>) -> Self {
        Self {
            kind: WasmErrorKind::Unsupported,
            message: message.into(),
        }
    }
}

impl From<WasmError> for wasm_bindgen::JsValue {
    fn from(value: WasmError) -> Self {
        wasm_bindgen::JsValue::from_str(&value.message)
    }
}

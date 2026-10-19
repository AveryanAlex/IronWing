use ironwing_core::ipc::OperationId;
use ironwing_core::ipc::logs::{ChartSeriesRequest, LogExportRequest, RawMessageQuery};
use ironwing_core::log_engine::{self, LogType};
use wasm_bindgen::prelude::*;

use crate::js_value::{from_js, to_js};

fn log_type_from_format(format: &str) -> Result<LogType, JsValue> {
    match format.to_ascii_lowercase().as_str() {
        "tlog" => Ok(LogType::Tlog),
        "bin" => Ok(LogType::Bin),
        _ => Err(JsValue::from_str(
            "unsupported log format; expected tlog or bin",
        )),
    }
}

fn parse(path: &str, format: &str, bytes: &[u8]) -> Result<log_engine::ParsedLog, JsValue> {
    log_engine::parse_log_bytes(path, bytes, log_type_from_format(format)?)
        .map_err(|error| JsValue::from_str(&error))
}

/// Owns one parsed log. Browser adapters release it on close/replacement.
#[wasm_bindgen]
pub struct WasmLog {
    parsed: log_engine::ParsedLog,
}

#[wasm_bindgen]
impl WasmLog {
    #[wasm_bindgen(constructor)]
    pub fn new(path: &str, format: &str, bytes: &[u8]) -> Result<WasmLog, JsValue> {
        Ok(Self {
            parsed: parse(path, format, bytes)?,
        })
    }

    #[wasm_bindgen(js_name = parseSummary)]
    pub fn log_parse_summary(&self) -> Result<JsValue, JsValue> {
        to_js(&serde_json::json!({
            "summary": self.parsed.store.summary,
            "diagnostics": self.parsed.diagnostics,
        }))
    }

    #[wasm_bindgen(js_name = queryMessages)]
    pub fn log_query_messages(
        &self,
        msg_type: &str,
        start_usec: Option<u64>,
        end_usec: Option<u64>,
        max_points: Option<usize>,
    ) -> Result<JsValue, JsValue> {
        to_js(&log_engine::query_log_messages(
            &self.parsed.store,
            msg_type,
            start_usec,
            end_usec,
            max_points,
        )?)
    }

    #[wasm_bindgen(js_name = rawMessagesQuery)]
    pub fn log_raw_messages_query(&self, request: JsValue) -> Result<JsValue, JsValue> {
        let request: RawMessageQuery = from_js(request)?;
        to_js(&log_engine::query_raw_message_page(
            &self.parsed.store,
            &request,
        )?)
    }

    #[wasm_bindgen(js_name = chartSeriesQuery)]
    pub fn log_chart_series_query(&self, request: JsValue) -> Result<JsValue, JsValue> {
        let request: ChartSeriesRequest = from_js(request)?;
        to_js(&log_engine::query_chart_series(
            &self.parsed.store,
            &request,
        ))
    }

    #[wasm_bindgen(js_name = flightPath)]
    pub fn log_flight_path(
        &self,
        start_usec: Option<u64>,
        end_usec: Option<u64>,
        max_points: Option<usize>,
    ) -> Result<JsValue, JsValue> {
        to_js(&log_engine::flight_path_points(
            &self.parsed.store,
            start_usec,
            end_usec,
            max_points,
        )?)
    }

    #[wasm_bindgen(js_name = telemetryTrack)]
    pub fn log_telemetry_track(&self, max_points: Option<usize>) -> Result<JsValue, JsValue> {
        to_js(&log_engine::telemetry_track(&self.parsed.store, max_points))
    }

    #[wasm_bindgen(js_name = flightSummary)]
    pub fn log_flight_summary(&self) -> Result<JsValue, JsValue> {
        to_js(&log_engine::flight_summary(&self.parsed.store))
    }

    #[wasm_bindgen(js_name = exportCsvBytes)]
    pub fn log_export_csv_bytes(&self, request: JsValue) -> Result<JsValue, JsValue> {
        let request: LogExportRequest = from_js(request)?;
        let (bytes, rows_written) = log_engine::export_csv_bytes(&self.parsed.store, &request)?;
        to_js(&serde_json::json!({
            "operation_id": OperationId::LogExport,
            "destination_path": request.destination_path,
            "bytes_written": bytes.len(),
            "rows_written": rows_written,
            "diagnostics": [],
            "bytes": bytes,
        }))
    }

    #[wasm_bindgen(js_name = playbackFrame)]
    pub fn playback_frame(&mut self, cursor_usec: Option<u64>) -> Result<JsValue, JsValue> {
        self.parsed.store.set_playback_cursor_usec(cursor_usec);
        to_js(&self.parsed.store.playback_frame())
    }
}

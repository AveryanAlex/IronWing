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

#[wasm_bindgen(js_name = logParseSummary)]
pub fn log_parse_summary(path: &str, format: &str, bytes: &[u8]) -> Result<JsValue, JsValue> {
    let parsed = parse(path, format, bytes)?;
    to_js(&serde_json::json!({
        "summary": parsed.store.summary,
        "diagnostics": parsed.diagnostics,
    }))
}

#[wasm_bindgen(js_name = logQueryMessages)]
pub fn log_query_messages(
    path: &str,
    format: &str,
    bytes: &[u8],
    msg_type: &str,
    start_usec: Option<u64>,
    end_usec: Option<u64>,
    max_points: Option<usize>,
) -> Result<JsValue, JsValue> {
    let parsed = parse(path, format, bytes)?;
    to_js(&log_engine::query_log_messages(
        &parsed.store,
        msg_type,
        start_usec,
        end_usec,
        max_points,
    )?)
}

#[wasm_bindgen(js_name = logRawMessagesQuery)]
pub fn log_raw_messages_query(
    path: &str,
    format: &str,
    bytes: &[u8],
    request: JsValue,
) -> Result<JsValue, JsValue> {
    let parsed = parse(path, format, bytes)?;
    let request: RawMessageQuery = from_js(request)?;
    to_js(&log_engine::query_raw_message_page(
        &parsed.store,
        &request,
    )?)
}

#[wasm_bindgen(js_name = logChartSeriesQuery)]
pub fn log_chart_series_query(
    path: &str,
    format: &str,
    bytes: &[u8],
    request: JsValue,
) -> Result<JsValue, JsValue> {
    let parsed = parse(path, format, bytes)?;
    let request: ChartSeriesRequest = from_js(request)?;
    to_js(&log_engine::query_chart_series(&parsed.store, &request))
}

#[wasm_bindgen(js_name = logFlightPath)]
pub fn log_flight_path(
    path: &str,
    format: &str,
    bytes: &[u8],
    start_usec: Option<u64>,
    end_usec: Option<u64>,
    max_points: Option<usize>,
) -> Result<JsValue, JsValue> {
    let parsed = parse(path, format, bytes)?;
    to_js(&log_engine::flight_path_points(
        &parsed.store,
        start_usec,
        end_usec,
        max_points,
    )?)
}

#[wasm_bindgen(js_name = logTelemetryTrack)]
pub fn log_telemetry_track(
    path: &str,
    format: &str,
    bytes: &[u8],
    max_points: Option<usize>,
) -> Result<JsValue, JsValue> {
    let parsed = parse(path, format, bytes)?;
    to_js(&log_engine::telemetry_track(&parsed.store, max_points))
}

#[wasm_bindgen(js_name = logTelemetryAt)]
pub fn log_telemetry_at(
    path: &str,
    format: &str,
    bytes: &[u8],
    cursor_usec: Option<u64>,
) -> Result<JsValue, JsValue> {
    let parsed = parse(path, format, bytes)?;
    to_js(&log_engine::telemetry_at(&parsed.store, cursor_usec))
}

#[wasm_bindgen(js_name = logFlightSummary)]
pub fn log_flight_summary(path: &str, format: &str, bytes: &[u8]) -> Result<JsValue, JsValue> {
    let parsed = parse(path, format, bytes)?;
    to_js(&log_engine::flight_summary(&parsed.store))
}

#[wasm_bindgen(js_name = logExportCsvBytes)]
pub fn log_export_csv_bytes(
    path: &str,
    format: &str,
    bytes: &[u8],
    request: JsValue,
) -> Result<JsValue, JsValue> {
    let parsed = parse(path, format, bytes)?;
    let request: LogExportRequest = from_js(request)?;
    let (bytes, rows_written) = log_engine::export_csv_bytes(&parsed.store, &request)?;
    to_js(&serde_json::json!({
        "operation_id": OperationId::LogExport,
        "destination_path": request.destination_path,
        "bytes_written": bytes.len(),
        "rows_written": rows_written,
        "diagnostics": [],
        "bytes": bytes,
    }))
}

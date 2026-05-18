use serde_json::Value;

use crate::ipc::{DomainProvenance, DomainValue};

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct StatusTextEntry {
    pub sequence: u64,
    pub text: String,
    pub severity: String,
    pub timestamp_usec: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct StatusTextState {
    pub entries: Vec<StatusTextEntry>,
}

pub type StatusTextSnapshot = DomainValue<StatusTextState>;
pub const STATUS_TEXT_HISTORY_LIMIT: usize = 100;

pub fn status_text_entry_from_value(value: &Value) -> Option<StatusTextEntry> {
    Some(StatusTextEntry {
        sequence: 0,
        text: value.get("text")?.as_str()?.to_string(),
        severity: value
            .get("severity")
            .and_then(Value::as_str)
            .unwrap_or("info")
            .to_string(),
        timestamp_usec: value.get("timestamp_usec").and_then(Value::as_u64),
    })
}

#[allow(dead_code)]
pub fn status_text_snapshot_from_entries(
    entries: Vec<StatusTextEntry>,
    provenance: DomainProvenance,
) -> StatusTextSnapshot {
    DomainValue::present(StatusTextState { entries }, provenance)
}

pub fn push_status_text_entry(history: &mut Vec<StatusTextEntry>, entry: StatusTextEntry) {
    history.push(entry);
    if history.len() > STATUS_TEXT_HISTORY_LIMIT {
        let drain = history.len().saturating_sub(STATUS_TEXT_HISTORY_LIMIT);
        history.drain(0..drain);
    }
}

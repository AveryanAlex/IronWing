use serde_json::Value;

use crate::ipc::{DomainProvenance, DomainValue};

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub(crate) struct StatusTextEntry {
    pub sequence: u64,
    pub text: String,
    pub severity: String,
    pub timestamp_usec: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub(crate) struct StatusTextState {
    pub entries: Vec<StatusTextEntry>,
}

pub(crate) type StatusTextSnapshot = DomainValue<StatusTextState>;
pub(crate) const STATUS_TEXT_HISTORY_LIMIT: usize = 100;

pub(crate) fn status_text_entry_from_value(value: &Value) -> Option<StatusTextEntry> {
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

#[allow(dead_code)] // Used by runtime/bootstrap wiring; contract-fixture test target includes this module without that wiring.
pub(crate) fn status_text_snapshot_from_entries(
    entries: Vec<StatusTextEntry>,
    provenance: DomainProvenance,
) -> StatusTextSnapshot {
    DomainValue::present(StatusTextState { entries }, provenance)
}

pub(crate) fn push_status_text_entry(history: &mut Vec<StatusTextEntry>, entry: StatusTextEntry) {
    history.push(entry);
    if history.len() > STATUS_TEXT_HISTORY_LIMIT {
        let drain = history.len().saturating_sub(STATUS_TEXT_HISTORY_LIMIT);
        history.drain(0..drain);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_text_entry_keeps_new_contract_fields() {
        let value = serde_json::json!({
            "text": "Ready",
            "severity": "notice",
            "timestamp_usec": 42
        });

        let entry = status_text_entry_from_value(&value).expect("entry");
        assert_eq!(entry.sequence, 0);
        assert_eq!(entry.text, "Ready");
        assert_eq!(entry.severity, "notice");
        assert_eq!(entry.timestamp_usec, Some(42));
    }

    #[test]
    fn push_status_text_entry_keeps_rolling_history_limit() {
        let mut history = Vec::new();
        for index in 0..(STATUS_TEXT_HISTORY_LIMIT as u64 + 1) {
            push_status_text_entry(
                &mut history,
                StatusTextEntry {
                    sequence: index,
                    text: format!("msg-{index}"),
                    severity: "info".into(),
                    timestamp_usec: Some(index),
                },
            );
        }

        assert_eq!(history.len(), STATUS_TEXT_HISTORY_LIMIT);
        assert_eq!(history.first().map(|entry| entry.sequence), Some(1));
    }
}

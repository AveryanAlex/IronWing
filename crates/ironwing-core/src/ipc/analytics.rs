use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub type AnalyticsProperties = BTreeMap<String, AnalyticsProperty>;

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(untagged)]
pub enum AnalyticsProperty {
    String(String),
    Number(serde_json::Number),
}

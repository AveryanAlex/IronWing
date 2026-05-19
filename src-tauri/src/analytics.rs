use crate::ipc::analytics::{AnalyticsProperties, AnalyticsProperty};
use serde_json::{Map, Value};
use tauri_plugin_aptabase::EventTracker;

pub(crate) fn aptabase_native_key() -> Option<&'static str> {
    option_env!("IRONWING_APTABASE_KEY")
        .map(str::trim)
        .filter(|key| !key.is_empty())
}

pub(crate) fn aptabase_options() -> tauri_plugin_aptabase::InitOptions {
    tauri_plugin_aptabase::InitOptions {
        host: option_env!("IRONWING_APTABASE_HOST")
            .map(str::trim)
            .filter(|host| !host.is_empty())
            .map(ToOwned::to_owned),
        flush_interval: None,
    }
}

fn analytics_enabled() -> bool {
    aptabase_native_key().is_some()
}

#[tauri::command]
pub(crate) async fn analytics_status() -> bool {
    analytics_enabled()
}

#[tauri::command]
pub(crate) async fn analytics_track_event(
    app: tauri::AppHandle,
    name: String,
    props: Option<AnalyticsProperties>,
) -> Result<(), String> {
    if !analytics_enabled() {
        return Ok(());
    }

    let event_name = name.trim();
    if event_name.is_empty() {
        return Ok(());
    }

    let props = props.and_then(properties_to_value);
    app.track_event(event_name, props)
        .map_err(|error| format!("failed to enqueue analytics event {event_name:?}: {error}"))
}

fn properties_to_value(props: AnalyticsProperties) -> Option<Value> {
    let mut object = Map::with_capacity(props.len());

    for (key, value) in props {
        let key = key.trim();
        if key.is_empty() {
            continue;
        }

        object.insert(key.to_owned(), property_to_value(value));
    }

    if object.is_empty() {
        None
    } else {
        Some(Value::Object(object))
    }
}

fn property_to_value(value: AnalyticsProperty) -> Value {
    match value {
        AnalyticsProperty::String(value) => Value::String(value),
        AnalyticsProperty::Number(value) => Value::Number(value),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn properties_to_value_omits_empty_keys() {
        let props = AnalyticsProperties::from([
            (
                "transport".to_string(),
                AnalyticsProperty::String("tcp".to_string()),
            ),
            (
                " ".to_string(),
                AnalyticsProperty::String("ignored".to_string()),
            ),
        ]);

        assert_eq!(
            properties_to_value(props),
            Some(json!({ "transport": "tcp" }))
        );
    }
}

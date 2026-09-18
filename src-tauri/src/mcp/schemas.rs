//! Public result shapes. Vehicle-domain snapshots remain extensible SDK objects.
use serde_json::{Map, Value, json};

fn object(properties: Value) -> Value {
    let required: Vec<_> = properties.as_object().unwrap().keys().cloned().collect();
    json!({"type":"object","properties":properties,"required":required})
}
fn array(items: Value) -> Value {
    json!({"type":"array","items":items})
}

pub fn output(name: &str) -> Map<String, Value> {
    let string = json!({"type":"string"});
    let boolean = json!({"type":"boolean"});
    let integer = json!({"type":"integer","minimum":0});
    let number = json!({"type":"number"});
    let nullable_string = json!({"type":["string","null"]});
    let snapshot =
        json!({"type":"object","description":"Shared vehicle-domain snapshot from mavkit."});
    let optional_snapshot = json!({"type":["object","null"]});
    let transport =
        json!({"type":["object","null"],"description":"Transport kind and endpoint/settings."});
    let properties = match name {
        "connection_status" => {
            json!({"session_id":string,"source":string,"transport":transport,"state":snapshot,"effective_ui_source":string})
        }
        "devices_list" => {
            json!({"transports":array(snapshot.clone()),"serial":snapshot,"ble":snapshot,"demo_presets":array(string.clone()),"connect_schema":snapshot})
        }
        "vehicle_connect" => {
            json!({"session_id":string,"source":string,"connected":boolean,"transport":transport})
        }
        "vehicle_disconnect" => json!({"session_id":string,"disconnected":boolean}),
        "vehicle_status" => {
            json!({"session_id":string,"source":string,"state":snapshot,"firmware":optional_snapshot,"hardware":optional_snapshot,"unique_ids":optional_snapshot,"serial_device":optional_snapshot,"display_id":nullable_string,"sensor_health":optional_snapshot,"link":{"type":["string","object","null"]}})
        }
        "parameters_search" | "parameters_read" => {
            let parameter = object(json!({
                "id":string,"value":number,"type":string,"metadata_available":boolean,
                "human_name":nullable_string,"description":nullable_string,
                "range":{"type":["object","null"]},"increment":{"type":["number","null"]},
                "units":nullable_string,"unit_text":nullable_string,
                "values":{"type":["array","null"],"items":{"type":"object"}},"bitmask":{"type":["array","null"],"items":{"type":"object"}},
                "read_only":{"type":["boolean","null"]},"reboot_required":{"type":["boolean","null"]},"user_level":nullable_string
            }));
            json!({"session_id":string,"source":string,"sync":nullable_string,"total":integer,"truncated":boolean,"parameters":array(json!({"oneOf":[parameter,object(json!({"id":string,"error":string}))]}))})
        }
        "parameters_write" => {
            json!({"session_id":string,"atomic":{"const":false},"results":array(object(json!({"id":string,"requested_value":number,"confirmed_value":number,"success":boolean,"error":nullable_string})))})
        }
        "parameters_refresh" => {
            json!({"session_id":string,"count":integer,"sync":nullable_string})
        }
        "telemetry_catalog" => {
            json!({"session_id":string,"source":string,"named_fields":array(object(json!({"name":string,"message_id":integer,"field":string,"units":string,"scale":number}))),"observed_messages":array(object(json!({"message_id":integer,"name":string,"component_id":integer,"instance":{"type":["integer","null"]},"fields":array(string.clone()),"age_ms":integer}))),"raw_units":string,"raw_selector_example":snapshot,"note":string})
        }
        "message_rates_write" => {
            json!({"session_id":string,"results":array(object(json!({"message_id":integer,"requested_rate_hz":number,"success":boolean,"error":nullable_string})))})
        }
        "telemetry_read" => {
            let value = object(json!({
                "selector":schemars::schema_for!(super::telemetry::FieldSelector),"value":{},
                "missing":boolean,"received_at_ms":{"type":["integer","null"]},
                "age_ms":{"type":["integer","null"]},"new_packet":boolean
            }));
            json!({"session_id":string,"source":string,"completion":string,"requested_count":integer,"interval_ms":integer,"points":array(object(json!({"sampled_at_ms":integer,"values":array(value)})))})
        }
        "status_text_read" => {
            json!({"session_id":string,"source":string,"entries":array(snapshot.clone()),"cursor":object(json!({"session_id":string,"sequence":integer})),"history_lost":boolean})
        }
        "vehicle_reboot" => {
            json!({"session_id":string,"command_acknowledged":boolean,"boot_completed":{"const":false}})
        }
        _ => unreachable!("every published tool needs an output schema"),
    };
    object(properties).as_object().unwrap().clone()
}

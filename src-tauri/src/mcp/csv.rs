//! Compact MCP tables. Context is sent once, separately from the CSV text block.
use serde_json::{Value, json};

pub(super) fn items(value: &Value) -> &[Value] {
    value.as_array().map(Vec::as_slice).unwrap_or_default()
}

pub(super) fn cell(value: &Value) -> String {
    match value {
        Value::Null => "—".into(),
        Value::String(text) => text.clone(),
        other => other.to_string(),
    }
}

// Preserve commas, quotes and embedded line breaks without HTML escaping.
pub(super) fn write_cell(output: &mut String, text: &str) {
    if text.contains([',', '"', '\r', '\n']) {
        output.push('"');
        output.push_str(&text.replace('"', "\"\""));
        output.push('"');
    } else {
        output.push_str(text);
    }
}

fn table(rows: &Value, columns: &[&str]) -> String {
    let mut output = columns.join(",");
    output.push_str("\r\n");
    for row in items(rows) {
        for (index, column) in columns.iter().enumerate() {
            if index != 0 {
                output.push(',');
            }
            write_cell(&mut output, &cell(&row[*column]));
        }
        output.push_str("\r\n");
    }
    output
}

fn take_rows(value: &mut Value, key: &str) -> Value {
    value
        .as_object_mut()
        .and_then(|object| object.remove(key))
        .unwrap_or_else(|| json!([]))
}

fn header(mut context: Value, count: usize) -> String {
    context["returned"] = json!(count);
    context["csv_null"] = json!("—");
    context.to_string()
}

pub(super) fn parameter_search(mut value: Value) -> Vec<String> {
    let rows = take_rows(&mut value, "parameters");
    vec![
        header(value, items(&rows).len()),
        table(
            &rows,
            &[
                "id",
                "value",
                "human_name",
                "units",
                "read_only",
                "reboot_required",
                "metadata_available",
            ],
        ),
    ]
}

pub(super) fn parameter_read(mut value: Value, details: bool) -> Vec<String> {
    let rows = take_rows(&mut value, "parameters");
    let columns: &[&str] = if details {
        &[
            "id",
            "value",
            "type",
            "error",
            "metadata_available",
            "human_name",
            "description",
            "range",
            "increment",
            "units",
            "unit_text",
            "values",
            "bitmask",
            "read_only",
            "reboot_required",
            "user_level",
        ]
    } else {
        &["id", "value", "type", "error"]
    };
    vec![header(value, items(&rows).len()), table(&rows, columns)]
}

pub(super) fn catalog(mut value: Value) -> Vec<String> {
    let named = take_rows(&mut value, "named_fields");
    let observed = take_rows(&mut value, "observed_messages");
    value["named_count"] = json!(items(&named).len());
    value["observed_count"] = json!(items(&observed).len());
    value["csv_null"] = json!("—");
    vec![
        value.to_string(),
        table(&named, &["name", "units", "message_id", "field", "scale"]),
        table(
            &observed,
            &[
                "message_id",
                "name",
                "component_id",
                "instance",
                "fields",
                "age_ms",
            ],
        ),
    ]
}

pub(super) fn status_text(mut value: Value) -> Vec<String> {
    let rows = take_rows(&mut value, "entries");
    vec![
        header(value, items(&rows).len()),
        table(&rows, &["timestamp_usec", "severity", "sequence", "text"]),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn search_retains_unknown_metadata_and_counts_without_full_documentation() {
        let result = parameter_search(json!({"session_id":"s","source":"live_parameter_cache",
            "sync":"synced","total":100,"truncated":true,"parameters":[
                {"id":"A","value":0,"human_name":"Pressure, \"primary\"","units":"Pa",
                 "read_only":false,"reboot_required":true,"metadata_available":true,
                 "description":"not sent","values":[{"value":0,"label":"not sent"}]},
                {"id":"B","value":1,"metadata_available":false}]}));
        let context: Value = serde_json::from_str(&result[0]).unwrap();
        assert_eq!(context["returned"], 2);
        assert_eq!(context["total"], 100);
        assert_eq!(context["truncated"], true);
        assert_eq!(context["sync"], "synced");
        assert!(context.get("parameters").is_none());
        assert_eq!(
            result[1],
            "id,value,human_name,units,read_only,reboot_required,metadata_available\r\nA,0,\"Pressure, \"\"primary\"\"\",Pa,false,true,true\r\nB,1,—,—,—,—,false\r\n"
        );
    }

    #[test]
    fn values_distinguish_zero_from_missing_parameter_and_empty_batch() {
        let result = parameter_read(
            json!({"parameters":[
            {"id":"A","value":0,"type":"real32"},
            {"id":"B","error":"not_found"}]}),
            false,
        );
        assert_eq!(
            result[1],
            "id,value,type,error\r\nA,0,real32,—\r\nB,—,—,not_found\r\n"
        );
        let empty = parameter_read(json!({"parameters":[]}), false);
        assert_eq!(empty[1], "id,value,type,error\r\n");
    }

    #[test]
    fn detailed_csv_preserves_full_shared_metadata() {
        let metadata = super::super::metadata::parse(include_str!(
            "../../../tests/fixtures/parameter-metadata.xml"
        ))
        .unwrap();
        let mut entry = metadata["BARO_TEST"].clone();
        entry["id"] = json!("BARO_TEST");
        entry["value"] = json!(3.0);
        entry["type"] = json!("real32");
        entry["metadata_available"] = json!(true);
        let result = parameter_read(json!({"parameters":[entry]}), true);
        assert_eq!(
            result[1],
            concat!(
                "id,value,type,error,metadata_available,human_name,description,range,increment,units,unit_text,values,bitmask,read_only,reboot_required,user_level\r\n",
                "BARO_TEST,3.0,real32,—,true,Barometer offset,Pressure offset for calibration,",
                "\"{\"\"max\"\":100.0,\"\"min\"\":-100.0}\",0.1,Pa,pascals,",
                "\"[{\"\"code\"\":0.0,\"\"label\"\":\"\"Disabled\"\"},{\"\"code\"\":1.0,\"\"label\"\":\"\"Enabled\"\"}]\",",
                "\"[{\"\"bit\"\":0.0,\"\"label\"\":\"\"Primary\"\"},{\"\"bit\"\":2.0,\"\"label\"\":\"\"Secondary\"\"}]\",false,true,Advanced\r\n"
            )
        );
    }

    #[test]
    fn catalog_keeps_observed_packet_selectors_and_scale() {
        let observed = json!([{"message_id":29,"component_id":1,"instance":null,
            "name":"SCALED_PRESSURE","fields":["press_abs"],"age_ms":30}]);
        let result = catalog(json!({"session_id":"s","source":"live",
            "observed_messages":observed,"raw_units":"wire units",
            "raw_selector_example":{"message_id":29,"field":"press_abs"},
            "note":"Reading never enables streams.",
            "named_fields":[{"name":"barometer.0.pressure_hpa","units":"hPa",
            "message_id":29,"field":"press_abs","scale":1.0}]}));
        let context: Value = serde_json::from_str(&result[0]).unwrap();
        assert!(context.get("observed_messages").is_none());
        assert_eq!(
            result[2],
            "message_id,name,component_id,instance,fields,age_ms\r\n29,SCALED_PRESSURE,1,—,\"[\"\"press_abs\"\"]\",30\r\n"
        );
        assert!(context.get("named_fields").is_none());
        assert_eq!(
            result[1],
            "name,units,message_id,field,scale\r\nbarometer.0.pressure_hpa,hPa,29,press_abs,1.0\r\n"
        );
    }

    #[test]
    fn alerts_preserve_cursor_loss_microsecond_timestamp_and_multiline_text() {
        let result = status_text(json!({"session_id":"s","source":"live",
            "cursor":{"session_id":"s","sequence":9007199254740993_u64},"history_lost":true,
            "entries":[{"timestamp_usec":9007199254740993_u64,"severity":"warning",
            "sequence":11,"text":"PreArm: GPS, \"unhealthy\"\r\nCheck antenna"},
            {"timestamp_usec":null,"severity":"info","sequence":12,"text":""}]}));
        let context: Value = serde_json::from_str(&result[0]).unwrap();
        assert_eq!(context["history_lost"], true);
        assert_eq!(context["cursor"]["sequence"], 9007199254740993_u64);
        assert!(context.get("entries").is_none());
        assert_eq!(
            result[1],
            "timestamp_usec,severity,sequence,text\r\n9007199254740993,warning,11,\"PreArm: GPS, \"\"unhealthy\"\"\r\nCheck antenna\"\r\n—,info,12,\r\n"
        );
    }
}

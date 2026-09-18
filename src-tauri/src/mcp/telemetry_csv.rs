//! Compact textual presentation of sampled telemetry; no second JSON copy is sent to MCP clients.
use super::csv::{cell, items, write_cell};
use serde_json::Value;
use std::fmt::Write;

fn source(value: &Value) -> String {
    if let Some(message) = value.get("source_message") {
        return cell(message);
    }
    let mut parts = Vec::new();
    for (key, label) in [
        ("message_id", "msg"),
        ("component_id", "comp"),
        ("instance", "instance"),
    ] {
        if let Some(number) = value.get(key).filter(|v| !v.is_null()) {
            parts.push(format!("{label}={}", cell(number)));
        }
    }
    parts.join(", ")
}

pub(super) fn render(result: &Value) -> [String; 2] {
    let points = items(&result["points"]);
    let first_values = points
        .first()
        .map(|p| items(&p["values"]))
        .unwrap_or_default();
    let fields: Vec<&Value> = if let Some(fields) = result["fields"].as_array() {
        fields.iter().collect()
    } else {
        first_values.iter().map(|v| &v["selector"]).collect()
    };
    let t0 = points.first().and_then(|p| p["sampled_at_ms"].as_u64());
    let mut summary = format!(
        "Live telemetry; session {}.\nSamples: {}/{}; interval_ms: {}; completion: {}.\n",
        cell(&result["session_id"]),
        points.len(),
        cell(&result["requested_count"]),
        cell(&result["interval_ms"]),
        cell(&result["completion"])
    );
    if let Some(t0) = t0 {
        let _ = writeln!(
            summary,
            "t0={t0} Unix ms; time columns and rx are ms offsets from t0. Cells: value@rx/age; age in ms; + = new packet, no + = cached; — = missing. #n selects a source listed below."
        );
    }
    let mut output = String::from("Field,Source");
    for point in points {
        let offset = point["sampled_at_ms"]
            .as_u64()
            .zip(t0)
            .map(|(t, t0)| i128::from(t) - i128::from(t0));
        let _ = write!(
            output,
            ",{}",
            offset.map(|t| t.to_string()).unwrap_or_else(|| "—".into())
        );
    }
    output.push_str("\r\n");
    for (index, selector) in fields.iter().enumerate() {
        let mut sources = Vec::new();
        for point in points {
            let descriptor = source(&point["values"][index]);
            if !descriptor.is_empty() && !sources.contains(&descriptor) {
                sources.push(descriptor);
            }
        }
        let description = if sources.len() > 1 {
            sources
                .iter()
                .enumerate()
                .map(|(i, source)| format!("#{} {source}", i + 1))
                .collect::<Vec<_>>()
                .join("; ")
        } else {
            sources.first().cloned().unwrap_or_else(|| "—".into())
        };
        write_cell(&mut output, &cell(selector));
        output.push(',');
        write_cell(&mut output, &description);
        for point in points {
            let value = &point["values"][index];
            let mut sample = cell(&value["value"]);
            if let Some((received, t0)) = value["received_at_ms"].as_u64().zip(t0) {
                let _ = write!(
                    sample,
                    "@{}/{}",
                    i128::from(received) - i128::from(t0),
                    cell(&value["age_ms"])
                );
            }
            if value["new_packet"].as_bool() == Some(true) {
                sample.push('+');
            }
            if sources.len() > 1
                && let Some(source_index) = sources.iter().position(|s| s == &source(value))
            {
                let _ = write!(sample, "#{}", source_index + 1);
            }
            output.push(',');
            write_cell(&mut output, &sample);
        }
        output.push_str("\r\n");
    }
    [summary, output]
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn csv_preserves_freshness_missing_values_and_receive_times() {
        let result = json!({"session_id":"demo","requested_count":3,"interval_ms":1000,"completion":"complete","points":[
            {"sampled_at_ms":1000,"values":[{"selector":"barometer.0.pressure_hpa","value":1013.25,"received_at_ms":990,"age_ms":10,"new_packet":true,"message_id":29,"component_id":1},{"selector":"imu.0.acceleration_x_mps2","value":null}]},
            {"sampled_at_ms":2000,"values":[{"selector":"barometer.0.pressure_hpa","value":1013.25,"received_at_ms":1990,"age_ms":10,"new_packet":true,"message_id":29,"component_id":1},{"selector":"imu.0.acceleration_x_mps2","value":null}]},
            {"sampled_at_ms":3000,"values":[{"selector":"barometer.0.pressure_hpa","value":1013.25,"received_at_ms":1990,"age_ms":1010,"new_packet":false,"message_id":29,"component_id":1},{"selector":"imu.0.acceleration_x_mps2","value":null}]}
        ]});
        let [summary, csv] = render(&result);
        assert!(summary.contains("t0=1000 Unix ms"));
        assert_eq!(
            csv,
            concat!(
                "Field,Source,0,1000,2000\r\n",
                "barometer.0.pressure_hpa,\"msg=29, comp=1\",1013.25@-10/10+,1013.25@990/10+,1013.25@990/1010\r\n",
                "imu.0.acceleration_x_mps2,—,—,—,—\r\n"
            )
        );
    }

    #[test]
    fn csv_handles_empty_partial_capture_and_source_changes() {
        let mut result = json!({"session_id":"demo","fields":[{"message_id":1,"field":"text"}],"requested_count":10,"interval_ms":1000,"completion":"session_changed_or_disconnected","points":[]});
        let [summary, csv] = render(&result);
        assert!(summary.contains("Samples: 0/10"));
        assert!(summary.contains("session_changed_or_disconnected"));
        assert!(!summary.contains("t0="));
        assert!(csv.starts_with("Field,Source\r\n"));
        result["points"] = json!([{"sampled_at_ms":1000,"values":[{"value":"a,b\n\"quoted\"","message_id":1,"component_id":1,"instance":0}]},{"sampled_at_ms":2000,"values":[{"value":[1,2],"message_id":1,"component_id":2,"instance":1}]}]);
        let [_, csv] = render(&result);
        assert!(csv.contains("\"#1 msg=1, comp=1, instance=0; #2 msg=1, comp=2, instance=1\""));
        assert!(csv.contains("\"a,b\n\"\"quoted\"\"#1\""));
        assert!(csv.contains("\"[1,2]#2\""));
        assert!(csv.contains("\"{\"\"field\"\":\"\"text\"\",\"\"message_id\"\":1}\""));
    }

    #[test]
    fn csv_quotes_only_when_needed_and_keeps_raw_text() {
        for (raw, expected) in [
            ("plain|text", "plain|text"),
            ("<b>`x`</b>", "<b>`x`</b>"),
            ("a,b", "\"a,b\""),
            ("a\"b", "\"a\"\"b\""),
            ("a\r\nb", "\"a\r\nb\""),
        ] {
            let mut csv = String::new();
            write_cell(&mut csv, raw);
            assert_eq!(csv, expected);
        }
    }
}

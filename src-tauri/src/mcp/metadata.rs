//! ArduPilot metadata, independent of the frontend and available with a hidden window.
use serde_json::{Value, json};
use std::{
    collections::BTreeMap,
    io::Read,
    path::Path,
    sync::Arc,
    time::{Duration, Instant},
};
use tauri::Manager;
use tokio::sync::Mutex;

pub type Metadata = BTreeMap<String, Value>;
type CachedMetadata = BTreeMap<String, (Instant, Arc<Metadata>)>;
#[derive(Default)]
pub struct MetadataCache {
    entries: Mutex<CachedMetadata>,
}
impl MetadataCache {
    pub async fn get(&self, app: &tauri::AppHandle, vehicle: &mavkit::Vehicle) -> Arc<Metadata> {
        let kind = serde_json::to_value(vehicle.identity().vehicle_type)
            .ok()
            .and_then(|v| v.as_str().map(str::to_owned))
            .unwrap_or_default();
        let Some(slug) = vehicle_slug(&kind) else {
            return Arc::default();
        };
        let version = vehicle.info().firmware().latest().and_then(|f| f.version);
        let key = format!("{slug}/{}", version.as_deref().unwrap_or("generic"));
        let mut entries = self.entries.lock().await;
        if let Some((at, data)) = entries.get(&key)
            && at.elapsed() < Duration::from_secs(300)
        {
            return data.clone();
        }
        let mut merged = Metadata::new();
        if let Ok(root) = app.path().app_cache_dir() {
            let client = reqwest::Client::builder()
                .timeout(Duration::from_secs(5))
                .build();
            if let Ok(client) = client {
                for path in sources(slug, version.as_deref()) {
                    if let Some(xml) =
                        fetch_xml(&client, &root.join("parameter-metadata"), &path).await
                        && let Ok(metadata) = parse(&xml)
                    {
                        for (id, entry) in metadata {
                            merged.entry(id).or_insert(entry);
                        }
                    }
                }
            }
        }
        let merged = Arc::new(merged);
        entries.insert(key, (Instant::now(), merged.clone()));
        merged
    }
}
fn vehicle_slug(kind: &str) -> Option<&'static str> {
    Some(match kind {
        "quadrotor" | "hexarotor" | "octorotor" | "tricopter" | "coaxial" => "ArduCopter",
        "helicopter" => "Heli",
        "fixed_wing" | "vtol" => "ArduPlane",
        "ground_rover" => "Rover",
        "submarine" => "ArduSub",
        "blimp" => "Blimp",
        "antenna_tracker" => "AntennaTracker",
        _ => return None,
    })
}
fn sources(slug: &str, version: Option<&str>) -> Vec<String> {
    let mut result = Vec::new();
    let short = match slug {
        "ArduCopter" => Some("Copter"),
        "ArduPlane" => Some("Plane"),
        "ArduSub" => Some("Sub"),
        "Rover" => Some("Rover"),
        "AntennaTracker" => Some("Tracker"),
        _ => None,
    };
    if let (Some(short), Some(version)) = (short, version)
        && version.split('.').count() == 3
        && version
            .split('.')
            .all(|v| !v.is_empty() && v.bytes().all(|b| b.is_ascii_digit()))
    {
        result.push(format!(
            "Parameters/versioned/{short}/stable-{version}/apm.pdef.xml"
        ));
    }
    for slug in [slug, "SITL", "AP_Periph"] {
        result.push(format!("Parameters/{slug}/apm.pdef.xml.gz"));
    }
    result
}
async fn fetch_xml(client: &reqwest::Client, root: &Path, path: &str) -> Option<String> {
    let cache = root.join(path.replace('/', "_"));
    let cached = std::fs::read_to_string(&cache).ok();
    let fresh = std::fs::metadata(&cache)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|m| m.elapsed().ok())
        .is_some_and(|age| age < Duration::from_secs(7 * 24 * 3600));
    if fresh && cached.is_some() {
        return cached;
    }
    let downloaded = async {
        let response = client
            .get(format!("https://autotest.ardupilot.org/{path}"))
            .send()
            .await
            .ok()?
            .error_for_status()
            .ok()?;
        let bytes = response.bytes().await.ok()?;
        if bytes.len() > 16 * 1024 * 1024 {
            return None;
        }
        let xml = if path.ends_with(".gz") {
            let mut xml = String::new();
            flate2::read::GzDecoder::new(bytes.as_ref())
                .take(32 * 1024 * 1024)
                .read_to_string(&mut xml)
                .ok()?;
            xml
        } else {
            String::from_utf8(bytes.to_vec()).ok()?
        };
        parse(&xml).ok()?;
        if std::fs::create_dir_all(root).is_ok() {
            let _ = std::fs::write(&cache, &xml);
        }
        Some(xml)
    }
    .await;
    downloaded.or(cached)
}
pub fn parse(xml: &str) -> Result<Metadata, String> {
    let doc = roxmltree::Document::parse(xml).map_err(|e| e.to_string())?;
    let mut result = Metadata::new();
    for node in doc.descendants().filter(|n| n.has_tag_name("param")) {
        let raw = node.attribute("name").unwrap_or("");
        let id = raw.split_once(':').map_or(raw, |(_, id)| id);
        if id.is_empty() || result.contains_key(id) {
            continue;
        }
        let text = |key: &str| {
            node.attribute(key)
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .or_else(|| {
                    node.children()
                        .find(|n| n.has_tag_name("field") && n.attribute("name") == Some(key))
                        .and_then(|n| n.text())
                        .map(str::trim)
                        .filter(|s| !s.is_empty())
                })
        };
        let number = |key: &str| {
            text(key)
                .and_then(|s| s.parse::<f64>().ok())
                .filter(|n| n.is_finite())
        };
        let flag = |key: &str| text(key).map(|s| s.eq_ignore_ascii_case("true"));
        let range=text("Range").and_then(|s|{let mut parts=s.split_whitespace();Some(json!({"min":parts.next()?.parse::<f64>().ok()?,"max":parts.next()?.parse::<f64>().ok()?}))});
        let options = |tag: &str, attribute: &str, field: &str, code_key: &str| {
            let mut items:Vec<Value>=node.descendants().filter(|n|n.has_tag_name(tag)).filter_map(|n|Some(json!({code_key:n.attribute(attribute)?.parse::<f64>().ok()?,"label":n.text()?.trim()}))).collect();
            if items.is_empty()
                && let Some(value) = text(field)
            {
                items = value
                    .split(',')
                    .filter_map(|s| {
                        let (c, l) = s.split_once(':')?;
                        Some(json!({code_key:c.trim().parse::<f64>().ok()?,"label":l.trim()}))
                    })
                    .collect();
            }
            if items.is_empty() {
                Value::Null
            } else {
                json!(items)
            }
        };
        result.insert(id.into(),json!({"human_name":text("humanName").unwrap_or(""),"description":text("documentation").unwrap_or(""),"range":range,"increment":number("Increment"),"units":text("Units"),"unit_text":text("UnitText"),"values":options("value","code","Values","code"),"bitmask":options("bit","code","Bitmask","bit"),"reboot_required":flag("RebootRequired"),"read_only":flag("ReadOnly"),"user_level":text("user").or_else(||text("User"))}));
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_shared_metadata_fixture_with_precedence_and_optional_values() {
        let data = parse(include_str!(
            "../../../tests/fixtures/parameter-metadata.xml"
        ))
        .unwrap();
        let baro = &data["BARO_TEST"];
        assert_eq!(baro["human_name"], "Barometer offset");
        assert_eq!(baro["range"], json!({"min":-100.0,"max":100.0}));
        assert_eq!(baro["increment"], 0.1);
        assert_eq!(baro["reboot_required"], true);
        assert_eq!(baro["read_only"], false);
        assert_eq!(baro["values"][1]["label"], "Enabled");
        assert_eq!(baro["bitmask"][1]["bit"], 2.0);
        assert_eq!(data["TEXT_TEST"]["values"][1]["code"], 1.0);
        assert_eq!(data["TEXT_TEST"]["increment"], Value::Null);
    }
    #[test]
    fn metadata_order_matches_frontend_and_rejects_invalid_version() {
        assert_eq!(
            sources("ArduPlane", Some("4.6.2")),
            vec![
                "Parameters/versioned/Plane/stable-4.6.2/apm.pdef.xml",
                "Parameters/ArduPlane/apm.pdef.xml.gz",
                "Parameters/SITL/apm.pdef.xml.gz",
                "Parameters/AP_Periph/apm.pdef.xml.gz"
            ]
        );
        assert_eq!(sources("ArduPlane", Some("../foo")).len(), 3);
    }
    #[tokio::test]
    async fn uses_stale_disk_metadata_when_network_fails() {
        let root =
            std::env::temp_dir().join(format!("ironwing-mcp-metadata-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let path = "Parameters/test.xml";
        let file = root.join(path.replace('/', "_"));
        std::fs::write(&file, "<paramfile><param name=\"OFFLINE\"/></paramfile>").unwrap();
        let old = SystemTime::now() - Duration::from_secs(8 * 24 * 3600);
        std::fs::File::options()
            .write(true)
            .open(&file)
            .unwrap()
            .set_modified(old)
            .unwrap();
        let client = reqwest::Client::builder()
            .proxy(reqwest::Proxy::all("http://127.0.0.1:1").unwrap())
            .timeout(Duration::from_millis(100))
            .build()
            .unwrap();
        assert!(
            fetch_xml(&client, &root, path)
                .await
                .unwrap()
                .contains("OFFLINE")
        );
        std::fs::remove_dir_all(root).unwrap();
    }
    use std::time::SystemTime;
}

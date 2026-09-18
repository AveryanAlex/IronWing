use futures_util::StreamExt;
use mavlink::{MavlinkVersion, Message};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    collections::{BTreeMap, HashMap},
    sync::{Arc, RwLock},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tokio::{task::JoinHandle, time::Instant};
use tokio_util::sync::CancellationToken;

#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(untagged)]
pub enum FieldSelector {
    /// A name from telemetry_catalog, e.g. barometer.0.pressure_hpa.
    Named(String),
    /// Raw MAVLink payload field, with optional component and instance filters.
    Raw {
        message_id: u32,
        field: String,
        component_id: Option<u8>,
        instance: Option<u16>,
    },
}
#[derive(Clone, Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ReadRequest {
    pub fields: Vec<FieldSelector>,
    #[serde(default = "one")]
    pub count: u32,
    #[serde(default = "second")]
    pub interval_ms: u64,
}
fn one() -> u32 {
    1
}
fn second() -> u64 {
    1000
}
impl ReadRequest {
    pub fn validate(&self) -> Result<(), String> {
        if self.fields.is_empty() || self.fields.len() > 64 {
            return Err("fields must contain 1..64 selectors".into());
        }
        if self.count == 0
            || self.count > 1000
            || self.interval_ms < 20
            || u64::from(self.count - 1)
                .checked_mul(self.interval_ms)
                .is_none_or(|d| d > 60_000)
        {
            return Err(
                "count must be 1..1000, interval_ms >= 20, and (count-1)*interval_ms <= 60000"
                    .into(),
            );
        }
        for field in &self.fields {
            resolve(field)?;
        }
        Ok(())
    }
}
#[derive(Clone, Serialize)]
pub struct NamedField {
    pub name: String,
    pub message_id: u32,
    pub field: String,
    pub units: String,
    pub scale: f64,
}
pub fn named_fields() -> Vec<NamedField> {
    let mut fields = Vec::new();
    let mut add = |name: &str, message_id, field: &str, units: &str, scale| {
        fields.push(NamedField {
            name: name.into(),
            message_id,
            field: field.into(),
            units: units.into(),
            scale,
        })
    };
    for (name, id, field, units, scale) in [
        ("flight.altitude_m", 33, "alt", "m", 0.001),
        ("flight.speed_mps", 74, "groundspeed", "m/s", 1.0),
        ("flight.climb_rate_mps", 74, "climb", "m/s", 1.0),
        ("flight.airspeed_mps", 74, "airspeed", "m/s", 1.0),
        ("flight.throttle_pct", 74, "throttle", "%", 1.0),
        ("navigation.latitude_deg", 33, "lat", "deg", 1e-7),
        ("navigation.longitude_deg", 33, "lon", "deg", 1e-7),
        ("navigation.heading_deg", 74, "heading", "deg", 1.0),
        ("navigation.wp_dist_m", 62, "wp_dist", "m", 1.0),
        ("navigation.nav_bearing_deg", 62, "nav_bearing", "deg", 1.0),
        (
            "navigation.target_bearing_deg",
            62,
            "target_bearing",
            "deg",
            1.0,
        ),
        ("navigation.xtrack_error_m", 62, "xtrack_error", "m", 1.0),
        (
            "attitude.roll_deg",
            30,
            "roll",
            "deg",
            180.0 / std::f64::consts::PI,
        ),
        (
            "attitude.pitch_deg",
            30,
            "pitch",
            "deg",
            180.0 / std::f64::consts::PI,
        ),
        (
            "attitude.yaw_deg",
            30,
            "yaw",
            "deg",
            180.0 / std::f64::consts::PI,
        ),
        ("power.battery_voltage_v", 1, "voltage_battery", "V", 0.001),
        ("power.battery_current_a", 1, "current_battery", "A", 0.01),
        ("power.battery_pct", 1, "battery_remaining", "%", 1.0),
        ("gps.satellites", 24, "satellites_visible", "", 1.0),
        (
            "power.energy_consumed_wh",
            147,
            "energy_consumed",
            "Wh",
            0.0277777778,
        ),
        (
            "power.battery_time_remaining_s",
            147,
            "time_remaining",
            "s",
            1.0,
        ),
        ("power.battery_voltage_cells", 147, "voltages", "V", 0.001),
        ("gps.hdop", 24, "eph", "", 0.01),
        ("gps.fix_type", 24, "fix_type", "", 1.0),
        ("terrain.terrain_height_m", 136, "terrain_height", "m", 1.0),
        (
            "terrain.height_above_terrain_m",
            136,
            "current_height",
            "m",
            1.0,
        ),
        ("radio.rc_rssi", 65, "rssi", "", 1.0),
    ] {
        add(name, id, field, units, scale);
    }
    for (instance, id) in [29, 137, 143].into_iter().enumerate() {
        add(
            &format!("barometer.{instance}.pressure_hpa"),
            id,
            "press_abs",
            "hPa",
            1.0,
        );
        add(
            &format!("barometer.{instance}.temperature_c"),
            id,
            "temperature",
            "degC",
            0.01,
        );
        add(
            &format!("barometer.{instance}.differential_pressure_hpa"),
            id,
            "press_diff",
            "hPa",
            1.0,
        );
    }
    for (instance, id) in [26, 116, 129].into_iter().enumerate() {
        for axis in ["x", "y", "z"] {
            add(
                &format!("imu.{instance}.acceleration_{axis}_mps2"),
                id,
                &format!("{axis}acc"),
                "m/s²",
                0.00980665,
            );
            add(
                &format!("imu.{instance}.angular_velocity_{axis}_radps"),
                id,
                &format!("{axis}gyro"),
                "rad/s",
                0.001,
            );
            add(
                &format!("imu.{instance}.magnetic_field_{axis}_gauss"),
                id,
                &format!("{axis}mag"),
                "gauss",
                0.001,
            );
        }
    }
    for channel in 1..=18 {
        add(
            &format!("radio.rc_channel_{channel}_us"),
            65,
            &format!("chan{channel}_raw"),
            "us",
            1.0,
        );
    }
    for channel in 1..=16 {
        add(
            &format!("radio.servo_{channel}_us"),
            36,
            &format!("servo{channel}_raw"),
            "us",
            1.0,
        );
    }
    fields
}
struct Resolved {
    message_id: u32,
    field: String,
    component: Option<u8>,
    instance: Option<u16>,
    scale: f64,
}
fn resolve(selector: &FieldSelector) -> Result<Resolved, String> {
    match selector {
        FieldSelector::Named(name) => named_fields()
            .into_iter()
            .find(|f| &f.name == name)
            .map(|f| Resolved {
                message_id: f.message_id,
                field: f.field,
                component: None,
                instance: None,
                scale: f.scale,
            })
            .ok_or_else(|| format!("Unknown telemetry field {name}; use telemetry_catalog")),
        FieldSelector::Raw {
            message_id,
            field,
            component_id,
            instance,
        } => {
            if field.is_empty() || field.len() > 128 || *message_id > 0xFFFFFF {
                return Err("Invalid MAVLink field selector".into());
            }
            Ok(Resolved {
                message_id: *message_id,
                field: field.clone(),
                component: *component_id,
                instance: *instance,
                scale: 1.0,
            })
        }
    }
}
#[derive(Clone)]
struct Packet {
    name: String,
    payload: Value,
    received: Instant,
    timestamp_ms: u64,
    revision: u64,
}
#[derive(Default)]
pub struct TelemetryCache {
    packets: BTreeMap<(u32, u8, Option<u16>), Packet>,
    revision: u64,
    metrics: BTreeMap<String, MetricValue>,
}
#[derive(Clone)]
struct MetricValue {
    value: Value,
    received: Instant,
    source: mavkit::TelemetryMessageKind,
    vehicle_time: Option<mavkit::VehicleTimestamp>,
}
pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
impl TelemetryCache {
    fn insert(&mut self, id: u32, component: u8, name: String, payload: Value, age: Duration) {
        let instance = payload
            .get("id")
            .or_else(|| payload.get("port"))
            .and_then(Value::as_u64)
            .and_then(|v| u16::try_from(v).ok());
        self.revision += 1;
        // Only the latest packet per source is retained; bound arbitrary incoming instances.
        if self.packets.len() >= 4096 && !self.packets.contains_key(&(id, component, instance)) {
            self.packets.pop_first();
        }
        self.packets.insert(
            (id, component, instance),
            Packet {
                name,
                payload,
                received: Instant::now().checked_sub(age).unwrap_or_else(Instant::now),
                timestamp_ms: now_ms().saturating_sub(age.as_millis() as u64),
                revision: self.revision,
            },
        );
    }
    pub fn refresh_metrics(&mut self, vehicle: &mavkit::Vehicle) {
        let t = vehicle.telemetry();
        macro_rules! scalar {
            ($name:expr,$handle:expr) => {
                if let Some(sample) = $handle.latest() {
                    self.metrics.insert(
                        $name.into(),
                        MetricValue {
                            value: json!(sample.value),
                            received: sample.received_at,
                            source: sample.source,
                            vehicle_time: sample.vehicle_time,
                        },
                    );
                }
            };
        }
        macro_rules! field {
            ($name:expr,$sample:expr,$field:ident) => {
                if let Some(sample) = &$sample {
                    self.metrics.insert(
                        $name.into(),
                        MetricValue {
                            value: json!(sample.value.$field),
                            received: sample.received_at,
                            source: sample.source,
                            vehicle_time: sample.vehicle_time.clone(),
                        },
                    );
                }
            };
        }
        let position = t.position().global().latest();
        field!("flight.altitude_m", position, altitude_msl_m);
        field!("navigation.latitude_deg", position, latitude_deg);
        field!("navigation.longitude_deg", position, longitude_deg);
        scalar!("flight.speed_mps", t.position().groundspeed_mps());
        scalar!("flight.airspeed_mps", t.position().airspeed_mps());
        scalar!("flight.climb_rate_mps", t.position().climb_rate_mps());
        scalar!("flight.throttle_pct", t.position().throttle_pct());
        scalar!("navigation.heading_deg", t.position().heading_deg());
        let attitude = t.attitude().euler().latest();
        field!("attitude.roll_deg", attitude, roll_deg);
        field!("attitude.pitch_deg", attitude, pitch_deg);
        field!("attitude.yaw_deg", attitude, yaw_deg);
        scalar!("power.battery_voltage_v", t.battery().voltage_v());
        scalar!("power.battery_current_a", t.battery().current_a());
        scalar!("power.battery_pct", t.battery().remaining_pct());
        scalar!("power.energy_consumed_wh", t.battery().energy_consumed_wh());
        scalar!(
            "power.battery_time_remaining_s",
            t.battery().time_remaining_s()
        );
        let cells = t.battery().cells().latest();
        field!("power.battery_voltage_cells", cells, voltages_v);
        let gps = t.gps().quality().latest();
        field!("gps.satellites", gps, satellites);
        field!("gps.hdop", gps, hdop);
        field!("gps.fix_type", gps, fix_type);
        let waypoint = t.navigation().waypoint().latest();
        field!("navigation.wp_dist_m", waypoint, distance_m);
        field!("navigation.nav_bearing_deg", waypoint, bearing_deg);
        let guidance = t.navigation().guidance().latest();
        field!("navigation.target_bearing_deg", guidance, bearing_deg);
        field!("navigation.xtrack_error_m", guidance, cross_track_error_m);
        let terrain = t.terrain().clearance().latest();
        field!("terrain.terrain_height_m", terrain, terrain_height_m);
        field!(
            "terrain.height_above_terrain_m",
            terrain,
            height_above_terrain_m
        );
        scalar!("radio.rc_rssi", t.rc().rssi_pct());
        for index in 0..18 {
            if let Some(handle) = t.rc().channel_pwm_us(index) {
                scalar!(format!("radio.rc_channel_{}_us", index + 1), handle);
            }
        }
        for index in 0..16 {
            if let Some(handle) = t.actuators().servo_pwm_us(index) {
                scalar!(format!("radio.servo_{}_us", index + 1), handle);
            }
        }
    }
    pub fn catalog(&self) -> Value {
        let messages:Vec<Value> = self.packets.iter().map(|((id,component,instance),p)| json!({"message_id":id,"name":p.name,"component_id":component,"instance":instance,"fields":p.payload.as_object().map(|o| o.keys().collect::<Vec<_>>()),"age_ms":p.received.elapsed().as_millis() as u64})).collect();
        json!({"named_fields":named_fields(),"observed_messages":messages,"raw_units":"MAVLink wire units; named fields apply the documented scale", "raw_selector_example":{"message_id":29,"field":"press_abs","component_id":1},"note":"Reading never enables streams. Use message_rates_write with the message_id if data is missing."})
    }
    pub fn sample(&self, fields: &[FieldSelector], previous: &mut HashMap<usize, String>) -> Value {
        let values:Vec<Value> = fields.iter().enumerate().map(|(index,selector)| {
            if let FieldSelector::Named(name)=selector {
                if let Some(metric)=self.metrics.get(name) {
                    let revision=format!("{:?}/{:?}",metric.source,metric.received);
                    let fresh=previous.insert(index,revision.clone())!=Some(revision);
                    let age=metric.received.elapsed().as_millis() as u64;
                    return json!({"selector":selector,"value":metric.value,"missing":metric.value.is_null(),"received_at_ms":now_ms().saturating_sub(age),"age_ms":age,"new_packet":fresh,"source_message":metric.source,"vehicle_time":metric.vehicle_time});
                }
                // SDK metrics decode unavailable/sentinel values; never substitute unvalidated wire numbers.
                if !name.starts_with("barometer.") && !name.starts_with("imu.") {
                    return json!({"selector":selector,"value":null,"missing":true,"received_at_ms":null,"age_ms":null,"new_packet":false});
                }
            }
            let Ok(field) = resolve(selector) else { return json!({"selector":selector,"value":null}); };
            let packet = self.packets.iter().filter(|((id,component,instance),_)| *id == field.message_id && field.component.is_none_or(|c| c == *component) && field.instance.is_none_or(|i| Some(i)==*instance)).max_by_key(|(_,p)|p.revision);
            let Some(((..,component,instance),packet)) = packet else { return json!({"selector":selector,"value":null,"missing":true,"message_id":field.message_id,"received_at_ms":null,"age_ms":null,"new_packet":false}); };
            let raw = field.field.split('.').try_fold(&packet.payload, |value,key| if let Ok(index)=key.parse::<usize>() { value.get(index) } else { value.get(key) });
            let value = raw.map(|v| v.as_f64().map(|n| json!(n*field.scale)).unwrap_or_else(||v.clone()));
            let fresh = previous.insert(index,packet.revision.to_string()) != Some(packet.revision.to_string());
            json!({"selector":selector,"value":value,"missing":raw.is_none(),"message_id":field.message_id,"component_id":component,"instance":instance,"received_at_ms":packet.timestamp_ms,"age_ms":packet.received.elapsed().as_millis() as u64,"new_packet":fresh})
        }).collect();
        json!({"sampled_at_ms":now_ms(),"values":values})
    }
}
pub fn spawn_collector(
    vehicle: &mavkit::Vehicle,
    cache: Arc<RwLock<TelemetryCache>>,
    cancel: CancellationToken,
) -> JoinHandle<()> {
    let stream = vehicle.raw().subscribe();
    let system_id = vehicle.identity().system_id;
    tokio::spawn(async move {
        tokio::pin!(stream);
        loop {
            let raw = tokio::select! { biased; _=cancel.cancelled()=>break, raw=stream.next()=>match raw {Some(raw)=>raw,None=>break} };
            if system_id != raw.system_id {
                continue;
            }
            let Ok(message) = mavlink::dialects::all::MavMessage::parse(
                MavlinkVersion::V2,
                raw.message_id,
                &raw.payload,
            ) else {
                continue;
            };
            let name = message.message_name().to_string();
            let Ok(mut payload) = serde_json::to_value(message) else {
                continue;
            };
            if let Some(nested) = payload.get(&name) {
                payload = nested.clone();
            }
            if let Some(object) = payload.as_object_mut() {
                object.remove("type");
            }
            // Check cancellation while holding the cache lock, preventing a late old packet from seeding a new session.
            let mut cache = cache.write().unwrap_or_else(|e| e.into_inner());
            if cancel.is_cancelled() {
                break;
            }
            cache.insert(
                raw.message_id,
                raw.component_id,
                name,
                payload,
                raw.received_at.elapsed(),
            );
        }
        cancel.cancel();
    })
}

pub async fn collect(
    cache: &RwLock<TelemetryCache>,
    vehicle: Option<&mavkit::Vehicle>,
    request: &ReadRequest,
    session_cancel: &CancellationToken,
    request_cancel: &CancellationToken,
) -> Value {
    let start = Instant::now();
    let mut previous = HashMap::new();
    let mut points = Vec::new();
    let mut reason = "complete";
    for index in 0..request.count {
        tokio::select! { biased;
            _=session_cancel.cancelled()=>{ reason="session_changed_or_disconnected"; break; }
            _=request_cancel.cancelled()=>{ reason="cancelled"; break; }
            _=tokio::time::sleep_until(start+Duration::from_millis(u64::from(index)*request.interval_ms))=>{}
        }
        let mut cache = cache.write().unwrap_or_else(|e| e.into_inner());
        if session_cancel.is_cancelled() {
            reason = "session_changed_or_disconnected";
            break;
        }
        if let Some(vehicle) = vehicle {
            cache.refresh_metrics(vehicle);
        }
        points.push(cache.sample(&request.fields, &mut previous));
    }
    json!({"points":points,"completion":reason,"requested_count":request.count,"interval_ms":request.interval_ms})
}

#[cfg(test)]
mod tests {
    use super::*;
    fn request(count: u32) -> ReadRequest {
        ReadRequest {
            fields: vec![
                FieldSelector::Named("barometer.0.pressure_hpa".into()),
                FieldSelector::Named("imu.0.acceleration_x_mps2".into()),
            ],
            count,
            interval_ms: 1000,
        }
    }
    #[tokio::test(start_paused = true)]
    async fn collects_ten_points_and_identifies_a_stopped_stream() {
        let cache = RwLock::new(TelemetryCache::default());
        cache.write().unwrap().insert(
            29,
            1,
            "SCALED_PRESSURE".into(),
            json!({"press_abs":1000.0}),
            Duration::ZERO,
        );
        let result = collect(
            &cache,
            None,
            &request(10),
            &CancellationToken::new(),
            &CancellationToken::new(),
        )
        .await;
        let points = result["points"].as_array().unwrap();
        assert_eq!(points.len(), 10);
        assert_eq!(points[0]["values"][0]["new_packet"], true);
        assert_eq!(points[1]["values"][0]["new_packet"], false);
        assert_eq!(points[9]["values"][0]["age_ms"], 9000);
        assert!(points[0]["values"][1]["value"].is_null());
    }
    #[tokio::test(start_paused = true)]
    async fn equal_values_in_new_packets_are_fresh_and_sensor_instances_are_separate() {
        let mut cache = TelemetryCache::default();
        let mut previous = HashMap::new();
        let fields = vec![FieldSelector::Raw {
            message_id: 29,
            field: "press_abs".into(),
            component_id: Some(1),
            instance: None,
        }];
        cache.insert(
            29,
            1,
            "SCALED_PRESSURE".into(),
            json!({"press_abs":1000}),
            Duration::ZERO,
        );
        cache.sample(&fields, &mut previous);
        tokio::time::advance(Duration::from_secs(1)).await;
        cache.insert(
            29,
            2,
            "SCALED_PRESSURE".into(),
            json!({"press_abs":800}),
            Duration::ZERO,
        );
        assert_eq!(
            cache.sample(&fields, &mut previous)["values"][0]["new_packet"],
            false
        );
        cache.insert(
            29,
            1,
            "SCALED_PRESSURE".into(),
            json!({"press_abs":1000}),
            Duration::ZERO,
        );
        let sample = cache.sample(&fields, &mut previous);
        assert_eq!(sample["values"][0]["value"], 1000.0);
        assert_eq!(sample["values"][0]["new_packet"], true);
    }
    #[tokio::test(start_paused = true)]
    async fn disconnect_returns_partial_points() {
        let cache = RwLock::new(TelemetryCache::default());
        let cancel = CancellationToken::new();
        let trigger = cancel.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(2500)).await;
            trigger.cancel();
        });
        let result = collect(
            &cache,
            None,
            &request(10),
            &cancel,
            &CancellationToken::new(),
        )
        .await;
        assert_eq!(result["points"].as_array().unwrap().len(), 3);
        assert_eq!(result["completion"], "session_changed_or_disconnected");
    }
    #[test]
    fn rejects_invalid_sampling_limits_without_overflow() {
        let mut r = request(0);
        assert!(r.validate().is_err());
        r.count = 10;
        r.interval_ms = u64::MAX;
        assert!(r.validate().is_err());
        r.interval_ms = 1000;
        assert!(r.validate().is_ok());
        r.fields.push(FieldSelector::Named("typo".into()));
        assert!(r.validate().is_err());
    }
    #[test]
    fn decodes_real_mavlink_packet_field_layout() {
        let message = mavlink::dialects::all::MavMessage::SCALED_PRESSURE(
            mavlink::dialects::all::SCALED_PRESSURE_DATA {
                press_abs: 1013.25,
                ..Default::default()
            },
        );
        let json = serde_json::to_value(message).unwrap();
        assert_eq!(json["press_abs"], 1013.25);
    }
}

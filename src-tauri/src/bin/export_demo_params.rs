use std::env;
use std::time::SystemTime;

use mavkit::{ParamStore, ParamType, Vehicle};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
struct ExportedParam {
    name: String,
    value: f32,
    param_type: &'static str,
}

#[derive(Debug, Deserialize)]
struct ExportSourceInput {
    autopilot: String,
    sitl_image: String,
    defaults: String,
}

#[derive(Debug, Serialize)]
struct ExportSource {
    kind: &'static str,
    autopilot: String,
    sitl_image: String,
    defaults: String,
    generated_at: String,
}

#[derive(Debug, Serialize)]
struct ExportedFixture {
    schema_version: u32,
    vehicle_family: String,
    vehicle_preset: String,
    source: ExportSource,
    params: Vec<ExportedParam>,
}

fn normalize_param_type(param_type: ParamType) -> &'static str {
    match param_type {
        ParamType::Uint8 => "uint8",
        ParamType::Int8 => "int8",
        ParamType::Uint16 => "uint16",
        ParamType::Int16 => "int16",
        ParamType::Uint32 => "uint32",
        ParamType::Int32 => "int32",
        ParamType::Real32 => "real32",
    }
}

fn tcp_address_from_args() -> Result<String, String> {
    env::args().nth(1).or_else(|| env::var("IRONWING_DEMO_SITL_TCP_ADDRESS").ok()).ok_or_else(
        || {
            "missing TCP address; pass 127.0.0.1:5760 as argv[1] or set IRONWING_DEMO_SITL_TCP_ADDRESS"
                .to_string()
        },
    )
}

fn vehicle_family_from_env() -> Result<String, String> {
    env::var("IRONWING_DEMO_PARAM_VEHICLE_FAMILY")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "missing IRONWING_DEMO_PARAM_VEHICLE_FAMILY".to_string())
}

fn vehicle_preset_from_env() -> Result<String, String> {
    env::var("IRONWING_DEMO_PARAM_VEHICLE_PRESET")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "missing IRONWING_DEMO_PARAM_VEHICLE_PRESET".to_string())
}

fn source_from_env() -> Result<ExportSource, String> {
    let raw = env::var("IRONWING_DEMO_PARAM_SOURCE_JSON")
        .map_err(|_| "missing IRONWING_DEMO_PARAM_SOURCE_JSON".to_string())?;
    let input: ExportSourceInput = serde_json::from_str(&raw)
        .map_err(|error| format!("invalid IRONWING_DEMO_PARAM_SOURCE_JSON: {error}"))?;
    let generated_at = humantime::format_rfc3339_seconds(SystemTime::now()).to_string();

    Ok(ExportSource {
        kind: "sitl_param_download",
        autopilot: input.autopilot,
        sitl_image: input.sitl_image,
        defaults: input.defaults,
        generated_at,
    })
}

async fn export_fixture(
    tcp_address: &str,
    vehicle_family: String,
    vehicle_preset: String,
    source: ExportSource,
) -> Result<ExportedFixture, String> {
    let vehicle = Vehicle::connect_with_config(
        &format!("tcpout:{tcp_address}"),
        mavkit::VehicleConfig::default(),
    )
    .await
    .map_err(|error| error.to_string())?;

    let result: Result<ExportedFixture, String> = async {
        let store: ParamStore = vehicle
            .params()
            .download_all()
            .map_err(|error| error.to_string())?
            .wait()
            .await
            .map_err(|error| error.to_string())?;

        let mut params = store
            .params
            .into_values()
            .map(|param| ExportedParam {
                name: param.name,
                value: param.value,
                param_type: normalize_param_type(param.param_type),
            })
            .collect::<Vec<_>>();
        params.sort_by(|left, right| left.name.cmp(&right.name));

        Ok(ExportedFixture {
            schema_version: 1,
            vehicle_family,
            vehicle_preset,
            source,
            params,
        })
    }
    .await;

    let _ = vehicle.disconnect().await;
    result
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let tcp_address = tcp_address_from_args()?;
    let vehicle_family = vehicle_family_from_env()?;
    let vehicle_preset = vehicle_preset_from_env()?;
    let source = source_from_env()?;
    let fixture = export_fixture(&tcp_address, vehicle_family, vehicle_preset, source).await?;
    println!("{}", serde_json::to_string_pretty(&fixture)?);
    Ok(())
}

use crate::types::{CatalogEntry, CatalogTargetSummary, FirmwareError};
use flate2::read::GzDecoder;
use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use std::io::Read;

#[derive(Deserialize)]
struct RawManifest {
    firmware: Vec<RawEntry>,
}

#[derive(Deserialize)]
struct RawEntry {
    board_id: Option<u32>,
    #[serde(rename = "mav-type")]
    mav_type: Option<String>,
    #[serde(rename = "mav-firmware-version")]
    version: Option<String>,
    #[serde(rename = "mav-firmware-version-type")]
    version_type: Option<String>,
    format: Option<String>,
    platform: Option<String>,
    url: Option<String>,
    image_size: Option<u64>,
    latest: Option<u32>,
    #[serde(rename = "git-sha")]
    git_sha: Option<String>,
    brand_name: Option<String>,
    manufacturer: Option<String>,
}

pub fn parse_manifest_gz(gz_data: &[u8]) -> Result<Vec<CatalogEntry>, FirmwareError> {
    let mut decoder = GzDecoder::new(gz_data);
    let mut json_bytes = Vec::new();
    decoder
        .read_to_end(&mut json_bytes)
        .map_err(|e| FirmwareError::CatalogUnavailable {
            reason: format!("gzip decompression failed: {e}"),
        })?;

    parse_manifest_json(&json_bytes)
}

pub fn parse_manifest_json(json_data: &[u8]) -> Result<Vec<CatalogEntry>, FirmwareError> {
    let manifest: RawManifest =
        serde_json::from_slice(json_data).map_err(|e| FirmwareError::CatalogUnavailable {
            reason: format!("invalid manifest JSON: {e}"),
        })?;

    Ok(manifest
        .firmware
        .into_iter()
        .filter_map(normalize_entry)
        .collect())
}

fn normalize_entry(raw: RawEntry) -> Option<CatalogEntry> {
    let board_id = raw.board_id?;
    let format = raw.format.as_deref().unwrap_or("");
    if format != "apj" {
        return None;
    }

    Some(CatalogEntry {
        board_id,
        platform: raw.platform.unwrap_or_default(),
        vehicle_type: raw.mav_type.unwrap_or_default(),
        version: raw.version.unwrap_or_default(),
        version_type: raw.version_type.unwrap_or_default(),
        format: format.to_string(),
        url: raw.url.unwrap_or_default(),
        image_size: raw.image_size.unwrap_or(0),
        latest: raw.latest == Some(1),
        git_sha: raw.git_sha.unwrap_or_default(),
        brand_name: raw.brand_name,
        manufacturer: raw.manufacturer,
    })
}

pub fn filter_by_board(entries: &[CatalogEntry], board_id: u32) -> Vec<CatalogEntry> {
    entries
        .iter()
        .filter(|entry| entry.board_id == board_id)
        .cloned()
        .collect()
}

pub fn filter_by_board_and_platform(
    entries: &[CatalogEntry],
    board_id: u32,
    platform: Option<&str>,
) -> Vec<CatalogEntry> {
    entries
        .iter()
        .filter(|entry| entry.board_id == board_id && platform.is_none_or(|p| entry.platform == p))
        .cloned()
        .collect()
}

pub fn build_catalog_targets(entries: &[CatalogEntry]) -> Vec<CatalogTargetSummary> {
    let mut groups: HashMap<(u32, String), CatalogTargetSummary> = HashMap::new();

    for entry in entries {
        let key = (entry.board_id, entry.platform.clone());
        let target = groups.entry(key).or_insert_with(|| CatalogTargetSummary {
            board_id: entry.board_id,
            platform: entry.platform.clone(),
            brand_name: None,
            manufacturer: None,
            vehicle_types: Vec::new(),
            latest_version: None,
        });

        if target.brand_name.is_none() {
            target.brand_name.clone_from(&entry.brand_name);
        }
        if target.manufacturer.is_none() {
            target.manufacturer.clone_from(&entry.manufacturer);
        }
        if !entry.vehicle_type.is_empty() && !target.vehicle_types.contains(&entry.vehicle_type) {
            target.vehicle_types.push(entry.vehicle_type.clone());
        }
        if entry.version_type == "OFFICIAL" {
            match &target.latest_version {
                None => target.latest_version = Some(entry.version.clone()),
                Some(existing) if version_gt(&entry.version, existing) => {
                    target.latest_version = Some(entry.version.clone());
                }
                _ => {}
            }
        }
    }

    let mut targets: Vec<_> = groups.into_values().collect();
    targets.sort_by(|a, b| {
        a.platform
            .cmp(&b.platform)
            .then(a.board_id.cmp(&b.board_id))
    });
    for target in &mut targets {
        target.vehicle_types.sort();
    }
    targets
}

fn version_gt(a: &str, b: &str) -> bool {
    let parse = |value: &str| -> Vec<u32> {
        value
            .split('.')
            .map(|segment| segment.parse::<u32>().unwrap_or(0))
            .collect()
    };
    parse(a) > parse(b)
}

pub fn parse_supported_official_bootloader_targets(index_html: &str) -> HashSet<String> {
    index_html
        .split("href=")
        .filter_map(|fragment| {
            let quote = fragment.chars().next()?;
            if quote != '"' && quote != '\'' {
                return None;
            }
            let rest = &fragment[1..];
            let href = rest.split(quote).next()?;
            let filename = href.rsplit('/').next()?;
            filename
                .strip_suffix("_bl.bin")
                .filter(|name| !name.is_empty())
                .map(ToString::to_string)
        })
        .collect()
}

pub fn filter_catalog_targets_to_supported_official_bootloaders(
    targets: &[CatalogTargetSummary],
    supported_targets: &HashSet<String>,
) -> Vec<CatalogTargetSummary> {
    targets
        .iter()
        .filter(|target| supported_targets.contains(&target.platform))
        .cloned()
        .collect()
}

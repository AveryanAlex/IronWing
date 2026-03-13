use crate::firmware::cache::ManifestCache;
use crate::firmware::types::{CatalogEntry, CatalogTargetSummary, FirmwareError};
use flate2::read::GzDecoder;
use serde::Deserialize;
use std::collections::HashMap;
use std::io::Read;
use std::path::PathBuf;
use std::time::Duration;

const CACHE_MAX_AGE: Duration = Duration::from_secs(24 * 60 * 60); // 24 hours

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

pub(crate) fn parse_manifest_gz(gz_data: &[u8]) -> Result<Vec<CatalogEntry>, FirmwareError> {
    let mut decoder = GzDecoder::new(gz_data);
    let mut json_bytes = Vec::new();
    decoder
        .read_to_end(&mut json_bytes)
        .map_err(|e| FirmwareError::CatalogUnavailable {
            reason: format!("gzip decompression failed: {e}"),
        })?;

    parse_manifest_json(&json_bytes)
}

pub(crate) fn parse_manifest_json(json_data: &[u8]) -> Result<Vec<CatalogEntry>, FirmwareError> {
    let manifest: RawManifest =
        serde_json::from_slice(json_data).map_err(|e| FirmwareError::CatalogUnavailable {
            reason: format!("invalid manifest JSON: {e}"),
        })?;

    let entries = manifest
        .firmware
        .into_iter()
        .filter_map(normalize_entry)
        .collect();

    Ok(entries)
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

pub(crate) fn filter_by_board(entries: &[CatalogEntry], board_id: u32) -> Vec<CatalogEntry> {
    entries
        .iter()
        .filter(|e| e.board_id == board_id)
        .cloned()
        .collect()
}

pub(crate) fn filter_by_board_and_platform(
    entries: &[CatalogEntry],
    board_id: u32,
    platform: Option<&str>,
) -> Vec<CatalogEntry> {
    entries
        .iter()
        .filter(|e| e.board_id == board_id && platform.is_none_or(|p| e.platform == p))
        .cloned()
        .collect()
}

pub(crate) fn build_catalog_targets(entries: &[CatalogEntry]) -> Vec<CatalogTargetSummary> {
    let mut groups: HashMap<(u32, String), CatalogTargetSummary> = HashMap::new();

    for e in entries {
        let key = (e.board_id, e.platform.clone());
        let target = groups.entry(key).or_insert_with(|| CatalogTargetSummary {
            board_id: e.board_id,
            platform: e.platform.clone(),
            brand_name: None,
            manufacturer: None,
            vehicle_types: Vec::new(),
            latest_version: None,
        });

        if target.brand_name.is_none() {
            target.brand_name.clone_from(&e.brand_name);
        }
        if target.manufacturer.is_none() {
            target.manufacturer.clone_from(&e.manufacturer);
        }

        if !e.vehicle_type.is_empty() && !target.vehicle_types.contains(&e.vehicle_type) {
            target.vehicle_types.push(e.vehicle_type.clone());
        }

        if e.version_type == "OFFICIAL" {
            match &target.latest_version {
                None => target.latest_version = Some(e.version.clone()),
                Some(existing) if version_gt(&e.version, existing) => {
                    target.latest_version = Some(e.version.clone());
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
    for t in &mut targets {
        t.vehicle_types.sort();
    }
    targets
}

fn version_gt(a: &str, b: &str) -> bool {
    let parse = |s: &str| -> Vec<u32> {
        s.split('.')
            .map(|seg| seg.parse::<u32>().unwrap_or(0))
            .collect()
    };
    let va = parse(a);
    let vb = parse(b);
    va > vb
}

pub(crate) fn reject_catalog_for_dfu() -> FirmwareError {
    FirmwareError::CatalogUnavailable {
        reason: "official catalog is not available for DFU recovery; use a local .bin file".into(),
    }
}

const MANIFEST_URL: &str = "https://firmware.ardupilot.org/manifest.json.gz";

pub(crate) fn fetch_manifest_gz() -> Result<Vec<u8>, FirmwareError> {
    let body = ureq::get(MANIFEST_URL)
        .call()
        .map_err(|e| FirmwareError::CatalogUnavailable {
            reason: format!("manifest fetch failed: {e}"),
        })?
        .into_body();

    let mut bytes = Vec::new();
    body.into_reader()
        .read_to_end(&mut bytes)
        .map_err(|e| FirmwareError::CatalogUnavailable {
            reason: format!("manifest download failed: {e}"),
        })?;

    Ok(bytes)
}

pub(crate) struct CatalogClient {
    cache: ManifestCache,
}

impl CatalogClient {
    pub(crate) fn new(cache_dir: PathBuf) -> Self {
        Self {
            cache: ManifestCache::new(cache_dir, CACHE_MAX_AGE),
        }
    }

    #[cfg(test)]
    pub(crate) fn with_max_age(cache_dir: PathBuf, max_age: Duration) -> Self {
        Self {
            cache: ManifestCache::new(cache_dir, max_age),
        }
    }

    pub(crate) fn get_entries_for_board_online(
        &self,
        board_id: u32,
    ) -> Result<Vec<CatalogEntry>, FirmwareError> {
        self.get_entries_for_board(board_id, fetch_manifest_gz)
    }

    pub(crate) fn get_entries_for_board<F>(
        &self,
        board_id: u32,
        fetcher: F,
    ) -> Result<Vec<CatalogEntry>, FirmwareError>
    where
        F: FnOnce() -> Result<Vec<u8>, FirmwareError>,
    {
        let all_entries = self.get_all_entries(fetcher)?;
        Ok(filter_by_board(&all_entries, board_id))
    }

    pub(crate) fn get_entries_filtered_online(
        &self,
        board_id: u32,
        platform: Option<&str>,
    ) -> Result<Vec<CatalogEntry>, FirmwareError> {
        self.get_entries_filtered(board_id, platform, fetch_manifest_gz)
    }

    pub(crate) fn get_entries_filtered<F>(
        &self,
        board_id: u32,
        platform: Option<&str>,
        fetcher: F,
    ) -> Result<Vec<CatalogEntry>, FirmwareError>
    where
        F: FnOnce() -> Result<Vec<u8>, FirmwareError>,
    {
        let all_entries = self.get_all_entries(fetcher)?;
        Ok(filter_by_board_and_platform(
            &all_entries,
            board_id,
            platform,
        ))
    }

    pub(crate) fn get_catalog_targets_online(
        &self,
    ) -> Result<Vec<CatalogTargetSummary>, FirmwareError> {
        self.get_catalog_targets(fetch_manifest_gz)
    }

    pub(crate) fn get_catalog_targets<F>(
        &self,
        fetcher: F,
    ) -> Result<Vec<CatalogTargetSummary>, FirmwareError>
    where
        F: FnOnce() -> Result<Vec<u8>, FirmwareError>,
    {
        let all_entries = self.get_all_entries(fetcher)?;
        Ok(build_catalog_targets(&all_entries))
    }

    fn get_all_entries<F>(&self, fetcher: F) -> Result<Vec<CatalogEntry>, FirmwareError>
    where
        F: FnOnce() -> Result<Vec<u8>, FirmwareError>,
    {
        let gz_data = match self.cache.get_if_fresh() {
            Some(cached) => cached,
            None => {
                let fresh = fetcher()?;
                let _ = self.cache.store(&fresh);
                fresh
            }
        };
        parse_manifest_gz(&gz_data)
    }
}

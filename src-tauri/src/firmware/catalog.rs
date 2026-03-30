use crate::firmware::cache::ManifestCache;
use crate::firmware::types::{CatalogEntry, CatalogTargetSummary, FirmwareError};
use flate2::read::GzDecoder;
use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::Duration;

const CACHE_MAX_AGE: Duration = Duration::from_secs(24 * 60 * 60); // 24 hours
const BOOTLOADER_CACHE_MAX_AGE: Duration = Duration::from_secs(24 * 60 * 60);
const BOOTLOADER_INDEX_CACHE_FILENAME: &str = "bootloaders.index.html";
const BOOTLOADER_INDEX_TIMESTAMP_FILENAME: &str = "bootloaders.index.timestamp";

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

const OFFICIAL_BOOTLOADER_BASE_URL: &str = "https://firmware.ardupilot.org/Tools/Bootloaders";
const OFFICIAL_BOOTLOADER_INDEX_URL: &str = "https://firmware.ardupilot.org/Tools/Bootloaders/";

pub(crate) fn resolve_official_bootloader_url(board_target: &str) -> Result<String, FirmwareError> {
    let board_target = board_target.trim();
    if board_target.is_empty() {
        return Err(FirmwareError::ArtifactInvalid {
            reason: "official DFU bootloader recovery requires a board target".into(),
        });
    }

    Ok(format!(
        "{OFFICIAL_BOOTLOADER_BASE_URL}/{board_target}_bl.bin"
    ))
}

pub(crate) fn parse_supported_official_bootloader_targets(index_html: &str) -> HashSet<String> {
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

pub(crate) fn resolve_supported_official_bootloader_url(
    board_target: &str,
    supported_targets: &HashSet<String>,
) -> Result<String, FirmwareError> {
    let url = resolve_official_bootloader_url(board_target)?;
    if supported_targets.contains(board_target.trim()) {
        Ok(url)
    } else {
        Err(FirmwareError::UnsupportedDfuBootloaderTarget {
            guidance: format!(
                "no official bootloader is published for '{board_target}'. Use the advanced/manual DFU APJ/BIN recovery path instead, and remember that normal ArduPilot firmware installs belong on the serial bootloader path"
            ),
        })
    }
}

pub(crate) fn filter_catalog_targets_to_supported_official_bootloaders(
    targets: &[CatalogTargetSummary],
    supported_targets: &HashSet<String>,
) -> Vec<CatalogTargetSummary> {
    targets
        .iter()
        .filter(|target| supported_targets.contains(&target.platform))
        .cloned()
        .collect()
}

pub(crate) fn fetch_supported_official_bootloader_targets() -> Result<HashSet<String>, FirmwareError>
{
    fetch_supported_official_bootloader_targets_with_cache(
        std::env::temp_dir().join("ironwing_bootloader_index"),
        fetch_bootloader_index_listing,
    )
}

pub(crate) fn fetch_bootloader_index_listing() -> Result<String, FirmwareError> {
    let mut body = ureq::get(OFFICIAL_BOOTLOADER_INDEX_URL)
        .call()
        .map_err(|e| FirmwareError::CatalogUnavailable {
            reason: format!("bootloader index fetch failed: {e}"),
        })?
        .into_body();

    let listing = body
        .read_to_string()
        .map_err(|e| FirmwareError::CatalogUnavailable {
            reason: format!("bootloader index download failed: {e}"),
        })?;

    Ok(listing)
}

fn bootloader_cache_read(cache_dir: &Path, accept_stale: bool) -> Option<String> {
    let ts_path = cache_dir.join(BOOTLOADER_INDEX_TIMESTAMP_FILENAME);
    let data_path = cache_dir.join(BOOTLOADER_INDEX_CACHE_FILENAME);

    if !accept_stale {
        let ts_str = std::fs::read_to_string(&ts_path).ok()?;
        let stored_epoch: u64 = ts_str.trim().parse().ok()?;
        let stored_time = std::time::SystemTime::UNIX_EPOCH + Duration::from_secs(stored_epoch);
        let age = std::time::SystemTime::now()
            .duration_since(stored_time)
            .unwrap_or(Duration::MAX);
        if age > BOOTLOADER_CACHE_MAX_AGE {
            return None;
        }
    }

    std::fs::read_to_string(data_path).ok()
}

fn bootloader_cache_store(cache_dir: &PathBuf, listing: &str) -> Result<(), std::io::Error> {
    std::fs::create_dir_all(cache_dir)?;
    std::fs::write(cache_dir.join(BOOTLOADER_INDEX_CACHE_FILENAME), listing)?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    std::fs::write(
        cache_dir.join(BOOTLOADER_INDEX_TIMESTAMP_FILENAME),
        now.to_string(),
    )?;
    Ok(())
}

pub(crate) fn fetch_supported_official_bootloader_targets_with_cache<F>(
    cache_dir: PathBuf,
    fetcher: F,
) -> Result<HashSet<String>, FirmwareError>
where
    F: FnOnce() -> Result<String, FirmwareError>,
{
    if let Some(cached) = bootloader_cache_read(&cache_dir, false) {
        return Ok(parse_supported_official_bootloader_targets(&cached));
    }

    match fetcher() {
        Ok(listing) => {
            let _ = bootloader_cache_store(&cache_dir, &listing);
            Ok(parse_supported_official_bootloader_targets(&listing))
        }
        Err(fetch_err) => {
            if let Some(cached) = bootloader_cache_read(&cache_dir, true) {
                return Ok(parse_supported_official_bootloader_targets(&cached));
            }
            Err(fetch_err)
        }
    }
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
        if let Some(cached) = self.cache.get_if_fresh() {
            return parse_manifest_gz(&cached);
        }

        match fetcher() {
            Ok(fresh) => {
                let _ = self.cache.store(&fresh);
                parse_manifest_gz(&fresh)
            }
            Err(fetch_err) => match self.cache.get_cached() {
                Some(stale) => parse_manifest_gz(&stale).map_err(|cache_err| {
                    combine_manifest_refresh_and_stale_cache_error(fetch_err, cache_err)
                }),
                None => Err(manifest_refresh_without_cache_error(fetch_err)),
            },
        }
    }
}

fn manifest_refresh_without_cache_error(fetch_err: FirmwareError) -> FirmwareError {
    FirmwareError::CatalogUnavailable {
        reason: format!(
            "manifest refresh failed and no cached manifest was available: {}",
            fetch_err
        ),
    }
}

fn combine_manifest_refresh_and_stale_cache_error(
    fetch_err: FirmwareError,
    cache_err: FirmwareError,
) -> FirmwareError {
    FirmwareError::CatalogUnavailable {
        reason: format!(
            "manifest refresh failed and stale cached manifest was unusable: refresh error: {}; stale cache error: {}",
            fetch_err, cache_err
        ),
    }
}

#[cfg(test)]
mod tests {
    use crate::firmware::types::FirmwareError;
    use std::collections::HashSet;

    #[test]
    fn official_bootloader_artifact_resolution_uses_ardupilot_bootloader_url_contract() {
        let url = super::resolve_official_bootloader_url("CubeOrange").unwrap();

        assert_eq!(
            url,
            "https://firmware.ardupilot.org/Tools/Bootloaders/CubeOrange_bl.bin"
        );
    }

    #[test]
    fn parses_supported_official_bootloader_targets_from_directory_listing() {
        let supported = super::parse_supported_official_bootloader_targets(
            r#"<html><body>
            <a href="CubeOrange_bl.bin">CubeOrange_bl.bin</a>
            <a href="fmuv3_bl.bin">fmuv3_bl.bin</a>
            <a href="notes.txt">notes.txt</a>
            </body></html>"#,
        );

        assert!(supported.contains("CubeOrange"));
        assert!(supported.contains("fmuv3"));
        assert!(!supported.contains("notes"));
    }

    #[test]
    fn resolve_supported_official_bootloader_url_rejects_unsupported_target() {
        let supported = HashSet::from(["CubeOrange".to_string()]);

        let err = super::resolve_supported_official_bootloader_url("NoSuchBoard", &supported)
            .unwrap_err();

        assert!(err.to_string().contains("official bootloader"));
        assert!(err.to_string().contains("manual"));
        assert!(err.to_string().contains("serial bootloader"));
    }

    #[test]
    fn filter_catalog_targets_to_supported_official_bootloaders() {
        let targets = vec![
            crate::firmware::types::CatalogTargetSummary {
                board_id: 140,
                platform: "CubeOrange".into(),
                brand_name: Some("CubeOrange".into()),
                manufacturer: Some("Hex".into()),
                vehicle_types: vec!["Copter".into()],
                latest_version: Some("4.5.0".into()),
            },
            crate::firmware::types::CatalogTargetSummary {
                board_id: 50,
                platform: "NoSuchBoard".into(),
                brand_name: Some("NoSuchBoard".into()),
                manufacturer: None,
                vehicle_types: vec!["Plane".into()],
                latest_version: None,
            },
        ];
        let supported = HashSet::from(["CubeOrange".to_string()]);

        let filtered =
            super::filter_catalog_targets_to_supported_official_bootloaders(&targets, &supported);

        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].platform, "CubeOrange");
    }

    #[test]
    fn bootloader_index_cache_falls_back_to_stale_cached_listing_when_fetch_fails() {
        let dir = std::env::temp_dir().join(format!(
            "ironwing_bootloader_cache_fallback_{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        super::bootloader_cache_store(&dir, r#"<a href="CubeOrange_bl.bin">CubeOrange_bl.bin</a>"#)
            .unwrap();

        let supported =
            super::fetch_supported_official_bootloader_targets_with_cache(dir.clone(), || {
                Err(FirmwareError::CatalogUnavailable {
                    reason: "bootloader index fetch failed".into(),
                })
            })
            .unwrap();

        assert!(supported.contains("CubeOrange"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn bootloader_index_cache_prefers_fresh_cached_listing_without_fetch() {
        let dir = std::env::temp_dir().join(format!(
            "ironwing_bootloader_cache_fresh_{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        super::bootloader_cache_store(&dir, r#"<a href="CubeOrange_bl.bin">CubeOrange_bl.bin</a>"#)
            .unwrap();

        let supported =
            super::fetch_supported_official_bootloader_targets_with_cache(dir.clone(), || {
                panic!("fresh cache should avoid live fetch")
            })
            .unwrap();

        assert!(supported.contains("CubeOrange"));
        let _ = std::fs::remove_dir_all(&dir);
    }
}

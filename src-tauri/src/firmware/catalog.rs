use crate::firmware::types::FirmwareError;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::Duration;

const BOOTLOADER_CACHE_MAX_AGE: Duration = Duration::from_secs(24 * 60 * 60);
const BOOTLOADER_INDEX_CACHE_FILENAME: &str = "bootloaders.index.html";
const BOOTLOADER_INDEX_TIMESTAMP_FILENAME: &str = "bootloaders.index.timestamp";
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

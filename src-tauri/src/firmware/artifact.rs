use crate::firmware::types::FirmwareError;
use base64::prelude::*;
use flate2::read::ZlibDecoder;
use serde::Deserialize;
use std::io::Read;
use std::path::Path;

// ── Parsed artifact models (path-specific, not collapsed) ──

/// Serial-path artifact: parsed from `.apj` file.
/// Contains decompressed firmware image and board metadata.
#[derive(Debug, Clone)]
pub(crate) struct SerialArtifact {
    pub(crate) board_id: u32,
    pub(crate) image: Vec<u8>,
    pub(crate) image_size: usize,
    pub(crate) summary: String,
}

/// DFU recovery artifact: validated raw `.bin` file.
/// Contains raw binary image with explicit recovery semantics.
#[derive(Debug, Clone)]
pub(crate) struct DfuRecoveryArtifact {
    pub(crate) image: Vec<u8>,
    pub(crate) image_size: usize,
    pub(crate) recovery_note: String,
}

// ── APJ JSON schema (internal deserialization target) ──

#[derive(Deserialize)]
struct ApjFile {
    board_id: u32,
    image: String,
    #[serde(default)]
    extf_image: String,
    #[serde(default)]
    summary: String,
    #[serde(default)]
    image_size: u32,
}

// ── Public parsing API ──

/// Parse a `.apj` file for the serial flashing path.
/// Returns a validated `SerialArtifact` with decompressed firmware image.
pub(crate) fn parse_apj(data: &[u8]) -> Result<SerialArtifact, FirmwareError> {
    let apj: ApjFile =
        serde_json::from_slice(data).map_err(|e| FirmwareError::ArtifactInvalid {
            reason: format!("invalid APJ JSON: {e}"),
        })?;

    // Reject non-empty extf_image (external flash not supported in V1)
    if !apj.extf_image.is_empty() {
        return Err(FirmwareError::ArtifactInvalid {
            reason: "external flash image (extf_image) is not supported in V1".into(),
        });
    }

    // Decode base64
    let compressed =
        BASE64_STANDARD
            .decode(&apj.image)
            .map_err(|e| FirmwareError::ArtifactInvalid {
                reason: format!("base64 decode failed: {e}"),
            })?;

    // Zlib decompress
    let mut decoder = ZlibDecoder::new(&compressed[..]);
    let mut image = Vec::new();
    decoder
        .read_to_end(&mut image)
        .map_err(|e| FirmwareError::ArtifactInvalid {
            reason: format!("zlib decompression failed: {e}"),
        })?;

    if image.is_empty() {
        return Err(FirmwareError::ArtifactInvalid {
            reason: "decompressed image is empty".into(),
        });
    }

    let actual_size = image.len();

    if apj.image_size > 0 && apj.image_size as usize != actual_size {
        return Err(FirmwareError::ArtifactInvalid {
            reason: format!(
                "image_size mismatch: declared {}, decompressed {actual_size}",
                apj.image_size
            ),
        });
    }

    Ok(SerialArtifact {
        board_id: apj.board_id,
        image,
        image_size: actual_size,
        summary: apj.summary,
    })
}

/// Validate a raw `.bin` file for the DFU recovery path.
pub(crate) fn validate_recovery_bin(data: &[u8]) -> Result<DfuRecoveryArtifact, FirmwareError> {
    if data.is_empty() {
        return Err(FirmwareError::ArtifactInvalid {
            reason: "recovery binary is empty".into(),
        });
    }

    Ok(DfuRecoveryArtifact {
        image_size: data.len(),
        image: data.to_vec(),
        recovery_note: "DFU recovery: this will overwrite the entire internal flash".into(),
    })
}

/// Classify a firmware file by extension and route to the appropriate parser/validator.
/// Returns typed errors with guidance for unsupported formats.
pub(crate) fn classify_artifact(path: &str) -> Result<ArtifactClassification, FirmwareError> {
    let ext = Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    match ext.as_str() {
        "apj" => Ok(ArtifactClassification::Apj),
        "bin" => Ok(ArtifactClassification::Bin),
        "px4" => Err(FirmwareError::ArtifactInvalid {
            reason: ".px4 format is not supported; use .apj files from the ArduPilot firmware server".into(),
        }),
        "hex" => Err(FirmwareError::ArtifactInvalid {
            reason: ".hex format is not supported; use .apj files for serial flashing or .bin for DFU recovery".into(),
        }),
        "dfu" => Err(FirmwareError::ArtifactInvalid {
            reason: ".dfu format is not supported; use raw .bin files for DFU recovery".into(),
        }),
        _ => Err(FirmwareError::ArtifactInvalid {
            reason: format!("unrecognized firmware format '.{ext}'; supported: .apj (serial), .bin (DFU recovery)"),
        }),
    }
}

/// Reject `.apj` files from the DFU recovery path with typed guidance.
pub(crate) fn validate_recovery_file_type(path: &str) -> Result<(), FirmwareError> {
    let classification = classify_artifact(path)?;
    match classification {
        ArtifactClassification::Bin => Ok(()),
        ArtifactClassification::Apj => Err(FirmwareError::ArtifactInvalid {
            reason:
                ".apj files cannot be used for DFU recovery; use a raw .bin firmware image instead"
                    .into(),
        }),
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ArtifactClassification {
    Apj,
    Bin,
}

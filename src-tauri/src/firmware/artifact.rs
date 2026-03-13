use crate::firmware::types::FirmwareError;
use base64::prelude::*;
use flate2::read::ZlibDecoder;
use serde::Deserialize;
use std::io::Read;
use std::path::Path;

// ── Parsed artifact models (path-specific, not collapsed) ──

/// Optional external-flash payload parsed from APJ `extf_image` field.
/// Carries the decompressed image and metadata needed by the serial uploader
/// to program external flash separately from the internal image.
#[derive(Debug, Clone)]
pub(crate) struct ExternalFlashPayload {
    /// Decompressed external-flash image bytes.
    pub(crate) image: Vec<u8>,
    /// Actual decompressed size (always `image.len()`).
    pub(crate) image_size: usize,
    /// Declared `extf_image_size` from APJ metadata (0 means absent/unset).
    pub(crate) declared_size: u32,
    /// Total external-flash capacity from APJ `extflash_total` (0 means absent/unset).
    pub(crate) extflash_total: u32,
}

/// Serial-path artifact: parsed from `.apj` file.
/// Contains decompressed firmware image and board metadata.
#[derive(Debug, Clone)]
pub(crate) struct SerialArtifact {
    pub(crate) board_id: u32,
    pub(crate) image: Vec<u8>,
    pub(crate) image_size: usize,
    pub(crate) summary: String,
    /// Optional external-flash payload. `None` when the APJ has no `extf_image`.
    pub(crate) extf: Option<ExternalFlashPayload>,
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
    #[serde(default)]
    extf_image_size: u32,
    #[serde(default)]
    extflash_total: u32,
}

// ── Shared decode/decompress helper ──

/// Decode a base64-encoded, zlib-compressed payload.
/// `label` is used in error messages to distinguish internal vs external images.
fn decode_compressed_payload(b64: &str, label: &str) -> Result<Vec<u8>, FirmwareError> {
    let compressed = BASE64_STANDARD
        .decode(b64)
        .map_err(|e| FirmwareError::ArtifactInvalid {
            reason: format!("{label}: base64 decode failed: {e}"),
        })?;

    let mut decoder = ZlibDecoder::new(&compressed[..]);
    let mut image = Vec::new();
    decoder
        .read_to_end(&mut image)
        .map_err(|e| FirmwareError::ArtifactInvalid {
            reason: format!("{label}: zlib decompression failed: {e}"),
        })?;

    Ok(image)
}

// ── Public parsing API ──

/// Parse a `.apj` file for the serial flashing path.
/// Returns a validated `SerialArtifact` with decompressed firmware image
/// and optional external-flash payload.
pub(crate) fn parse_apj(data: &[u8]) -> Result<SerialArtifact, FirmwareError> {
    let apj: ApjFile =
        serde_json::from_slice(data).map_err(|e| FirmwareError::ArtifactInvalid {
            reason: format!("invalid APJ JSON: {e}"),
        })?;

    // ── Internal image (required) ──

    let image = decode_compressed_payload(&apj.image, "image")?;

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

    // ── External flash image (optional) ──

    let extf = if apj.extf_image.is_empty() {
        None
    } else {
        let extf_image = decode_compressed_payload(&apj.extf_image, "extf_image")?;

        if extf_image.is_empty() {
            return Err(FirmwareError::ArtifactInvalid {
                reason: "extf_image: decompressed external flash image is empty".into(),
            });
        }

        let extf_actual = extf_image.len();

        if apj.extf_image_size > 0 && apj.extf_image_size as usize != extf_actual {
            return Err(FirmwareError::ArtifactInvalid {
                reason: format!(
                    "extf_image_size mismatch: declared {}, decompressed {extf_actual}",
                    apj.extf_image_size
                ),
            });
        }

        Some(ExternalFlashPayload {
            image: extf_image,
            image_size: extf_actual,
            declared_size: apj.extf_image_size,
            extflash_total: apj.extflash_total,
        })
    };

    Ok(SerialArtifact {
        board_id: apj.board_id,
        image,
        image_size: actual_size,
        summary: apj.summary,
        extf,
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

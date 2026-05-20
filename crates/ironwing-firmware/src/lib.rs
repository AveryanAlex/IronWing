pub mod artifact;
pub mod catalog;
pub mod serial_uploader;
pub mod types;

pub use artifact::{
    ArtifactClassification, DfuRecoveryArtifact, ExternalFlashPayload, SerialArtifact,
    classify_artifact, parse_apj, validate_recovery_bin, validate_recovery_file_type,
};
pub use catalog::{
    build_catalog_targets, filter_by_board, filter_by_board_and_platform,
    filter_catalog_targets_to_supported_official_bootloaders, parse_manifest_gz,
    parse_manifest_json, parse_supported_official_bootloader_targets,
};
pub use serial_uploader::{
    AsyncSerialIo, BootloaderInfo, SerialIo, SerialReadError, async_probe_with_cancel,
    async_upload_after_probe, async_upload_with_options, erase, erase_with_cancel, extf_erase,
    extf_erase_with_cancel, extf_program, extf_verify_crc, extf_verify_crc_with_cancel,
    firmware_crc, full_erase, full_erase_with_cancel, get_info, get_info_with_cancel, get_sync,
    get_sync_with_cancel, identify, identify_with_cancel, probe, probe_for_detection_with_cancel,
    probe_with_cancel, program, reboot, sync, sync_with_cancel, upload, upload_after_probe,
    upload_with_options, validate_board, validate_extf_capacity, validate_main_capacity,
    verify_crc, verify_crc_with_cancel,
};
pub use types::*;

#[cfg(test)]
mod tests {
    use super::*;
    use base64::prelude::*;
    use flate2::{
        Compression,
        write::{GzEncoder, ZlibEncoder},
    };
    use serde_json::json;
    use std::collections::VecDeque;
    use std::future::Future;
    use std::io::Write;
    use std::pin::Pin;

    fn compressed_b64(data: &[u8]) -> String {
        let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
        encoder.write_all(data).unwrap();
        BASE64_STANDARD.encode(encoder.finish().unwrap())
    }

    fn gzip_json(value: serde_json::Value) -> Vec<u8> {
        let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
        encoder.write_all(value.to_string().as_bytes()).unwrap();
        encoder.finish().unwrap()
    }

    #[test]
    fn catalog_manifest_parsing_filters_to_apj_and_groups_targets() {
        let manifest = gzip_json(json!({
            "firmware": [
                {
                    "board_id": 140,
                    "mav-type": "Copter",
                    "mav-firmware-version": "4.5.0",
                    "mav-firmware-version-type": "OFFICIAL",
                    "format": "apj",
                    "platform": "CubeOrange",
                    "url": "https://firmware.example/CubeOrange.apj",
                    "image_size": 42,
                    "latest": 1,
                    "git-sha": "abc",
                    "brand_name": "Cube Orange",
                    "manufacturer": "Hex"
                },
                {
                    "board_id": 140,
                    "mav-type": "Plane",
                    "mav-firmware-version": "4.4.0",
                    "mav-firmware-version-type": "OFFICIAL",
                    "format": "bin",
                    "platform": "CubeOrange",
                    "url": "https://firmware.example/CubeOrange.bin"
                }
            ]
        }));

        let entries = parse_manifest_gz(&manifest).unwrap();
        let targets = build_catalog_targets(&entries);

        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].url, "https://firmware.example/CubeOrange.apj");
        assert_eq!(targets.len(), 1);
        assert_eq!(targets[0].latest_version.as_deref(), Some("4.5.0"));
    }

    #[test]
    fn bootloader_catalog_targets_use_supported_index_listing() {
        let targets = vec![
            CatalogTargetSummary {
                board_id: 140,
                platform: "CubeOrange".into(),
                brand_name: Some("Cube Orange".into()),
                manufacturer: Some("Hex".into()),
                vehicle_types: vec!["Copter".into()],
                latest_version: Some("4.5.0".into()),
            },
            CatalogTargetSummary {
                board_id: 50,
                platform: "UnsupportedBoard".into(),
                brand_name: None,
                manufacturer: None,
                vehicle_types: vec!["Plane".into()],
                latest_version: None,
            },
        ];
        let supported = parse_supported_official_bootloader_targets(
            r#"<a href="CubeOrange_bl.bin">CubeOrange_bl.bin</a>"#,
        );

        let filtered =
            filter_catalog_targets_to_supported_official_bootloaders(&targets, &supported);

        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].platform, "CubeOrange");
    }

    #[test]
    fn parse_apj_extracts_internal_and_external_payloads() {
        let image = vec![1, 2, 3, 4];
        let extf = vec![5, 6, 7, 8];
        let apj = json!({
            "board_id": 140,
            "image": compressed_b64(&image),
            "image_size": image.len(),
            "extf_image": compressed_b64(&extf),
            "extf_image_size": extf.len(),
            "extflash_total": 1024,
            "summary": "test artifact"
        });

        let parsed = parse_apj(apj.to_string().as_bytes()).unwrap();

        assert_eq!(parsed.board_id, 140);
        assert_eq!(parsed.image, image);
        let parsed_extf = parsed.extf.unwrap();
        assert_eq!(parsed_extf.image, extf);
        assert_eq!(parsed_extf.extflash_total, 1024);
    }

    #[test]
    fn firmware_session_wire_uses_canonical_tags() {
        let status = FirmwareSessionStatus::FirmwareInstallUpdate {
            phase: SerialFlashPhase::Programming,
        };

        assert_eq!(
            serde_json::to_value(&status).unwrap(),
            json!({ "kind": "firmware_install_update", "phase": "programming" })
        );
    }

    #[test]
    fn new_session_start_methods_report_new_product_paths() {
        let session = FirmwareSessionHandle::new();
        session.try_start_firmware_install_update().unwrap();

        let err = session
            .try_start_bootloader_installation(false)
            .unwrap_err();

        match err {
            FirmwareError::SessionBusy { current_session } => {
                assert_eq!(current_session, FIRMWARE_INSTALL_UPDATE_PATH);
            }
            other => panic!("expected SessionBusy, got {other:?}"),
        }
    }

    struct MockAsyncSerial {
        reads: VecDeque<Result<Vec<u8>, SerialReadError>>,
        writes: Vec<Vec<u8>>,
    }

    impl MockAsyncSerial {
        fn new(reads: Vec<Result<Vec<u8>, SerialReadError>>) -> Self {
            Self {
                reads: reads.into(),
                writes: Vec::new(),
            }
        }
    }

    impl AsyncSerialIo for MockAsyncSerial {
        fn write_all<'a>(
            &'a mut self,
            data: &'a [u8],
        ) -> Pin<Box<dyn Future<Output = Result<(), FirmwareError>> + 'a>> {
            Box::pin(async move {
                self.writes.push(data.to_vec());
                Ok(())
            })
        }

        fn read<'a>(
            &'a mut self,
            buf: &'a mut [u8],
        ) -> Pin<Box<dyn Future<Output = Result<usize, SerialReadError>> + 'a>> {
            Box::pin(async move {
                match self.reads.pop_front() {
                    Some(Ok(mut chunk)) => {
                        let n = chunk.len().min(buf.len());
                        buf[..n].copy_from_slice(&chunk[..n]);
                        if n < chunk.len() {
                            let rest = chunk.split_off(n);
                            self.reads.push_front(Ok(rest));
                        }
                        Ok(n)
                    }
                    Some(Err(error)) => Err(error),
                    None => Err(SerialReadError::Timeout),
                }
            })
        }

        fn flush_input<'a>(
            &'a mut self,
        ) -> Pin<Box<dyn Future<Output = Result<(), FirmwareError>> + 'a>> {
            Box::pin(async { Ok(()) })
        }
    }

    fn ok_sync() -> Result<Vec<u8>, SerialReadError> {
        Ok(vec![0x12, 0x10])
    }

    fn u32_response(value: u32) -> Result<Vec<u8>, SerialReadError> {
        Ok(value.to_le_bytes().to_vec())
    }

    #[test]
    fn async_upload_uses_shared_serial_protocol() {
        let artifact = SerialArtifact {
            board_id: 140,
            image: vec![1, 2, 3, 4],
            image_size: 4,
            summary: "async test".into(),
            extf: None,
        };
        let expected_crc = firmware_crc(&artifact.image, 1024);
        let mut io = MockAsyncSerial::new(vec![
            ok_sync(),
            u32_response(5),
            ok_sync(),
            u32_response(140),
            ok_sync(),
            u32_response(1),
            ok_sync(),
            u32_response(1024),
            ok_sync(),
            u32_response(0),
            ok_sync(),
            ok_sync(),
            ok_sync(),
            u32_response(expected_crc),
            ok_sync(),
        ]);
        let mut progress = Vec::new();

        let info = futures::executor::block_on(async_upload_with_options(
            &mut io,
            &artifact,
            &SerialFlashOptions {
                full_chip_erase: false,
            },
            &|| false,
            |phase, written, total| progress.push((phase.to_string(), written, total)),
        ))
        .unwrap();

        assert_eq!(info.board_id, 140);
        assert_eq!(info.bl_rev, 5);
        assert_eq!(
            progress,
            vec![
                ("erasing".into(), 0, 0),
                ("programming".into(), 0, 4),
                ("programming".into(), 4, 4),
                ("verifying".into(), 0, 0),
                ("rebooting".into(), 0, 0),
            ]
        );
        assert!(io.writes.contains(&vec![0x27, 4]));
        assert!(io.writes.contains(&vec![0x30, 0x20]));
    }
}

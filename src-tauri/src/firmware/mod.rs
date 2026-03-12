pub(crate) mod artifact;
pub(crate) mod cache;
pub(crate) mod catalog;
pub(crate) mod commands;
pub(crate) mod dfu_recovery;
pub(crate) mod discovery;
pub(crate) mod serial_executor;
pub(crate) mod serial_uploader;
pub(crate) mod types;

#[cfg(test)]
mod tests {
    use super::artifact::*;
    use super::types::*;

    // ── Session contract serialization tests ──

    #[test]
    fn session_contracts_serial_primary_status_serializes() {
        let status = FirmwareSessionStatus::SerialPrimary {
            phase: SerialFlashPhase::Idle,
        };
        let json = serde_json::to_string(&status).unwrap();
        assert!(json.contains("serial_primary"), "got: {json}");
        assert!(json.contains("idle"), "got: {json}");
    }

    #[test]
    fn session_contracts_dfu_recovery_status_serializes() {
        let status = FirmwareSessionStatus::DfuRecovery {
            phase: DfuRecoveryPhase::Idle,
        };
        let json = serde_json::to_string(&status).unwrap();
        assert!(json.contains("dfu_recovery"), "got: {json}");
        assert!(json.contains("idle"), "got: {json}");
    }

    #[test]
    fn session_contracts_serial_terminal_outcomes() {
        let verified = SerialFlashOutcome::Verified;
        let unverified = SerialFlashOutcome::FlashedButUnverified;
        let failed = SerialFlashOutcome::Failed {
            reason: "timeout".into(),
        };

        let j1 = serde_json::to_string(&verified).unwrap();
        let j2 = serde_json::to_string(&unverified).unwrap();
        let j3 = serde_json::to_string(&failed).unwrap();

        assert!(j1.contains("verified"), "got: {j1}");
        assert!(j2.contains("flashed_but_unverified"), "got: {j2}");
        assert!(j3.contains("failed"), "got: {j3}");
        assert!(j3.contains("timeout"), "got: {j3}");
    }

    #[test]
    fn session_contracts_dfu_terminal_outcomes() {
        let verified = DfuRecoveryOutcome::Verified;
        let failed = DfuRecoveryOutcome::Failed {
            reason: "usb error".into(),
        };
        let unsupported = DfuRecoveryOutcome::UnsupportedRecoveryPath {
            guidance: "use serial".into(),
        };

        let j1 = serde_json::to_string(&verified).unwrap();
        let j2 = serde_json::to_string(&failed).unwrap();
        let j3 = serde_json::to_string(&unsupported).unwrap();

        assert!(j1.contains("verified"), "got: {j1}");
        assert!(j2.contains("failed"), "got: {j2}");
        assert!(j3.contains("unsupported_recovery_path"), "got: {j3}");
        assert!(j3.contains("use serial"), "got: {j3}");
    }

    #[test]
    fn session_contracts_firmware_source_types_are_path_specific() {
        let catalog = FirmwareSource::OfficialCatalog {
            board_id: 42,
            url: "https://example.com/fw.apj".into(),
            version: "4.5.0".into(),
        };
        let local_apj = FirmwareSource::LocalApj {
            path: "/tmp/fw.apj".into(),
        };
        let local_bin = FirmwareSource::LocalBin {
            path: "/tmp/fw.bin".into(),
        };

        let j1 = serde_json::to_string(&catalog).unwrap();
        let j2 = serde_json::to_string(&local_apj).unwrap();
        let j3 = serde_json::to_string(&local_bin).unwrap();

        assert!(j1.contains("official_catalog"), "got: {j1}");
        assert!(j2.contains("local_apj"), "got: {j2}");
        assert!(j3.contains("local_bin"), "got: {j3}");
    }

    #[test]
    fn session_contracts_progress_snapshot() {
        let progress = FirmwareProgress {
            phase_label: "erasing".into(),
            bytes_written: 1024,
            bytes_total: 65536,
            pct: 1.56,
        };
        let json = serde_json::to_string(&progress).unwrap();
        assert!(json.contains("erasing"), "got: {json}");
        assert!(json.contains("1024"), "got: {json}");
    }

    #[test]
    fn session_contracts_firmware_error_serializes() {
        let err = FirmwareError::SessionBusy {
            current_session: "serial_primary".into(),
        };
        let json = serde_json::to_string(&err).unwrap();
        assert!(json.contains("session_busy"), "got: {json}");
        assert!(json.contains("serial_primary"), "got: {json}");
    }

    // ── Session ownership / exclusivity tests ──

    #[test]
    fn serial_session_accepts_connected_state() {
        // Serial session now accepts connected state — the command handles
        // reboot-then-disconnect before flashing.
        let session = FirmwareSessionHandle::new();
        session.try_start_serial().unwrap();
        assert!(matches!(
            session.status(),
            FirmwareSessionStatus::SerialPrimary { .. }
        ));
        session.stop();
    }

    #[test]
    fn rejects_conflicting_session_state_already_flashing() {
        let session = FirmwareSessionHandle::new();

        // Start a serial session successfully
        session.try_start_serial().unwrap();

        // Attempt a DFU session while serial is active
        let result = session.try_start_dfu(false);
        assert!(result.is_err(), "should reject conflicting session");
        match result.unwrap_err() {
            FirmwareError::SessionBusy { current_session } => {
                assert_eq!(current_session, "serial_primary");
            }
            other => panic!("expected SessionBusy, got: {other:?}"),
        }
    }

    #[test]
    fn rejects_conflicting_session_state_dfu_blocks_serial() {
        let session = FirmwareSessionHandle::new();

        session.try_start_dfu(false).unwrap();

        let result = session.try_start_serial();
        assert!(result.is_err());
        match result.unwrap_err() {
            FirmwareError::SessionBusy { current_session } => {
                assert_eq!(current_session, "dfu_recovery");
            }
            other => panic!("expected SessionBusy, got: {other:?}"),
        }
    }

    #[test]
    fn rejects_conflicting_session_state_stop_then_restart() {
        let session = FirmwareSessionHandle::new();

        session.try_start_serial().unwrap();
        session.stop();

        // After stop, should be able to start a new session
        session.try_start_dfu(false).unwrap();
        let status = session.status();
        match status {
            FirmwareSessionStatus::DfuRecovery { phase } => {
                assert!(matches!(phase, DfuRecoveryPhase::Idle));
            }
            other => panic!("expected DfuRecovery, got: {other:?}"),
        }
    }

    #[test]
    fn session_contracts_serial_board_identity_serializes() {
        let board = SerialBoardIdentity {
            board_id: 140,
            bootloader_rev: 5,
            flash_size: 2_097_152,
            board_name: "fmuv3".into(),
            port: "/dev/ttyACM0".into(),
        };
        let json = serde_json::to_string(&board).unwrap();
        assert!(json.contains("140"), "got: {json}");
        assert!(json.contains("fmuv3"), "got: {json}");
        assert!(json.contains("/dev/ttyACM0"), "got: {json}");
    }

    #[test]
    fn session_contracts_dfu_recovery_identity_serializes() {
        let device = DfuRecoveryIdentity {
            vendor_id: 0x0483,
            product_id: 0xdf11,
            device_label: "STM32 DFU Bootloader".into(),
        };
        let json = serde_json::to_string(&device).unwrap();
        assert!(
            json.contains("1155"),
            "vendor_id 0x0483 = 1155, got: {json}"
        );
        assert!(
            json.contains("57105"),
            "product_id 0xdf11 = 57105, got: {json}"
        );
        assert!(json.contains("STM32 DFU Bootloader"), "got: {json}");
    }

    #[test]
    fn session_contracts_action_required_prompts_serialize() {
        let backup = ActionRequired::ConfirmParameterBackup;
        let j1 = serde_json::to_string(&backup).unwrap();
        assert!(j1.contains("confirm_parameter_backup"), "got: {j1}");

        let confirm_serial = ActionRequired::ConfirmSerialFlash {
            board: SerialBoardIdentity {
                board_id: 140,
                bootloader_rev: 5,
                flash_size: 2_097_152,
                board_name: "fmuv3".into(),
                port: "/dev/ttyACM0".into(),
            },
            source: FirmwareSource::LocalApj {
                path: "/tmp/fw.apj".into(),
            },
        };
        let j2 = serde_json::to_string(&confirm_serial).unwrap();
        assert!(j2.contains("confirm_serial_flash"), "got: {j2}");
        assert!(j2.contains("fmuv3"), "got: {j2}");
        assert!(j2.contains("local_apj"), "got: {j2}");

        let confirm_dfu = ActionRequired::ConfirmDfuRecovery {
            device: DfuRecoveryIdentity {
                vendor_id: 0x0483,
                product_id: 0xdf11,
                device_label: "STM32 DFU".into(),
            },
        };
        let j3 = serde_json::to_string(&confirm_dfu).unwrap();
        assert!(j3.contains("confirm_dfu_recovery"), "got: {j3}");
        assert!(j3.contains("STM32 DFU"), "got: {j3}");

        let driver = ActionRequired::InstallUsbDriver {
            guidance: "Install WinUSB via Zadig".into(),
        };
        let j4 = serde_json::to_string(&driver).unwrap();
        assert!(j4.contains("install_usb_driver"), "got: {j4}");
        assert!(j4.contains("Zadig"), "got: {j4}");
    }

    #[test]
    fn session_contracts_idle_is_default() {
        let session = FirmwareSessionHandle::new();
        let status = session.status();
        assert!(matches!(status, FirmwareSessionStatus::Idle));
    }

    // ── Artifact test helpers ──

    /// Build a synthetic APJ JSON with base64(zlib(data)) image payload.
    fn make_apj(board_id: u32, image_data: &[u8], extf_data: &[u8]) -> Vec<u8> {
        use base64::prelude::*;
        use flate2::write::ZlibEncoder;
        use flate2::Compression;
        use std::io::Write;

        let compress = |data: &[u8]| -> String {
            if data.is_empty() {
                return String::new();
            }
            let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
            encoder.write_all(data).unwrap();
            let compressed = encoder.finish().unwrap();
            BASE64_STANDARD.encode(&compressed)
        };

        let image_b64 = compress(image_data);
        let extf_b64 = compress(extf_data);

        let json = serde_json::json!({
            "board_id": board_id,
            "image": image_b64,
            "extf_image": extf_b64,
            "summary": "test firmware",
            "image_size": image_data.len(),
        });

        serde_json::to_vec(&json).unwrap()
    }

    // ── Artifact parsing tests ──

    #[test]
    fn artifact_parse_valid_apj() {
        let firmware_bytes = vec![0xDE, 0xAD, 0xBE, 0xEF, 0x01, 0x02, 0x03, 0x04];
        let apj_data = make_apj(140, &firmware_bytes, &[]);

        let artifact = parse_apj(&apj_data).unwrap();
        assert_eq!(artifact.board_id, 140);
        assert_eq!(artifact.image, firmware_bytes);
        assert_eq!(artifact.image_size, 8);
        assert_eq!(artifact.summary, "test firmware");
    }

    #[test]
    fn artifact_parse_apj_large_image() {
        let firmware_bytes: Vec<u8> = (0..65536).map(|i| (i % 256) as u8).collect();
        let apj_data = make_apj(9, &firmware_bytes, &[]);

        let artifact = parse_apj(&apj_data).unwrap();
        assert_eq!(artifact.board_id, 9);
        assert_eq!(artifact.image_size, 65536);
        assert_eq!(artifact.image.len(), 65536);
    }

    #[test]
    fn artifact_rejects_apj_image_size_mismatch() {
        use base64::prelude::*;
        use flate2::write::ZlibEncoder;
        use flate2::Compression;
        use std::io::Write;

        let firmware_bytes = vec![0xDE, 0xAD, 0xBE, 0xEF];
        let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
        encoder.write_all(&firmware_bytes).unwrap();
        let compressed = encoder.finish().unwrap();
        let image_b64 = BASE64_STANDARD.encode(&compressed);

        let json = serde_json::json!({
            "board_id": 140,
            "image": image_b64,
            "extf_image": "",
            "image_size": 9999,
        });
        let data = serde_json::to_vec(&json).unwrap();

        let result = parse_apj(&data);
        assert!(result.is_err(), "should reject image_size mismatch");
        match result.unwrap_err() {
            FirmwareError::ArtifactInvalid { reason } => {
                assert!(reason.contains("image_size"), "got: {reason}");
                assert!(
                    reason.contains("9999"),
                    "should mention declared size: {reason}"
                );
            }
            other => panic!("expected ArtifactInvalid, got: {other:?}"),
        }
    }

    #[test]
    fn artifact_rejects_invalid_apj_json() {
        let result = parse_apj(b"not json at all {{{");
        assert!(result.is_err());
        let err = result.unwrap_err();
        match err {
            FirmwareError::ArtifactInvalid { reason } => {
                assert!(reason.contains("invalid APJ JSON"), "got: {reason}");
            }
            other => panic!("expected ArtifactInvalid, got: {other:?}"),
        }
    }

    #[test]
    fn artifact_rejects_apj_missing_fields() {
        let data = serde_json::to_vec(&serde_json::json!({"summary": "no image"})).unwrap();
        let result = parse_apj(&data);
        assert!(result.is_err());
        match result.unwrap_err() {
            FirmwareError::ArtifactInvalid { reason } => {
                assert!(reason.contains("invalid APJ JSON"), "got: {reason}");
            }
            other => panic!("expected ArtifactInvalid, got: {other:?}"),
        }
    }

    #[test]
    fn artifact_rejects_apj_corrupt_base64() {
        let data = serde_json::to_vec(&serde_json::json!({
            "board_id": 140,
            "image": "!!!not-valid-base64!!!",
            "extf_image": "",
        }))
        .unwrap();
        let result = parse_apj(&data);
        assert!(result.is_err());
        match result.unwrap_err() {
            FirmwareError::ArtifactInvalid { reason } => {
                assert!(reason.contains("base64"), "got: {reason}");
            }
            other => panic!("expected ArtifactInvalid, got: {other:?}"),
        }
    }

    #[test]
    fn artifact_rejects_apj_corrupt_zlib() {
        use base64::prelude::*;
        let fake_compressed = BASE64_STANDARD.encode(b"this is not zlib compressed data");
        let data = serde_json::to_vec(&serde_json::json!({
            "board_id": 140,
            "image": fake_compressed,
            "extf_image": "",
        }))
        .unwrap();
        let result = parse_apj(&data);
        assert!(result.is_err());
        match result.unwrap_err() {
            FirmwareError::ArtifactInvalid { reason } => {
                assert!(reason.contains("zlib"), "got: {reason}");
            }
            other => panic!("expected ArtifactInvalid, got: {other:?}"),
        }
    }

    #[test]
    fn artifact_rejects_nonempty_extf_image() {
        let apj_data = make_apj(140, &[0x01, 0x02], &[0xFF, 0xFE]);

        let result = parse_apj(&apj_data);
        assert!(result.is_err());
        match result.unwrap_err() {
            FirmwareError::ArtifactInvalid { reason } => {
                assert!(reason.contains("extf_image"), "got: {reason}");
                assert!(reason.contains("not supported"), "got: {reason}");
            }
            other => panic!("expected ArtifactInvalid, got: {other:?}"),
        }
    }

    // ── DFU recovery artifact tests ──

    #[test]
    fn artifact_validate_valid_recovery_bin() {
        let bin_data = vec![0x00, 0x20, 0x00, 0x08, 0x01, 0x02, 0x03, 0x04];
        let artifact = validate_recovery_bin(&bin_data).unwrap();
        assert_eq!(artifact.image_size, 8);
        assert_eq!(artifact.image, bin_data);
        assert!(artifact.recovery_note.contains("recovery"));
    }

    #[test]
    fn artifact_rejects_empty_recovery_bin() {
        let result = validate_recovery_bin(&[]);
        assert!(result.is_err());
        match result.unwrap_err() {
            FirmwareError::ArtifactInvalid { reason } => {
                assert!(reason.contains("empty"), "got: {reason}");
            }
            other => panic!("expected ArtifactInvalid, got: {other:?}"),
        }
    }

    // ── Classification tests ──

    #[test]
    fn artifact_classify_apj_extension() {
        let cls = classify_artifact("/tmp/firmware.apj").unwrap();
        assert_eq!(cls, ArtifactClassification::Apj);
    }

    #[test]
    fn artifact_classify_bin_extension() {
        let cls = classify_artifact("/tmp/firmware.bin").unwrap();
        assert_eq!(cls, ArtifactClassification::Bin);
    }

    #[test]
    fn artifact_rejects_px4_extension() {
        let result = classify_artifact("/tmp/firmware.px4");
        assert!(result.is_err());
        match result.unwrap_err() {
            FirmwareError::ArtifactInvalid { reason } => {
                assert!(reason.contains(".px4"), "got: {reason}");
            }
            other => panic!("expected ArtifactInvalid, got: {other:?}"),
        }
    }

    #[test]
    fn artifact_rejects_hex_extension() {
        let result = classify_artifact("/tmp/firmware.hex");
        assert!(result.is_err());
        match result.unwrap_err() {
            FirmwareError::ArtifactInvalid { reason } => {
                assert!(reason.contains(".hex"), "got: {reason}");
            }
            other => panic!("expected ArtifactInvalid, got: {other:?}"),
        }
    }

    #[test]
    fn artifact_rejects_dfu_extension() {
        let result = classify_artifact("/tmp/firmware.dfu");
        assert!(result.is_err());
        match result.unwrap_err() {
            FirmwareError::ArtifactInvalid { reason } => {
                assert!(reason.contains(".dfu"), "got: {reason}");
            }
            other => panic!("expected ArtifactInvalid, got: {other:?}"),
        }
    }

    #[test]
    fn artifact_rejects_unknown_extension() {
        let result = classify_artifact("/tmp/firmware.xyz");
        assert!(result.is_err());
        match result.unwrap_err() {
            FirmwareError::ArtifactInvalid { reason } => {
                assert!(reason.contains("unrecognized"), "got: {reason}");
                assert!(
                    reason.contains(".apj"),
                    "should mention supported: {reason}"
                );
                assert!(
                    reason.contains(".bin"),
                    "should mention supported: {reason}"
                );
            }
            other => panic!("expected ArtifactInvalid, got: {other:?}"),
        }
    }

    // ── DFU recovery file-type gate tests ──

    #[test]
    fn artifact_rejects_invalid_recovery_inputs_apj_blocked() {
        let result = validate_recovery_file_type("/tmp/firmware.apj");
        assert!(result.is_err());
        match result.unwrap_err() {
            FirmwareError::ArtifactInvalid { reason } => {
                assert!(reason.contains(".apj"), "got: {reason}");
                assert!(reason.contains("DFU recovery"), "got: {reason}");
                assert!(reason.contains(".bin"), "should guide to .bin: {reason}");
            }
            other => panic!("expected ArtifactInvalid, got: {other:?}"),
        }
    }

    #[test]
    fn artifact_rejects_invalid_recovery_inputs_px4_blocked() {
        let result = validate_recovery_file_type("/tmp/firmware.px4");
        assert!(result.is_err());
        match result.unwrap_err() {
            FirmwareError::ArtifactInvalid { reason } => {
                assert!(reason.contains(".px4"), "got: {reason}");
            }
            other => panic!("expected ArtifactInvalid, got: {other:?}"),
        }
    }

    #[test]
    fn artifact_rejects_invalid_recovery_inputs_hex_blocked() {
        let result = validate_recovery_file_type("/tmp/firmware.hex");
        assert!(result.is_err());
        match result.unwrap_err() {
            FirmwareError::ArtifactInvalid { reason } => {
                assert!(reason.contains(".hex"), "got: {reason}");
            }
            other => panic!("expected ArtifactInvalid, got: {other:?}"),
        }
    }

    #[test]
    fn artifact_recovery_accepts_bin() {
        validate_recovery_file_type("/tmp/firmware.bin").unwrap();
    }

    // ── Serial uploader tests ──

    use super::serial_uploader::*;
    use std::collections::VecDeque;

    /// Mock serial I/O for testing. Stores expected writes and scripted reads.
    struct MockSerial {
        read_buf: VecDeque<u8>,
        written: Vec<u8>,
        flush_count: usize,
    }

    impl MockSerial {
        fn new() -> Self {
            Self {
                read_buf: VecDeque::new(),
                written: Vec::new(),
                flush_count: 0,
            }
        }

        fn queue_read(&mut self, data: &[u8]) {
            self.read_buf.extend(data);
        }

        fn queue_sync_ok(&mut self) {
            self.queue_read(&[0x12, 0x10]); // INSYNC + OK
        }

        fn queue_u32_le(&mut self, val: u32) {
            self.queue_read(&val.to_le_bytes());
        }

        fn queue_identify(&mut self, bl_rev: u32, board_id: u32, board_rev: u32, flash_size: u32) {
            self.queue_u32_le(bl_rev);
            self.queue_sync_ok();
            self.queue_u32_le(board_id);
            self.queue_sync_ok();
            self.queue_u32_le(board_rev);
            self.queue_sync_ok();
            self.queue_u32_le(flash_size);
            self.queue_sync_ok();
        }
    }

    impl SerialIo for MockSerial {
        fn write_all(&mut self, data: &[u8]) -> Result<(), FirmwareError> {
            self.written.extend_from_slice(data);
            Ok(())
        }

        fn read_exact(&mut self, buf: &mut [u8]) -> Result<(), FirmwareError> {
            for byte in buf.iter_mut() {
                *byte = self
                    .read_buf
                    .pop_front()
                    .ok_or_else(|| FirmwareError::ProtocolError {
                        detail: "mock serial: read buffer exhausted (timeout)".into(),
                    })?;
            }
            Ok(())
        }

        fn flush_input(&mut self) -> Result<(), FirmwareError> {
            self.flush_count += 1;
            Ok(())
        }
    }

    // Protocol constants for test assertions
    const TEST_GET_SYNC: u8 = 0x21;
    const TEST_EOC: u8 = 0x20;
    const TEST_INSYNC: u8 = 0x12;
    const TEST_FAILED: u8 = 0x11;
    const TEST_INVALID: u8 = 0x13;
    const TEST_OK: u8 = 0x10;
    const TEST_CHIP_ERASE: u8 = 0x23;
    const TEST_PROG_MULTI: u8 = 0x27;
    const TEST_GET_CRC: u8 = 0x29;
    const TEST_REBOOT: u8 = 0x30;
    const TEST_PROG_MULTI_MAX: usize = 252;

    // ── Sync tests ──

    #[test]
    fn serial_uploader_sync_ok() {
        let mut mock = MockSerial::new();
        mock.queue_sync_ok();
        sync(&mut mock).unwrap();
        assert_eq!(mock.written, vec![TEST_GET_SYNC, TEST_EOC]);
        assert_eq!(mock.flush_count, 1);
    }

    #[test]
    fn serial_uploader_sync_failed_response() {
        let mut mock = MockSerial::new();
        mock.queue_read(&[TEST_INSYNC, TEST_FAILED]);
        let err = sync(&mut mock).unwrap_err();
        match err {
            FirmwareError::ProtocolError { detail } => {
                assert!(detail.contains("FAILED"), "got: {detail}");
            }
            other => panic!("expected ProtocolError, got: {other:?}"),
        }
    }

    #[test]
    fn serial_uploader_sync_invalid_response() {
        let mut mock = MockSerial::new();
        mock.queue_read(&[TEST_INSYNC, TEST_INVALID]);
        let err = sync(&mut mock).unwrap_err();
        match err {
            FirmwareError::ProtocolError { detail } => {
                assert!(detail.contains("INVALID"), "got: {detail}");
            }
            other => panic!("expected ProtocolError, got: {other:?}"),
        }
    }

    #[test]
    fn serial_uploader_sync_no_insync() {
        let mut mock = MockSerial::new();
        mock.queue_read(&[0xFF, TEST_OK]);
        let err = sync(&mut mock).unwrap_err();
        match err {
            FirmwareError::ProtocolError { detail } => {
                assert!(detail.contains("INSYNC"), "got: {detail}");
            }
            other => panic!("expected ProtocolError, got: {other:?}"),
        }
    }

    #[test]
    fn serial_uploader_sync_timeout() {
        let mut mock = MockSerial::new();
        let err = sync(&mut mock).unwrap_err();
        match err {
            FirmwareError::ProtocolError { detail } => {
                assert!(
                    detail.contains("timeout") || detail.contains("exhausted"),
                    "got: {detail}"
                );
            }
            other => panic!("expected ProtocolError, got: {other:?}"),
        }
    }

    // ── Device identification tests ──

    #[test]
    fn serial_uploader_identify_valid() {
        let mut mock = MockSerial::new();
        mock.queue_identify(5, 140, 0, 2_097_152);
        let info = identify(&mut mock).unwrap();
        assert_eq!(info.bl_rev, 5);
        assert_eq!(info.board_id, 140);
        assert_eq!(info.board_rev, 0);
        assert_eq!(info.flash_size, 2_097_152);
    }

    #[test]
    fn serial_uploader_identify_bl_rev_2() {
        let mut mock = MockSerial::new();
        mock.queue_identify(2, 9, 1, 1_048_576);
        let info = identify(&mut mock).unwrap();
        assert_eq!(info.bl_rev, 2);
        assert_eq!(info.board_id, 9);
    }

    #[test]
    fn serial_uploader_identify_rejects_unsupported_bl_rev_1() {
        let mut mock = MockSerial::new();
        mock.queue_u32_le(1);
        mock.queue_sync_ok();
        let err = identify(&mut mock).unwrap_err();
        match err {
            FirmwareError::ProtocolError { detail } => {
                assert!(detail.contains("unsupported"), "got: {detail}");
                assert!(detail.contains("1"), "got: {detail}");
            }
            other => panic!("expected ProtocolError, got: {other:?}"),
        }
    }

    #[test]
    fn serial_uploader_identify_rejects_unsupported_bl_rev_6() {
        let mut mock = MockSerial::new();
        mock.queue_u32_le(6);
        mock.queue_sync_ok();
        let err = identify(&mut mock).unwrap_err();
        match err {
            FirmwareError::ProtocolError { detail } => {
                assert!(detail.contains("unsupported"), "got: {detail}");
                assert!(detail.contains("6"), "got: {detail}");
            }
            other => panic!("expected ProtocolError, got: {other:?}"),
        }
    }

    // ── Board validation tests ──

    #[test]
    fn serial_uploader_validate_board_match() {
        let artifact = SerialArtifact {
            board_id: 140,
            image: vec![0xDE, 0xAD],
            image_size: 2,
            summary: "test".into(),
        };
        let info = BootloaderInfo {
            bl_rev: 5,
            board_id: 140,
            board_rev: 0,
            flash_size: 2_097_152,
        };
        validate_board(&artifact, &info).unwrap();
    }

    #[test]
    fn serial_uploader_rejects_board_mismatch() {
        let artifact = SerialArtifact {
            board_id: 140,
            image: vec![0xDE, 0xAD],
            image_size: 2,
            summary: "test".into(),
        };
        let info = BootloaderInfo {
            bl_rev: 5,
            board_id: 9,
            board_rev: 0,
            flash_size: 2_097_152,
        };
        let err = validate_board(&artifact, &info).unwrap_err();
        match err {
            FirmwareError::BoardMismatch { expected, actual } => {
                assert_eq!(expected, 140);
                assert_eq!(actual, 9);
            }
            other => panic!("expected BoardMismatch, got: {other:?}"),
        }
    }

    // ── Erase tests ──

    #[test]
    fn serial_uploader_erase_ok() {
        let mut mock = MockSerial::new();
        mock.queue_sync_ok();
        erase(&mut mock).unwrap();
        assert_eq!(mock.written, vec![TEST_CHIP_ERASE, TEST_EOC]);
    }

    #[test]
    fn serial_uploader_erase_timeout() {
        let mut mock = MockSerial::new();
        let err = erase(&mut mock).unwrap_err();
        match err {
            FirmwareError::ProtocolError { detail } => {
                assert!(
                    detail.contains("timeout") || detail.contains("exhausted"),
                    "got: {detail}"
                );
            }
            other => panic!("expected ProtocolError, got: {other:?}"),
        }
    }

    #[test]
    fn serial_uploader_erase_failed() {
        let mut mock = MockSerial::new();
        mock.queue_read(&[TEST_INSYNC, TEST_FAILED]);
        let err = erase(&mut mock).unwrap_err();
        match err {
            FirmwareError::ProtocolError { detail } => {
                assert!(detail.contains("FAILED"), "got: {detail}");
            }
            other => panic!("expected ProtocolError, got: {other:?}"),
        }
    }

    // ── Program tests ──

    #[test]
    fn serial_uploader_program_single_chunk() {
        let mut mock = MockSerial::new();
        let image = vec![0x01, 0x02, 0x03, 0x04];
        mock.queue_sync_ok();

        let mut progress_calls = Vec::new();
        program(&mut mock, &image, |written, total| {
            progress_calls.push((written, total));
        })
        .unwrap();

        assert_eq!(mock.written[0], TEST_PROG_MULTI);
        assert_eq!(mock.written[1], 4);
        assert_eq!(&mock.written[2..6], &[0x01, 0x02, 0x03, 0x04]);
        assert_eq!(mock.written[6], TEST_EOC);
        assert_eq!(progress_calls, vec![(4, 4)]);
    }

    #[test]
    fn serial_uploader_program_multiple_chunks() {
        let mut mock = MockSerial::new();
        let image: Vec<u8> = (0..TEST_PROG_MULTI_MAX + 8)
            .map(|i| (i % 256) as u8)
            .collect();
        mock.queue_sync_ok();
        mock.queue_sync_ok();

        let mut progress_calls = Vec::new();
        program(&mut mock, &image, |written, total| {
            progress_calls.push((written, total));
        })
        .unwrap();

        let total = TEST_PROG_MULTI_MAX + 8;
        assert_eq!(progress_calls.len(), 2);
        assert_eq!(progress_calls[0], (TEST_PROG_MULTI_MAX, total));
        assert_eq!(progress_calls[1], (total, total));
    }

    #[test]
    fn serial_uploader_program_empty_image() {
        let mut mock = MockSerial::new();
        let mut progress_calls = Vec::new();
        program(&mut mock, &[], |written, total| {
            progress_calls.push((written, total));
        })
        .unwrap();
        assert!(mock.written.is_empty());
        assert!(progress_calls.is_empty());
    }

    #[test]
    fn serial_uploader_program_chunk_failure() {
        let mut mock = MockSerial::new();
        let image = vec![0x01, 0x02, 0x03, 0x04];
        mock.queue_read(&[TEST_INSYNC, TEST_FAILED]);
        let err = program(&mut mock, &image, |_, _| {}).unwrap_err();
        match err {
            FirmwareError::ProtocolError { detail } => {
                assert!(detail.contains("FAILED"), "got: {detail}");
            }
            other => panic!("expected ProtocolError, got: {other:?}"),
        }
    }

    // ── CRC tests ──

    #[test]
    fn serial_uploader_firmware_crc_empty_image() {
        let crc = firmware_crc(&[], 16);
        let mut hasher = crc32fast::Hasher::new();
        for _ in 0..4 {
            hasher.update(&[0xFF, 0xFF, 0xFF, 0xFF]);
        }
        assert_eq!(crc, hasher.finalize());
    }

    #[test]
    fn serial_uploader_firmware_crc_exact_flash_size() {
        let image = vec![0xAB; 1024];
        let crc = firmware_crc(&image, 1024);
        let mut hasher = crc32fast::Hasher::new();
        hasher.update(&image);
        assert_eq!(crc, hasher.finalize());
    }

    #[test]
    fn serial_uploader_firmware_crc_with_padding() {
        let image = vec![0x01, 0x02, 0x03, 0x04];
        let crc = firmware_crc(&image, 20);
        let mut hasher = crc32fast::Hasher::new();
        hasher.update(&image);
        for _ in 0..4 {
            hasher.update(&[0xFF, 0xFF, 0xFF, 0xFF]);
        }
        assert_eq!(crc, hasher.finalize());
    }

    #[test]
    fn serial_uploader_verify_crc_match() {
        let image = vec![0xDE, 0xAD, 0xBE, 0xEF];
        let flash_size = 1024u32;
        let expected_crc = firmware_crc(&image, flash_size);
        let mut mock = MockSerial::new();
        mock.queue_u32_le(expected_crc);
        mock.queue_sync_ok();
        verify_crc(&mut mock, &image, flash_size).unwrap();
        assert_eq!(mock.written, vec![TEST_GET_CRC, TEST_EOC]);
    }

    #[test]
    fn serial_uploader_verify_crc_mismatch() {
        let image = vec![0xDE, 0xAD, 0xBE, 0xEF];
        let mut mock = MockSerial::new();
        mock.queue_u32_le(0xDEAD_BEEF);
        mock.queue_sync_ok();
        let err = verify_crc(&mut mock, &image, 1024).unwrap_err();
        match err {
            FirmwareError::ProtocolError { detail } => {
                assert!(detail.contains("CRC mismatch"), "got: {detail}");
            }
            other => panic!("expected ProtocolError, got: {other:?}"),
        }
    }

    // ── Reboot tests ──

    #[test]
    fn serial_uploader_reboot_sends_command() {
        let mut mock = MockSerial::new();
        reboot(&mut mock).unwrap();
        assert_eq!(mock.written, vec![TEST_REBOOT, TEST_EOC]);
    }

    // ── Full upload flow tests ──

    #[test]
    fn serial_uploader_full_upload_happy_path() {
        let mut mock = MockSerial::new();
        let image = vec![0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08];
        let flash_size = 2_097_152u32;

        mock.queue_sync_ok();
        mock.queue_identify(5, 140, 0, flash_size);
        mock.queue_sync_ok(); // erase
        mock.queue_sync_ok(); // program
        let expected_crc = firmware_crc(&image, flash_size);
        mock.queue_u32_le(expected_crc);
        mock.queue_sync_ok(); // verify

        let artifact = SerialArtifact {
            board_id: 140,
            image: image.clone(),
            image_size: 8,
            summary: "test fw".into(),
        };

        let mut progress = Vec::new();
        let info = upload(&mut mock, &artifact, |w, t| progress.push((w, t))).unwrap();
        assert_eq!(info.bl_rev, 5);
        assert_eq!(info.board_id, 140);
        assert_eq!(info.flash_size, flash_size);
        assert_eq!(progress, vec![(8, 8)]);
    }

    #[test]
    fn serial_uploader_full_upload_bl_rev_2_skips_crc() {
        let mut mock = MockSerial::new();
        let image = vec![0x01, 0x02, 0x03, 0x04];

        mock.queue_sync_ok();
        mock.queue_identify(2, 9, 0, 1_048_576);
        mock.queue_sync_ok(); // erase
        mock.queue_sync_ok(); // program

        let artifact = SerialArtifact {
            board_id: 9,
            image,
            image_size: 4,
            summary: "test".into(),
        };

        let info = upload(&mut mock, &artifact, |_, _| {}).unwrap();
        assert_eq!(info.bl_rev, 2);
        assert_eq!(info.board_id, 9);
        assert!(
            mock.read_buf.is_empty(),
            "no extra reads should have occurred"
        );
    }

    #[test]
    fn serial_uploader_full_upload_board_mismatch_aborts_before_erase() {
        let mut mock = MockSerial::new();

        mock.queue_sync_ok();
        mock.queue_identify(5, 9, 0, 2_097_152);

        let artifact = SerialArtifact {
            board_id: 140,
            image: vec![0x01],
            image_size: 1,
            summary: "test".into(),
        };

        let err = upload(&mut mock, &artifact, |_, _| {}).unwrap_err();
        match err {
            FirmwareError::BoardMismatch { expected, actual } => {
                assert_eq!(expected, 140);
                assert_eq!(actual, 9);
            }
            other => panic!("expected BoardMismatch, got: {other:?}"),
        }

        assert!(
            !mock.written.contains(&TEST_CHIP_ERASE),
            "erase should not have been sent on board mismatch"
        );
    }

    #[test]
    fn serial_uploader_full_upload_crc_mismatch_reports_error() {
        let mut mock = MockSerial::new();
        let image = vec![0x01, 0x02, 0x03, 0x04];

        mock.queue_sync_ok();
        mock.queue_identify(3, 140, 0, 1024);
        mock.queue_sync_ok(); // erase
        mock.queue_sync_ok(); // program
        mock.queue_u32_le(0xBADC_0000);
        mock.queue_sync_ok();

        let artifact = SerialArtifact {
            board_id: 140,
            image,
            image_size: 4,
            summary: "test".into(),
        };

        let err = upload(&mut mock, &artifact, |_, _| {}).unwrap_err();
        match err {
            FirmwareError::ProtocolError { detail } => {
                assert!(detail.contains("CRC mismatch"), "got: {detail}");
            }
            other => panic!("expected ProtocolError, got: {other:?}"),
        }
    }

    #[test]
    fn serial_uploader_full_upload_large_image_chunking() {
        let mut mock = MockSerial::new();
        let image: Vec<u8> = (0..600).map(|i| (i % 256) as u8).collect();
        let flash_size = 2_097_152u32;

        mock.queue_sync_ok();
        mock.queue_identify(4, 140, 0, flash_size);
        mock.queue_sync_ok(); // erase
        mock.queue_sync_ok(); // chunk 1
        mock.queue_sync_ok(); // chunk 2
        mock.queue_sync_ok(); // chunk 3
        let expected_crc = firmware_crc(&image, flash_size);
        mock.queue_u32_le(expected_crc);
        mock.queue_sync_ok();

        let artifact = SerialArtifact {
            board_id: 140,
            image: image.clone(),
            image_size: 600,
            summary: "big fw".into(),
        };

        let mut progress = Vec::new();
        let info = upload(&mut mock, &artifact, |w, t| progress.push((w, t))).unwrap();
        assert_eq!(info.bl_rev, 4);
        assert_eq!(progress.len(), 3);
        assert_eq!(progress[0], (252, 600));
        assert_eq!(progress[1], (504, 600));
        assert_eq!(progress[2], (600, 600));
    }

    // ── Inventory / discovery tests ──

    use super::discovery::*;

    #[test]
    fn inventory_port_info_serializes() {
        let port = PortInfo {
            port_name: "/dev/ttyACM0".into(),
            vid: Some(0x2DAE),
            pid: Some(0x1058),
            serial_number: Some("3B0034000F51353233343932".into()),
            manufacturer: Some("ArduPilot".into()),
            product: Some("fmuv3".into()),
            location: Some("1-2.3".into()),
        };
        let json = serde_json::to_string(&port).unwrap();
        assert!(json.contains("/dev/ttyACM0"), "got: {json}");
        assert!(json.contains("11694"), "vid 0x2DAE = 11694, got: {json}");
        assert!(json.contains("4184"), "pid 0x1058 = 4184, got: {json}");
        assert!(json.contains("ArduPilot"), "got: {json}");
    }

    #[test]
    fn inventory_result_available_serializes() {
        let result = InventoryResult::Available {
            ports: vec![PortInfo {
                port_name: "/dev/ttyACM0".into(),
                vid: Some(0x2DAE),
                pid: Some(0x1058),
                serial_number: None,
                manufacturer: None,
                product: None,
                location: None,
            }],
        };
        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains("available"), "got: {json}");
        assert!(json.contains("/dev/ttyACM0"), "got: {json}");
    }

    #[test]
    fn inventory_result_unsupported_serializes() {
        let result = InventoryResult::Unsupported;
        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains("unsupported"), "got: {json}");
        assert!(
            !json.contains("ports"),
            "should have no ports field: {json}"
        );
    }

    #[test]
    fn inventory_android_unsupported() {
        let port_result = InventoryResult::Unsupported;
        let dfu_result = DfuScanResult::Unsupported;
        let port_json = serde_json::to_string(&port_result).unwrap();
        let dfu_json = serde_json::to_string(&dfu_result).unwrap();
        assert!(port_json.contains("unsupported"), "got: {port_json}");
        assert!(!port_json.contains("ports"), "got: {port_json}");
        assert!(dfu_json.contains("unsupported"), "got: {dfu_json}");
        assert!(!dfu_json.contains("devices"), "got: {dfu_json}");
    }

    #[test]
    fn inventory_dfu_scan_result_available_serializes() {
        let result = DfuScanResult::Available {
            devices: vec![DfuDeviceInfo {
                vid: 0x0483,
                pid: 0xdf11,
                serial_number: Some("12345".into()),
                manufacturer: Some("STMicroelectronics".into()),
                product: Some("STM32 BOOTLOADER".into()),
            }],
        };
        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains("available"), "got: {json}");
        assert!(json.contains("1155"), "vid 0x0483 = 1155, got: {json}");
        assert!(json.contains("57105"), "pid 0xdf11 = 57105, got: {json}");
        assert!(json.contains("STMicroelectronics"), "got: {json}");
    }

    #[test]
    fn inventory_list_firmware_ports_returns_available() {
        let result = list_firmware_ports();
        match result {
            InventoryResult::Available { .. } => {}
            other => panic!("expected Available on desktop, got: {other:?}"),
        }
    }

    #[test]
    fn inventory_list_dfu_devices_returns_available() {
        let result = list_dfu_devices();
        match result {
            DfuScanResult::Available { .. } => {}
            other => panic!("expected Available on desktop, got: {other:?}"),
        }
    }

    #[test]
    fn inventory_is_stm32_dfu_device_positive() {
        let device = DfuDeviceInfo {
            vid: 0x0483,
            pid: 0xdf11,
            serial_number: None,
            manufacturer: Some("STMicroelectronics".into()),
            product: Some("STM32 BOOTLOADER".into()),
        };
        assert!(is_stm32_dfu(&device));
    }

    #[test]
    fn inventory_is_stm32_dfu_device_negative() {
        let device = DfuDeviceInfo {
            vid: 0x2DAE,
            pid: 0x1058,
            serial_number: None,
            manufacturer: None,
            product: None,
        };
        assert!(!is_stm32_dfu(&device));
    }

    #[test]
    fn inventory_detect_bootloader_same_port_reuse() {
        let before = vec![PortInfo {
            port_name: "/dev/ttyACM0".into(),
            vid: Some(0x2DAE),
            pid: Some(0x1058),
            serial_number: Some("ABC123".into()),
            manufacturer: None,
            product: None,
            location: Some("1-2".into()),
        }];
        let after = vec![PortInfo {
            port_name: "/dev/ttyACM0".into(),
            vid: Some(0x2DAE),
            pid: Some(0x1016),
            serial_number: Some("ABC123".into()),
            manufacturer: None,
            product: None,
            location: Some("1-2".into()),
        }];
        let candidates = detect_bootloader_port(&before, &after);
        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].port_name, "/dev/ttyACM0");
    }

    #[test]
    fn inventory_detect_bootloader_new_port_after_reboot() {
        let before = vec![PortInfo {
            port_name: "/dev/ttyACM0".into(),
            vid: Some(0x2DAE),
            pid: Some(0x1058),
            serial_number: None,
            manufacturer: None,
            product: None,
            location: Some("1-2".into()),
        }];
        let after = vec![PortInfo {
            port_name: "/dev/ttyACM1".into(),
            vid: Some(0x2DAE),
            pid: Some(0x1016),
            serial_number: None,
            manufacturer: None,
            product: None,
            location: Some("1-2".into()),
        }];
        let candidates = detect_bootloader_port(&before, &after);
        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].port_name, "/dev/ttyACM1");
    }

    #[test]
    fn inventory_detect_bootloader_disappeared_port() {
        let before = vec![PortInfo {
            port_name: "/dev/ttyACM0".into(),
            vid: Some(0x2DAE),
            pid: Some(0x1058),
            serial_number: None,
            manufacturer: None,
            product: None,
            location: Some("1-2".into()),
        }];
        let after: Vec<PortInfo> = vec![];
        let candidates = detect_bootloader_port(&before, &after);
        assert!(
            candidates.is_empty(),
            "no ports means no bootloader candidates"
        );
    }

    #[test]
    fn inventory_detect_bootloader_new_port_no_location_match() {
        let before = vec![PortInfo {
            port_name: "/dev/ttyACM0".into(),
            vid: Some(0x2DAE),
            pid: Some(0x1058),
            serial_number: None,
            manufacturer: None,
            product: None,
            location: None,
        }];
        let after = vec![
            PortInfo {
                port_name: "/dev/ttyACM0".into(),
                vid: Some(0x2DAE),
                pid: Some(0x1058),
                serial_number: None,
                manufacturer: None,
                product: None,
                location: None,
            },
            PortInfo {
                port_name: "/dev/ttyACM1".into(),
                vid: Some(0x2DAE),
                pid: Some(0x1016),
                serial_number: None,
                manufacturer: None,
                product: None,
                location: None,
            },
        ];
        let candidates = detect_bootloader_port(&before, &after);
        assert_eq!(candidates.len(), 1, "new port should be detected");
        assert_eq!(candidates[0].port_name, "/dev/ttyACM1");
    }

    #[test]
    fn inventory_filter_dfu_devices() {
        let devices = vec![
            DfuDeviceInfo {
                vid: 0x0483,
                pid: 0xdf11,
                serial_number: None,
                manufacturer: Some("STMicroelectronics".into()),
                product: Some("STM32 BOOTLOADER".into()),
            },
            DfuDeviceInfo {
                vid: 0x2DAE,
                pid: 0x1058,
                serial_number: None,
                manufacturer: None,
                product: None,
            },
        ];
        let dfu_devices: Vec<_> = devices.iter().filter(|d| is_stm32_dfu(d)).collect();
        assert_eq!(dfu_devices.len(), 1);
        assert_eq!(dfu_devices[0].vid, 0x0483);
        assert_eq!(dfu_devices[0].pid, 0xdf11);
    }

    // ── Board-ID detection from port VID/PID ──

    #[test]
    fn detect_board_id_cubeorange_vid_pid() {
        let ports = vec![PortInfo {
            port_name: "/dev/ttyACM0".into(),
            vid: Some(0x2DAE),
            pid: Some(0x1058),
            serial_number: None,
            manufacturer: None,
            product: None,
            location: None,
        }];
        assert_eq!(detect_board_id_from_ports(&ports), Some(140));
    }

    #[test]
    fn detect_board_id_cubeblack_vid_pid() {
        let ports = vec![PortInfo {
            port_name: "/dev/ttyACM0".into(),
            vid: Some(0x2DAE),
            pid: Some(0x1011),
            serial_number: None,
            manufacturer: None,
            product: None,
            location: None,
        }];
        assert_eq!(detect_board_id_from_ports(&ports), Some(9));
    }

    #[test]
    fn detect_board_id_unknown_vid_pid_returns_none() {
        let ports = vec![PortInfo {
            port_name: "/dev/ttyUSB0".into(),
            vid: Some(0x1234),
            pid: Some(0x5678),
            serial_number: None,
            manufacturer: None,
            product: None,
            location: None,
        }];
        assert_eq!(detect_board_id_from_ports(&ports), None);
    }

    #[test]
    fn detect_board_id_no_usb_ports_returns_none() {
        let ports = vec![PortInfo {
            port_name: "/dev/ttyS0".into(),
            vid: None,
            pid: None,
            serial_number: None,
            manufacturer: None,
            product: None,
            location: None,
        }];
        assert_eq!(detect_board_id_from_ports(&ports), None);
    }

    #[test]
    fn detect_board_id_empty_ports_returns_none() {
        assert_eq!(detect_board_id_from_ports(&[]), None);
    }

    #[test]
    fn detect_board_id_first_known_port_wins() {
        let ports = vec![
            PortInfo {
                port_name: "/dev/ttyACM0".into(),
                vid: Some(0x2DAE),
                pid: Some(0x1058),
                serial_number: None,
                manufacturer: None,
                product: None,
                location: None,
            },
            PortInfo {
                port_name: "/dev/ttyACM1".into(),
                vid: Some(0x27AC),
                pid: Some(0x1154),
                serial_number: None,
                manufacturer: None,
                product: None,
                location: None,
            },
        ];
        assert_eq!(detect_board_id_from_ports(&ports), Some(140));
    }

    // ── Catalog tests ──

    use super::cache::ManifestCache;
    use super::catalog::*;

    fn make_manifest_json(entries: &[serde_json::Value]) -> Vec<u8> {
        serde_json::to_vec(&serde_json::json!({ "firmware": entries })).unwrap()
    }

    fn make_manifest_gz(entries: &[serde_json::Value]) -> Vec<u8> {
        use flate2::write::GzEncoder;
        use flate2::Compression;
        use std::io::Write;

        let json = make_manifest_json(entries);
        let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
        encoder.write_all(&json).unwrap();
        encoder.finish().unwrap()
    }

    fn sample_entry(
        board_id: u32,
        format: &str,
        version: &str,
        platform: &str,
    ) -> serde_json::Value {
        serde_json::json!({
            "board_id": board_id,
            "mav-type": "Copter",
            "mav-firmware-version": version,
            "mav-firmware-version-type": "OFFICIAL",
            "format": format,
            "platform": platform,
            "url": format!("https://firmware.ardupilot.org/{platform}/{version}/firmware.apj"),
            "image_size": 1_500_000,
            "latest": 1,
            "git-sha": "abc123",
            "brand_name": "TestBoard"
        })
    }

    #[test]
    fn catalog_parse_manifest_entries() {
        let entries = vec![
            sample_entry(140, "apj", "4.5.0", "fmuv3"),
            sample_entry(140, "apj", "4.4.0", "fmuv3"),
            sample_entry(9, "apj", "4.5.0", "fmuv2"),
        ];
        let gz = make_manifest_gz(&entries);
        let parsed = parse_manifest_gz(&gz).unwrap();
        assert_eq!(parsed.len(), 3);
        assert_eq!(parsed[0].board_id, 140);
        assert_eq!(parsed[0].version, "4.5.0");
        assert_eq!(parsed[0].platform, "fmuv3");
        assert!(parsed[0].latest);
    }

    #[test]
    fn catalog_filters_non_apj_formats() {
        let entries = vec![
            sample_entry(140, "apj", "4.5.0", "fmuv3"),
            serde_json::json!({
                "board_id": 140,
                "format": "px4",
                "platform": "fmuv3",
                "url": "https://example.com/fw.px4"
            }),
            serde_json::json!({
                "board_id": 140,
                "format": "ELF",
                "platform": "SITL",
                "url": "https://example.com/fw"
            }),
        ];
        let gz = make_manifest_gz(&entries);
        let parsed = parse_manifest_gz(&gz).unwrap();
        assert_eq!(parsed.len(), 1, "only apj entries should be included");
        assert_eq!(parsed[0].format, "apj");
    }

    #[test]
    fn catalog_filter_by_board_id() {
        let entries = vec![
            sample_entry(140, "apj", "4.5.0", "fmuv3"),
            sample_entry(9, "apj", "4.5.0", "fmuv2"),
            sample_entry(140, "apj", "4.4.0", "fmuv3"),
        ];
        let gz = make_manifest_gz(&entries);
        let all = parse_manifest_gz(&gz).unwrap();
        let filtered = filter_by_board(&all, 140);
        assert_eq!(filtered.len(), 2);
        assert!(filtered.iter().all(|e| e.board_id == 140));
    }

    #[test]
    fn catalog_filter_by_board_id_no_match() {
        let entries = vec![sample_entry(140, "apj", "4.5.0", "fmuv3")];
        let gz = make_manifest_gz(&entries);
        let all = parse_manifest_gz(&gz).unwrap();
        let filtered = filter_by_board(&all, 999);
        assert!(filtered.is_empty());
    }

    #[test]
    fn catalog_rejects_dfu_usage() {
        let err = reject_catalog_for_dfu();
        match err {
            FirmwareError::CatalogUnavailable { reason } => {
                assert!(reason.contains("DFU recovery"), "got: {reason}");
                assert!(reason.contains(".bin"), "should guide to .bin: {reason}");
            }
            other => panic!("expected CatalogUnavailable, got: {other:?}"),
        }
    }

    #[test]
    fn catalog_corrupt_gz_returns_error() {
        let result = parse_manifest_gz(b"not gzip data at all");
        assert!(result.is_err());
        match result.unwrap_err() {
            FirmwareError::CatalogUnavailable { reason } => {
                assert!(
                    reason.contains("gzip") || reason.contains("decompression"),
                    "got: {reason}"
                );
            }
            other => panic!("expected CatalogUnavailable, got: {other:?}"),
        }
    }

    #[test]
    fn catalog_corrupt_json_inside_gz_returns_error() {
        use flate2::write::GzEncoder;
        use flate2::Compression;
        use std::io::Write;

        let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
        encoder.write_all(b"{{not valid json}}").unwrap();
        let gz = encoder.finish().unwrap();

        let result = parse_manifest_gz(&gz);
        assert!(result.is_err());
        match result.unwrap_err() {
            FirmwareError::CatalogUnavailable { reason } => {
                assert!(reason.contains("JSON"), "got: {reason}");
            }
            other => panic!("expected CatalogUnavailable, got: {other:?}"),
        }
    }

    #[test]
    fn catalog_entry_serializes() {
        let entry = CatalogEntry {
            board_id: 140,
            platform: "fmuv3".into(),
            vehicle_type: "Copter".into(),
            version: "4.5.0".into(),
            version_type: "OFFICIAL".into(),
            format: "apj".into(),
            url: "https://firmware.ardupilot.org/fmuv3/4.5.0/firmware.apj".into(),
            image_size: 1_500_000,
            latest: true,
            git_sha: "abc123".into(),
            brand_name: Some("CubeBlack".into()),
        };
        let json = serde_json::to_string(&entry).unwrap();
        assert!(json.contains("fmuv3"), "got: {json}");
        assert!(json.contains("4.5.0"), "got: {json}");
        assert!(json.contains("CubeBlack"), "got: {json}");
    }

    #[test]
    fn catalog_skips_entries_missing_board_id() {
        let entries = vec![
            sample_entry(140, "apj", "4.5.0", "fmuv3"),
            serde_json::json!({
                "format": "apj",
                "platform": "unknown",
                "url": "https://example.com/fw.apj"
            }),
        ];
        let json = make_manifest_json(&entries);
        let parsed = parse_manifest_json(&json).unwrap();
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].board_id, 140);
    }

    #[test]
    fn catalog_cache_fresh_returns_data() {
        let dir =
            std::env::temp_dir().join(format!("ironwing_test_cache_fresh_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);

        let cache = ManifestCache::new(dir.clone(), std::time::Duration::from_secs(3600));
        let test_data = make_manifest_gz(&[sample_entry(140, "apj", "4.5.0", "fmuv3")]);

        cache.store(&test_data).unwrap();
        let cached = cache.get_if_fresh();
        assert!(cached.is_some(), "fresh cache should return data");
        assert_eq!(cached.unwrap(), test_data);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn catalog_cache_expired_returns_none() {
        let dir = std::env::temp_dir().join(format!(
            "ironwing_test_cache_expired_{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);

        let cache = ManifestCache::new(dir.clone(), std::time::Duration::from_secs(0));
        let test_data = b"old data";
        cache.store(test_data).unwrap();

        std::thread::sleep(std::time::Duration::from_millis(50));

        let cached = cache.get_if_fresh();
        assert!(cached.is_none(), "expired cache should return None");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn catalog_cache_corrupt_returns_none() {
        let dir = std::env::temp_dir().join(format!(
            "ironwing_test_cache_corrupt_{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        std::fs::write(dir.join("manifest.timestamp"), "not_a_number").unwrap();
        std::fs::write(dir.join("manifest.json.gz"), b"corrupt").unwrap();

        let cache = ManifestCache::new(dir.clone(), std::time::Duration::from_secs(3600));
        let cached = cache.get_if_fresh();
        assert!(cached.is_none(), "corrupt timestamp should return None");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn catalog_cache_missing_returns_none() {
        let dir = std::env::temp_dir().join(format!(
            "ironwing_test_cache_missing_{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);

        let cache = ManifestCache::new(dir, std::time::Duration::from_secs(3600));
        assert!(cache.get_if_fresh().is_none());
    }

    // ── Catalog client tests ──

    #[test]
    fn catalog_client_fetches_on_cache_miss() {
        let dir =
            std::env::temp_dir().join(format!("ironwing_test_client_miss_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);

        let client = CatalogClient::with_max_age(dir.clone(), std::time::Duration::from_secs(3600));
        let gz = make_manifest_gz(&[
            sample_entry(140, "apj", "4.5.0", "fmuv3"),
            sample_entry(9, "apj", "4.5.0", "fmuv2"),
        ]);
        let gz_clone = gz.clone();

        let mut fetch_called = false;
        let results = client
            .get_entries_for_board(140, || {
                fetch_called = true;
                Ok(gz_clone.clone())
            })
            .unwrap();

        assert!(fetch_called, "fetcher should be called on cache miss");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].board_id, 140);
        assert_eq!(results[0].version, "4.5.0");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn catalog_client_uses_fresh_cache() {
        let dir =
            std::env::temp_dir().join(format!("ironwing_test_client_hit_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);

        let client = CatalogClient::with_max_age(dir.clone(), std::time::Duration::from_secs(3600));
        let gz = make_manifest_gz(&[sample_entry(140, "apj", "4.5.0", "fmuv3")]);

        // Prime cache via a first call
        let gz_for_prime = gz.clone();
        client
            .get_entries_for_board(140, || Ok(gz_for_prime))
            .unwrap();

        // Second call should NOT invoke fetcher
        let results = client
            .get_entries_for_board(140, || {
                panic!("fetcher should not be called when cache is fresh")
            })
            .unwrap();

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].board_id, 140);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn catalog_client_refetches_on_expired_cache() {
        let dir = std::env::temp_dir().join(format!(
            "ironwing_test_client_expired_{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);

        let client = CatalogClient::with_max_age(dir.clone(), std::time::Duration::from_secs(0));
        let old_gz = make_manifest_gz(&[sample_entry(140, "apj", "4.4.0", "fmuv3")]);
        let new_gz = make_manifest_gz(&[sample_entry(140, "apj", "4.5.0", "fmuv3")]);

        // Prime with old data
        let old_gz_clone = old_gz.clone();
        client
            .get_entries_for_board(140, || Ok(old_gz_clone))
            .unwrap();

        std::thread::sleep(std::time::Duration::from_millis(50));

        // Should refetch since TTL=0
        let new_gz_clone = new_gz.clone();
        let results = client
            .get_entries_for_board(140, || Ok(new_gz_clone))
            .unwrap();

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].version, "4.5.0", "should have new version");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn catalog_client_propagates_fetch_error() {
        let dir =
            std::env::temp_dir().join(format!("ironwing_test_client_err_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);

        let client = CatalogClient::with_max_age(dir.clone(), std::time::Duration::from_secs(3600));

        let result = client.get_entries_for_board(140, || {
            Err(FirmwareError::CatalogUnavailable {
                reason: "network unreachable".into(),
            })
        });

        assert!(result.is_err());
        match result.unwrap_err() {
            FirmwareError::CatalogUnavailable { reason } => {
                assert!(reason.contains("network"), "got: {reason}");
            }
            other => panic!("expected CatalogUnavailable, got: {other:?}"),
        }

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn catalog_client_filters_by_board_from_cached_data() {
        let dir = std::env::temp_dir().join(format!(
            "ironwing_test_client_filter_{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);

        let client = CatalogClient::with_max_age(dir.clone(), std::time::Duration::from_secs(3600));
        let gz = make_manifest_gz(&[
            sample_entry(140, "apj", "4.5.0", "fmuv3"),
            sample_entry(9, "apj", "4.5.0", "fmuv2"),
            sample_entry(140, "apj", "4.4.0", "fmuv3"),
        ]);
        let gz_clone = gz.clone();
        client.get_entries_for_board(140, || Ok(gz_clone)).unwrap();

        // Query different board from cache
        let results = client
            .get_entries_for_board(9, || panic!("should use cache"))
            .unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].board_id, 9);
        assert_eq!(results[0].platform, "fmuv2");

        let _ = std::fs::remove_dir_all(&dir);
    }

    // ── Protocol constant sanity tests ──

    #[test]
    fn serial_uploader_constants_match_upstream() {
        assert_eq!(TEST_INSYNC, 0x12);
        assert_eq!(TEST_EOC, 0x20);
        assert_eq!(TEST_OK, 0x10);
        assert_eq!(TEST_FAILED, 0x11);
        assert_eq!(TEST_INVALID, 0x13);
        assert_eq!(TEST_GET_SYNC, 0x21);
        assert_eq!(TEST_CHIP_ERASE, 0x23);
        assert_eq!(TEST_PROG_MULTI, 0x27);
        assert_eq!(TEST_GET_CRC, 0x29);
        assert_eq!(TEST_REBOOT, 0x30);
        assert_eq!(TEST_PROG_MULTI_MAX, 252);
    }

    // ── Serial flow executor tests ──

    use super::serial_executor::*;
    use std::cell::{Cell, RefCell};

    struct MockFlowDeps {
        ports_sequence: RefCell<Vec<Vec<PortInfo>>>,
        port_call_idx: Cell<usize>,
        serial_mock: RefCell<Option<MockSerial>>,
        sleep_calls: RefCell<Vec<u64>>,
        reconnect_results: RefCell<Vec<Result<(), FirmwareError>>>,
        reconnect_call_idx: Cell<usize>,
    }

    impl MockFlowDeps {
        fn new() -> Self {
            Self {
                ports_sequence: RefCell::new(vec![]),
                port_call_idx: Cell::new(0),
                serial_mock: RefCell::new(None),
                sleep_calls: RefCell::new(vec![]),
                reconnect_results: RefCell::new(vec![]),
                reconnect_call_idx: Cell::new(0),
            }
        }

        fn with_ports_sequence(mut self, seq: Vec<Vec<PortInfo>>) -> Self {
            self.ports_sequence = RefCell::new(seq);
            self
        }

        fn with_serial_mock(mut self, mock: MockSerial) -> Self {
            self.serial_mock = RefCell::new(Some(mock));
            self
        }

        fn with_reconnect_results(mut self, results: Vec<Result<(), FirmwareError>>) -> Self {
            self.reconnect_results = RefCell::new(results);
            self
        }
    }

    impl SerialFlowDeps for MockFlowDeps {
        fn list_ports(&self) -> Vec<PortInfo> {
            let idx = self.port_call_idx.get();
            self.port_call_idx.set(idx + 1);
            let seq = self.ports_sequence.borrow();
            if idx < seq.len() {
                seq[idx].clone()
            } else if !seq.is_empty() {
                seq.last().unwrap().clone()
            } else {
                vec![]
            }
        }

        fn open_serial(&self, _port: &str, _baud: u32) -> Result<Box<dyn SerialIo>, FirmwareError> {
            let mock = self.serial_mock.borrow_mut().take().ok_or_else(|| {
                FirmwareError::ProtocolError {
                    detail: "no mock serial configured".into(),
                }
            })?;
            Ok(Box::new(mock))
        }

        fn sleep_ms(&self, ms: u64) {
            self.sleep_calls.borrow_mut().push(ms);
        }

        fn try_reconnect(&self, _port: &str, _baud: u32) -> Result<(), FirmwareError> {
            let idx = self.reconnect_call_idx.get();
            self.reconnect_call_idx.set(idx + 1);
            let results = self.reconnect_results.borrow();
            if idx < results.len() {
                results[idx].clone()
            } else {
                Err(FirmwareError::ProtocolError {
                    detail: "reconnect not configured".into(),
                })
            }
        }
    }

    fn make_bootloader_port() -> PortInfo {
        PortInfo {
            port_name: "/dev/ttyACM0".into(),
            vid: Some(0x2DAE),
            pid: Some(0x1016),
            serial_number: Some("BL123".into()),
            manufacturer: None,
            product: None,
            location: None,
        }
    }

    fn make_normal_port() -> PortInfo {
        PortInfo {
            port_name: "/dev/ttyACM0".into(),
            vid: Some(0x2DAE),
            pid: Some(0x1058),
            serial_number: Some("ABC123".into()),
            manufacturer: None,
            product: None,
            location: None,
        }
    }

    fn make_test_artifact(board_id: u32, image: Vec<u8>) -> SerialArtifact {
        let image_size = image.len();
        SerialArtifact {
            board_id,
            image,
            image_size,
            summary: "test firmware".into(),
        }
    }

    fn make_upload_mock(bl_rev: u32, board_id: u32, flash_size: u32, image: &[u8]) -> MockSerial {
        let mut mock = MockSerial::new();
        mock.queue_sync_ok();
        mock.queue_identify(bl_rev, board_id, 0, flash_size);
        mock.queue_sync_ok(); // erase
                              // program chunks
        let chunk_count = (image.len() + TEST_PROG_MULTI_MAX - 1) / TEST_PROG_MULTI_MAX.max(1);
        for _ in 0..chunk_count.max(1) {
            mock.queue_sync_ok();
        }
        if bl_rev >= 3 {
            let expected_crc = firmware_crc(image, flash_size);
            mock.queue_u32_le(expected_crc);
            mock.queue_sync_ok();
        }
        mock
    }

    #[test]
    fn serial_flow_connected_preflight_verified() {
        let image = vec![0x01, 0x02, 0x03, 0x04];
        let flash_size = 2_097_152;
        let mock = make_upload_mock(5, 140, flash_size, &image);
        let bootloader_port = make_bootloader_port();

        let deps = MockFlowDeps::new()
            .with_ports_sequence(vec![vec![bootloader_port]])
            .with_serial_mock(mock)
            .with_reconnect_results(vec![Ok(())]);

        let preflight = PreflightSnapshot {
            port: "/dev/ttyACM0".into(),
            baud: 57600,
            ports_before: vec![make_normal_port()],
        };
        let artifact = make_test_artifact(140, image);

        let result = execute_serial_flash(&deps, &preflight, &artifact, |_, _| {});

        match &result {
            SerialFlowResult::ReconnectVerified {
                board_id,
                bootloader_rev,
                flash_verified,
            } => {
                assert_eq!(*board_id, 140);
                assert_eq!(*bootloader_rev, 5);
                assert!(*flash_verified);
            }
            other => panic!("expected ReconnectVerified, got: {other:?}"),
        }

        let outcome = result.to_outcome();
        match outcome {
            SerialFlashOutcome::Verified => {}
            other => panic!("expected Verified outcome, got: {other:?}"),
        }
    }

    #[test]
    fn serial_flow_connected_preflight_bl_rev2_unverified() {
        let image = vec![0x01, 0x02, 0x03, 0x04];
        let flash_size = 1_048_576;
        let mock = make_upload_mock(2, 9, flash_size, &image);
        let bootloader_port = make_bootloader_port();

        let deps = MockFlowDeps::new()
            .with_ports_sequence(vec![vec![bootloader_port]])
            .with_serial_mock(mock)
            .with_reconnect_results(vec![Ok(())]);

        let preflight = PreflightSnapshot {
            port: "/dev/ttyACM0".into(),
            baud: 57600,
            ports_before: vec![make_normal_port()],
        };
        let artifact = make_test_artifact(9, image);

        let result = execute_serial_flash(&deps, &preflight, &artifact, |_, _| {});

        match &result {
            SerialFlowResult::ReconnectVerified { flash_verified, .. } => {
                assert!(!flash_verified, "BL_REV 2 should not be flash_verified");
            }
            other => panic!("expected ReconnectVerified, got: {other:?}"),
        }

        let outcome = result.to_outcome();
        match outcome {
            SerialFlashOutcome::FlashedButUnverified => {}
            other => panic!("expected FlashedButUnverified, got: {other:?}"),
        }
    }

    #[test]
    fn serial_flow_board_detection_fails() {
        let deps = MockFlowDeps::new().with_ports_sequence(vec![vec![]]); // empty port list on every poll

        let preflight = PreflightSnapshot {
            port: "/dev/ttyACM0".into(),
            baud: 57600,
            ports_before: vec![make_normal_port()],
        };
        let artifact = make_test_artifact(140, vec![0x01]);

        let result = execute_serial_flash(&deps, &preflight, &artifact, |_, _| {});

        match &result {
            SerialFlowResult::BoardDetectionFailed { reason } => {
                assert!(
                    reason.contains("not found") || reason.contains("port"),
                    "got: {reason}"
                );
            }
            other => panic!("expected BoardDetectionFailed, got: {other:?}"),
        }
    }

    #[test]
    fn serial_flow_reconnect_fails_but_flash_verified() {
        let image = vec![0x01, 0x02, 0x03, 0x04];
        let flash_size = 2_097_152;
        let mock = make_upload_mock(5, 140, flash_size, &image);
        let bootloader_port = make_bootloader_port();

        // All reconnect attempts fail
        let reconnect_failures: Vec<Result<(), FirmwareError>> = (0..10)
            .map(|_| {
                Err(FirmwareError::ProtocolError {
                    detail: "timeout".into(),
                })
            })
            .collect();

        let deps = MockFlowDeps::new()
            .with_ports_sequence(vec![vec![bootloader_port]])
            .with_serial_mock(mock)
            .with_reconnect_results(reconnect_failures);

        let preflight = PreflightSnapshot {
            port: "/dev/ttyACM0".into(),
            baud: 57600,
            ports_before: vec![make_normal_port()],
        };
        let artifact = make_test_artifact(140, image);

        let result = execute_serial_flash(&deps, &preflight, &artifact, |_, _| {});

        match &result {
            SerialFlowResult::Verified {
                board_id,
                bootloader_rev,
                ..
            } => {
                assert_eq!(*board_id, 140);
                assert_eq!(*bootloader_rev, 5);
            }
            other => panic!("expected Verified (flash verified, reconnect failed), got: {other:?}"),
        }
    }

    #[test]
    fn serial_flow_reconnect_fails_bl_rev2_unverified() {
        let image = vec![0x01, 0x02, 0x03, 0x04];
        let flash_size = 1_048_576;
        let mock = make_upload_mock(2, 9, flash_size, &image);
        let bootloader_port = make_bootloader_port();

        let reconnect_failures: Vec<Result<(), FirmwareError>> = (0..10)
            .map(|_| {
                Err(FirmwareError::ProtocolError {
                    detail: "timeout".into(),
                })
            })
            .collect();

        let deps = MockFlowDeps::new()
            .with_ports_sequence(vec![vec![bootloader_port]])
            .with_serial_mock(mock)
            .with_reconnect_results(reconnect_failures);

        let preflight = PreflightSnapshot {
            port: "/dev/ttyACM0".into(),
            baud: 57600,
            ports_before: vec![make_normal_port()],
        };
        let artifact = make_test_artifact(9, image);

        let result = execute_serial_flash(&deps, &preflight, &artifact, |_, _| {});

        match &result {
            SerialFlowResult::FlashedButUnverified {
                board_id,
                bootloader_rev,
                ..
            } => {
                assert_eq!(*board_id, 9);
                assert_eq!(*bootloader_rev, 2);
            }
            other => panic!("expected FlashedButUnverified, got: {other:?}"),
        }
    }

    #[test]
    fn serial_flow_never_auto_enters_dfu() {
        // Simulate: board detection fails (no bootloader port appears).
        // The serial flow must return a typed failure, NOT invoke DFU.
        let deps = MockFlowDeps::new().with_ports_sequence(vec![vec![]]); // no ports ever appear

        let preflight = PreflightSnapshot {
            port: "/dev/ttyACM0".into(),
            baud: 57600,
            ports_before: vec![make_normal_port()],
        };
        let artifact = make_test_artifact(140, vec![0xFF; 8]);

        let result = execute_serial_flash(&deps, &preflight, &artifact, |_, _| {});

        // Must be a typed serial failure, never DFU
        match &result {
            SerialFlowResult::BoardDetectionFailed { .. } | SerialFlowResult::Failed { .. } => {
                // Correct: serial flow failed without entering DFU
            }
            SerialFlowResult::ReconnectVerified { .. }
            | SerialFlowResult::ReconnectFailed { .. }
            | SerialFlowResult::Verified { .. }
            | SerialFlowResult::FlashedButUnverified { .. } => {
                panic!("should not succeed when board detection fails");
            }
        }

        // Verify the result maps to a recovery-needed outcome, not a DFU outcome
        let outcome = result.to_outcome();
        match outcome {
            SerialFlashOutcome::RecoveryNeeded { .. } => {}
            other => panic!("expected RecoveryNeeded outcome (no DFU fallback), got: {other:?}"),
        }
    }

    #[test]
    fn serial_flow_source_selection_local_artifact() {
        let image = vec![0xDE, 0xAD, 0xBE, 0xEF];
        let flash_size = 2_097_152;
        let mock = make_upload_mock(4, 140, flash_size, &image);
        let bootloader_port = make_bootloader_port();

        let deps = MockFlowDeps::new()
            .with_ports_sequence(vec![vec![bootloader_port]])
            .with_serial_mock(mock)
            .with_reconnect_results(vec![Ok(())]);

        let preflight = PreflightSnapshot {
            port: "/dev/ttyACM0".into(),
            baud: 57600,
            ports_before: vec![make_normal_port()],
        };

        // Source selection: local artifact (already parsed)
        let artifact = make_test_artifact(140, image);

        let result = execute_serial_flash(&deps, &preflight, &artifact, |_, _| {});

        match &result {
            SerialFlowResult::ReconnectVerified {
                board_id,
                flash_verified,
                ..
            } => {
                assert_eq!(*board_id, 140);
                assert!(*flash_verified);
            }
            other => panic!("expected ReconnectVerified, got: {other:?}"),
        }
    }

    #[test]
    fn serial_flow_protocol_error_returns_failed() {
        let mut mock = MockSerial::new();
        // sync succeeds but identify fails
        mock.queue_sync_ok();
        mock.queue_u32_le(1); // unsupported BL rev
        mock.queue_sync_ok();
        let bootloader_port = make_bootloader_port();

        let deps = MockFlowDeps::new()
            .with_ports_sequence(vec![vec![bootloader_port]])
            .with_serial_mock(mock);

        let preflight = PreflightSnapshot {
            port: "/dev/ttyACM0".into(),
            baud: 57600,
            ports_before: vec![make_normal_port()],
        };
        let artifact = make_test_artifact(140, vec![0x01]);

        let result = execute_serial_flash(&deps, &preflight, &artifact, |_, _| {});

        match &result {
            SerialFlowResult::Failed { reason } => {
                assert!(
                    reason.contains("unsupported") || reason.contains("protocol"),
                    "got: {reason}"
                );
            }
            other => panic!("expected Failed, got: {other:?}"),
        }
    }

    #[test]
    fn serial_flow_progress_callback_fires() {
        let image = vec![0x01, 0x02, 0x03, 0x04];
        let flash_size = 2_097_152;
        let mock = make_upload_mock(5, 140, flash_size, &image);
        let bootloader_port = make_bootloader_port();

        let deps = MockFlowDeps::new()
            .with_ports_sequence(vec![vec![bootloader_port]])
            .with_serial_mock(mock)
            .with_reconnect_results(vec![Ok(())]);

        let preflight = PreflightSnapshot {
            port: "/dev/ttyACM0".into(),
            baud: 57600,
            ports_before: vec![make_normal_port()],
        };
        let artifact = make_test_artifact(140, image);

        let mut progress_calls = Vec::new();
        execute_serial_flash(&deps, &preflight, &artifact, |w, t| {
            progress_calls.push((w, t));
        });

        assert!(!progress_calls.is_empty(), "progress should be called");
        let last = progress_calls.last().unwrap();
        assert_eq!(last.0, last.1, "final call should have written == total");
    }

    #[test]
    fn serial_flow_build_board_identity() {
        let info = BootloaderInfo {
            bl_rev: 5,
            board_id: 140,
            board_rev: 0,
            flash_size: 2_097_152,
        };
        let identity = build_board_identity(&info, "/dev/ttyACM0");
        assert_eq!(identity.board_id, 140);
        assert_eq!(identity.bootloader_rev, 5);
        assert_eq!(identity.flash_size, 2_097_152);
        assert_eq!(identity.port, "/dev/ttyACM0");
    }

    #[test]
    fn serial_flow_result_serializes() {
        let verified = SerialFlowResult::Verified {
            board_id: 140,
            bootloader_rev: 5,
            port: "/dev/ttyACM0".into(),
        };
        let j1 = serde_json::to_string(&verified).unwrap();
        assert!(j1.contains("verified"), "got: {j1}");
        assert!(j1.contains("140"), "got: {j1}");

        let unverified = SerialFlowResult::FlashedButUnverified {
            board_id: 9,
            bootloader_rev: 2,
            port: "/dev/ttyACM0".into(),
        };
        let j2 = serde_json::to_string(&unverified).unwrap();
        assert!(j2.contains("flashed_but_unverified"), "got: {j2}");

        let reconnect = SerialFlowResult::ReconnectVerified {
            board_id: 140,
            bootloader_rev: 5,
            flash_verified: true,
        };
        let j3 = serde_json::to_string(&reconnect).unwrap();
        assert!(j3.contains("reconnect_verified"), "got: {j3}");

        let failed = SerialFlowResult::Failed {
            reason: "port gone".into(),
        };
        let j4 = serde_json::to_string(&failed).unwrap();
        assert!(j4.contains("failed"), "got: {j4}");

        let board_fail = SerialFlowResult::BoardDetectionFailed {
            reason: "no port".into(),
        };
        let j5 = serde_json::to_string(&board_fail).unwrap();
        assert!(j5.contains("board_detection_failed"), "got: {j5}");
    }

    // ── Serial flow integration tests (session + executor pipeline) ──

    #[test]
    fn serial_flow_session_exclusivity_blocks_concurrent() {
        let session = FirmwareSessionHandle::new();
        session.try_start_serial().unwrap();

        let result = session.try_start_serial();
        assert!(result.is_err());
        match result.unwrap_err() {
            FirmwareError::SessionBusy { current_session } => {
                assert_eq!(current_session, "serial_primary");
            }
            other => panic!("expected SessionBusy, got: {other:?}"),
        }

        session.stop();
        session.try_start_serial().unwrap();
    }

    #[test]
    fn serial_flow_dfu_session_rejects_when_vehicle_connected() {
        let session = FirmwareSessionHandle::new();
        let err = session.try_start_dfu(true).unwrap_err();
        match err {
            FirmwareError::VehicleConnected => {}
            other => panic!("expected VehicleConnected, got: {other:?}"),
        }
    }

    #[test]
    fn serial_flow_integrated_preflight_to_outcome() {
        let image = vec![0x01, 0x02, 0x03, 0x04];
        let flash_size = 2_097_152;
        let mock = make_upload_mock(5, 140, flash_size, &image);
        let bootloader_port = make_bootloader_port();

        let session = FirmwareSessionHandle::new();
        session.try_start_serial().unwrap();

        let deps = MockFlowDeps::new()
            .with_ports_sequence(vec![vec![bootloader_port]])
            .with_serial_mock(mock)
            .with_reconnect_results(vec![Ok(())]);

        let preflight = PreflightSnapshot {
            port: "/dev/ttyACM0".into(),
            baud: 57600,
            ports_before: vec![make_normal_port()],
        };
        let artifact = make_test_artifact(140, image);

        let result = execute_serial_flash(&deps, &preflight, &artifact, |_, _| {});

        let outcome = result.to_outcome();
        let session_outcome = FirmwareOutcome::SerialPrimary { outcome };
        let completed = FirmwareSessionStatus::Completed {
            outcome: session_outcome,
        };
        let json = serde_json::to_string(&completed).unwrap();
        assert!(json.contains("completed"), "got: {json}");
        assert!(json.contains("serial_primary"), "got: {json}");
        assert!(json.contains("verified"), "got: {json}");

        session.stop();
        let status = session.status();
        assert!(matches!(status, FirmwareSessionStatus::Idle));
    }

    #[test]
    fn serial_flow_integrated_failure_cleans_session() {
        let session = FirmwareSessionHandle::new();
        session.try_start_serial().unwrap();

        let deps = MockFlowDeps::new()
            .with_ports_sequence(vec![vec![]]);

        let preflight = PreflightSnapshot {
            port: "/dev/ttyACM0".into(),
            baud: 57600,
            ports_before: vec![make_normal_port()],
        };
        let artifact = make_test_artifact(140, vec![0x01]);

        let result = execute_serial_flash(&deps, &preflight, &artifact, |_, _| {});
        assert!(matches!(result, SerialFlowResult::BoardDetectionFailed { .. }));

        session.stop();
        session.try_start_serial().unwrap();
        session.stop();
    }

    #[test]
    fn serial_flow_integrated_never_produces_dfu_outcome() {
        let session = FirmwareSessionHandle::new();
        session.try_start_serial().unwrap();

        let deps = MockFlowDeps::new()
            .with_ports_sequence(vec![vec![]]);

        let preflight = PreflightSnapshot {
            port: "/dev/ttyACM0".into(),
            baud: 57600,
            ports_before: vec![make_normal_port()],
        };
        let artifact = make_test_artifact(140, vec![0xFF; 4]);

        let result = execute_serial_flash(&deps, &preflight, &artifact, |_, _| {});
        let outcome = result.to_outcome();
        let wrapped = FirmwareOutcome::SerialPrimary { outcome };
        let json = serde_json::to_string(&wrapped).unwrap();
        assert!(json.contains("serial_primary"), "got: {json}");
        assert!(!json.contains("dfu"), "must not contain dfu: {json}");

        session.stop();
    }

    // ── Serial preflight info tests ──

    use super::types::SerialPreflightInfo;

    #[test]
    fn serial_flow_preflight_info_serializes_idle_no_vehicle() {
        let info = SerialPreflightInfo {
            vehicle_connected: false,
            param_count: 0,
            has_params_to_backup: false,
            available_ports: vec![],
            detected_board_id: None,
            session_ready: true,
            session_status: FirmwareSessionStatus::Idle,
        };
        let json = serde_json::to_string(&info).unwrap();
        assert!(json.contains("\"vehicle_connected\":false"), "got: {json}");
        assert!(json.contains("\"param_count\":0"), "got: {json}");
        assert!(
            json.contains("\"has_params_to_backup\":false"),
            "got: {json}"
        );
        assert!(json.contains("\"session_ready\":true"), "got: {json}");
        assert!(json.contains("idle"), "got: {json}");
    }

    #[test]
    fn serial_flow_preflight_info_serializes_connected_with_params() {
        let info = SerialPreflightInfo {
            vehicle_connected: true,
            param_count: 842,
            has_params_to_backup: true,
            available_ports: vec![PortInfo {
                port_name: "/dev/ttyACM0".into(),
                vid: Some(0x2DAE),
                pid: Some(0x1058),
                serial_number: None,
                manufacturer: None,
                product: None,
                location: None,
            }],
            detected_board_id: Some(140),
            session_ready: true,
            session_status: FirmwareSessionStatus::Idle,
        };
        let json = serde_json::to_string(&info).unwrap();
        assert!(json.contains("\"vehicle_connected\":true"), "got: {json}");
        assert!(json.contains("\"param_count\":842"), "got: {json}");
        assert!(
            json.contains("\"has_params_to_backup\":true"),
            "got: {json}"
        );
        assert!(json.contains("/dev/ttyACM0"), "got: {json}");
    }

    #[test]
    fn serial_flow_preflight_info_session_busy() {
        let info = SerialPreflightInfo {
            vehicle_connected: false,
            param_count: 0,
            has_params_to_backup: false,
            available_ports: vec![],
            detected_board_id: None,
            session_ready: false,
            session_status: FirmwareSessionStatus::SerialPrimary {
                phase: SerialFlashPhase::Idle,
            },
        };
        let json = serde_json::to_string(&info).unwrap();
        assert!(json.contains("\"session_ready\":false"), "got: {json}");
        assert!(json.contains("serial_primary"), "got: {json}");
    }

    #[test]
    fn serial_flow_preflight_has_params_mirrors_count() {
        let with_params = SerialPreflightInfo {
            vehicle_connected: true,
            param_count: 1,
            has_params_to_backup: true,
            available_ports: vec![],
            detected_board_id: None,
            session_ready: true,
            session_status: FirmwareSessionStatus::Idle,
        };
        assert!(with_params.has_params_to_backup);
        assert_eq!(with_params.param_count, 1);

        let without_params = SerialPreflightInfo {
            vehicle_connected: true,
            param_count: 0,
            has_params_to_backup: false,
            available_ports: vec![],
            detected_board_id: None,
            session_ready: true,
            session_status: FirmwareSessionStatus::Idle,
        };
        assert!(!without_params.has_params_to_backup);
        assert_eq!(without_params.param_count, 0);
    }

    // ── SerialFlashSource deserialization tests ──

    use super::types::SerialFlashSource;

    #[test]
    fn serial_flash_source_deserializes_catalog_url() {
        let json = r#"{"kind":"catalog_url","url":"https://firmware.ardupilot.org/fw.apj"}"#;
        let source: SerialFlashSource = serde_json::from_str(json).unwrap();
        match source {
            SerialFlashSource::CatalogUrl { url } => {
                assert_eq!(url, "https://firmware.ardupilot.org/fw.apj");
            }
            other => panic!("expected CatalogUrl, got: {other:?}"),
        }
    }

    #[test]
    fn serial_flash_source_deserializes_local_apj_bytes() {
        let json = r#"{"kind":"local_apj_bytes","data":[222,173,190,239]}"#;
        let source: SerialFlashSource = serde_json::from_str(json).unwrap();
        match source {
            SerialFlashSource::LocalApjBytes { data } => {
                assert_eq!(data, vec![0xDE, 0xAD, 0xBE, 0xEF]);
            }
            other => panic!("expected LocalApjBytes, got: {other:?}"),
        }
    }

    #[test]
    fn serial_flash_source_rejects_unknown_kind() {
        let json = r#"{"kind":"unknown_source","path":"/tmp/fw.apj"}"#;
        let result: Result<SerialFlashSource, _> = serde_json::from_str(json);
        assert!(result.is_err(), "unknown kind should fail deserialization");
    }

    // ── Session cancel / abort wiring tests ──

    #[test]
    fn serial_flow_session_stop_returns_to_idle() {
        let session = FirmwareSessionHandle::new();
        session.try_start_serial().unwrap();
        assert!(matches!(
            session.status(),
            FirmwareSessionStatus::SerialPrimary { .. }
        ));
        session.stop();
        assert!(matches!(session.status(), FirmwareSessionStatus::Idle));
    }

    #[test]
    fn serial_flow_abort_handle_is_functional() {
        let handle = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        handle.block_on(async {
            let task = tokio::spawn(async {
                tokio::time::sleep(std::time::Duration::from_secs(60)).await;
                42
            });
            let abort = task.abort_handle();
            abort.abort();
            let result = task.await;
            assert!(result.is_err(), "aborted task should return Err");
            assert!(result.unwrap_err().is_cancelled(), "should be cancelled");
        });
    }

    // ── DFU recovery tests ──

    use super::dfu_recovery::*;

    /// Mock USB access for DFU recovery testing.
    struct MockDfuUsb {
        open_result: Result<(), FirmwareError>,
        download_result: Result<(), FirmwareError>,
        detach_result: Result<(), FirmwareError>,
    }

    impl MockDfuUsb {
        fn success() -> Self {
            Self {
                open_result: Ok(()),
                download_result: Ok(()),
                detach_result: Ok(()),
            }
        }

        fn with_open_error(mut self, err: FirmwareError) -> Self {
            self.open_result = Err(err);
            self
        }

        fn with_download_error(mut self, err: FirmwareError) -> Self {
            self.download_result = Err(err);
            self
        }

        fn with_detach_error(mut self, err: FirmwareError) -> Self {
            self.detach_result = Err(err);
            self
        }
    }

    impl DfuUsbAccess for MockDfuUsb {
        fn open_device(&self, _device: &DfuDeviceInfo) -> Result<(), FirmwareError> {
            self.open_result.clone()
        }

        fn download(
            &self,
            data: &[u8],
            progress: &mut dyn FnMut(usize, usize),
        ) -> Result<(), FirmwareError> {
            // Simulate progress
            let total = data.len();
            progress(total, total);
            self.download_result.clone()
        }

        fn detach_and_reset(&self) -> Result<(), FirmwareError> {
            self.detach_result.clone()
        }
    }

    fn stm32_dfu_device() -> DfuDeviceInfo {
        DfuDeviceInfo {
            vid: 0x0483,
            pid: 0xdf11,
            serial_number: Some("STM32_BL".into()),
            manufacturer: Some("STMicroelectronics".into()),
            product: Some("STM32 BOOTLOADER".into()),
        }
    }

    fn non_stm32_device() -> DfuDeviceInfo {
        DfuDeviceInfo {
            vid: 0x2DAE,
            pid: 0x1058,
            serial_number: None,
            manufacturer: Some("SomeVendor".into()),
            product: Some("RandomDevice".into()),
        }
    }

    // ── DFU recovery happy path ──

    #[test]
    fn dfu_recovery_happy_path_verified() {
        let usb = MockDfuUsb::success();
        let device = stm32_dfu_device();
        let bin_data = vec![0x00, 0x20, 0x00, 0x08, 0x01, 0x02, 0x03, 0x04];

        let mut progress_calls = Vec::new();
        let result = execute_dfu_recovery(&usb, &device, &bin_data, |w, t| {
            progress_calls.push((w, t));
        });

        match &result {
            DfuRecoveryResult::Verified => {}
            other => panic!("expected Verified, got: {other:?}"),
        }

        assert!(!progress_calls.is_empty(), "progress should fire");
        let outcome = result.to_outcome();
        match outcome {
            DfuRecoveryOutcome::Verified => {}
            other => panic!("expected Verified outcome, got: {other:?}"),
        }
    }

    #[test]
    fn dfu_recovery_outcome_maps_correctly() {
        let verified = DfuRecoveryResult::Verified;
        let failed = DfuRecoveryResult::Failed {
            reason: "usb error".into(),
        };
        let driver = DfuRecoveryResult::DriverGuidance {
            guidance: "install WinUSB".into(),
        };
        let unsupported = DfuRecoveryResult::PlatformUnsupported;

        match verified.to_outcome() {
            DfuRecoveryOutcome::Verified => {}
            other => panic!("expected Verified, got: {other:?}"),
        }
        match failed.to_outcome() {
            DfuRecoveryOutcome::Failed { reason } => {
                assert!(reason.contains("usb error"), "got: {reason}");
            }
            other => panic!("expected Failed, got: {other:?}"),
        }
        match driver.to_outcome() {
            DfuRecoveryOutcome::UnsupportedRecoveryPath { guidance } => {
                assert!(guidance.contains("WinUSB"), "got: {guidance}");
            }
            other => panic!("expected UnsupportedRecoveryPath, got: {other:?}"),
        }
        match unsupported.to_outcome() {
            DfuRecoveryOutcome::UnsupportedRecoveryPath { guidance } => {
                assert!(guidance.contains("not supported"), "got: {guidance}");
            }
            other => panic!("expected UnsupportedRecoveryPath, got: {other:?}"),
        }
    }

    // ── Non-STM32 device rejection ──

    #[test]
    fn dfu_recovery_rejects_non_stm32_device() {
        let usb = MockDfuUsb::success();
        let device = non_stm32_device();
        let bin_data = vec![0x01, 0x02, 0x03, 0x04];

        let result = execute_dfu_recovery(&usb, &device, &bin_data, |_, _| {});

        match &result {
            DfuRecoveryResult::Failed { reason } => {
                assert!(reason.contains("not an STM32 DFU"), "got: {reason}");
                assert!(reason.contains("0483"), "should mention expected VID: {reason}");
                assert!(reason.contains("df11"), "should mention expected PID: {reason}");
            }
            other => panic!("expected Failed with non-STM32 guidance, got: {other:?}"),
        }
    }

    #[test]
    fn dfu_recovery_validate_stm32_positive() {
        let device = stm32_dfu_device();
        validate_stm32_dfu_device(&device).unwrap();
    }

    #[test]
    fn dfu_recovery_validate_stm32_negative() {
        let device = non_stm32_device();
        let err = validate_stm32_dfu_device(&device).unwrap_err();
        match err {
            FirmwareError::ArtifactInvalid { reason } => {
                assert!(reason.contains("not an STM32 DFU"), "got: {reason}");
            }
            other => panic!("expected ArtifactInvalid, got: {other:?}"),
        }
    }

    // ── .bin only enforcement ──

    #[test]
    fn dfu_recovery_rejects_empty_bin() {
        let usb = MockDfuUsb::success();
        let device = stm32_dfu_device();

        let result = execute_dfu_recovery(&usb, &device, &[], |_, _| {});

        match &result {
            DfuRecoveryResult::Failed { reason } => {
                assert!(reason.contains("empty"), "got: {reason}");
            }
            other => panic!("expected Failed for empty bin, got: {other:?}"),
        }
    }

    // ── Windows driver guidance ──

    #[test]
    fn dfu_recovery_windows_driver_guidance() {
        let usb = MockDfuUsb::success().with_open_error(FirmwareError::UsbAccessDenied {
            guidance: "access denied".into(),
        });
        let device = stm32_dfu_device();
        let bin_data = vec![0x01, 0x02, 0x03, 0x04];

        let result = execute_dfu_recovery(&usb, &device, &bin_data, |_, _| {});

        match &result {
            DfuRecoveryResult::DriverGuidance { guidance } => {
                assert!(guidance.contains("WinUSB"), "got: {guidance}");
                assert!(guidance.contains("Zadig"), "got: {guidance}");
                assert!(guidance.contains("zadig.akeo.ie"), "got: {guidance}");
            }
            other => panic!("expected DriverGuidance, got: {other:?}"),
        }

        // Verify outcome mapping
        let outcome = result.to_outcome();
        match outcome {
            DfuRecoveryOutcome::UnsupportedRecoveryPath { guidance } => {
                assert!(guidance.contains("WinUSB"), "got: {guidance}");
            }
            other => panic!("expected UnsupportedRecoveryPath, got: {other:?}"),
        }
    }

    #[test]
    fn dfu_recovery_driver_guidance_text_is_comprehensive() {
        let text = windows_driver_guidance();
        assert!(text.contains("WinUSB"), "should mention WinUSB: {text}");
        assert!(text.contains("Zadig"), "should mention Zadig: {text}");
        assert!(text.contains("zadig.akeo.ie"), "should link Zadig: {text}");
        assert!(text.contains("Linux"), "should mention Linux: {text}");
        assert!(text.contains("udev"), "should mention udev: {text}");
        assert!(text.contains("macOS"), "should mention macOS: {text}");
    }

    // ── Download / detach failure paths ──

    #[test]
    fn dfu_recovery_download_failure() {
        let usb = MockDfuUsb::success().with_download_error(FirmwareError::ProtocolError {
            detail: "USB pipe error".into(),
        });
        let device = stm32_dfu_device();
        let bin_data = vec![0x01, 0x02, 0x03, 0x04];

        let result = execute_dfu_recovery(&usb, &device, &bin_data, |_, _| {});

        match &result {
            DfuRecoveryResult::Failed { reason } => {
                assert!(reason.contains("DFU download failed"), "got: {reason}");
            }
            other => panic!("expected Failed, got: {other:?}"),
        }
    }

    #[test]
    fn dfu_recovery_detach_failure() {
        let usb = MockDfuUsb::success().with_detach_error(FirmwareError::ProtocolError {
            detail: "device unresponsive".into(),
        });
        let device = stm32_dfu_device();
        let bin_data = vec![0x01, 0x02, 0x03, 0x04];

        let result = execute_dfu_recovery(&usb, &device, &bin_data, |_, _| {});

        match &result {
            DfuRecoveryResult::Failed { reason } => {
                assert!(reason.contains("reset failed"), "got: {reason}");
            }
            other => panic!("expected Failed, got: {other:?}"),
        }
    }

    // ── DFU recovery is separate from serial path ──

    #[test]
    fn dfu_recovery_session_isolation_from_serial() {
        let session = FirmwareSessionHandle::new();

        // Start DFU session
        session.try_start_dfu(false).unwrap();
        let status = session.status();
        match status {
            FirmwareSessionStatus::DfuRecovery { .. } => {}
            other => panic!("expected DfuRecovery, got: {other:?}"),
        }

        // Serial must be blocked
        let err = session.try_start_serial().unwrap_err();
        match err {
            FirmwareError::SessionBusy { current_session } => {
                assert_eq!(current_session, "dfu_recovery");
            }
            other => panic!("expected SessionBusy, got: {other:?}"),
        }

        // After DFU stop, serial can start
        session.stop();
        session.try_start_serial().unwrap();
        session.stop();
    }

    #[test]
    fn dfu_recovery_never_produces_serial_outcome() {
        let usb = MockDfuUsb::success();
        let device = stm32_dfu_device();
        let bin_data = vec![0x01, 0x02, 0x03, 0x04];

        let result = execute_dfu_recovery(&usb, &device, &bin_data, |_, _| {});
        let outcome = result.to_outcome();
        let wrapped = FirmwareOutcome::DfuRecovery { outcome };
        let json = serde_json::to_string(&wrapped).unwrap();
        assert!(json.contains("dfu_recovery"), "got: {json}");
        assert!(!json.contains("serial_primary"), "must not contain serial: {json}");
    }

    // ── DFU recovery integrated with session + artifact validation ──

    #[test]
    fn dfu_recovery_integrated_session_to_outcome() {
        let session = FirmwareSessionHandle::new();
        session.try_start_dfu(false).unwrap();

        let usb = MockDfuUsb::success();
        let device = stm32_dfu_device();
        let bin_data = vec![0x01, 0x02, 0x03, 0x04];

        let result = execute_dfu_recovery(&usb, &device, &bin_data, |_, _| {});
        let outcome = result.to_outcome();
        let session_outcome = FirmwareOutcome::DfuRecovery { outcome };
        let completed = FirmwareSessionStatus::Completed {
            outcome: session_outcome,
        };
        let json = serde_json::to_string(&completed).unwrap();
        assert!(json.contains("completed"), "got: {json}");
        assert!(json.contains("dfu_recovery"), "got: {json}");
        assert!(json.contains("verified"), "got: {json}");

        session.stop();
        assert!(matches!(session.status(), FirmwareSessionStatus::Idle));
    }

    // ── Unsupported platform behavior ──

    #[test]
    fn dfu_recovery_platform_unsupported_outcome() {
        let result = DfuRecoveryResult::PlatformUnsupported;
        let outcome = result.to_outcome();
        match outcome {
            DfuRecoveryOutcome::UnsupportedRecoveryPath { guidance } => {
                assert!(guidance.contains("not supported"), "got: {guidance}");
            }
            other => panic!("expected UnsupportedRecoveryPath, got: {other:?}"),
        }
    }

    // ── End-to-end fixture tests (Task 10) ──

    #[test]
    fn e2e_serial_primary_happy_path() {
        let session = FirmwareSessionHandle::new();
        session.try_start_serial().unwrap();

        let image = vec![0xDE, 0xAD, 0xBE, 0xEF, 0x01, 0x02, 0x03, 0x04];
        let flash_size = 2_097_152;
        let mock = make_upload_mock(5, 140, flash_size, &image);
        let bootloader_port = make_bootloader_port();

        let deps = MockFlowDeps::new()
            .with_ports_sequence(vec![vec![bootloader_port]])
            .with_serial_mock(mock)
            .with_reconnect_results(vec![Ok(())]);

        let preflight = PreflightSnapshot {
            port: "/dev/ttyACM0".into(),
            baud: 57600,
            ports_before: vec![make_normal_port()],
        };
        let artifact = make_test_artifact(140, image);

        let result = execute_serial_flash(&deps, &preflight, &artifact, |_, _| {});
        let outcome = result.to_outcome();
        assert!(
            matches!(outcome, SerialFlashOutcome::Verified),
            "e2e serial happy path must produce Verified, got: {outcome:?}"
        );

        let wrapped = FirmwareOutcome::SerialPrimary { outcome };
        let status = FirmwareSessionStatus::Completed { outcome: wrapped };
        let json = serde_json::to_string(&status).unwrap();
        assert!(json.contains("verified"));
        assert!(json.contains("serial_primary"));
        assert!(!json.contains("dfu"));

        session.stop();
        assert!(matches!(session.status(), FirmwareSessionStatus::Idle));
    }

    #[test]
    fn e2e_serial_failure_recovery_needed() {
        let session = FirmwareSessionHandle::new();
        session.try_start_serial().unwrap();

        let deps = MockFlowDeps::new().with_ports_sequence(vec![vec![]]);

        let preflight = PreflightSnapshot {
            port: "/dev/ttyACM0".into(),
            baud: 57600,
            ports_before: vec![make_normal_port()],
        };
        let artifact = make_test_artifact(140, vec![0xFF; 8]);

        let result = execute_serial_flash(&deps, &preflight, &artifact, |_, _| {});

        match &result {
            SerialFlowResult::BoardDetectionFailed { .. } => {}
            other => panic!("e2e serial failure must be BoardDetectionFailed, got: {other:?}"),
        }

        let outcome = result.to_outcome();
        match &outcome {
            SerialFlashOutcome::RecoveryNeeded { reason } => {
                assert!(
                    !reason.is_empty(),
                    "recovery_needed reason must be non-empty: {reason}"
                );
            }
            other => panic!("e2e serial failure outcome must be RecoveryNeeded, got: {other:?}"),
        }

        let wrapped = FirmwareOutcome::SerialPrimary { outcome };
        let json = serde_json::to_string(&wrapped).unwrap();
        assert!(json.contains("serial_primary"));
        assert!(json.contains("recovery_needed"));
        assert!(!json.contains("dfu"));

        session.stop();
    }

    #[test]
    fn e2e_serial_flashed_but_unverified_stays_distinct() {
        let session = FirmwareSessionHandle::new();
        session.try_start_serial().unwrap();

        let image = vec![0x01, 0x02, 0x03, 0x04];
        let flash_size = 1_048_576;
        let mock = make_upload_mock(2, 9, flash_size, &image);
        let bootloader_port = make_bootloader_port();

        let reconnect_failures: Vec<Result<(), FirmwareError>> = (0..10)
            .map(|_| {
                Err(FirmwareError::ProtocolError {
                    detail: "timeout".into(),
                })
            })
            .collect();

        let deps = MockFlowDeps::new()
            .with_ports_sequence(vec![vec![bootloader_port]])
            .with_serial_mock(mock)
            .with_reconnect_results(reconnect_failures);

        let preflight = PreflightSnapshot {
            port: "/dev/ttyACM0".into(),
            baud: 57600,
            ports_before: vec![make_normal_port()],
        };
        let artifact = make_test_artifact(9, image);

        let result = execute_serial_flash(&deps, &preflight, &artifact, |_, _| {});
        let outcome = result.to_outcome();
        assert!(
            matches!(outcome, SerialFlashOutcome::FlashedButUnverified),
            "BL_REV 2 + reconnect failure must be FlashedButUnverified, got: {outcome:?}"
        );

        let json = serde_json::to_string(&FirmwareOutcome::SerialPrimary { outcome }).unwrap();
        assert!(json.contains("flashed_but_unverified"));
        assert!(!json.contains("\"verified\""));

        session.stop();
    }

    #[test]
    fn e2e_dfu_recovery_happy_path() {
        let session = FirmwareSessionHandle::new();
        session.try_start_dfu(false).unwrap();

        let usb = MockDfuUsb::success();
        let device = stm32_dfu_device();
        let bin_data = vec![0x00, 0x20, 0x00, 0x08, 0x01, 0x02, 0x03, 0x04];

        let mut progress_calls = Vec::new();
        let result = execute_dfu_recovery(&usb, &device, &bin_data, |w, t| {
            progress_calls.push((w, t));
        });

        assert!(
            matches!(result, DfuRecoveryResult::Verified),
            "e2e DFU happy path must produce Verified, got: {result:?}"
        );
        assert!(!progress_calls.is_empty());

        let outcome = result.to_outcome();
        let wrapped = FirmwareOutcome::DfuRecovery { outcome };
        let status = FirmwareSessionStatus::Completed { outcome: wrapped };
        let json = serde_json::to_string(&status).unwrap();
        assert!(json.contains("dfu_recovery"));
        assert!(json.contains("verified"));
        assert!(!json.contains("serial_primary"));

        session.stop();
        assert!(matches!(session.status(), FirmwareSessionStatus::Idle));
    }

    #[test]
    fn e2e_dfu_unsupported_platform_state() {
        let result = DfuRecoveryResult::PlatformUnsupported;
        let outcome = result.to_outcome();

        match &outcome {
            DfuRecoveryOutcome::UnsupportedRecoveryPath { guidance } => {
                assert!(guidance.contains("not supported"), "got: {guidance}");
            }
            other => panic!("platform unsupported must map to UnsupportedRecoveryPath: {other:?}"),
        }

        let wrapped = FirmwareOutcome::DfuRecovery { outcome };
        let json = serde_json::to_string(&wrapped).unwrap();
        assert!(json.contains("unsupported_recovery_path"));
        assert!(json.contains("dfu_recovery"));
    }

    #[test]
    fn e2e_dfu_driver_guidance_state() {
        let usb = MockDfuUsb::success().with_open_error(FirmwareError::UsbAccessDenied {
            guidance: "access denied".into(),
        });
        let device = stm32_dfu_device();
        let bin_data = vec![0x01, 0x02, 0x03, 0x04];

        let result = execute_dfu_recovery(&usb, &device, &bin_data, |_, _| {});
        let outcome = result.to_outcome();

        match &outcome {
            DfuRecoveryOutcome::UnsupportedRecoveryPath { guidance } => {
                assert!(guidance.contains("WinUSB"), "got: {guidance}");
                assert!(guidance.contains("Zadig"), "got: {guidance}");
                assert!(guidance.contains("Linux"), "got: {guidance}");
                assert!(guidance.contains("macOS"), "got: {guidance}");
            }
            other => panic!("driver denied must produce UnsupportedRecoveryPath: {other:?}"),
        }

        let json =
            serde_json::to_string(&FirmwareOutcome::DfuRecovery { outcome }).unwrap();
        assert!(json.contains("unsupported_recovery_path"));
    }

    #[test]
    fn e2e_catalog_client_board_filtered() {
        let dir = std::env::temp_dir().join(format!(
            "ironwing_test_e2e_catalog_{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);

        let client = CatalogClient::with_max_age(dir.clone(), std::time::Duration::from_secs(3600));
        let gz = make_manifest_gz(&[
            sample_entry(140, "apj", "4.5.0", "fmuv3"),
            sample_entry(9, "apj", "4.5.0", "fmuv2"),
            sample_entry(140, "apj", "4.4.0", "fmuv3"),
        ]);
        let gz_clone = gz.clone();

        let results = client.get_entries_for_board(140, || Ok(gz_clone)).unwrap();
        assert_eq!(results.len(), 2);
        assert!(results.iter().all(|e| e.board_id == 140));
        assert!(results.iter().any(|e| e.version == "4.5.0"));
        assert!(results.iter().any(|e| e.version == "4.4.0"));

        let _ = std::fs::remove_dir_all(&dir);
    }
}

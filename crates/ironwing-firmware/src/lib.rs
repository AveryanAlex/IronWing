pub mod artifact;
pub mod dfu_flow;
pub mod discovery;
pub mod serial_flow;
pub mod serial_uploader;
pub mod types;

pub use artifact::{
    ArtifactClassification, DfuRecoveryArtifact, ExternalFlashPayload, SerialArtifact,
    classify_artifact, parse_apj, validate_recovery_bin, validate_recovery_file_type,
};
pub use dfu_flow::{
    AsyncDfuFuture, AsyncDfuProgressCallback, AsyncDfuUsbAccess, DfuRecoveryResult, DfuUsbAccess,
    DfuUsbDeviceIdentity, ResetDisposition, apj_to_dfu_bin, classify_usb_error,
    confirm_reset_with_device_checks, confirm_reset_with_device_checks_async,
    confirm_reset_with_presence_check, confirm_reset_with_presence_check_async,
    default_reset_confirmation_poll_interval, default_reset_confirmation_timeout,
    execute_async_dfu_recovery, execute_async_dfu_recovery_with_phases, execute_dfu_recovery,
    execute_dfu_recovery_with_phases, is_unambiguous_reset_confirmation_match,
    normalize_usb_device_identity_text, resolve_preloaded_dfu_source, usb_driver_guidance,
    validate_stm32_dfu_device,
};
#[cfg(feature = "dfu-core")]
pub use dfu_flow::{
    STM32_DFUSE_FLASH_BASE, STM32_DFUSE_TRANSFER_SIZE, download_dfu_core_async_with_progress,
    stm32_dfuse_functional_descriptor, stm32_dfuse_memory_layout, stm32_dfuse_protocol,
};
pub use discovery::{
    STM32_DFU_PID, STM32_DFU_VID, build_dfu_unique_id, detect_board_id_from_port,
    detect_board_id_from_ports, detect_bootloader_port, is_authoritative_bootloader_port,
    is_bootloader_candidate_port, is_known_fc_application_port, is_stm32_dfu,
    normalized_product_name, resolve_exact_dfu_device,
};
pub use serial_flow::{
    PreflightSnapshot, SerialFlowDeps, build_board_identity, build_bootloader_board_info,
    detect_bootloader_board, execute_serial_flash, execute_serial_flash_with_options,
};
pub use serial_uploader::{
    AsyncSerialIo, BootloaderInfo, SerialIo, SerialReadError,
    async_probe_for_detection_with_cancel, async_probe_with_cancel, async_upload_after_probe,
    async_upload_with_options, erase, erase_with_cancel, extf_erase, extf_erase_with_cancel,
    extf_program, extf_verify_crc, extf_verify_crc_with_cancel, firmware_crc, full_erase,
    full_erase_with_cancel, get_info, get_info_with_cancel, get_sync, get_sync_with_cancel,
    identify, identify_with_cancel, probe, probe_for_detection_with_cancel, probe_with_cancel,
    program, reboot, sync, sync_with_cancel, upload, upload_after_probe, upload_with_options,
    validate_board, validate_extf_capacity, validate_main_capacity, verify_crc,
    verify_crc_with_cancel,
};
pub use types::*;

#[cfg(test)]
mod tests {
    use super::*;
    use base64::prelude::*;
    use flate2::{Compression, write::ZlibEncoder};
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

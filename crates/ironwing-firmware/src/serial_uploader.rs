//! Pure serial bootloader uploader for ArduPilot/PX4-compatible boards.
//!
//! Protocol reference: ArduPilot `Tools/scripts/uploader.py`
//! Supports bootloader revisions 2–5 (BL_REV_MIN..=BL_REV_MAX).
//!
//! This module is Tauri-independent. All I/O goes through the `SerialIo` trait,
//! enabling full test coverage with mock serial.

use crate::artifact::SerialArtifact;
use crate::types::{FirmwareError, SerialFlashOptions};
use std::future::Future;
use std::pin::Pin;

// ── Protocol constants ──

/// Sync marker sent by bootloader before every response.
const INSYNC: u8 = 0x12;
/// End-of-command marker appended to every command.
const EOC: u8 = 0x20;

// Response codes (after INSYNC)
const OK: u8 = 0x10;
const FAILED: u8 = 0x11;
const INVALID: u8 = 0x13;

// Command bytes
const GET_SYNC: u8 = 0x21;
const GET_DEVICE: u8 = 0x22;
const CHIP_ERASE: u8 = 0x23;
const CHIP_FULL_ERASE: u8 = 0x40;
const PROG_MULTI: u8 = 0x27;
const GET_CRC: u8 = 0x29;
const REBOOT: u8 = 0x30;

// Device info parameter IDs
const INFO_BL_REV: u8 = 0x01;
const INFO_BOARD_ID: u8 = 0x02;
const INFO_BOARD_REV: u8 = 0x03;
const INFO_FLASH_SIZE: u8 = 0x04;
const INFO_EXTF_SIZE: u8 = 0x06;

// External-flash command bytes
const EXTF_ERASE: u8 = 0x34;
const EXTF_PROG_MULTI: u8 = 0x35;
const EXTF_GET_CRC: u8 = 0x37;

// Bootloader revision bounds
const BL_REV_MIN: u8 = 2;
const BL_REV_MAX: u8 = 5;

/// Max bytes per PROG_MULTI command (protocol max 255, must be multiple of 4).
const PROG_MULTI_MAX: usize = 252;
const ERASE_INSYNC_TIMEOUT_BUDGET: usize = 12;
const ERASE_STATUS_TIMEOUT_BUDGET: usize = 12;
const EXTF_ERASE_ACK_TIMEOUT_BUDGET: usize = 12;
const EXTF_ERASE_PROGRESS_TIMEOUT_BUDGET: usize = 12;
const EXTF_ERASE_FINAL_STATUS_TIMEOUT_BUDGET: usize = 12;
const EXTF_CRC_TIMEOUT_BUDGET: usize = 12;
const SYNC_RESPONSE_TIMEOUT_BUDGET: usize = 12;
const DEVICE_INFO_TIMEOUT_BUDGET: usize = 12;
const DETECTION_SYNC_RESPONSE_TIMEOUT_BUDGET: usize = 1;
const DETECTION_DEVICE_INFO_TIMEOUT_BUDGET: usize = 1;
const MAIN_CRC_TIMEOUT_BUDGET: usize = 12;
const PROGRESS_BYTE_BUDGET: usize = 256;

// ── Serial I/O trait (mockable) ──

/// Abstraction over serial port I/O for testability.
pub trait SerialIo {
    /// Write all bytes to the port.
    fn write_all(&mut self, data: &[u8]) -> Result<(), FirmwareError>;
    /// Read up to `buf.len()` bytes, blocking up to an internal timeout.
    fn read(&mut self, buf: &mut [u8]) -> Result<usize, SerialReadError>;
    /// Discard any buffered input.
    fn flush_input(&mut self) -> Result<(), FirmwareError>;
}

pub trait AsyncSerialIo {
    fn write_all<'a>(
        &'a mut self,
        data: &'a [u8],
    ) -> Pin<Box<dyn Future<Output = Result<(), FirmwareError>> + 'a>>;
    fn read<'a>(
        &'a mut self,
        buf: &'a mut [u8],
    ) -> Pin<Box<dyn Future<Output = Result<usize, SerialReadError>> + 'a>>;
    fn flush_input<'a>(
        &'a mut self,
    ) -> Pin<Box<dyn Future<Output = Result<(), FirmwareError>> + 'a>>;
}

#[derive(Debug)]
pub enum SerialReadError {
    Timeout,
    Other(FirmwareError),
}

// ── Device info from bootloader ──

/// Information read from the bootloader via GET_DEVICE commands.
#[derive(Debug, Clone)]
pub struct BootloaderInfo {
    pub bl_rev: u8,
    pub board_id: u32,
    pub board_rev: u32,
    pub flash_size: u32,
    pub extf_size: u32,
}

// ── CRC computation (matches ArduPilot firmware.crc()) ──

fn ap_crc32(bytes: &[u8], mut state: u32) -> u32 {
    for &byte in bytes {
        state ^= byte as u32;
        for _ in 0..8 {
            state = if (state & 1) != 0 {
                (state >> 1) ^ 0xEDB8_8320
            } else {
                state >> 1
            };
        }
    }
    state
}

/// Compute ArduPilot bootloader CRC of a firmware image padded with 0xFF to
/// `flash_size`.
///
/// This matches `Tools/scripts/uploader.py` `firmware.crc(padlen)`, which uses
/// ArduPilot's `crc_crc32()` state machine (initial state 0, no final xor), not
/// the conventional zlib/IEEE CRC32 wrapper semantics.
pub fn firmware_crc(image: &[u8], flash_size: u32) -> u32 {
    let mut state = ap_crc32(image, 0);

    // Pad with 0xFF words up to flash_size
    let mut pos = image.len();
    while pos < (flash_size as usize).saturating_sub(1) {
        state = ap_crc32(&[0xFF, 0xFF, 0xFF, 0xFF], state);
        pos += 4;
    }

    state
}

// ── Core protocol operations ──

/// Read INSYNC + status byte. Returns Ok(()) on INSYNC+OK.
pub fn get_sync(io: &mut dyn SerialIo) -> Result<(), FirmwareError> {
    get_sync_with_cancel(io, &|| false)
}

pub fn get_sync_with_cancel(
    io: &mut dyn SerialIo,
    is_cancelled: &dyn Fn() -> bool,
) -> Result<(), FirmwareError> {
    get_sync_with_timeout_budget(io, is_cancelled, SYNC_RESPONSE_TIMEOUT_BUDGET)
}

fn get_sync_with_timeout_budget(
    io: &mut dyn SerialIo,
    is_cancelled: &dyn Fn() -> bool,
    timeout_budget: usize,
) -> Result<(), FirmwareError> {
    let mut buf = [0u8; 2];
    read_exact_with_retry(io, &mut buf, is_cancelled, timeout_budget, "sync response")?;
    if buf[0] != INSYNC {
        return Err(FirmwareError::BootloaderSyncMismatch { received: buf[0] });
    }
    match buf[1] {
        OK => Ok(()),
        FAILED => Err(FirmwareError::ProtocolError {
            detail: "bootloader reports OPERATION FAILED".into(),
        }),
        INVALID => Err(FirmwareError::ProtocolError {
            detail: "bootloader reports INVALID OPERATION".into(),
        }),
        other => Err(FirmwareError::ProtocolError {
            detail: format!("unexpected response 0x{other:02X} after INSYNC"),
        }),
    }
}

fn send_get_sync(io: &mut dyn SerialIo) -> Result<(), FirmwareError> {
    io.write_all(&[GET_SYNC, EOC])
}

fn read_exact_with_retry(
    io: &mut dyn SerialIo,
    buf: &mut [u8],
    is_cancelled: &dyn Fn() -> bool,
    timeout_budget: usize,
    context: &str,
) -> Result<(), FirmwareError> {
    let mut filled = 0;
    let mut timeouts = 0;

    while filled < buf.len() {
        check_cancel(is_cancelled)?;
        match io.read(&mut buf[filled..]) {
            Ok(0) => {
                return Err(FirmwareError::ProtocolError {
                    detail: format!("serial read returned no data while waiting for {context}"),
                });
            }
            Ok(read) => {
                filled += read;
            }
            Err(SerialReadError::Timeout) if timeouts < timeout_budget => {
                timeouts += 1;
            }
            Err(SerialReadError::Timeout) => {
                return Err(FirmwareError::Timeout {
                    context: context.to_string(),
                });
            }
            Err(SerialReadError::Other(error)) => return Err(error),
        }
    }

    Ok(())
}

fn get_sync_bytewise(
    io: &mut dyn SerialIo,
    is_cancelled: &dyn Fn() -> bool,
    insync_timeout_budget: usize,
    status_timeout_budget: usize,
    progress_budget: usize,
) -> Result<(), FirmwareError> {
    let mut insync_timeouts = 0;
    let mut ignored_progress = 0;

    loop {
        let mut insync = [0u8; 1];
        check_cancel(is_cancelled)?;
        match io.read(&mut insync) {
            Ok(0) => {
                return Err(FirmwareError::ProtocolError {
                    detail: "serial read returned no data while waiting for erase sync".into(),
                });
            }
            Ok(_) => {}
            Err(SerialReadError::Timeout) if insync_timeouts < insync_timeout_budget => {
                insync_timeouts += 1;
                continue;
            }
            Err(SerialReadError::Timeout) => {
                return Err(FirmwareError::Timeout {
                    context: "erase sync".into(),
                });
            }
            Err(SerialReadError::Other(error)) => return Err(error),
        }

        if insync[0] != INSYNC {
            ignored_progress += 1;
            if ignored_progress > progress_budget {
                return Err(FirmwareError::BootloaderSyncMismatch {
                    received: insync[0],
                });
            }
            continue;
        }

        let mut status = [0u8; 1];
        let mut status_timeouts = 0;
        loop {
            check_cancel(is_cancelled)?;
            match io.read(&mut status) {
                Ok(0) => {
                    return Err(FirmwareError::ProtocolError {
                        detail: "serial read returned no data while waiting for sync status".into(),
                    });
                }
                Ok(_) => {
                    return match status[0] {
                        OK => Ok(()),
                        FAILED => Err(FirmwareError::ProtocolError {
                            detail: "bootloader reports OPERATION FAILED".into(),
                        }),
                        INVALID => Err(FirmwareError::ProtocolError {
                            detail: "bootloader reports INVALID OPERATION".into(),
                        }),
                        other => Err(FirmwareError::ProtocolError {
                            detail: format!("unexpected response 0x{other:02X} after INSYNC"),
                        }),
                    };
                }
                Err(SerialReadError::Timeout) if status_timeouts < status_timeout_budget => {
                    status_timeouts += 1;
                }
                Err(SerialReadError::Timeout) => {
                    return Err(FirmwareError::Timeout {
                        context: "sync status".into(),
                    });
                }
                Err(SerialReadError::Other(error)) => return Err(error),
            }
        }
    }
}

fn wait_for_extf_erase_completion_with_cancel(
    io: &mut dyn SerialIo,
    is_cancelled: &dyn Fn() -> bool,
) -> Result<(), FirmwareError> {
    get_sync_bytewise(
        io,
        is_cancelled,
        EXTF_ERASE_ACK_TIMEOUT_BUDGET,
        EXTF_ERASE_ACK_TIMEOUT_BUDGET,
        0,
    )?;
    get_sync_bytewise(
        io,
        is_cancelled,
        EXTF_ERASE_PROGRESS_TIMEOUT_BUDGET,
        EXTF_ERASE_FINAL_STATUS_TIMEOUT_BUDGET,
        PROGRESS_BYTE_BUDGET,
    )
}

fn read_u32_with_timeouts(
    io: &mut dyn SerialIo,
    is_cancelled: &dyn Fn() -> bool,
    timeout_budget: usize,
    context: &str,
) -> Result<u32, FirmwareError> {
    let mut buf = [0u8; 4];
    read_exact_with_retry(io, &mut buf, is_cancelled, timeout_budget, context)?;
    Ok(u32::from_le_bytes(buf))
}

/// Send GET_SYNC + EOC, expect INSYNC + OK.
pub fn sync(io: &mut dyn SerialIo) -> Result<(), FirmwareError> {
    sync_with_cancel(io, &|| false)
}

pub fn sync_with_cancel(
    io: &mut dyn SerialIo,
    is_cancelled: &dyn Fn() -> bool,
) -> Result<(), FirmwareError> {
    io.flush_input()?;
    send_get_sync(io)?;
    get_sync_with_cancel(io, is_cancelled)
}

/// Send GET_DEVICE + param + EOC, read 4-byte LE u32, then INSYNC+OK.
pub fn get_info(io: &mut dyn SerialIo, param: u8) -> Result<u32, FirmwareError> {
    get_info_with_cancel(io, param, &|| false)
}

pub fn get_info_with_cancel(
    io: &mut dyn SerialIo,
    param: u8,
    is_cancelled: &dyn Fn() -> bool,
) -> Result<u32, FirmwareError> {
    get_info_with_timeout_budget(io, param, is_cancelled, DEVICE_INFO_TIMEOUT_BUDGET)
}

fn get_info_with_timeout_budget(
    io: &mut dyn SerialIo,
    param: u8,
    is_cancelled: &dyn Fn() -> bool,
    timeout_budget: usize,
) -> Result<u32, FirmwareError> {
    io.write_all(&[GET_DEVICE, param, EOC])?;
    let value = read_u32_with_timeouts(io, is_cancelled, timeout_budget, "device info")?;
    get_sync_with_timeout_budget(io, is_cancelled, timeout_budget)?;
    Ok(value)
}

/// Identify the bootloader: read bl_rev, board_id, board_rev, flash_size.
pub fn identify(io: &mut dyn SerialIo) -> Result<BootloaderInfo, FirmwareError> {
    identify_with_cancel(io, &|| false)
}

pub fn identify_with_cancel(
    io: &mut dyn SerialIo,
    is_cancelled: &dyn Fn() -> bool,
) -> Result<BootloaderInfo, FirmwareError> {
    identify_with_timeout_budget(io, is_cancelled, DEVICE_INFO_TIMEOUT_BUDGET)
}

fn identify_with_timeout_budget(
    io: &mut dyn SerialIo,
    is_cancelled: &dyn Fn() -> bool,
    timeout_budget: usize,
) -> Result<BootloaderInfo, FirmwareError> {
    let bl_rev_raw = get_info_with_timeout_budget(io, INFO_BL_REV, is_cancelled, timeout_budget)?;
    let bl_rev = bl_rev_raw as u8;

    if !(BL_REV_MIN..=BL_REV_MAX).contains(&bl_rev) {
        return Err(FirmwareError::ProtocolError {
            detail: format!(
                "unsupported bootloader revision {bl_rev} (supported: {BL_REV_MIN}-{BL_REV_MAX})"
            ),
        });
    }

    let board_id = get_info_with_timeout_budget(io, INFO_BOARD_ID, is_cancelled, timeout_budget)?;
    let board_rev = get_info_with_timeout_budget(io, INFO_BOARD_REV, is_cancelled, timeout_budget)?;
    let flash_size =
        get_info_with_timeout_budget(io, INFO_FLASH_SIZE, is_cancelled, timeout_budget)?;

    let extf_size =
        match get_info_with_timeout_budget(io, INFO_EXTF_SIZE, is_cancelled, timeout_budget) {
            Ok(size) => size,
            Err(FirmwareError::ProtocolError { detail })
                if detail == "bootloader reports INVALID OPERATION" =>
            {
                sync_with_cancel(io, is_cancelled)?;
                0
            }
            Err(error) => return Err(error),
        };

    Ok(BootloaderInfo {
        bl_rev,
        board_id,
        board_rev,
        flash_size,
        extf_size,
    })
}

/// Validate that the artifact's board_id matches the detected board.
/// Must be called before erase/program.
pub fn validate_board(
    artifact: &SerialArtifact,
    info: &BootloaderInfo,
) -> Result<(), FirmwareError> {
    if artifact.board_id != info.board_id {
        return Err(FirmwareError::BoardMismatch {
            expected: artifact.board_id,
            actual: info.board_id,
        });
    }
    Ok(())
}

pub fn validate_main_capacity(
    artifact: &SerialArtifact,
    info: &BootloaderInfo,
) -> Result<(), FirmwareError> {
    if (artifact.image.len() as u32) > info.flash_size {
        return Err(FirmwareError::InternalFlashCapacityInsufficient {
            board_capacity: info.flash_size,
            firmware_needs: artifact.image.len() as u32,
        });
    }
    Ok(())
}

/// Send CHIP_ERASE + EOC. The bootloader may take a long time to respond.
pub fn erase(io: &mut dyn SerialIo) -> Result<(), FirmwareError> {
    erase_with_cancel(io, &|| false)
}

pub fn erase_with_cancel(
    io: &mut dyn SerialIo,
    is_cancelled: &dyn Fn() -> bool,
) -> Result<(), FirmwareError> {
    io.write_all(&[CHIP_ERASE, EOC])?;
    get_sync_bytewise(
        io,
        is_cancelled,
        ERASE_INSYNC_TIMEOUT_BUDGET,
        ERASE_STATUS_TIMEOUT_BUDGET,
        0,
    )
}

pub fn full_erase(io: &mut dyn SerialIo) -> Result<(), FirmwareError> {
    full_erase_with_cancel(io, &|| false)
}

pub fn full_erase_with_cancel(
    io: &mut dyn SerialIo,
    is_cancelled: &dyn Fn() -> bool,
) -> Result<(), FirmwareError> {
    io.write_all(&[CHIP_FULL_ERASE, EOC])?;
    get_sync_bytewise(
        io,
        is_cancelled,
        ERASE_INSYNC_TIMEOUT_BUDGET,
        ERASE_STATUS_TIMEOUT_BUDGET,
        0,
    )
}

/// Program the firmware image in PROG_MULTI_MAX-sized chunks.
/// Calls `on_progress(bytes_written, total_bytes)` after each chunk.
pub fn program(
    io: &mut dyn SerialIo,
    image: &[u8],
    is_cancelled: &dyn Fn() -> bool,
    mut on_progress: impl FnMut(usize, usize),
) -> Result<(), FirmwareError> {
    let total = image.len();
    let mut written = 0;

    for chunk in image.chunks(PROG_MULTI_MAX) {
        check_cancel(is_cancelled)?;
        let len = chunk.len() as u8;
        // PROG_MULTI + length + data + EOC
        io.write_all(&[PROG_MULTI, len])?;
        io.write_all(chunk)?;
        io.write_all(&[EOC])?;
        get_sync_with_cancel(io, is_cancelled)?;
        written += chunk.len();
        on_progress(written, total);
    }

    Ok(())
}

/// Send GET_CRC + EOC, read 4-byte LE CRC from bootloader, then INSYNC+OK.
/// Compares against locally computed CRC. Returns Ok(()) if match.
pub fn verify_crc(
    io: &mut dyn SerialIo,
    image: &[u8],
    flash_size: u32,
) -> Result<(), FirmwareError> {
    verify_crc_with_cancel(io, image, flash_size, &|| false)
}

pub fn verify_crc_with_cancel(
    io: &mut dyn SerialIo,
    image: &[u8],
    flash_size: u32,
    is_cancelled: &dyn Fn() -> bool,
) -> Result<(), FirmwareError> {
    let expected = firmware_crc(image, flash_size);

    io.write_all(&[GET_CRC, EOC])?;
    let reported = read_u32_with_timeouts(io, is_cancelled, MAIN_CRC_TIMEOUT_BUDGET, "CRC")?;
    get_sync_with_cancel(io, is_cancelled)?;

    if reported != expected {
        return Err(FirmwareError::ProtocolError {
            detail: format!("CRC mismatch: expected 0x{expected:08X}, got 0x{reported:08X}"),
        });
    }

    Ok(())
}

// ── External-flash operations ──

pub fn validate_extf_capacity(
    extf: &crate::artifact::ExternalFlashPayload,
    info: &BootloaderInfo,
) -> Result<(), FirmwareError> {
    if info.extf_size == 0 || (extf.image.len() as u32) > info.extf_size {
        return Err(FirmwareError::ExtfCapacityInsufficient {
            board_capacity: info.extf_size,
            firmware_needs: extf.image.len() as u32,
        });
    }
    Ok(())
}

pub fn extf_erase(io: &mut dyn SerialIo, size: u32) -> Result<(), FirmwareError> {
    extf_erase_with_cancel(io, size, &|| false)
}

pub fn extf_erase_with_cancel(
    io: &mut dyn SerialIo,
    size: u32,
    is_cancelled: &dyn Fn() -> bool,
) -> Result<(), FirmwareError> {
    io.write_all(&[EXTF_ERASE])?;
    io.write_all(&size.to_le_bytes())?;
    io.write_all(&[EOC])?;
    wait_for_extf_erase_completion_with_cancel(io, is_cancelled)
}

pub fn extf_program(
    io: &mut dyn SerialIo,
    image: &[u8],
    is_cancelled: &dyn Fn() -> bool,
    mut on_progress: impl FnMut(usize, usize),
) -> Result<(), FirmwareError> {
    // Pad image to 4-byte alignment with 0xFF for word-aligned programming
    let padded_len = (image.len() + 3) & !3;
    let mut padded = image.to_vec();
    padded.resize(padded_len, 0xFF);

    let total = image.len();
    let mut written = 0;

    for chunk in padded.chunks(PROG_MULTI_MAX) {
        check_cancel(is_cancelled)?;
        let len = chunk.len() as u8;
        io.write_all(&[EXTF_PROG_MULTI, len])?;
        io.write_all(chunk)?;
        io.write_all(&[EOC])?;
        get_sync_with_cancel(io, is_cancelled)?;
        written = (written + chunk.len()).min(total);
        on_progress(written, total);
    }

    Ok(())
}

pub fn extf_verify_crc(io: &mut dyn SerialIo, image: &[u8]) -> Result<(), FirmwareError> {
    extf_verify_crc_with_cancel(io, image, &|| false)
}

pub fn extf_verify_crc_with_cancel(
    io: &mut dyn SerialIo,
    image: &[u8],
    is_cancelled: &dyn Fn() -> bool,
) -> Result<(), FirmwareError> {
    let size = image.len() as u32;
    let expected = firmware_crc(image, size);

    io.write_all(&[EXTF_GET_CRC])?;
    io.write_all(&size.to_le_bytes())?;
    io.write_all(&[EOC])?;
    let reported =
        read_u32_with_timeouts(io, is_cancelled, EXTF_CRC_TIMEOUT_BUDGET, "extflash CRC")?;
    get_sync_bytewise(
        io,
        is_cancelled,
        EXTF_CRC_TIMEOUT_BUDGET,
        EXTF_CRC_TIMEOUT_BUDGET,
        0,
    )?;

    if reported != expected {
        return Err(FirmwareError::ProtocolError {
            detail: format!("extf CRC mismatch: expected 0x{expected:08X}, got 0x{reported:08X}"),
        });
    }

    Ok(())
}

pub fn reboot(io: &mut dyn SerialIo) -> Result<(), FirmwareError> {
    io.write_all(&[REBOOT, EOC])
}

pub fn upload(
    io: &mut dyn SerialIo,
    artifact: &SerialArtifact,
    is_cancelled: &dyn Fn() -> bool,
    on_progress: impl FnMut(&str, usize, usize),
) -> Result<BootloaderInfo, FirmwareError> {
    upload_with_options(
        io,
        artifact,
        &SerialFlashOptions {
            full_chip_erase: false,
        },
        is_cancelled,
        on_progress,
    )
}

pub fn upload_with_options(
    io: &mut dyn SerialIo,
    artifact: &SerialArtifact,
    options: &SerialFlashOptions,
    is_cancelled: &dyn Fn() -> bool,
    mut on_progress: impl FnMut(&str, usize, usize),
) -> Result<BootloaderInfo, FirmwareError> {
    check_cancel(is_cancelled)?;
    let info = probe_with_cancel(io, is_cancelled)?;
    upload_after_probe(io, &info, artifact, options, is_cancelled, &mut on_progress)?;
    Ok(info)
}

pub fn probe(io: &mut dyn SerialIo) -> Result<BootloaderInfo, FirmwareError> {
    probe_with_cancel(io, &|| false)
}

pub fn probe_with_cancel(
    io: &mut dyn SerialIo,
    is_cancelled: &dyn Fn() -> bool,
) -> Result<BootloaderInfo, FirmwareError> {
    probe_with_timeout_budgets(
        io,
        is_cancelled,
        SYNC_RESPONSE_TIMEOUT_BUDGET,
        DEVICE_INFO_TIMEOUT_BUDGET,
    )
}

pub fn probe_for_detection_with_cancel(
    io: &mut dyn SerialIo,
    is_cancelled: &dyn Fn() -> bool,
) -> Result<BootloaderInfo, FirmwareError> {
    probe_with_timeout_budgets(
        io,
        is_cancelled,
        DETECTION_SYNC_RESPONSE_TIMEOUT_BUDGET,
        DETECTION_DEVICE_INFO_TIMEOUT_BUDGET,
    )
}

fn probe_with_timeout_budgets(
    io: &mut dyn SerialIo,
    is_cancelled: &dyn Fn() -> bool,
    sync_timeout_budget: usize,
    device_info_timeout_budget: usize,
) -> Result<BootloaderInfo, FirmwareError> {
    send_get_sync(io)?;
    get_sync_with_timeout_budget(io, is_cancelled, sync_timeout_budget)?;
    identify_with_timeout_budget(io, is_cancelled, device_info_timeout_budget)
}

pub fn upload_after_probe(
    io: &mut dyn SerialIo,
    info: &BootloaderInfo,
    artifact: &SerialArtifact,
    options: &SerialFlashOptions,
    is_cancelled: &dyn Fn() -> bool,
    mut on_progress: impl FnMut(&str, usize, usize),
) -> Result<(), FirmwareError> {
    check_cancel(is_cancelled)?;
    validate_board(artifact, info)?;
    validate_main_capacity(artifact, info)?;

    if let Some(extf) = &artifact.extf {
        check_cancel(is_cancelled)?;
        validate_extf_capacity(extf, info)?;

        on_progress("extf_erasing", 0, 0);
        extf_erase_with_cancel(io, extf.image.len() as u32, is_cancelled)?;
        on_progress("extf_programming", 0, extf.image.len());
        extf_program(io, &extf.image, is_cancelled, |w, t| {
            on_progress("extf_programming", w, t)
        })?;
        check_cancel(is_cancelled)?;
        on_progress("extf_verifying", 0, 0);
        extf_verify_crc_with_cancel(io, &extf.image, is_cancelled)?;
    }

    check_cancel(is_cancelled)?;
    on_progress("erasing", 0, 0);
    if options.full_chip_erase {
        full_erase_with_cancel(io, is_cancelled)?;
    } else {
        erase_with_cancel(io, is_cancelled)?;
    }
    on_progress("programming", 0, artifact.image.len());
    program(io, &artifact.image, is_cancelled, |w, t| {
        on_progress("programming", w, t)
    })?;

    if info.bl_rev >= 3 {
        check_cancel(is_cancelled)?;
        on_progress("verifying", 0, 0);
        verify_crc_with_cancel(io, &artifact.image, info.flash_size, is_cancelled)?;
    }

    check_cancel(is_cancelled)?;
    on_progress("rebooting", 0, 0);
    reboot(io)?;
    Ok(())
}

pub async fn async_upload_with_options(
    io: &mut dyn AsyncSerialIo,
    artifact: &SerialArtifact,
    options: &SerialFlashOptions,
    is_cancelled: &dyn Fn() -> bool,
    mut on_progress: impl FnMut(&str, usize, usize),
) -> Result<BootloaderInfo, FirmwareError> {
    check_cancel(is_cancelled)?;
    let info = async_probe_with_cancel(io, is_cancelled).await?;
    async_upload_after_probe(io, &info, artifact, options, is_cancelled, &mut on_progress).await?;
    Ok(info)
}

pub async fn async_probe_with_cancel(
    io: &mut dyn AsyncSerialIo,
    is_cancelled: &dyn Fn() -> bool,
) -> Result<BootloaderInfo, FirmwareError> {
    async_probe_with_timeout_budgets(
        io,
        is_cancelled,
        SYNC_RESPONSE_TIMEOUT_BUDGET,
        DEVICE_INFO_TIMEOUT_BUDGET,
    )
    .await
}

pub async fn async_probe_for_detection_with_cancel(
    io: &mut dyn AsyncSerialIo,
    is_cancelled: &dyn Fn() -> bool,
) -> Result<BootloaderInfo, FirmwareError> {
    async_probe_with_timeout_budgets(
        io,
        is_cancelled,
        DETECTION_SYNC_RESPONSE_TIMEOUT_BUDGET,
        DETECTION_DEVICE_INFO_TIMEOUT_BUDGET,
    )
    .await
}

async fn async_probe_with_timeout_budgets(
    io: &mut dyn AsyncSerialIo,
    is_cancelled: &dyn Fn() -> bool,
    sync_timeout_budget: usize,
    device_info_timeout_budget: usize,
) -> Result<BootloaderInfo, FirmwareError> {
    async_send_get_sync(io).await?;
    async_get_sync_with_timeout_budget(io, is_cancelled, sync_timeout_budget).await?;
    async_identify_with_timeout_budget(io, is_cancelled, device_info_timeout_budget).await
}

pub async fn async_upload_after_probe(
    io: &mut dyn AsyncSerialIo,
    info: &BootloaderInfo,
    artifact: &SerialArtifact,
    options: &SerialFlashOptions,
    is_cancelled: &dyn Fn() -> bool,
    mut on_progress: impl FnMut(&str, usize, usize),
) -> Result<(), FirmwareError> {
    check_cancel(is_cancelled)?;
    validate_board(artifact, info)?;
    validate_main_capacity(artifact, info)?;

    if let Some(extf) = &artifact.extf {
        check_cancel(is_cancelled)?;
        validate_extf_capacity(extf, info)?;

        on_progress("extf_erasing", 0, 0);
        async_extf_erase_with_cancel(io, extf.image.len() as u32, is_cancelled).await?;
        on_progress("extf_programming", 0, extf.image.len());
        async_extf_program(io, &extf.image, is_cancelled, |w, t| {
            on_progress("extf_programming", w, t)
        })
        .await?;
        check_cancel(is_cancelled)?;
        on_progress("extf_verifying", 0, 0);
        async_extf_verify_crc_with_cancel(io, &extf.image, is_cancelled).await?;
    }

    check_cancel(is_cancelled)?;
    on_progress("erasing", 0, 0);
    if options.full_chip_erase {
        async_full_erase_with_cancel(io, is_cancelled).await?;
    } else {
        async_erase_with_cancel(io, is_cancelled).await?;
    }
    on_progress("programming", 0, artifact.image.len());
    async_program(io, &artifact.image, is_cancelled, |w, t| {
        on_progress("programming", w, t)
    })
    .await?;

    if info.bl_rev >= 3 {
        check_cancel(is_cancelled)?;
        on_progress("verifying", 0, 0);
        async_verify_crc_with_cancel(io, &artifact.image, info.flash_size, is_cancelled).await?;
    }

    check_cancel(is_cancelled)?;
    on_progress("rebooting", 0, 0);
    async_reboot(io).await?;
    Ok(())
}

async fn async_get_sync_with_cancel(
    io: &mut dyn AsyncSerialIo,
    is_cancelled: &dyn Fn() -> bool,
) -> Result<(), FirmwareError> {
    async_get_sync_with_timeout_budget(io, is_cancelled, SYNC_RESPONSE_TIMEOUT_BUDGET).await
}

async fn async_get_sync_with_timeout_budget(
    io: &mut dyn AsyncSerialIo,
    is_cancelled: &dyn Fn() -> bool,
    timeout_budget: usize,
) -> Result<(), FirmwareError> {
    let mut buf = [0u8; 2];
    async_read_exact_with_retry(io, &mut buf, is_cancelled, timeout_budget, "sync response")
        .await?;
    if buf[0] != INSYNC {
        return Err(FirmwareError::BootloaderSyncMismatch { received: buf[0] });
    }
    sync_status_result(buf[1])
}

async fn async_send_get_sync(io: &mut dyn AsyncSerialIo) -> Result<(), FirmwareError> {
    io.write_all(&[GET_SYNC, EOC]).await
}

async fn async_read_exact_with_retry(
    io: &mut dyn AsyncSerialIo,
    buf: &mut [u8],
    is_cancelled: &dyn Fn() -> bool,
    timeout_budget: usize,
    context: &str,
) -> Result<(), FirmwareError> {
    let mut filled = 0;
    let mut timeouts = 0;

    while filled < buf.len() {
        check_cancel(is_cancelled)?;
        match io.read(&mut buf[filled..]).await {
            Ok(0) => {
                return Err(FirmwareError::ProtocolError {
                    detail: format!("serial read returned no data while waiting for {context}"),
                });
            }
            Ok(read) => {
                filled += read;
            }
            Err(SerialReadError::Timeout) if timeouts < timeout_budget => {
                timeouts += 1;
            }
            Err(SerialReadError::Timeout) => {
                return Err(FirmwareError::Timeout {
                    context: context.to_string(),
                });
            }
            Err(SerialReadError::Other(error)) => return Err(error),
        }
    }

    Ok(())
}

async fn async_get_sync_bytewise(
    io: &mut dyn AsyncSerialIo,
    is_cancelled: &dyn Fn() -> bool,
    insync_timeout_budget: usize,
    status_timeout_budget: usize,
    progress_budget: usize,
) -> Result<(), FirmwareError> {
    let mut insync_timeouts = 0;
    let mut ignored_progress = 0;

    loop {
        let mut insync = [0u8; 1];
        check_cancel(is_cancelled)?;
        match io.read(&mut insync).await {
            Ok(0) => {
                return Err(FirmwareError::ProtocolError {
                    detail: "serial read returned no data while waiting for erase sync".into(),
                });
            }
            Ok(_) => {}
            Err(SerialReadError::Timeout) if insync_timeouts < insync_timeout_budget => {
                insync_timeouts += 1;
                continue;
            }
            Err(SerialReadError::Timeout) => {
                return Err(FirmwareError::Timeout {
                    context: "erase sync".into(),
                });
            }
            Err(SerialReadError::Other(error)) => return Err(error),
        }

        if insync[0] != INSYNC {
            ignored_progress += 1;
            if ignored_progress > progress_budget {
                return Err(FirmwareError::BootloaderSyncMismatch {
                    received: insync[0],
                });
            }
            continue;
        }

        let mut status = [0u8; 1];
        let mut status_timeouts = 0;
        loop {
            check_cancel(is_cancelled)?;
            match io.read(&mut status).await {
                Ok(0) => {
                    return Err(FirmwareError::ProtocolError {
                        detail: "serial read returned no data while waiting for sync status".into(),
                    });
                }
                Ok(_) => return sync_status_result(status[0]),
                Err(SerialReadError::Timeout) if status_timeouts < status_timeout_budget => {
                    status_timeouts += 1;
                }
                Err(SerialReadError::Timeout) => {
                    return Err(FirmwareError::Timeout {
                        context: "sync status".into(),
                    });
                }
                Err(SerialReadError::Other(error)) => return Err(error),
            }
        }
    }
}

fn sync_status_result(status: u8) -> Result<(), FirmwareError> {
    match status {
        OK => Ok(()),
        FAILED => Err(FirmwareError::ProtocolError {
            detail: "bootloader reports OPERATION FAILED".into(),
        }),
        INVALID => Err(FirmwareError::ProtocolError {
            detail: "bootloader reports INVALID OPERATION".into(),
        }),
        other => Err(FirmwareError::ProtocolError {
            detail: format!("unexpected response 0x{other:02X} after INSYNC"),
        }),
    }
}

async fn async_wait_for_extf_erase_completion_with_cancel(
    io: &mut dyn AsyncSerialIo,
    is_cancelled: &dyn Fn() -> bool,
) -> Result<(), FirmwareError> {
    async_get_sync_bytewise(
        io,
        is_cancelled,
        EXTF_ERASE_ACK_TIMEOUT_BUDGET,
        EXTF_ERASE_ACK_TIMEOUT_BUDGET,
        0,
    )
    .await?;
    async_get_sync_bytewise(
        io,
        is_cancelled,
        EXTF_ERASE_PROGRESS_TIMEOUT_BUDGET,
        EXTF_ERASE_FINAL_STATUS_TIMEOUT_BUDGET,
        PROGRESS_BYTE_BUDGET,
    )
    .await
}

async fn async_read_u32_with_timeouts(
    io: &mut dyn AsyncSerialIo,
    is_cancelled: &dyn Fn() -> bool,
    timeout_budget: usize,
    context: &str,
) -> Result<u32, FirmwareError> {
    let mut buf = [0u8; 4];
    async_read_exact_with_retry(io, &mut buf, is_cancelled, timeout_budget, context).await?;
    Ok(u32::from_le_bytes(buf))
}

async fn async_sync_with_cancel(
    io: &mut dyn AsyncSerialIo,
    is_cancelled: &dyn Fn() -> bool,
) -> Result<(), FirmwareError> {
    io.flush_input().await?;
    async_send_get_sync(io).await?;
    async_get_sync_with_cancel(io, is_cancelled).await
}

async fn async_get_info_with_timeout_budget(
    io: &mut dyn AsyncSerialIo,
    param: u8,
    is_cancelled: &dyn Fn() -> bool,
    timeout_budget: usize,
) -> Result<u32, FirmwareError> {
    io.write_all(&[GET_DEVICE, param, EOC]).await?;
    let value =
        async_read_u32_with_timeouts(io, is_cancelled, timeout_budget, "device info").await?;
    async_get_sync_with_timeout_budget(io, is_cancelled, timeout_budget).await?;
    Ok(value)
}

async fn async_identify_with_timeout_budget(
    io: &mut dyn AsyncSerialIo,
    is_cancelled: &dyn Fn() -> bool,
    timeout_budget: usize,
) -> Result<BootloaderInfo, FirmwareError> {
    let bl_rev_raw =
        async_get_info_with_timeout_budget(io, INFO_BL_REV, is_cancelled, timeout_budget).await?;
    let bl_rev = bl_rev_raw as u8;

    if !(BL_REV_MIN..=BL_REV_MAX).contains(&bl_rev) {
        return Err(FirmwareError::ProtocolError {
            detail: format!(
                "unsupported bootloader revision {bl_rev} (supported: {BL_REV_MIN}-{BL_REV_MAX})"
            ),
        });
    }

    let board_id =
        async_get_info_with_timeout_budget(io, INFO_BOARD_ID, is_cancelled, timeout_budget).await?;
    let board_rev =
        async_get_info_with_timeout_budget(io, INFO_BOARD_REV, is_cancelled, timeout_budget)
            .await?;
    let flash_size =
        async_get_info_with_timeout_budget(io, INFO_FLASH_SIZE, is_cancelled, timeout_budget)
            .await?;

    let extf_size =
        match async_get_info_with_timeout_budget(io, INFO_EXTF_SIZE, is_cancelled, timeout_budget)
            .await
        {
            Ok(size) => size,
            Err(FirmwareError::ProtocolError { detail })
                if detail == "bootloader reports INVALID OPERATION" =>
            {
                async_sync_with_cancel(io, is_cancelled).await?;
                0
            }
            Err(error) => return Err(error),
        };

    Ok(BootloaderInfo {
        bl_rev,
        board_id,
        board_rev,
        flash_size,
        extf_size,
    })
}

async fn async_erase_with_cancel(
    io: &mut dyn AsyncSerialIo,
    is_cancelled: &dyn Fn() -> bool,
) -> Result<(), FirmwareError> {
    io.write_all(&[CHIP_ERASE, EOC]).await?;
    async_get_sync_bytewise(
        io,
        is_cancelled,
        ERASE_INSYNC_TIMEOUT_BUDGET,
        ERASE_STATUS_TIMEOUT_BUDGET,
        0,
    )
    .await
}

async fn async_full_erase_with_cancel(
    io: &mut dyn AsyncSerialIo,
    is_cancelled: &dyn Fn() -> bool,
) -> Result<(), FirmwareError> {
    io.write_all(&[CHIP_FULL_ERASE, EOC]).await?;
    async_get_sync_bytewise(
        io,
        is_cancelled,
        ERASE_INSYNC_TIMEOUT_BUDGET,
        ERASE_STATUS_TIMEOUT_BUDGET,
        0,
    )
    .await
}

async fn async_program(
    io: &mut dyn AsyncSerialIo,
    image: &[u8],
    is_cancelled: &dyn Fn() -> bool,
    mut on_progress: impl FnMut(usize, usize),
) -> Result<(), FirmwareError> {
    let total = image.len();
    let mut written = 0;

    for chunk in image.chunks(PROG_MULTI_MAX) {
        check_cancel(is_cancelled)?;
        let len = chunk.len() as u8;
        io.write_all(&[PROG_MULTI, len]).await?;
        io.write_all(chunk).await?;
        io.write_all(&[EOC]).await?;
        async_get_sync_with_cancel(io, is_cancelled).await?;
        written += chunk.len();
        on_progress(written, total);
    }

    Ok(())
}

async fn async_verify_crc_with_cancel(
    io: &mut dyn AsyncSerialIo,
    image: &[u8],
    flash_size: u32,
    is_cancelled: &dyn Fn() -> bool,
) -> Result<(), FirmwareError> {
    let expected = firmware_crc(image, flash_size);

    io.write_all(&[GET_CRC, EOC]).await?;
    let reported =
        async_read_u32_with_timeouts(io, is_cancelled, MAIN_CRC_TIMEOUT_BUDGET, "CRC").await?;
    async_get_sync_with_cancel(io, is_cancelled).await?;

    if reported != expected {
        return Err(FirmwareError::ProtocolError {
            detail: format!("CRC mismatch: expected 0x{expected:08X}, got 0x{reported:08X}"),
        });
    }

    Ok(())
}

async fn async_extf_erase_with_cancel(
    io: &mut dyn AsyncSerialIo,
    size: u32,
    is_cancelled: &dyn Fn() -> bool,
) -> Result<(), FirmwareError> {
    io.write_all(&[EXTF_ERASE]).await?;
    io.write_all(&size.to_le_bytes()).await?;
    io.write_all(&[EOC]).await?;
    async_wait_for_extf_erase_completion_with_cancel(io, is_cancelled).await
}

async fn async_extf_program(
    io: &mut dyn AsyncSerialIo,
    image: &[u8],
    is_cancelled: &dyn Fn() -> bool,
    mut on_progress: impl FnMut(usize, usize),
) -> Result<(), FirmwareError> {
    let padded_len = (image.len() + 3) & !3;
    let mut padded = image.to_vec();
    padded.resize(padded_len, 0xFF);

    let total = image.len();
    let mut written = 0;

    for chunk in padded.chunks(PROG_MULTI_MAX) {
        check_cancel(is_cancelled)?;
        let len = chunk.len() as u8;
        io.write_all(&[EXTF_PROG_MULTI, len]).await?;
        io.write_all(chunk).await?;
        io.write_all(&[EOC]).await?;
        async_get_sync_with_cancel(io, is_cancelled).await?;
        written = (written + chunk.len()).min(total);
        on_progress(written, total);
    }

    Ok(())
}

async fn async_extf_verify_crc_with_cancel(
    io: &mut dyn AsyncSerialIo,
    image: &[u8],
    is_cancelled: &dyn Fn() -> bool,
) -> Result<(), FirmwareError> {
    let size = image.len() as u32;
    let expected = firmware_crc(image, size);

    io.write_all(&[EXTF_GET_CRC]).await?;
    io.write_all(&size.to_le_bytes()).await?;
    io.write_all(&[EOC]).await?;
    let reported =
        async_read_u32_with_timeouts(io, is_cancelled, EXTF_CRC_TIMEOUT_BUDGET, "extflash CRC")
            .await?;
    async_get_sync_bytewise(
        io,
        is_cancelled,
        EXTF_CRC_TIMEOUT_BUDGET,
        EXTF_CRC_TIMEOUT_BUDGET,
        0,
    )
    .await?;

    if reported != expected {
        return Err(FirmwareError::ProtocolError {
            detail: format!("extf CRC mismatch: expected 0x{expected:08X}, got 0x{reported:08X}"),
        });
    }

    Ok(())
}

async fn async_reboot(io: &mut dyn AsyncSerialIo) -> Result<(), FirmwareError> {
    io.write_all(&[REBOOT, EOC]).await
}

fn check_cancel(is_cancelled: &dyn Fn() -> bool) -> Result<(), FirmwareError> {
    if is_cancelled() {
        return Err(FirmwareError::Cancelled);
    }
    Ok(())
}

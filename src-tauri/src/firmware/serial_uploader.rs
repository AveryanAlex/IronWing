//! Pure serial bootloader uploader for ArduPilot/PX4-compatible boards.
//!
//! Protocol reference: ArduPilot `Tools/scripts/uploader.py`
//! Supports bootloader revisions 2–5 (BL_REV_MIN..=BL_REV_MAX).
//!
//! This module is Tauri-independent. All I/O goes through the `SerialIo` trait,
//! enabling full test coverage with mock serial.

use crate::firmware::artifact::SerialArtifact;
use crate::firmware::types::FirmwareError;

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
const NOP: u8 = 0x00;
const GET_SYNC: u8 = 0x21;
const GET_DEVICE: u8 = 0x22;
const CHIP_ERASE: u8 = 0x23;
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

// ── Serial I/O trait (mockable) ──

/// Abstraction over serial port I/O for testability.
pub(crate) trait SerialIo {
    /// Write all bytes to the port.
    fn write_all(&mut self, data: &[u8]) -> Result<(), FirmwareError>;
    /// Read exactly `count` bytes, blocking up to an internal timeout.
    fn read_exact(&mut self, buf: &mut [u8]) -> Result<(), FirmwareError>;
    /// Discard any buffered input.
    fn flush_input(&mut self) -> Result<(), FirmwareError>;
}

// ── Device info from bootloader ──

/// Information read from the bootloader via GET_DEVICE commands.
#[derive(Debug, Clone)]
pub(crate) struct BootloaderInfo {
    pub(crate) bl_rev: u8,
    pub(crate) board_id: u32,
    pub(crate) board_rev: u32,
    pub(crate) flash_size: u32,
    pub(crate) extf_size: u32,
}

// ── CRC computation (matches ArduPilot firmware.crc()) ──

/// Compute CRC32 of firmware image padded with 0xFF to `flash_size`.
/// Matches ArduPilot `firmware.crc(padlen)`:
///   state = crc32(image, 0)
///   for i in range(len(image), padlen - 1, 4):
///       state = crc32(b'\xff\xff\xff\xff', state)
pub(crate) fn firmware_crc(image: &[u8], flash_size: u32) -> u32 {
    let mut hasher = crc32fast::Hasher::new();
    hasher.update(image);

    // Pad with 0xFF words up to flash_size
    let pad_word: [u8; 4] = [0xFF, 0xFF, 0xFF, 0xFF];
    let mut pos = image.len();
    while pos < (flash_size as usize).saturating_sub(1) {
        hasher.update(&pad_word);
        pos += 4;
    }

    hasher.finalize()
}

// ── Core protocol operations ──

/// Read INSYNC + status byte. Returns Ok(()) on INSYNC+OK.
pub(crate) fn get_sync(io: &mut dyn SerialIo) -> Result<(), FirmwareError> {
    let mut buf = [0u8; 2];
    io.read_exact(&mut buf)?;
    if buf[0] != INSYNC {
        return Err(FirmwareError::ProtocolError {
            detail: format!("expected INSYNC (0x{INSYNC:02X}), got 0x{:02X}", buf[0]),
        });
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

/// Send GET_SYNC + EOC, expect INSYNC + OK.
pub(crate) fn sync(io: &mut dyn SerialIo) -> Result<(), FirmwareError> {
    io.flush_input()?;
    io.write_all(&[GET_SYNC, EOC])?;
    get_sync(io)
}

/// Send GET_DEVICE + param + EOC, read 4-byte LE u32, then INSYNC+OK.
pub(crate) fn get_info(io: &mut dyn SerialIo, param: u8) -> Result<u32, FirmwareError> {
    io.write_all(&[GET_DEVICE, param, EOC])?;
    let mut buf = [0u8; 4];
    io.read_exact(&mut buf)?;
    let value = u32::from_le_bytes(buf);
    get_sync(io)?;
    Ok(value)
}

/// Identify the bootloader: read bl_rev, board_id, board_rev, flash_size.
pub(crate) fn identify(io: &mut dyn SerialIo) -> Result<BootloaderInfo, FirmwareError> {
    let bl_rev_raw = get_info(io, INFO_BL_REV)?;
    let bl_rev = bl_rev_raw as u8;

    if !(BL_REV_MIN..=BL_REV_MAX).contains(&bl_rev) {
        return Err(FirmwareError::ProtocolError {
            detail: format!(
                "unsupported bootloader revision {bl_rev} (supported: {BL_REV_MIN}-{BL_REV_MAX})"
            ),
        });
    }

    let board_id = get_info(io, INFO_BOARD_ID)?;
    let board_rev = get_info(io, INFO_BOARD_REV)?;
    let flash_size = get_info(io, INFO_FLASH_SIZE)?;

    let extf_size = match get_info(io, INFO_EXTF_SIZE) {
        Ok(size) => size,
        Err(_) => {
            sync(io)?;
            0
        }
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
pub(crate) fn validate_board(
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

/// Send CHIP_ERASE + EOC. The bootloader may take a long time to respond.
pub(crate) fn erase(io: &mut dyn SerialIo) -> Result<(), FirmwareError> {
    io.write_all(&[CHIP_ERASE, EOC])?;
    get_sync(io)
}

/// Program the firmware image in PROG_MULTI_MAX-sized chunks.
/// Calls `on_progress(bytes_written, total_bytes)` after each chunk.
pub(crate) fn program(
    io: &mut dyn SerialIo,
    image: &[u8],
    mut on_progress: impl FnMut(usize, usize),
) -> Result<(), FirmwareError> {
    let total = image.len();
    let mut written = 0;

    for chunk in image.chunks(PROG_MULTI_MAX) {
        let len = chunk.len() as u8;
        // PROG_MULTI + length + data + EOC
        io.write_all(&[PROG_MULTI, len])?;
        io.write_all(chunk)?;
        io.write_all(&[EOC])?;
        get_sync(io)?;
        written += chunk.len();
        on_progress(written, total);
    }

    Ok(())
}

/// Send GET_CRC + EOC, read 4-byte LE CRC from bootloader, then INSYNC+OK.
/// Compares against locally computed CRC. Returns Ok(()) if match.
pub(crate) fn verify_crc(
    io: &mut dyn SerialIo,
    image: &[u8],
    flash_size: u32,
) -> Result<(), FirmwareError> {
    let expected = firmware_crc(image, flash_size);

    io.write_all(&[GET_CRC, EOC])?;
    let mut buf = [0u8; 4];
    io.read_exact(&mut buf)?;
    let reported = u32::from_le_bytes(buf);
    get_sync(io)?;

    if reported != expected {
        return Err(FirmwareError::ProtocolError {
            detail: format!("CRC mismatch: expected 0x{expected:08X}, got 0x{reported:08X}"),
        });
    }

    Ok(())
}

// ── External-flash operations ──

pub(crate) fn validate_extf_capacity(
    extf: &crate::firmware::artifact::ExternalFlashPayload,
    info: &BootloaderInfo,
) -> Result<(), FirmwareError> {
    if info.extf_size == 0 || (extf.image.len() as u32) > info.extf_size {
        return Err(FirmwareError::ArtifactInvalid {
            reason: format!(
                "external-flash capacity insufficient: board reports {} bytes, firmware needs {} bytes",
                info.extf_size,
                extf.image.len()
            ),
        });
    }
    Ok(())
}

pub(crate) fn extf_erase(io: &mut dyn SerialIo, size: u32) -> Result<(), FirmwareError> {
    io.write_all(&[EXTF_ERASE])?;
    io.write_all(&size.to_le_bytes())?;
    io.write_all(&[EOC])?;
    get_sync(io)
}

pub(crate) fn extf_program(
    io: &mut dyn SerialIo,
    image: &[u8],
    mut on_progress: impl FnMut(usize, usize),
) -> Result<(), FirmwareError> {
    // Pad image to 4-byte alignment with 0xFF for word-aligned programming
    let padded_len = (image.len() + 3) & !3;
    let mut padded = image.to_vec();
    padded.resize(padded_len, 0xFF);

    let total = image.len();
    let mut written = 0;

    for chunk in padded.chunks(PROG_MULTI_MAX) {
        let len = chunk.len() as u8;
        io.write_all(&[EXTF_PROG_MULTI, len])?;
        io.write_all(chunk)?;
        io.write_all(&[EOC])?;
        get_sync(io)?;
        written = (written + chunk.len()).min(total);
        on_progress(written, total);
    }

    Ok(())
}

pub(crate) fn extf_verify_crc(io: &mut dyn SerialIo, image: &[u8]) -> Result<(), FirmwareError> {
    let size = image.len() as u32;
    let expected = firmware_crc(image, size);

    io.write_all(&[EXTF_GET_CRC])?;
    io.write_all(&size.to_le_bytes())?;
    io.write_all(&[EOC])?;
    let mut buf = [0u8; 4];
    io.read_exact(&mut buf)?;
    let reported = u32::from_le_bytes(buf);
    get_sync(io)?;

    if reported != expected {
        return Err(FirmwareError::ProtocolError {
            detail: format!("extf CRC mismatch: expected 0x{expected:08X}, got 0x{reported:08X}"),
        });
    }

    Ok(())
}

pub(crate) fn reboot(io: &mut dyn SerialIo) -> Result<(), FirmwareError> {
    io.write_all(&[REBOOT, EOC])
}

pub(crate) fn upload(
    io: &mut dyn SerialIo,
    artifact: &SerialArtifact,
    mut on_progress: impl FnMut(&str, usize, usize),
) -> Result<BootloaderInfo, FirmwareError> {
    sync(io)?;
    let info = identify(io)?;
    validate_board(artifact, &info)?;

    if let Some(extf) = &artifact.extf {
        validate_extf_capacity(extf, &info)?;

        on_progress("extf_erasing", 0, 0);
        extf_erase(io, extf.image.len() as u32)?;
        on_progress("extf_programming", 0, extf.image.len());
        extf_program(io, &extf.image, |w, t| {
            on_progress("extf_programming", w, t)
        })?;
        on_progress("extf_verifying", 0, 0);
        extf_verify_crc(io, &extf.image)?;
    }

    on_progress("erasing", 0, 0);
    erase(io)?;
    on_progress("programming", 0, artifact.image.len());
    program(io, &artifact.image, |w, t| on_progress("programming", w, t))?;

    if info.bl_rev >= 3 {
        on_progress("verifying", 0, 0);
        verify_crc(io, &artifact.image, info.flash_size)?;
    }

    on_progress("rebooting", 0, 0);
    reboot(io)?;
    Ok(info)
}

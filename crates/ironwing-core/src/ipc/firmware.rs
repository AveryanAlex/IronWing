//! Shared firmware IPC contracts.
//!
//! The canonical domain types live in `ironwing-firmware` so non-Tauri runtimes
//! can reuse artifact parsing and bootloader protocol logic without depending on
//! the Tauri shell. Core re-exports them from the IPC namespace to keep one
//! contract surface for adapters.

pub use ironwing_firmware::types::*;

#[cfg(test)]
mod tests {
    use super::{FirmwareSessionStatus, SerialFlashPhase};
    use serde_json::json;

    #[test]
    fn firmware_session_contract_reexports_shared_types() {
        let status = FirmwareSessionStatus::FirmwareInstallUpdate {
            phase: SerialFlashPhase::Probing,
        };

        assert_eq!(
            serde_json::to_value(status).unwrap(),
            json!({ "kind": "firmware_install_update", "phase": "probing" })
        );
    }
}

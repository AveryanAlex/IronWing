use serde::Serialize;

use crate::firmware::discovery::list_firmware_ports;
use crate::firmware::types::{InventoryResult, PortInfo};

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub(crate) enum SerialPortInventoryResult {
    Available {
        ports: Vec<PortInfo>,
        can_request_web_serial: bool,
    },
    Unsupported {
        can_request_web_serial: bool,
    },
}

#[tauri::command]
pub(crate) fn list_serial_port_inventory() -> SerialPortInventoryResult {
    match list_firmware_ports() {
        InventoryResult::Available { ports } => SerialPortInventoryResult::Available {
            ports,
            can_request_web_serial: false,
        },
        InventoryResult::Unsupported => SerialPortInventoryResult::Unsupported {
            can_request_web_serial: false,
        },
    }
}

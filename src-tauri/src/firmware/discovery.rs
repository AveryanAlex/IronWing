use crate::firmware::types::{DfuDeviceInfo, DfuScanResult, InventoryResult, PortInfo};

const STM32_DFU_VID: u16 = 0x0483;
const STM32_DFU_PID: u16 = 0xdf11;

// ── Tauri commands ──

#[cfg(not(target_os = "android"))]
#[tauri::command]
pub(crate) fn firmware_list_ports() -> InventoryResult {
    list_firmware_ports()
}

#[cfg(target_os = "android")]
#[tauri::command]
pub(crate) fn firmware_list_ports() -> InventoryResult {
    InventoryResult::Unsupported
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
pub(crate) fn firmware_list_dfu_devices() -> DfuScanResult {
    list_dfu_devices()
}

#[cfg(target_os = "android")]
#[tauri::command]
pub(crate) fn firmware_list_dfu_devices() -> DfuScanResult {
    DfuScanResult::Unsupported
}

// ── Desktop serial port inventory ──

#[cfg(not(target_os = "android"))]
pub(crate) fn list_firmware_ports() -> InventoryResult {
    let ports = match serialport::available_ports() {
        Ok(ports) => ports,
        Err(_) => return InventoryResult::Available { ports: vec![] },
    };

    let port_infos = ports
        .into_iter()
        .map(|p| {
            let (vid, pid, serial_number, manufacturer, product) = match p.port_type {
                serialport::SerialPortType::UsbPort(usb) => (
                    Some(usb.vid),
                    Some(usb.pid),
                    usb.serial_number,
                    usb.manufacturer,
                    usb.product,
                ),
                _ => (None, None, None, None, None),
            };
            PortInfo {
                port_name: p.port_name,
                vid,
                pid,
                serial_number,
                manufacturer,
                product,
                location: None,
            }
        })
        .collect();

    InventoryResult::Available { ports: port_infos }
}

#[cfg(target_os = "android")]
pub(crate) fn list_firmware_ports() -> InventoryResult {
    InventoryResult::Unsupported
}

// ── Desktop DFU USB enumeration via nusb ──

#[cfg(not(target_os = "android"))]
pub(crate) fn list_dfu_devices() -> DfuScanResult {
    use nusb::MaybeFuture;

    let devices = match nusb::list_devices().wait() {
        Ok(iter) => iter,
        Err(_) => return DfuScanResult::Available { devices: vec![] },
    };

    let dfu_devices: Vec<DfuDeviceInfo> = devices
        .filter(|d| d.vendor_id() == STM32_DFU_VID && d.product_id() == STM32_DFU_PID)
        .map(|d| DfuDeviceInfo {
            vid: d.vendor_id(),
            pid: d.product_id(),
            serial_number: d.serial_number().map(String::from),
            manufacturer: d.manufacturer_string().map(String::from),
            product: d.product_string().map(String::from),
        })
        .collect();

    DfuScanResult::Available {
        devices: dfu_devices,
    }
}

#[cfg(target_os = "android")]
pub(crate) fn list_dfu_devices() -> DfuScanResult {
    DfuScanResult::Unsupported
}

// ── Helpers (used by downstream tasks for re-enumeration and detection) ──

pub(crate) fn is_stm32_dfu(device: &DfuDeviceInfo) -> bool {
    device.vid == STM32_DFU_VID && device.pid == STM32_DFU_PID
}

pub(crate) fn detect_bootloader_port<'a>(
    before: &[PortInfo],
    after: &'a [PortInfo],
) -> Vec<&'a PortInfo> {
    let before_names: std::collections::HashSet<&str> =
        before.iter().map(|p| p.port_name.as_str()).collect();

    let mut candidates: Vec<&PortInfo> = Vec::new();

    for port in after {
        if before_names.contains(port.port_name.as_str()) {
            if port_changed_identity(before, port) {
                candidates.push(port);
            }
        } else {
            candidates.push(port);
        }
    }

    candidates
}

fn port_changed_identity(before: &[PortInfo], current: &PortInfo) -> bool {
    before.iter().any(|prev| {
        prev.port_name == current.port_name
            && (prev.vid != current.vid
                || prev.pid != current.pid
                || prev.serial_number != current.serial_number)
    })
}

/// Attempt to detect an ArduPilot board_id from USB VID/PID of connected ports.
/// Returns the first match from a known VID/PID → board_id lookup table.
/// This is a best-effort heuristic; the bootloader's own board_id is authoritative.
pub(crate) fn detect_board_id_from_ports(ports: &[PortInfo]) -> Option<u32> {
    for port in ports {
        if let (Some(vid), Some(pid)) = (port.vid, port.pid) {
            if let Some(board_id) = vid_pid_to_board_id(vid, pid) {
                return Some(board_id);
            }
        }
    }
    None
}

fn vid_pid_to_board_id(vid: u16, pid: u16) -> Option<u32> {
    match (vid, pid) {
        // CubePilot
        (0x2DAE, 0x1011) => Some(9),   // CubeBlack (fmuv2)
        (0x2DAE, 0x1016) => Some(9),   // CubeBlack bootloader
        (0x2DAE, 0x1058) => Some(140), // CubeOrange (fmuv3)
        (0x2DAE, 0x1059) => Some(140), // CubeOrange bootloader
        (0x2DAE, 0x1101) => Some(140), // CubeOrangePlus
        // 3DR
        (0x27AC, 0x1154) => Some(9), // Pixhawk1 (fmuv2)
        // Holybro
        (0x3162, 0x004B) => Some(50), // Durandal (fmuv5)
        // mRo
        (0x2780, 0x0001) => Some(9), // mRo Pixhawk
        _ => None,
    }
}

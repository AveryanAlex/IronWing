use crate::firmware::types::{DfuDeviceInfo, DfuScanResult, InventoryResult, PortInfo};

const STM32_DFU_VID: u16 = 0x0483;
const STM32_DFU_PID: u16 = 0xdf11;

#[cfg(not(target_os = "android"))]
pub(crate) fn build_dfu_unique_id(
    bus_id: &str,
    port_chain: &[u8],
    serial_number: Option<&str>,
) -> String {
    let topology = if port_chain.is_empty() {
        "root".to_string()
    } else {
        port_chain
            .iter()
            .map(u8::to_string)
            .collect::<Vec<_>>()
            .join(".")
    };

    let serial = serial_number.unwrap_or("no-serial");
    format!("{bus_id}:{topology}:{serial}")
}

pub(crate) fn resolve_exact_dfu_device(
    devices: &[DfuDeviceInfo],
    selected_unique_id: &str,
) -> Result<DfuDeviceInfo, crate::firmware::types::FirmwareError> {
    let mut matches = devices
        .iter()
        .filter(|device| device.unique_id == selected_unique_id);

    let Some(first) = matches.next() else {
        return Err(crate::firmware::types::FirmwareError::DfuExactTargetingUnavailable {
            guidance: "exact DFU targeting could not find the selected device. Re-scan DFU devices and select the intended target again".to_string(),
        });
    };

    if matches.next().is_some() {
        return Err(crate::firmware::types::FirmwareError::DfuExactTargetingUnavailable {
            guidance: "exact DFU targeting is ambiguous because multiple indistinguishable STM32 DFU devices are attached. Disconnect extra devices and try again".into(),
        });
    }

    Ok(first.clone())
}

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
        Err(e) => {
            tracing::warn!("serial port enumeration failed: {e}");
            return InventoryResult::Available { ports: vec![] };
        }
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
        Err(e) => {
            tracing::warn!("USB device enumeration failed: {e}");
            return DfuScanResult::Available { devices: vec![] };
        }
    };

    let dfu_devices: Vec<DfuDeviceInfo> = devices
        .filter(|d| d.vendor_id() == STM32_DFU_VID && d.product_id() == STM32_DFU_PID)
        .map(|d| {
            let serial_number = d.serial_number().map(String::from);
            let unique_id =
                build_dfu_unique_id(d.bus_id(), d.port_chain(), serial_number.as_deref());

            DfuDeviceInfo {
                vid: d.vendor_id(),
                pid: d.product_id(),
                unique_id,
                serial_number,
                manufacturer: d.manufacturer_string().map(String::from),
                product: d.product_string().map(String::from),
            }
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
                || prev.serial_number != current.serial_number
                || prev.product != current.product
                || prev.manufacturer != current.manufacturer
                || (!is_bootloader_candidate_port(prev) && is_bootloader_candidate_port(current)))
    })
}

/// Attempt to detect an ArduPilot board_id from USB VID/PID of connected ports.
/// Returns the first match from a known VID/PID → board_id lookup table.
/// This is a best-effort heuristic; the bootloader's own board_id is authoritative.
pub(crate) fn detect_board_id_from_ports(ports: &[PortInfo]) -> Option<u32> {
    for port in ports {
        if let Some(board_id) = detect_board_id_from_port(port) {
            return Some(board_id);
        }
    }
    None
}

pub(crate) fn detect_board_id_from_port(port: &PortInfo) -> Option<u32> {
    if let (Some(vid), Some(pid)) = (port.vid, port.pid)
        && let Some(board_id) = vid_pid_to_board_id(vid, pid)
    {
        return Some(board_id);
    }

    port.product.as_deref().and_then(board_id_from_product_name)
}

fn normalized_product_name(product: &str) -> String {
    product
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .flat_map(|ch| ch.to_lowercase())
        .collect()
}

pub(crate) fn is_authoritative_bootloader_port(port: &PortInfo) -> bool {
    port.product
        .as_deref()
        .is_some_and(|product| normalized_product_name(product).contains("bootloader"))
        || matches!(
            (port.vid, port.pid),
            (Some(0x2DAE), Some(0x1016))
                | (Some(0x2DAE), Some(0x1059))
                | (Some(0x26AC), Some(0x0011))
        )
}

pub(crate) fn is_bootloader_candidate_port(port: &PortInfo) -> bool {
    port.product.as_deref().is_some_and(|product| {
        let normalized = normalized_product_name(product);
        normalized.contains("bootloader") || normalized.ends_with("bl")
    }) || matches!(
        (port.vid, port.pid),
        (Some(0x2DAE), Some(0x1016))
            | (Some(0x2DAE), Some(0x1059))
            | (Some(0x1209), Some(0x5741))
            | (Some(0x26AC), Some(0x0011))
    )
}

fn vid_pid_to_board_id(vid: u16, pid: u16) -> Option<u32> {
    match (vid, pid) {
        // CubePilot
        (0x2DAE, 0x1011) => Some(9),   // CubeBlack (fmuv2)
        (0x2DAE, 0x1016) => Some(9),   // CubeBlack bootloader
        (0x2DAE, 0x1058) => Some(140), // CubeOrange (fmuv3)
        (0x2DAE, 0x1059) => Some(140), // CubeOrange bootloader
        (0x2DAE, 0x1101) => Some(140), // CubeOrangePlus
        (0x26AC, 0x0011) => Some(9),   // PX4 bootloader identity after DFU bootloader restore
        // 3DR
        (0x27AC, 0x1154) => Some(9), // Pixhawk1 (fmuv2)
        // Holybro
        (0x3162, 0x004B) => Some(50), // Durandal (fmuv5)
        // mRo
        (0x2780, 0x0001) => Some(9), // mRo Pixhawk
        _ => None,
    }
}

fn board_id_from_product_name(product: &str) -> Option<u32> {
    let normalized = normalized_product_name(product);

    match () {
        _ if normalized.contains("matekf405te") => Some(1054),
        _ if normalized.contains("cubeorangeplus") => Some(140),
        _ if normalized.contains("cubeorange") => Some(140),
        _ if normalized.contains("cubeblack") => Some(9),
        _ if normalized.contains("pixhawk1") => Some(9),
        _ if normalized.contains("px4bootloader") => Some(9),
        _ => None,
    }
}

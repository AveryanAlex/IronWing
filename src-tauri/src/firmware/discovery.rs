use crate::firmware::types::{DfuDeviceInfo, DfuScanResult, InventoryResult, PortInfo};

pub(crate) use ironwing_firmware::discovery::{
    STM32_DFU_PID, STM32_DFU_VID, build_dfu_unique_id, is_authoritative_bootloader_port,
    resolve_exact_dfu_device,
};
#[cfg(test)]
pub(crate) use ironwing_firmware::discovery::{
    detect_board_id_from_ports, detect_bootloader_port, is_stm32_dfu,
};

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

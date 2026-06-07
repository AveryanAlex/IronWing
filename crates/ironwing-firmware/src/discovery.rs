use crate::types::{DfuDeviceInfo, FirmwareError, PortInfo};

pub const STM32_DFU_VID: u16 = 0x0483;
pub const STM32_DFU_PID: u16 = 0xdf11;

pub fn build_dfu_unique_id(bus_id: &str, port_chain: &[u8], serial_number: Option<&str>) -> String {
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

pub fn resolve_exact_dfu_device(
    devices: &[DfuDeviceInfo],
    selected_unique_id: &str,
) -> Result<DfuDeviceInfo, FirmwareError> {
    let mut matches = devices
        .iter()
        .filter(|device| device.unique_id == selected_unique_id);

    let Some(first) = matches.next() else {
        return Err(FirmwareError::DfuExactTargetingUnavailable {
            guidance: "exact DFU targeting could not find the selected device. Re-scan DFU devices and select the intended target again".to_string(),
        });
    };

    if matches.next().is_some() {
        return Err(FirmwareError::DfuExactTargetingUnavailable {
            guidance: "exact DFU targeting is ambiguous because multiple indistinguishable STM32 DFU devices are attached. Disconnect extra devices and try again".into(),
        });
    }

    Ok(first.clone())
}

pub fn is_stm32_dfu(device: &DfuDeviceInfo) -> bool {
    device.vid == STM32_DFU_VID && device.pid == STM32_DFU_PID
}

pub fn detect_bootloader_port<'a>(before: &[PortInfo], after: &'a [PortInfo]) -> Vec<&'a PortInfo> {
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
pub fn detect_board_id_from_ports(ports: &[PortInfo]) -> Option<u32> {
    for port in ports {
        if let Some(board_id) = detect_board_id_from_port(port) {
            return Some(board_id);
        }
    }
    None
}

pub fn detect_board_id_from_port(port: &PortInfo) -> Option<u32> {
    if let (Some(vid), Some(pid)) = (port.vid, port.pid)
        && let Some(board_id) = vid_pid_to_board_id(vid, pid)
    {
        return Some(board_id);
    }

    port.product.as_deref().and_then(board_id_from_product_name)
}

pub fn normalized_product_name(product: &str) -> String {
    product
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .flat_map(|ch| ch.to_lowercase())
        .collect()
}

pub fn is_authoritative_bootloader_port(port: &PortInfo) -> bool {
    port.product.as_deref().is_some_and(|product| {
        let normalized = normalized_product_name(product);
        normalized.contains("bootloader") || has_bootloader_suffix(product)
    }) || matches!(
        (port.vid, port.pid),
        (Some(0x2DAE), Some(0x1016)) | (Some(0x2DAE), Some(0x1059)) | (Some(0x26AC), Some(0x0011))
    )
}

pub fn is_bootloader_candidate_port(port: &PortInfo) -> bool {
    port.product.as_deref().is_some_and(|product| {
        let normalized = normalized_product_name(product);
        normalized.contains("bootloader") || has_bootloader_suffix(product)
    }) || matches!(
        (port.vid, port.pid),
        (Some(0x2DAE), Some(0x1016))
            | (Some(0x2DAE), Some(0x1059))
            | (Some(0x1209), Some(0x5741))
            | (Some(0x26AC), Some(0x0011))
    )
}

/// Returns `true` when the port has a known flight-controller VID/PID or product name
/// but does **not** look like it is already in bootloader mode.
/// Used to detect boards that are likely running firmware and can be rebooted to bootloader
/// via a temporary MAVLink session.
pub fn is_known_fc_application_port(port: &PortInfo) -> bool {
    detect_board_id_from_port(port).is_some() && !is_bootloader_candidate_port(port)
}

fn has_bootloader_suffix(product: &str) -> bool {
    product.trim().to_ascii_lowercase().ends_with("-bl")
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

#[cfg(test)]
mod tests {
    use super::*;

    fn make_port(
        port_name: &str,
        vid: Option<u16>,
        pid: Option<u16>,
        product: Option<&str>,
    ) -> PortInfo {
        PortInfo {
            port_name: port_name.into(),
            vid,
            pid,
            serial_number: None,
            manufacturer: None,
            product: product.map(str::to_string),
            location: None,
        }
    }

    #[test]
    fn detects_bootloader_reenumeration_on_same_port_identity_change() {
        let before = vec![make_port(
            "/dev/ttyACM0",
            Some(0x2DAE),
            Some(0x1058),
            Some("CubeOrange"),
        )];
        let after = vec![make_port(
            "/dev/ttyACM0",
            Some(0x2DAE),
            Some(0x1058),
            Some("CubeOrange Bootloader"),
        )];

        let candidates = detect_bootloader_port(&before, &after);

        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].port_name, "/dev/ttyACM0");
    }

    #[test]
    fn detects_board_id_from_matek_product_hint() {
        let port = make_port(
            "/dev/ttyACM0",
            Some(0x1209),
            Some(0x5741),
            Some("MatekF405-TE-BL"),
        );

        assert_eq!(detect_board_id_from_port(&port), Some(1054));
    }

    #[test]
    fn treats_bl_product_suffix_as_authoritative_bootloader_identity() {
        let port = make_port(
            "/dev/ttyACM1",
            Some(0x1209),
            Some(0x5741),
            Some("MatekF405-VTOL-BL"),
        );

        assert!(is_authoritative_bootloader_port(&port));
    }

    #[test]
    fn exact_dfu_resolution_rejects_duplicate_unique_ids() {
        let devices = vec![
            DfuDeviceInfo {
                vid: STM32_DFU_VID,
                pid: STM32_DFU_PID,
                unique_id: "1-3:2:no-serial".into(),
                serial_number: None,
                manufacturer: None,
                product: None,
            },
            DfuDeviceInfo {
                vid: STM32_DFU_VID,
                pid: STM32_DFU_PID,
                unique_id: "1-3:2:no-serial".into(),
                serial_number: None,
                manufacturer: None,
                product: None,
            },
        ];

        let err = resolve_exact_dfu_device(&devices, "1-3:2:no-serial").unwrap_err();

        assert!(err.to_string().contains("Disconnect extra devices"));
    }
}

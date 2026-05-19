#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum TransportDescriptor {
    Udp {
        label: &'static str,
        available: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        discovery_error: Option<&'static str>,
        validation: UdpValidation,
    },
    Tcp {
        label: &'static str,
        available: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        discovery_error: Option<&'static str>,
        validation: TcpValidation,
    },
    Serial {
        label: &'static str,
        available: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        discovery_error: Option<&'static str>,
        validation: SerialValidation,
        default_baud: u32,
    },
    BluetoothBle {
        label: &'static str,
        available: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        discovery_error: Option<&'static str>,
        validation: AddressValidation,
    },
    BluetoothSpp {
        label: &'static str,
        available: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        discovery_error: Option<&'static str>,
        validation: AddressValidation,
    },
    #[serde(rename = "websocket")]
    WebSocket {
        label: &'static str,
        available: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        discovery_error: Option<&'static str>,
        validation: UrlValidation,
    },
    WebSerial {
        label: &'static str,
        available: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        discovery_error: Option<&'static str>,
        validation: WebSerialValidation,
        default_baud: u32,
    },
    WebBluetooth {
        label: &'static str,
        available: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        discovery_error: Option<&'static str>,
        validation: WebBluetoothValidation,
        profile: BluetoothProfile,
    },
}

pub const DEFAULT_SERIAL_BAUD: u32 = 57_600;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TransportAvailability {
    pub available: bool,
    pub discovery_error: Option<&'static str>,
}

impl TransportAvailability {
    pub const fn available() -> Self {
        Self {
            available: true,
            discovery_error: None,
        }
    }

    pub const fn unavailable(discovery_error: &'static str) -> Self {
        Self {
            available: false,
            discovery_error: Some(discovery_error),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct NativeTransportOptions {
    pub udp: TransportAvailability,
    pub tcp: TransportAvailability,
    pub serial: Option<TransportAvailability>,
    pub bluetooth_ble: TransportAvailability,
    pub bluetooth_spp: Option<TransportAvailability>,
}

impl NativeTransportOptions {
    pub const fn desktop() -> Self {
        Self {
            udp: TransportAvailability::available(),
            tcp: TransportAvailability::available(),
            serial: Some(TransportAvailability::available()),
            bluetooth_ble: TransportAvailability::available(),
            bluetooth_spp: None,
        }
    }

    pub const fn android() -> Self {
        Self {
            udp: TransportAvailability::available(),
            tcp: TransportAvailability::available(),
            serial: None,
            bluetooth_ble: TransportAvailability::available(),
            bluetooth_spp: Some(TransportAvailability::available()),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WebTransportOptions {
    pub websocket: TransportAvailability,
    pub web_serial: TransportAvailability,
    pub web_bluetooth: TransportAvailability,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct UdpValidation {
    pub bind_addr_required: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct TcpValidation {
    pub address_required: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct SerialValidation {
    pub port_required: bool,
    pub baud_required: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct AddressValidation {
    pub address_required: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct UrlValidation {
    pub url_required: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct WebSerialValidation {
    pub chooser_required: bool,
    pub baud_required: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct WebBluetoothValidation {
    pub chooser_required: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BluetoothProfile {
    NordicUart,
}

impl TransportDescriptor {
    pub fn udp(availability: TransportAvailability) -> Self {
        Self::Udp {
            label: "UDP",
            available: availability.available,
            discovery_error: availability.discovery_error,
            validation: UdpValidation {
                bind_addr_required: true,
            },
        }
    }

    pub fn tcp(availability: TransportAvailability) -> Self {
        Self::Tcp {
            label: "TCP",
            available: availability.available,
            discovery_error: availability.discovery_error,
            validation: TcpValidation {
                address_required: true,
            },
        }
    }

    pub fn serial(availability: TransportAvailability) -> Self {
        Self::Serial {
            label: "Serial",
            available: availability.available,
            discovery_error: availability.discovery_error,
            validation: SerialValidation {
                port_required: true,
                baud_required: true,
            },
            default_baud: DEFAULT_SERIAL_BAUD,
        }
    }

    pub fn bluetooth_ble(availability: TransportAvailability) -> Self {
        Self::BluetoothBle {
            label: "BLE",
            available: availability.available,
            discovery_error: availability.discovery_error,
            validation: AddressValidation {
                address_required: true,
            },
        }
    }

    pub fn bluetooth_spp(availability: TransportAvailability) -> Self {
        Self::BluetoothSpp {
            label: "Classic BT",
            available: availability.available,
            discovery_error: availability.discovery_error,
            validation: AddressValidation {
                address_required: true,
            },
        }
    }

    pub fn websocket(availability: TransportAvailability) -> Self {
        Self::WebSocket {
            label: "WebSocket",
            available: availability.available,
            discovery_error: availability.discovery_error,
            validation: UrlValidation { url_required: true },
        }
    }

    pub fn web_serial(availability: TransportAvailability) -> Self {
        Self::WebSerial {
            label: "Web Serial",
            available: availability.available,
            discovery_error: availability.discovery_error,
            validation: WebSerialValidation {
                chooser_required: true,
                baud_required: true,
            },
            default_baud: DEFAULT_SERIAL_BAUD,
        }
    }

    pub fn web_bluetooth(availability: TransportAvailability) -> Self {
        Self::WebBluetooth {
            label: "Web Bluetooth",
            available: availability.available,
            discovery_error: availability.discovery_error,
            validation: WebBluetoothValidation {
                chooser_required: true,
            },
            profile: BluetoothProfile::NordicUart,
        }
    }
}

pub fn native_transport_descriptors(options: NativeTransportOptions) -> Vec<TransportDescriptor> {
    let mut transports = vec![
        TransportDescriptor::udp(options.udp),
        TransportDescriptor::tcp(options.tcp),
    ];

    if let Some(serial) = options.serial {
        transports.push(TransportDescriptor::serial(serial));
    }

    transports.push(TransportDescriptor::bluetooth_ble(options.bluetooth_ble));

    if let Some(bluetooth_spp) = options.bluetooth_spp {
        transports.push(TransportDescriptor::bluetooth_spp(bluetooth_spp));
    }

    transports
}

pub fn current_native_transport_descriptors() -> Vec<TransportDescriptor> {
    #[cfg(target_os = "android")]
    {
        native_transport_descriptors(NativeTransportOptions::android())
    }

    #[cfg(not(target_os = "android"))]
    {
        native_transport_descriptors(NativeTransportOptions::desktop())
    }
}

pub fn web_transport_descriptors(options: WebTransportOptions) -> Vec<TransportDescriptor> {
    vec![
        TransportDescriptor::websocket(options.websocket),
        TransportDescriptor::web_serial(options.web_serial),
        TransportDescriptor::web_bluetooth(options.web_bluetooth),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_desktop_transport_descriptors_match_runtime_contract() {
        let value = serde_json::to_value(native_transport_descriptors(
            NativeTransportOptions::desktop(),
        ))
        .expect("serialize native transports");

        assert_eq!(value[0]["kind"], "udp");
        assert_eq!(value[1]["kind"], "tcp");
        assert_eq!(value[2]["kind"], "serial");
        assert_eq!(value[2]["default_baud"], DEFAULT_SERIAL_BAUD);
        assert_eq!(value[3]["kind"], "bluetooth_ble");
        assert!(value[0].get("discovery_error").is_none());
    }

    #[test]
    fn web_transport_descriptors_carry_discovery_errors_when_unavailable() {
        let value = serde_json::to_value(web_transport_descriptors(WebTransportOptions {
            websocket: TransportAvailability::unavailable("WebSocket unavailable"),
            web_serial: TransportAvailability::available(),
            web_bluetooth: TransportAvailability::available(),
        }))
        .expect("serialize web transports");

        assert_eq!(value[0]["kind"], "websocket");
        assert_eq!(value[0]["available"], false);
        assert_eq!(value[0]["discovery_error"], "WebSocket unavailable");
    }
}

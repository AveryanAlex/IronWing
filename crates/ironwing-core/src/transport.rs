#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum TransportDescriptor {
    Udp {
        label: &'static str,
        available: bool,
        validation: UdpValidation,
    },
    Tcp {
        label: &'static str,
        available: bool,
        validation: TcpValidation,
    },
    Serial {
        label: &'static str,
        available: bool,
        validation: SerialValidation,
        default_baud: u32,
    },
    BluetoothBle {
        label: &'static str,
        available: bool,
        validation: AddressValidation,
    },
    BluetoothSpp {
        label: &'static str,
        available: bool,
        validation: AddressValidation,
    },
    WebSocket {
        label: &'static str,
        available: bool,
        validation: UrlValidation,
    },
    WebSerial {
        label: &'static str,
        available: bool,
        validation: WebSerialValidation,
        default_baud: u32,
    },
    WebBluetooth {
        label: &'static str,
        available: bool,
        validation: WebBluetoothValidation,
        profile: BluetoothProfile,
    },
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

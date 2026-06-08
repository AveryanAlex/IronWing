use crate::transport::BluetoothProfile;

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ConnectRequest {
    pub transport: ConnectTransport,
    #[serde(default)]
    pub auto_record_on_connect: bool,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DisconnectRequest {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ConnectTransport {
    Udp {
        bind_addr: String,
    },
    Tcp {
        address: String,
    },
    Serial {
        port: String,
        baud: u32,
    },
    BluetoothBle {
        address: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        profile: Option<BluetoothProfile>,
    },
    BluetoothSpp {
        address: String,
    },
    #[serde(rename = "websocket")]
    WebSocket {
        url: String,
    },
    WebSerial {
        baud: u32,
        port_id: String,
    },
    WebBluetooth {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        device_id: Option<String>,
        profile: BluetoothProfile,
    },
    Demo {
        vehicle_preset: DemoVehiclePreset,
    },
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DemoVehiclePreset {
    Quadcopter,
    Airplane,
    Quadplane,
}

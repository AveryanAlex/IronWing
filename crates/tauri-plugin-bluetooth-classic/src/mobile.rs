use serde::de::DeserializeOwned;
use tauri::{
    plugin::{PluginApi, PluginHandle},
    AppHandle, Runtime,
};

use crate::{BondedDevice, BondedDevicesResponse, ConnectArgs, SendArgs};

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "org.ardupilot.bluetooth.classic";

pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> Result<BluetoothClassic<R>, Box<dyn std::error::Error>> {
    #[cfg(target_os = "android")]
    let handle = api.register_android_plugin(PLUGIN_IDENTIFIER, "ClassicBluetoothPlugin")?;
    #[cfg(target_os = "ios")]
    let handle = {
        let _ = api;
        return Err("Classic Bluetooth is not supported on iOS".into());
    };
    Ok(BluetoothClassic(handle))
}

pub struct BluetoothClassic<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> BluetoothClassic<R> {
    pub fn request_bt_permissions(&self) -> Result<(), Box<dyn std::error::Error>> {
        self.0
            .run_mobile_plugin::<serde_json::Value>("requestBtPermissions", ())?;
        Ok(())
    }

    pub fn get_bonded_devices(&self) -> Result<Vec<BondedDevice>, Box<dyn std::error::Error>> {
        let resp: BondedDevicesResponse = self
            .0
            .run_mobile_plugin("getBondedDevices", ())?;
        Ok(resp.devices)
    }

    pub fn connect(&self, address: &str) -> Result<(), Box<dyn std::error::Error>> {
        self.0
            .run_mobile_plugin::<()>("connect", ConnectArgs { address: address.to_string() })?;
        Ok(())
    }

    pub fn disconnect(&self) -> Result<(), Box<dyn std::error::Error>> {
        self.0.run_mobile_plugin::<()>("disconnect", ())?;
        Ok(())
    }

    pub fn send(&self, data: &[u8]) -> Result<(), Box<dyn std::error::Error>> {
        self.0
            .run_mobile_plugin::<()>("send", SendArgs { data: data.to_vec() })?;
        Ok(())
    }
}

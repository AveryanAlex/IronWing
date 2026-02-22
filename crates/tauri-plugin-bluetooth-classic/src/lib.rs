use serde::{Deserialize, Serialize};
#[cfg(mobile)]
use tauri::Manager;
use tauri::{
    plugin::{Builder, TauriPlugin},
    Runtime,
};

#[cfg(mobile)]
mod mobile;

#[cfg(mobile)]
pub use mobile::BluetoothClassic;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BondedDevice {
    pub name: String,
    pub address: String,
}

#[cfg(mobile)]
#[derive(Debug, Clone, Serialize, Deserialize)]
struct ConnectArgs {
    address: String,
}

#[cfg(mobile)]
#[derive(Debug, Clone, Serialize, Deserialize)]
struct SendArgs {
    data: Vec<u8>,
}

#[cfg(mobile)]
#[derive(Debug, Clone, Serialize, Deserialize)]
struct BondedDevicesResponse {
    devices: Vec<BondedDevice>,
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
async fn request_bt_permissions<R: Runtime>(app: tauri::AppHandle<R>) -> Result<(), String> {
    #[cfg(mobile)]
    {
        let bt = app.state::<BluetoothClassic<R>>();
        bt.request_bt_permissions()
            .map_err(|e: Box<dyn std::error::Error>| e.to_string())?;
    }
    #[cfg(not(mobile))]
    {
        let _ = app;
    }
    Ok(())
}

#[tauri::command]
async fn get_bonded_devices<R: Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Vec<BondedDevice>, String> {
    #[cfg(mobile)]
    {
        let bt = app.state::<BluetoothClassic<R>>();
        bt.get_bonded_devices().map_err(|e| e.to_string())
    }
    #[cfg(not(mobile))]
    {
        let _ = app;
        Err("Classic Bluetooth is only available on Android".into())
    }
}

#[tauri::command]
async fn connect<R: Runtime>(app: tauri::AppHandle<R>, address: String) -> Result<(), String> {
    #[cfg(mobile)]
    {
        let bt = app.state::<BluetoothClassic<R>>();
        bt.connect(&address).map_err(|e| e.to_string())
    }
    #[cfg(not(mobile))]
    {
        let _ = (app, address);
        Err("Classic Bluetooth is only available on Android".into())
    }
}

#[tauri::command]
async fn disconnect<R: Runtime>(app: tauri::AppHandle<R>) -> Result<(), String> {
    #[cfg(mobile)]
    {
        let bt = app.state::<BluetoothClassic<R>>();
        bt.disconnect().map_err(|e| e.to_string())
    }
    #[cfg(not(mobile))]
    {
        let _ = app;
        Err("Classic Bluetooth is only available on Android".into())
    }
}

#[tauri::command]
async fn send<R: Runtime>(app: tauri::AppHandle<R>, data: Vec<u8>) -> Result<(), String> {
    #[cfg(mobile)]
    {
        let bt = app.state::<BluetoothClassic<R>>();
        bt.send(&data).map_err(|e| e.to_string())
    }
    #[cfg(not(mobile))]
    {
        let _ = (app, data);
        Err("Classic Bluetooth is only available on Android".into())
    }
}

// ---------------------------------------------------------------------------
// Plugin init
// ---------------------------------------------------------------------------

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("bluetooth-classic")
        .invoke_handler(tauri::generate_handler![
            request_bt_permissions,
            get_bonded_devices,
            connect,
            disconnect,
            send,
        ])
        .setup(|app, api| {
            #[cfg(mobile)]
            {
                let handle = mobile::init(app, api)?;
                app.manage(handle);
            }
            #[cfg(not(mobile))]
            {
                let _ = (app, api);
            }
            Ok(())
        })
        .build()
}

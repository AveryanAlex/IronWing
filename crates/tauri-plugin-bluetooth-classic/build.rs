const COMMANDS: &[&str] = &[
    "get_bonded_devices",
    "connect",
    "disconnect",
    "send",
    "request_bt_permissions",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .try_build()
        .expect("failed to build tauri-plugin-bluetooth-classic");
}

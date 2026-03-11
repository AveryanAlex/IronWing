use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use mavkit::{
    HomePosition, LinkState, MagCalProgress, MagCalReport, ParamProgress, ParamStore,
    SensorHealth, StatusMessage, Telemetry, TransferProgress, Vehicle, VehicleState,
};
use tauri::Emitter;

pub(crate) static TELEMETRY_INTERVAL_MS: AtomicU64 = AtomicU64::new(200);

pub(crate) fn spawn_event_bridges(app: &tauri::AppHandle, vehicle: &Vehicle) {
    // Telemetry — throttled by TELEMETRY_INTERVAL_MS (re-read each loop for live rate changes)
    {
        let mut rx = vehicle.telemetry();
        let handle = app.clone();
        tokio::spawn(async move {
            loop {
                let ms = TELEMETRY_INTERVAL_MS.load(Ordering::Relaxed);
                tokio::time::sleep(Duration::from_millis(ms)).await;
                match rx.has_changed() {
                    Ok(true) => {
                        let t: Telemetry = rx.borrow_and_update().clone();
                        let _ = handle.emit("telemetry://tick", &t);
                    }
                    Ok(false) => {}
                    Err(_) => break,
                }
            }
        });
    }

    // VehicleState
    {
        let mut rx = vehicle.state();
        let handle = app.clone();
        tokio::spawn(async move {
            while rx.changed().await.is_ok() {
                let s: VehicleState = rx.borrow().clone();
                let _ = handle.emit("vehicle://state", &s);
            }
        });
    }

    // HomePosition
    {
        let mut rx = vehicle.home_position();
        let handle = app.clone();
        tokio::spawn(async move {
            while rx.changed().await.is_ok() {
                let hp: Option<HomePosition> = rx.borrow().clone();
                if let Some(hp) = hp {
                    let _ = handle.emit("home://position", &hp);
                }
            }
        });
    }

    // MissionState
    {
        let mut rx = vehicle.mission_state();
        let handle = app.clone();
        tokio::spawn(async move {
            while rx.changed().await.is_ok() {
                let ms = rx.borrow().clone();
                let _ = handle.emit("mission.state", &ms);
            }
        });
    }

    // LinkState
    {
        let mut rx = vehicle.link_state();
        let handle = app.clone();
        tokio::spawn(async move {
            while rx.changed().await.is_ok() {
                let ls: LinkState = rx.borrow().clone();
                let _ = handle.emit("link://state", &ls);
            }
        });
    }

    // MissionProgress
    {
        let mut rx = vehicle.mission_progress();
        let handle = app.clone();
        tokio::spawn(async move {
            while rx.changed().await.is_ok() {
                let mp: Option<TransferProgress> = rx.borrow().clone();
                if let Some(mp) = mp {
                    let _ = handle.emit("mission.progress", &mp);
                }
            }
        });
    }

    // ParamStore
    {
        let mut rx = vehicle.param_store();
        let handle = app.clone();
        tokio::spawn(async move {
            while rx.changed().await.is_ok() {
                let ps: ParamStore = rx.borrow().clone();
                let _ = handle.emit("param://store", &ps);
            }
        });
    }

    // ParamProgress
    {
        let mut rx = vehicle.param_progress();
        let handle = app.clone();
        tokio::spawn(async move {
            while rx.changed().await.is_ok() {
                let pp: ParamProgress = rx.borrow().clone();
                let _ = handle.emit("param://progress", &pp);
            }
        });
    }

    // StatusText
    {
        let mut rx = vehicle.statustext();
        let handle = app.clone();
        tokio::spawn(async move {
            while rx.changed().await.is_ok() {
                let msg: Option<StatusMessage> = rx.borrow().clone();
                if let Some(msg) = msg {
                    let _ = handle.emit("statustext://message", &msg);
                }
            }
        });
    }

    // SensorHealth
    {
        let mut rx = vehicle.sensor_health();
        let handle = app.clone();
        tokio::spawn(async move {
            while rx.changed().await.is_ok() {
                let val: SensorHealth = rx.borrow_and_update().clone();
                let _ = handle.emit("sensor://health", &val);
            }
        });
    }

    // MagCalProgress
    {
        let mut rx = vehicle.mag_cal_progress();
        let handle = app.clone();
        tokio::spawn(async move {
            while rx.changed().await.is_ok() {
                let val: Option<MagCalProgress> = rx.borrow_and_update().clone();
                if let Some(ref val) = val {
                    let _ = handle.emit("compass://cal_progress", val);
                }
            }
        });
    }

    // MagCalReport
    {
        let mut rx = vehicle.mag_cal_report();
        let handle = app.clone();
        tokio::spawn(async move {
            while rx.changed().await.is_ok() {
                let val: Option<MagCalReport> = rx.borrow_and_update().clone();
                if let Some(ref val) = val {
                    let _ = handle.emit("compass://cal_report", val);
                }
            }
        });
    }
}

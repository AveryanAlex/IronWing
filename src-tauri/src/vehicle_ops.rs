//! Parameter operation entry points shared by IPC and MCP.
//! MAVKit owns protocol exclusion and updates the shared confirmed parameter cache.
pub(crate) fn begin_download(vehicle: &mavkit::Vehicle) -> Result<mavkit::ParamDownloadOp, String> {
    vehicle.params().download_all().map_err(|e| e.to_string())
}
pub(crate) fn begin_write(
    vehicle: &mavkit::Vehicle,
    params: Vec<(String, f32)>,
) -> Result<mavkit::ParamWriteBatchOp, String> {
    vehicle
        .params()
        .write_batch(params)
        .map_err(|e| e.to_string())
}
#[cfg(not(target_os = "android"))]
pub(crate) async fn download_parameters(
    vehicle: &mavkit::Vehicle,
) -> Result<mavkit::ParamStore, String> {
    begin_download(vehicle)?
        .wait()
        .await
        .map_err(|e| e.to_string())
}
#[cfg(not(target_os = "android"))]
pub(crate) async fn write_parameters(
    vehicle: &mavkit::Vehicle,
    params: Vec<(String, f32)>,
) -> Result<Vec<mavkit::ParamWriteResult>, String> {
    begin_write(vehicle, params)?
        .wait()
        .await
        .map_err(|e| e.to_string())
}

#[cfg(all(test, not(target_os = "android")))]
mod tests {
    use super::*;
    #[tokio::test]
    async fn parameter_batch_updates_shared_sdk_cache_after_confirmation() {
        let (vehicle, demo) = mavkit::sim::DemoVehicle::connect(mavkit::VehicleConfig::default())
            .await
            .unwrap();
        let store = download_parameters(&vehicle).await.unwrap();
        let params: Vec<_> = store
            .iter()
            .take(2)
            .map(|(id, p)| (id.clone(), p.value))
            .collect();
        assert_eq!(params.len(), 2);
        let written = write_parameters(&vehicle, params).await.unwrap();
        for result in written {
            assert!(result.success);
            assert_eq!(
                vehicle.params().get(&result.name).unwrap().value,
                result.confirmed_value
            );
        }
        vehicle.disconnect().await.unwrap();
        let _ = demo.shutdown().await;
    }
}

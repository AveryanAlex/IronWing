use crate::AppState;
use tokio::sync::MappedMutexGuard;

pub(crate) async fn with_vehicle(
    state: &AppState,
) -> Result<MappedMutexGuard<'_, mavkit::Vehicle>, String> {
    let guard = state.vehicle.lock().await;
    tokio::sync::MutexGuard::try_map(guard, |opt| opt.as_mut())
        .map_err(|_| "not connected".to_string())
}

// TODO(T4): enable once `LogStore` is moved into `logs.rs`.
// pub(crate) async fn with_log_store(
//     state: &AppState,
// ) -> Result<MappedMutexGuard<'_, crate::logs::LogStore>, String> {
//     let guard = state.log_store.lock().await;
//     tokio::sync::MutexGuard::try_map(guard, |opt| opt.as_mut())
//         .map_err(|_| "no log loaded".to_string())
// }

pub(crate) fn downsample<T: Clone>(items: Vec<T>, max: usize) -> Vec<T> {
    if max == 0 || items.len() <= max {
        return items;
    }

    let step = items.len() as f64 / max as f64;
    let mut sampled = Vec::with_capacity(max);
    let mut i = 0.0_f64;

    while (i as usize) < items.len() && sampled.len() < max {
        sampled.push(items[i as usize].clone());
        i += step;
    }

    sampled
}

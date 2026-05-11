use crate::AppState;
use crate::ipc::{OperationFailure, OperationId, Reason, ReasonKind, SourceKind};
use tokio::sync::MappedMutexGuard;

pub(crate) async fn with_vehicle(
    state: &AppState,
) -> Result<MappedMutexGuard<'_, mavkit::Vehicle>, String> {
    let guard = state.vehicle.lock().await;
    tokio::sync::MutexGuard::try_map(guard, |opt| opt.as_mut())
        .map_err(|_| "not connected".to_string())
}

pub(crate) async fn with_log_store(
    state: &AppState,
) -> Result<MappedMutexGuard<'_, crate::logs::LogStore>, String> {
    let guard = state.log_store.lock().await;
    tokio::sync::MutexGuard::try_map(guard, |opt| opt.as_mut())
        .map_err(|_| "no log loaded".to_string())
}

pub(crate) async fn ensure_live_write_allowed(
    state: &AppState,
    operation_id: OperationId,
) -> Result<(), String> {
    let source_kind = state.session_runtime.lock().await.effective_source_kind();
    if source_kind == SourceKind::Playback {
        return Err(operation_failure_json(OperationFailure {
            operation_id,
            reason: Reason {
                kind: ReasonKind::PermissionDenied,
                message:
                    "replay is read-only while playback is the effective source; switch back to the live source to send vehicle commands"
                        .to_string(),
            },
        }));
    }

    Ok(())
}

pub(crate) fn operation_failure_json(failure: OperationFailure) -> String {
    match serde_json::to_string(&failure) {
        Ok(json) => json,
        Err(_) => failure.reason.message,
    }
}

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn downsample_empty_input() {
        let result: Vec<i32> = downsample(vec![], 10);
        assert!(result.is_empty());
    }

    #[test]
    fn downsample_smaller_than_max() {
        let result = downsample(vec![1, 2, 3], 10);
        assert_eq!(result, vec![1, 2, 3]);
    }

    #[test]
    fn downsample_equal_to_max() {
        let result = downsample(vec![1, 2, 3, 4, 5], 5);
        assert_eq!(result, vec![1, 2, 3, 4, 5]);
    }

    #[test]
    fn downsample_larger_than_max() {
        let items: Vec<i32> = (0..100).collect();
        let result = downsample(items, 10);
        assert_eq!(result, vec![0, 10, 20, 30, 40, 50, 60, 70, 80, 90]);
    }

    #[test]
    fn downsample_non_divisible_ratio_preserves_sampling_order() {
        let items: Vec<i32> = (0..50).collect();
        let result = downsample(items, 7);
        assert_eq!(result, vec![0, 7, 14, 21, 28, 35, 42]);
    }

    #[test]
    fn downsample_to_single_item_keeps_first_element() {
        let items: Vec<i32> = (10..20).collect();
        let result = downsample(items, 1);
        assert_eq!(result, vec![10]);
    }

    #[test]
    fn downsample_max_zero() {
        let result = downsample(vec![1, 2, 3], 0);
        assert_eq!(result, vec![1, 2, 3]);
    }

    #[test]
    fn downsample_single_element() {
        let result = downsample(vec![42], 5);
        assert_eq!(result, vec![42]);
    }
}

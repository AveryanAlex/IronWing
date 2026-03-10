use crate::AppState;
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
        assert_eq!(result.len(), 10);
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

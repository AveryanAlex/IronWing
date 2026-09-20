use ironwing_core::event_names;
use ironwing_core::ipc::{
    ParamApplyOutcome, ParamEditOrigin, ParamStageChange, ParamStagingState, StagedParamEdit,
};
use ironwing_core::live_runtime::emit_scoped;

use crate::AppState;
use crate::helpers::with_vehicle;

fn with_state<R>(app_state: &AppState, update: impl FnOnce(&mut ParamStagingState) -> R) -> R {
    let mut staging = app_state
        .param_staging
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    update(&mut staging)
}

fn emit(app_state: &AppState, state: ParamStagingState) {
    emit_scoped(&app_state.live_runtime, event_names::PARAM_STAGING, state);
}

pub(crate) fn snapshot(app_state: &AppState) -> ParamStagingState {
    with_state(app_state, |state| state.clone())
}

pub(crate) fn reset(app_state: &AppState) {
    with_state(app_state, ParamStagingState::reset);
}

pub(crate) fn clear_reboot_checkpoint(app_state: &AppState) -> ParamStagingState {
    let state = with_state(app_state, |state| {
        state.clear_reboot_checkpoint();
        state.clone()
    });
    emit(app_state, state.clone());
    state
}

pub(crate) async fn stage(
    app_state: &AppState,
    changes: Vec<ParamStageChange>,
    origin: ParamEditOrigin,
    expected_revision: Option<u32>,
) -> Result<ParamStagingState, String> {
    let vehicle = with_vehicle(app_state).await?;
    let store = vehicle
        .params()
        .latest()
        .and_then(|snapshot| snapshot.store)
        .ok_or_else(|| "parameters must be downloaded before staging changes".to_string())?;
    let state = with_state(app_state, |state| {
        state
            .stage(&store, &changes, origin, expected_revision)
            .map(|()| state.clone())
            .map_err(|error| error.to_string())
    })?;
    emit(app_state, state.clone());
    Ok(state)
}

pub(crate) fn discard(
    app_state: &AppState,
    names: &[String],
    expected_revision: Option<u32>,
) -> Result<ParamStagingState, String> {
    let state = with_state(app_state, |state| {
        state
            .discard(names, expected_revision)
            .map(|()| state.clone())
            .map_err(|error| error.to_string())
    })?;
    emit(app_state, state.clone());
    Ok(state)
}

pub(crate) fn clear(
    app_state: &AppState,
    expected_revision: Option<u32>,
) -> Result<ParamStagingState, String> {
    let state = with_state(app_state, |state| {
        state
            .clear(expected_revision)
            .map(|()| state.clone())
            .map_err(|error| error.to_string())
    })?;
    emit(app_state, state.clone());
    Ok(state)
}

pub(crate) async fn apply(
    app_state: &AppState,
    names: Option<Vec<String>>,
    expected_revision: Option<u32>,
) -> Result<ParamApplyOutcome, String> {
    let vehicle = with_vehicle(app_state).await?;
    let requested = with_state(app_state, |state| {
        state
            .begin_apply(names.as_deref(), expected_revision)
            .map_err(|error| error.to_string())
    })?;
    emit(app_state, snapshot(app_state));

    let params = requested
        .iter()
        .map(|edit| (edit.name.clone(), edit.staged_value))
        .collect();
    let handle = match crate::vehicle_ops::begin_write(&vehicle, params) {
        Ok(handle) => handle,
        Err(error) => return fail_apply(app_state, &requested, error),
    };
    let mut progress = handle.subscribe();
    let runtime = app_state.live_runtime.clone();
    let bridge = tokio::spawn(async move {
        while let Some(update) = progress.recv().await {
            emit_scoped(&runtime, event_names::PARAM_PROGRESS, update);
        }
    });
    drop(bridge);

    match handle.wait().await {
        Ok(results) => {
            let outcome = with_state(app_state, |state| state.finish_apply(&requested, results));
            emit(app_state, outcome.state.clone());
            Ok(outcome)
        }
        Err(error) => fail_apply(app_state, &requested, error.to_string()),
    }
}

fn fail_apply(
    app_state: &AppState,
    requested: &[StagedParamEdit],
    message: String,
) -> Result<ParamApplyOutcome, String> {
    let state = with_state(app_state, |state| {
        state.fail_apply(requested, &message);
        state.clone()
    });
    emit(app_state, state);
    Err(message)
}

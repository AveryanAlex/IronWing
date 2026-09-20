use std::collections::{BTreeSet, HashSet};
use std::fmt;

use mavkit::{ParamStore, ParamWriteResult};

pub const FACTORY_RESET_PARAMETER_NAME: &str = "FORMAT_VERSION";

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ParamEditOrigin {
    Ui,
    Agent,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ParamApplyPhase {
    #[default]
    Idle,
    Applying,
    PartialFailure,
    Failed,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct ParamStageChange {
    pub name: String,
    pub value: f32,
    pub reboot_required: Option<bool>,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct StagedParamEdit {
    pub name: String,
    pub base_value: f32,
    pub staged_value: f32,
    pub reboot_required: Option<bool>,
    pub origin: ParamEditOrigin,
    pub failure: Option<String>,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Default, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct ParamStagingState {
    pub revision: u32,
    pub edits: Vec<StagedParamEdit>,
    pub apply_phase: ParamApplyPhase,
    pub pending_reboot_ids: Vec<String>,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct ParamApplyOutcome {
    pub state: ParamStagingState,
    pub results: Vec<ParamWriteResult>,
    pub reboot_required: bool,
    pub reboot_required_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ParamStagingError {
    RevisionConflict { expected: u32, actual: u32 },
    ApplyInProgress,
    RebootRequired,
    EmptyChanges,
    InvalidChange(String),
    ParameterNotFound(String),
    StagedParameterNotFound(String),
    NoStagedChanges,
}

impl fmt::Display for ParamStagingError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::RevisionConflict { expected, actual } => {
                write!(formatter, "staging revision conflict: expected {expected}, current {actual}")
            }
            Self::ApplyInProgress => formatter.write_str("parameter apply already in progress"),
            Self::RebootRequired => formatter.write_str(
                "reboot-required parameter changes were already applied; reboot or reset the checkpoint before staging more changes",
            ),
            Self::EmptyChanges => formatter.write_str("at least one parameter change is required"),
            Self::InvalidChange(name) => write!(formatter, "invalid parameter change for {name}"),
            Self::ParameterNotFound(name) => write!(formatter, "parameter not found: {name}"),
            Self::StagedParameterNotFound(name) => {
                write!(formatter, "staged parameter not found: {name}")
            }
            Self::NoStagedChanges => formatter.write_str("no matching staged parameter changes"),
        }
    }
}

impl std::error::Error for ParamStagingError {}

impl ParamStagingState {
    pub fn stage(
        &mut self,
        store: &ParamStore,
        changes: &[ParamStageChange],
        origin: ParamEditOrigin,
        expected_revision: Option<u32>,
    ) -> Result<(), ParamStagingError> {
        self.guard_mutation(expected_revision)?;
        if changes.is_empty() {
            return Err(ParamStagingError::EmptyChanges);
        }

        let mut names = HashSet::new();
        for change in changes {
            if change.name.is_empty()
                || change.name.len() > 16
                || !change.name.is_ascii()
                || !change.value.is_finite()
                || !names.insert(change.name.as_str())
            {
                return Err(ParamStagingError::InvalidChange(change.name.clone()));
            }
            if store.get(&change.name).is_none() {
                return Err(ParamStagingError::ParameterNotFound(change.name.clone()));
            }
        }

        let mut next = self.clone();
        for change in changes {
            let current_value = store
                .get(&change.name)
                .ok_or_else(|| ParamStagingError::ParameterNotFound(change.name.clone()))?
                .value;
            if let Some(index) = next.edits.iter().position(|edit| edit.name == change.name) {
                let base_value = next.edits[index].base_value;
                let reboot_required = change.reboot_required.or(next.edits[index].reboot_required);
                if change.value == base_value {
                    next.edits.remove(index);
                } else {
                    next.edits[index] = StagedParamEdit {
                        name: change.name.clone(),
                        base_value,
                        staged_value: change.value,
                        reboot_required,
                        origin,
                        failure: None,
                    };
                }
            } else if change.value != current_value {
                next.edits.push(StagedParamEdit {
                    name: change.name.clone(),
                    base_value: current_value,
                    staged_value: change.value,
                    reboot_required: change.reboot_required,
                    origin,
                    failure: None,
                });
            }
        }
        next.edits.sort_by(|left, right| left.name.cmp(&right.name));
        next.apply_phase = ParamApplyPhase::Idle;
        if next != *self {
            next.revision = self.revision.saturating_add(1);
            *self = next;
        }
        Ok(())
    }

    pub fn discard(
        &mut self,
        names: &[String],
        expected_revision: Option<u32>,
    ) -> Result<(), ParamStagingError> {
        self.guard_mutation(expected_revision)?;
        if names.is_empty() {
            return Err(ParamStagingError::EmptyChanges);
        }
        if let Some(name) = names
            .iter()
            .find(|name| !self.edits.iter().any(|edit| edit.name == name.as_str()))
        {
            return Err(ParamStagingError::StagedParameterNotFound((*name).clone()));
        }
        let names: HashSet<_> = names.iter().collect();
        let previous_len = self.edits.len();
        self.edits.retain(|edit| !names.contains(&edit.name));
        if self.edits.len() == previous_len {
            return Err(ParamStagingError::NoStagedChanges);
        }
        self.apply_phase = ParamApplyPhase::Idle;
        self.revision = self.revision.saturating_add(1);
        Ok(())
    }

    pub fn clear(&mut self, expected_revision: Option<u32>) -> Result<(), ParamStagingError> {
        self.guard_mutation(expected_revision)?;
        if self.edits.is_empty() {
            return Ok(());
        }
        self.edits.clear();
        self.apply_phase = ParamApplyPhase::Idle;
        self.revision = self.revision.saturating_add(1);
        Ok(())
    }

    pub fn begin_apply(
        &mut self,
        names: Option<&[String]>,
        expected_revision: Option<u32>,
    ) -> Result<Vec<StagedParamEdit>, ParamStagingError> {
        self.guard_mutation(expected_revision)?;
        let selected: Vec<_> = match names {
            Some(names) if !names.is_empty() => {
                if let Some(name) = names
                    .iter()
                    .find(|name| !self.edits.iter().any(|edit| edit.name == name.as_str()))
                {
                    return Err(ParamStagingError::StagedParameterNotFound((*name).clone()));
                }
                let names: HashSet<_> = names.iter().collect();
                self.edits
                    .iter()
                    .filter(|edit| names.contains(&edit.name))
                    .cloned()
                    .collect()
            }
            _ => self.edits.clone(),
        };
        if selected.is_empty() {
            return Err(ParamStagingError::NoStagedChanges);
        }
        self.apply_phase = ParamApplyPhase::Applying;
        self.revision = self.revision.saturating_add(1);
        Ok(selected)
    }

    pub fn finish_apply(
        &mut self,
        requested: &[StagedParamEdit],
        results: Vec<ParamWriteResult>,
    ) -> ParamApplyOutcome {
        let mut successful_names = HashSet::new();
        let mut failed_names = HashSet::new();
        for result in &results {
            if result.success {
                successful_names.insert(result.name.as_str());
            } else {
                failed_names.insert(result.name.as_str());
            }
        }

        let requested_names: HashSet<_> = requested.iter().map(|edit| edit.name.as_str()).collect();
        let mut reboot_required_ids = BTreeSet::new();
        self.edits.retain_mut(|edit| {
            if !requested_names.contains(edit.name.as_str()) {
                return true;
            }
            if successful_names.contains(edit.name.as_str()) {
                if edit.reboot_required == Some(true) && edit.name != FACTORY_RESET_PARAMETER_NAME {
                    reboot_required_ids.insert(edit.name.clone());
                }
                return false;
            }
            edit.failure = Some(if failed_names.contains(edit.name.as_str()) {
                "vehicle_did_not_confirm_requested_value".into()
            } else {
                "vehicle_did_not_return_a_result".into()
            });
            true
        });

        self.pending_reboot_ids
            .extend(reboot_required_ids.iter().cloned());
        self.pending_reboot_ids.sort();
        self.pending_reboot_ids.dedup();
        let failed_count = requested
            .iter()
            .filter(|edit| !successful_names.contains(edit.name.as_str()))
            .count();
        self.apply_phase = if failed_count == 0 {
            ParamApplyPhase::Idle
        } else if failed_count == requested.len() {
            ParamApplyPhase::Failed
        } else {
            ParamApplyPhase::PartialFailure
        };
        self.revision = self.revision.saturating_add(1);

        let reboot_required_ids: Vec<_> = reboot_required_ids.into_iter().collect();
        ParamApplyOutcome {
            state: self.clone(),
            results,
            reboot_required: !reboot_required_ids.is_empty(),
            reboot_required_ids,
        }
    }

    pub fn fail_apply(&mut self, requested: &[StagedParamEdit], message: &str) {
        let requested_names: HashSet<_> = requested.iter().map(|edit| edit.name.as_str()).collect();
        for edit in &mut self.edits {
            if requested_names.contains(edit.name.as_str()) {
                edit.failure = Some(message.to_string());
            }
        }
        self.apply_phase = ParamApplyPhase::Failed;
        self.revision = self.revision.saturating_add(1);
    }

    pub fn clear_reboot_checkpoint(&mut self) {
        if self.pending_reboot_ids.is_empty() {
            return;
        }
        self.pending_reboot_ids.clear();
        self.revision = self.revision.saturating_add(1);
    }

    pub fn reset(&mut self) {
        let next_revision = self.revision.saturating_add(1);
        *self = Self {
            revision: next_revision,
            ..Self::default()
        };
    }

    fn guard_mutation(&self, expected_revision: Option<u32>) -> Result<(), ParamStagingError> {
        if let Some(expected) = expected_revision
            && expected != self.revision
        {
            return Err(ParamStagingError::RevisionConflict {
                expected,
                actual: self.revision,
            });
        }
        if self.apply_phase == ParamApplyPhase::Applying {
            return Err(ParamStagingError::ApplyInProgress);
        }
        if !self.pending_reboot_ids.is_empty() {
            return Err(ParamStagingError::RebootRequired);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn store() -> ParamStore {
        let mut store = ParamStore::default();
        for (index, (name, value)) in [("A", 1.0), ("B", 2.0)].into_iter().enumerate() {
            store.params.insert(
                name.into(),
                mavkit::Param {
                    name: name.into(),
                    value,
                    param_type: mavkit::ParamType::Real32,
                    index: index as u16,
                },
            );
        }
        store
    }

    #[test]
    fn stage_preserves_the_original_base_value_when_the_same_edit_changes() {
        let mut state = ParamStagingState::default();
        state
            .stage(
                &store(),
                &[ParamStageChange {
                    name: "A".into(),
                    value: 3.0,
                    reboot_required: Some(true),
                }],
                ParamEditOrigin::Agent,
                Some(0),
            )
            .unwrap();
        state
            .stage(
                &store(),
                &[ParamStageChange {
                    name: "A".into(),
                    value: 4.0,
                    reboot_required: None,
                }],
                ParamEditOrigin::Ui,
                Some(1),
            )
            .unwrap();

        assert_eq!(
            state.edits,
            vec![StagedParamEdit {
                name: "A".into(),
                base_value: 1.0,
                staged_value: 4.0,
                reboot_required: Some(true),
                origin: ParamEditOrigin::Ui,
                failure: None,
            }]
        );
    }

    #[test]
    fn stale_revision_is_rejected_without_mutating_the_change_set() {
        let mut state = ParamStagingState::default();
        let error = state
            .stage(
                &store(),
                &[ParamStageChange {
                    name: "A".into(),
                    value: 3.0,
                    reboot_required: None,
                }],
                ParamEditOrigin::Agent,
                Some(9),
            )
            .unwrap_err();

        assert_eq!(
            error,
            ParamStagingError::RevisionConflict {
                expected: 9,
                actual: 0
            }
        );
        assert!(state.edits.is_empty());
    }

    #[test]
    fn successful_apply_removes_edits_and_creates_a_reboot_checkpoint() {
        let mut state = ParamStagingState::default();
        state
            .stage(
                &store(),
                &[ParamStageChange {
                    name: "A".into(),
                    value: 3.0,
                    reboot_required: Some(true),
                }],
                ParamEditOrigin::Agent,
                None,
            )
            .unwrap();
        let requested = state.begin_apply(None, Some(1)).unwrap();
        let outcome = state.finish_apply(
            &requested,
            vec![ParamWriteResult {
                name: "A".into(),
                requested_value: 3.0,
                confirmed_value: 3.0,
                success: true,
            }],
        );

        assert!(outcome.state.edits.is_empty());
        assert_eq!(outcome.state.pending_reboot_ids, vec!["A"]);
        assert_eq!(outcome.reboot_required_ids, vec!["A"]);
    }

    #[test]
    fn failed_apply_keeps_the_edit_for_review_and_retry() {
        let mut state = ParamStagingState::default();
        state
            .stage(
                &store(),
                &[ParamStageChange {
                    name: "B".into(),
                    value: 5.0,
                    reboot_required: Some(false),
                }],
                ParamEditOrigin::Ui,
                None,
            )
            .unwrap();
        let requested = state.begin_apply(None, None).unwrap();
        state.finish_apply(
            &requested,
            vec![ParamWriteResult {
                name: "B".into(),
                requested_value: 5.0,
                confirmed_value: 2.0,
                success: false,
            }],
        );

        assert_eq!(state.apply_phase, ParamApplyPhase::Failed);
        assert_eq!(
            state.edits[0].failure.as_deref(),
            Some("vehicle_did_not_confirm_requested_value")
        );
    }

    #[test]
    fn applying_an_unknown_staged_id_is_rejected_without_starting_apply() {
        let mut state = ParamStagingState::default();
        state
            .stage(
                &store(),
                &[ParamStageChange {
                    name: "A".into(),
                    value: 3.0,
                    reboot_required: Some(false),
                }],
                ParamEditOrigin::Agent,
                None,
            )
            .unwrap();

        let error = state
            .begin_apply(Some(&["B".into()]), Some(state.revision))
            .unwrap_err();

        assert_eq!(
            error,
            ParamStagingError::StagedParameterNotFound("B".into())
        );
        assert_eq!(state.apply_phase, ParamApplyPhase::Idle);
        assert_eq!(state.edits.len(), 1);
    }
}

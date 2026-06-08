use mavkit::ardupilot::{MagCalProgress, MagCalReport, MagCalStatus};

use crate::ipc::{DomainProvenance, DomainValue};

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CalibrationLifecycle {
    NotStarted,
    Running,
    Complete,
    Failed,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct CalibrationStep {
    pub lifecycle: CalibrationLifecycle,
    pub progress: Option<MagCalProgress>,
    pub report: Option<MagCalReport>,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct CalibrationState {
    pub accel: Option<CalibrationStep>,
    pub compass: Option<CalibrationStep>,
    pub radio: Option<CalibrationStep>,
}

pub type CalibrationSnapshot = DomainValue<CalibrationState>;

#[derive(Debug, Clone, Default)]
pub struct CalibrationSources {
    mag_progress: Option<MagCalProgress>,
    mag_report: Option<MagCalReport>,
}

impl CalibrationSources {
    pub fn update_mag_progress(&mut self, mag_progress: Option<MagCalProgress>) {
        self.mag_progress = mag_progress;
    }

    #[allow(dead_code)]
    pub fn update_mag_report(&mut self, mag_report: Option<MagCalReport>) {
        self.mag_report = mag_report;
    }

    pub fn snapshot(&self, provenance: DomainProvenance) -> CalibrationSnapshot {
        calibration_snapshot_from_sources(
            self.mag_progress.as_ref(),
            self.mag_report.as_ref(),
            provenance,
        )
    }
}

fn running_compass_status(progress: Option<&MagCalProgress>) -> bool {
    matches!(
        progress.map(|progress| progress.status),
        Some(
            MagCalStatus::WaitingToStart
                | MagCalStatus::RunningStepOne
                | MagCalStatus::RunningStepTwo
        )
    )
}

fn compass_lifecycle(
    progress: Option<&MagCalProgress>,
    report: Option<&MagCalReport>,
) -> CalibrationLifecycle {
    if matches!(report.map(|item| item.status), Some(MagCalStatus::Success)) {
        return CalibrationLifecycle::Complete;
    }
    if running_compass_status(progress) {
        return CalibrationLifecycle::Running;
    }
    matches!(
        report.map(|item| item.status),
        Some(MagCalStatus::Failed | MagCalStatus::BadOrientation | MagCalStatus::BadRadius)
    )
    .then_some(CalibrationLifecycle::Failed)
    .unwrap_or(CalibrationLifecycle::NotStarted)
}

pub fn calibration_state_from_sources(
    mag_progress: Option<&MagCalProgress>,
    mag_report: Option<&MagCalReport>,
) -> CalibrationState {
    CalibrationState {
        accel: None,
        compass: Some(CalibrationStep {
            lifecycle: compass_lifecycle(mag_progress, mag_report),
            progress: mag_progress.cloned(),
            report: mag_report.cloned(),
        }),
        radio: None,
    }
}

pub fn calibration_snapshot_from_sources(
    mag_progress: Option<&MagCalProgress>,
    mag_report: Option<&MagCalReport>,
    provenance: DomainProvenance,
) -> CalibrationSnapshot {
    let state = calibration_state_from_sources(mag_progress, mag_report);
    let complete = matches!(
        state.accel.as_ref().map(|step| &step.lifecycle),
        Some(CalibrationLifecycle::Complete)
    ) && matches!(
        state.compass.as_ref().map(|step| &step.lifecycle),
        Some(CalibrationLifecycle::Complete)
    ) && matches!(
        state.radio.as_ref().map(|step| &step.lifecycle),
        Some(CalibrationLifecycle::Complete)
    );

    DomainValue {
        available: true,
        complete,
        provenance,
        value: Some(state),
    }
}

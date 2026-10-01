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
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AccelCalibrationPosition {
    Level,
    Left,
    Right,
    NoseDown,
    NoseUp,
    Back,
}

impl AccelCalibrationPosition {
    pub const fn wire_value(self) -> u32 {
        match self {
            Self::Level => 1,
            Self::Left => 2,
            Self::Right => 3,
            Self::NoseDown => 4,
            Self::NoseUp => 5,
            Self::Back => 6,
        }
    }

    pub const fn from_wire_value(value: u32) -> Option<Self> {
        match value {
            1 => Some(Self::Level),
            2 => Some(Self::Left),
            3 => Some(Self::Right),
            4 => Some(Self::NoseDown),
            5 => Some(Self::NoseUp),
            6 => Some(Self::Back),
            _ => None,
        }
    }
}

impl std::str::FromStr for AccelCalibrationPosition {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "level" => Ok(Self::Level),
            "left" => Ok(Self::Left),
            "right" => Ok(Self::Right),
            "nose_down" => Ok(Self::NoseDown),
            "nose_up" => Ok(Self::NoseUp),
            "back" => Ok(Self::Back),
            _ => Err(format!(
                "unknown accelerometer calibration position: {value}"
            )),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AccelCalibrationUpdate {
    Position(AccelCalibrationPosition),
    Complete,
    Failed,
}

impl AccelCalibrationUpdate {
    pub const fn from_wire_value(value: u32) -> Option<Self> {
        match value {
            16_777_215 => Some(Self::Complete),
            16_777_216 => Some(Self::Failed),
            value => match AccelCalibrationPosition::from_wire_value(value) {
                Some(position) => Some(Self::Position(position)),
                None => None,
            },
        }
    }
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct CalibrationStep {
    pub lifecycle: CalibrationLifecycle,
    pub requested_position: Option<AccelCalibrationPosition>,
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
    accel: Option<CalibrationStep>,
    mag_progress: Option<MagCalProgress>,
    mag_report: Option<MagCalReport>,
}

impl CalibrationSources {
    pub fn update_accel(&mut self, update: AccelCalibrationUpdate) {
        self.accel = Some(match update {
            AccelCalibrationUpdate::Position(position) => CalibrationStep {
                lifecycle: CalibrationLifecycle::Running,
                requested_position: Some(position),
                progress: None,
                report: None,
            },
            AccelCalibrationUpdate::Complete => CalibrationStep {
                lifecycle: CalibrationLifecycle::Complete,
                requested_position: None,
                progress: None,
                report: None,
            },
            AccelCalibrationUpdate::Failed => CalibrationStep {
                lifecycle: CalibrationLifecycle::Failed,
                requested_position: None,
                progress: None,
                report: None,
            },
        });
    }

    pub fn update_mag_progress(&mut self, mag_progress: Option<MagCalProgress>) {
        self.mag_progress = mag_progress;
    }

    #[allow(dead_code)]
    pub fn update_mag_report(&mut self, mag_report: Option<MagCalReport>) {
        self.mag_report = mag_report;
    }

    pub fn snapshot(&self, provenance: DomainProvenance) -> CalibrationSnapshot {
        calibration_snapshot_from_state(
            calibration_state_from_sources(
                self.accel.clone(),
                self.mag_progress.as_ref(),
                self.mag_report.as_ref(),
            ),
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
    accel: Option<CalibrationStep>,
    mag_progress: Option<&MagCalProgress>,
    mag_report: Option<&MagCalReport>,
) -> CalibrationState {
    CalibrationState {
        accel,
        compass: Some(CalibrationStep {
            lifecycle: compass_lifecycle(mag_progress, mag_report),
            requested_position: None,
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
    calibration_snapshot_from_state(
        calibration_state_from_sources(None, mag_progress, mag_report),
        provenance,
    )
}

fn calibration_snapshot_from_state(
    state: CalibrationState,
    provenance: DomainProvenance,
) -> CalibrationSnapshot {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accel_wire_updates_drive_the_guided_lifecycle() {
        let mut sources = CalibrationSources::default();

        sources.update_accel(AccelCalibrationUpdate::from_wire_value(4).unwrap());
        let running = sources.snapshot(DomainProvenance::Stream);
        assert_eq!(
            running.value.unwrap().accel,
            Some(CalibrationStep {
                lifecycle: CalibrationLifecycle::Running,
                requested_position: Some(AccelCalibrationPosition::NoseDown),
                progress: None,
                report: None,
            })
        );

        sources.update_accel(AccelCalibrationUpdate::from_wire_value(16_777_215).unwrap());
        let complete = sources.snapshot(DomainProvenance::Stream);
        assert_eq!(
            complete.value.unwrap().accel.unwrap().lifecycle,
            CalibrationLifecycle::Complete
        );
    }

    #[test]
    fn accel_wire_update_rejects_unknown_values() {
        assert_eq!(AccelCalibrationUpdate::from_wire_value(0), None);
        assert_eq!(AccelCalibrationUpdate::from_wire_value(7), None);
    }
}

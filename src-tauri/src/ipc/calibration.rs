use mavkit::ardupilot::{MagCalProgress, MagCalReport, MagCalStatus};

use crate::ipc::{DomainProvenance, DomainValue};

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum CalibrationLifecycle {
    NotStarted,
    Running,
    Complete,
    Failed,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct CalibrationStep {
    pub lifecycle: CalibrationLifecycle,
    pub progress: Option<MagCalProgress>,
    pub report: Option<MagCalReport>,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct CalibrationState {
    pub accel: Option<CalibrationStep>,
    pub compass: Option<CalibrationStep>,
    pub radio: Option<CalibrationStep>,
}

pub(crate) type CalibrationSnapshot = DomainValue<CalibrationState>;

#[derive(Debug, Clone, Default)]
pub(crate) struct CalibrationSources {
    mag_progress: Option<MagCalProgress>,
    mag_report: Option<MagCalReport>,
}

impl CalibrationSources {
    pub(crate) fn update_mag_progress(&mut self, mag_progress: Option<MagCalProgress>) {
        self.mag_progress = mag_progress;
    }

    #[allow(dead_code)] // Used by the runtime event bridge; contract-fixture test target includes this module without the bridge.
    pub(crate) fn update_mag_report(&mut self, mag_report: Option<MagCalReport>) {
        self.mag_report = mag_report;
    }

    pub(crate) fn snapshot(&self, provenance: DomainProvenance) -> CalibrationSnapshot {
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

pub(crate) fn calibration_state_from_sources(
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

pub(crate) fn calibration_snapshot_from_sources(
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

#[cfg(test)]
mod tests {
    use super::*;
    use mavkit::ardupilot::{MagCalProgress, MagCalStatus};

    #[test]
    fn calibration_snapshot_groups_lifecycle_and_progress_from_sources() {
        let snapshot = calibration_snapshot_from_sources(
            Some(&MagCalProgress {
                compass_id: 1,
                completion_pct: 42,
                status: MagCalStatus::RunningStepOne,
                attempt: 1,
            }),
            None,
            DomainProvenance::Stream,
        );
        let value = serde_json::to_value(snapshot).expect("serialize calibration snapshot");

        assert_eq!(value["value"]["accel"], serde_json::Value::Null);
        assert_eq!(value["value"]["compass"]["lifecycle"], "running");
        assert_eq!(value["value"]["compass"]["progress"]["completion_pct"], 42);
        assert_eq!(value["value"]["compass"]["report"], serde_json::Value::Null);
        assert_eq!(value["value"]["radio"], serde_json::Value::Null);
    }

    #[test]
    fn calibration_snapshot_embeds_success_report_when_compass_completes() {
        let snapshot = calibration_snapshot_from_sources(
            None,
            Some(&MagCalReport {
                compass_id: 1,
                status: MagCalStatus::Success,
                fitness: 12.0,
                ofs_x: 1.0,
                ofs_y: 2.0,
                ofs_z: 3.0,
                autosaved: true,
            }),
            DomainProvenance::Bootstrap,
        );
        let value = serde_json::to_value(snapshot).expect("serialize calibration snapshot");

        assert_eq!(value["value"]["compass"]["lifecycle"], "complete");
        assert_eq!(value["value"]["compass"]["report"]["status"], "success");
        assert_eq!(value["value"]["accel"], serde_json::Value::Null);
        assert_eq!(value["value"]["radio"], serde_json::Value::Null);
        assert_eq!(value["complete"], false);
        assert_eq!(
            value["value"]["compass"]["progress"],
            serde_json::Value::Null
        );
    }

    #[test]
    fn calibration_sources_preserve_running_compass_state_across_sensor_health_updates() {
        let mut sources = CalibrationSources::default();
        sources.update_mag_progress(Some(MagCalProgress {
            compass_id: 1,
            completion_pct: 42,
            status: MagCalStatus::RunningStepOne,
            attempt: 1,
        }));

        let snapshot = sources.snapshot(DomainProvenance::Stream);
        let value = serde_json::to_value(snapshot).expect("serialize calibration snapshot");

        assert_eq!(value["value"]["compass"]["lifecycle"], "running");
        assert_eq!(value["value"]["compass"]["progress"]["completion_pct"], 42);
    }

    #[test]
    fn calibration_contract_carries_lifecycle_progress_and_report_shape() {
        let snapshot = calibration_snapshot_from_sources(
            Some(&MagCalProgress {
                compass_id: 1,
                completion_pct: 42,
                status: MagCalStatus::RunningStepOne,
                attempt: 1,
            }),
            Some(&MagCalReport {
                compass_id: 1,
                status: MagCalStatus::Failed,
                fitness: 12.0,
                ofs_x: 1.0,
                ofs_y: 2.0,
                ofs_z: 3.0,
                autosaved: false,
            }),
            DomainProvenance::Stream,
        );

        let value = serde_json::to_value(snapshot).expect("serialize calibration snapshot");

        assert_eq!(value["value"]["compass"]["lifecycle"], "running");
        assert_eq!(value["value"]["compass"]["progress"]["completion_pct"], 42);
        assert_eq!(value["value"]["compass"]["report"]["status"], "failed");
        assert_eq!(value["value"]["accel"], serde_json::Value::Null);
    }

    #[test]
    fn calibration_snapshot_marks_failed_compass_without_running_progress() {
        let snapshot = calibration_snapshot_from_sources(
            None,
            Some(&MagCalReport {
                compass_id: 1,
                status: MagCalStatus::Failed,
                fitness: 12.0,
                ofs_x: 1.0,
                ofs_y: 2.0,
                ofs_z: 3.0,
                autosaved: false,
            }),
            DomainProvenance::Stream,
        );

        assert_eq!(
            snapshot
                .value
                .expect("calibration")
                .compass
                .expect("compass")
                .lifecycle,
            CalibrationLifecycle::Failed
        );
    }
}

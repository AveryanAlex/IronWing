use mavkit::{HomePosition, MissionPlan, RcOverrideChannelValue};

/// Result of downloading a mission plan from a vehicle.
/// Home position is extracted from telemetry home, not from plan items.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct MissionDownload {
    pub plan: MissionPlan,
    pub home: Option<HomePosition>,
}

#[derive(Debug, Clone, Copy, serde::Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum RcOverrideChannelValueWire {
    Ignore,
    Release,
    Pwm { pwm_us: u16 },
}

impl TryFrom<RcOverrideChannelValueWire> for RcOverrideChannelValue {
    type Error = mavkit::VehicleError;

    fn try_from(value: RcOverrideChannelValueWire) -> Result<Self, Self::Error> {
        match value {
            RcOverrideChannelValueWire::Ignore => Ok(RcOverrideChannelValue::Ignore),
            RcOverrideChannelValueWire::Release => Ok(RcOverrideChannelValue::Release),
            RcOverrideChannelValueWire::Pwm { pwm_us } => RcOverrideChannelValue::pwm(pwm_us),
        }
    }
}

#[derive(Debug, Clone, Copy, serde::Deserialize)]
pub struct RcOverrideChannelWire {
    pub channel: u8,
    pub value: RcOverrideChannelValueWire,
}

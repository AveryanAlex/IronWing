//! Semantic fixtures evaluated by the SDK, independently of the frontend codec.
use mavkit::dialect::MavCmd;
use mavkit::mission::commands::{MissionCommand, MissionFrame};
use serde_json::json;

pub fn generate() -> Result<String, serde_json::Error> {
    let cases = [
        (
            "pause",
            MavCmd::MAV_CMD_DO_PAUSE_CONTINUE,
            [0.0, 0.0, 0.0, 0.0],
            false,
        ),
        (
            "continue",
            MavCmd::MAV_CMD_DO_PAUSE_CONTINUE,
            [1.0, 0.0, 0.0, 0.0],
            false,
        ),
        (
            "clockwise arc",
            MavCmd::MAV_CMD_NAV_ARC_WAYPOINT,
            [90.0, 0.0, 0.0, 0.0],
            true,
        ),
        (
            "counterclockwise arc",
            MavCmd::MAV_CMD_NAV_ARC_WAYPOINT,
            [-90.0, 0.0, 0.0, 0.0],
            true,
        ),
        (
            "clockwise loiter to altitude",
            MavCmd::MAV_CMD_NAV_LOITER_TO_ALT,
            [0.0, 40.0, 0.0, 1.0],
            true,
        ),
        (
            "counterclockwise loiter to altitude",
            MavCmd::MAV_CMD_NAV_LOITER_TO_ALT,
            [0.0, -40.0, 0.0, 0.0],
            true,
        ),
        (
            "clockwise loiter turns",
            MavCmd::MAV_CMD_NAV_LOITER_TURNS,
            [2.0, 0.0, 40.0, 1.0],
            true,
        ),
        (
            "counterclockwise loiter turns",
            MavCmd::MAV_CMD_NAV_LOITER_TURNS,
            [2.0, 0.0, -40.0, 0.0],
            true,
        ),
    ];
    let fixtures = cases.map(|(name, id, params, positional)| {
        let (frame, frame_number, x, y, z) = if positional {
            (MissionFrame::GlobalRelativeAlt, 3, 557_500_000, 376_250_000, 80.0)
        } else {
            (MissionFrame::Mission, 2, 0, 0, 0.0)
        };
        let command = MissionCommand::from_wire(id as u16, frame, params, x, y, z);
        json!({
            "name": name,
            "input": {
                "type": "SimpleItem", "command": id as u16, "frame": frame_number,
                "params": [f64::from(params[0]), f64::from(params[1]), f64::from(params[2]), f64::from(params[3]), f64::from(x) / 1e7, f64::from(y) / 1e7, f64::from(z)],
            },
            "command": command,
        })
    });
    Ok(format!("{}\n", serde_json::to_string_pretty(&fixtures)?))
}

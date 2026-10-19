//! Runtime-neutral SDK adapters for the file-format layer. QGC layout stays in the UI.
use mavkit::{MissionCommand, RawMissionCommand};

pub fn decode(commands: Vec<RawMissionCommand>) -> Vec<MissionCommand> {
    commands
        .into_iter()
        .map(|raw| {
            MissionCommand::from_wire_lossless(
                raw.command,
                raw.frame,
                [raw.param1, raw.param2, raw.param3, raw.param4],
                raw.x,
                raw.y,
                raw.z,
            )
        })
        .collect()
}

pub fn encode(commands: Vec<MissionCommand>) -> Vec<RawMissionCommand> {
    commands
        .into_iter()
        .map(|command| {
            let (command, frame, params, x, y, z) = command.into_wire();
            RawMissionCommand {
                command,
                frame,
                param1: params[0],
                param2: params[1],
                param3: params[2],
                param4: params[3],
                x,
                y,
                z,
            }
        })
        .collect()
}

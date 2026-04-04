import type { ConditionCommand, DoCommand, GeoPoint3d, MissionCommand, NavCommand } from "./mission-types";
import { defaultGeoPoint3d } from "./geo";

const DEFAULT_POS: GeoPoint3d = defaultGeoPoint3d(0, 0, 0);

function pos(position?: GeoPoint3d): GeoPoint3d {
    return position ?? DEFAULT_POS;
}

export function defaultCommand(
    category: "Nav" | "Do" | "Condition",
    variant: string,
    position?: GeoPoint3d,
): MissionCommand {
    if (category === "Nav") return { Nav: defaultNavCommand(variant, position) };
    if (category === "Do") return { Do: defaultDoCommand(variant, position) };
    return { Condition: defaultConditionCommand(variant) };
}

function defaultNavCommand(variant: string, position?: GeoPoint3d): NavCommand {
    switch (variant) {
        case "Waypoint":
            return {
                Waypoint: { position: pos(position), hold_time_s: 0, acceptance_radius_m: 0, pass_radius_m: 0, yaw_deg: 0 },
            };
        case "SplineWaypoint":
            return { SplineWaypoint: { position: pos(position), hold_time_s: 0 } };
        case "ArcWaypoint":
            return { ArcWaypoint: { position: pos(position), arc_angle_deg: 0, direction: "Clockwise" } };
        case "Takeoff":
            return { Takeoff: { position: pos(position), pitch_deg: 0 } };
        case "Land":
            return { Land: { position: pos(position), abort_alt_m: 0 } };
        case "LoiterUnlimited":
            return { LoiterUnlimited: { position: pos(position), radius_m: 0, direction: "Clockwise" } };
        case "LoiterTurns":
            return {
                LoiterTurns: { position: pos(position), turns: 0, radius_m: 0, direction: "Clockwise", exit_xtrack: false },
            };
        case "LoiterTime":
            return { LoiterTime: { position: pos(position), time_s: 0, direction: "Clockwise", exit_xtrack: false } };
        case "LoiterToAlt":
            return {
                LoiterToAlt: { position: pos(position), radius_m: 0, direction: "Clockwise", exit_xtrack: false },
            };
        case "ContinueAndChangeAlt":
            return { ContinueAndChangeAlt: { position: pos(position), action: "Neutral" } };
        case "VtolTakeoff":
            return { VtolTakeoff: { position: pos(position) } };
        case "VtolLand":
            return { VtolLand: { position: pos(position), options: 0 } };
        case "PayloadPlace":
            return { PayloadPlace: { position: pos(position), max_descent_m: 0 } };
        case "ReturnToLaunch":
            return "ReturnToLaunch";
        case "Delay":
            return { Delay: { seconds: 0, hour_utc: 0, min_utc: 0, sec_utc: 0 } };
        case "GuidedEnable":
            return { GuidedEnable: { enabled: false } };
        case "AltitudeWait":
            return { AltitudeWait: { altitude_m: 0, descent_rate_mps: 0, wiggle_time_s: 0 } };
        case "SetYawSpeed":
            return { SetYawSpeed: { angle_deg: 0, speed_mps: 0, relative: false } };
        case "ScriptTime":
            return { ScriptTime: { command: 0, timeout_s: 0, arg1: 0, arg2: 0, arg3: 0, arg4: 0 } };
        case "AttitudeTime":
            return { AttitudeTime: { time_s: 0, roll_deg: 0, pitch_deg: 0, yaw_deg: 0, climb_rate_mps: 0 } };
        default:
            console.warn(`defaultNavCommand: unknown variant "${variant}", falling back to Waypoint`);
            return {
                Waypoint: { position: pos(position), hold_time_s: 0, acceptance_radius_m: 0, pass_radius_m: 0, yaw_deg: 0 },
            };
    }
}

function defaultDoCommand(variant: string, position?: GeoPoint3d): DoCommand {
    switch (variant) {
        case "Jump":
            return { Jump: { target_index: 0, repeat_count: 0 } };
        case "JumpTag":
            return { JumpTag: { tag: 0, repeat_count: 0 } };
        case "Tag":
            return { Tag: { tag: 0 } };
        case "PauseContinue":
            return { PauseContinue: { pause: false } };
        case "ChangeSpeed":
            return { ChangeSpeed: { speed_type: "Airspeed", speed_mps: 0, throttle_pct: 0 } };
        case "SetReverse":
            return { SetReverse: { reverse: false } };
        case "SetHome":
            return { SetHome: { position: pos(position), use_current: false } };
        case "LandStart":
            return { LandStart: { position: pos(position) } };
        case "ReturnPathStart":
            return { ReturnPathStart: { position: pos(position) } };
        case "GoAround":
            return { GoAround: { position: pos(position) } };
        case "SetRoiLocation":
            return { SetRoiLocation: { position: pos(position) } };
        case "SetRoi":
            return { SetRoi: { mode: 0, position: pos(position) } };
        case "SetRoiNone":
            return "SetRoiNone";
        case "MountControl":
            return { MountControl: { pitch_deg: 0, roll_deg: 0, yaw_deg: 0 } };
        case "GimbalManagerPitchYaw":
            return { GimbalManagerPitchYaw: { pitch_deg: 0, yaw_deg: 0, pitch_rate_dps: 0, yaw_rate_dps: 0, flags: 0, gimbal_id: 0 } };
        case "CamTriggerDistance":
            return { CamTriggerDistance: { meters: 0, trigger_now: false } };
        case "ImageStartCapture":
            return { ImageStartCapture: { instance: 0, interval_s: 0, total_images: 0, start_number: 0 } };
        case "ImageStopCapture":
            return { ImageStopCapture: { instance: 0 } };
        case "VideoStartCapture":
            return { VideoStartCapture: { stream_id: 0 } };
        case "VideoStopCapture":
            return { VideoStopCapture: { stream_id: 0 } };
        case "SetCameraZoom":
            return { SetCameraZoom: { zoom_type: 0, zoom_value: 0 } };
        case "SetCameraFocus":
            return { SetCameraFocus: { focus_type: 0, focus_value: 0 } };
        case "SetCameraSource":
            return { SetCameraSource: { instance: 0, primary: 0, secondary: 0 } };
        case "DigicamConfigure":
            return { DigicamConfigure: { shooting_mode: 0, shutter_speed: 0, aperture: 0, iso: 0, exposure_type: 0, cmd_id: 0, cutoff_time: 0 } };
        case "DigicamControl":
            return { DigicamControl: { session: 0, zoom_pos: 0, zoom_step: 0, focus_lock: 0, shooting_cmd: 0, cmd_id: 0 } };
        case "SetServo":
            return { SetServo: { channel: 0, pwm: 0 } };
        case "SetRelay":
            return { SetRelay: { number: 0, state: false } };
        case "RepeatServo":
            return { RepeatServo: { channel: 0, pwm: 0, count: 0, cycle_time_s: 0 } };
        case "RepeatRelay":
            return { RepeatRelay: { number: 0, count: 0, cycle_time_s: 0 } };
        case "FenceEnable":
            return { FenceEnable: { action: "Disable" } };
        case "Parachute":
            return { Parachute: { action: "Disable" } };
        case "Gripper":
            return { Gripper: { number: 0, action: "Release" } };
        case "Sprayer":
            return { Sprayer: { enabled: false } };
        case "Winch":
            return { Winch: { number: 0, action: "Relax", release_length_m: 0, release_rate_mps: 0 } };
        case "EngineControl":
            return { EngineControl: { start: false, cold_start: false, height_delay_m: 0, allow_disarmed: false } };
        case "InvertedFlight":
            return { InvertedFlight: { inverted: false } };
        case "AutotuneEnable":
            return { AutotuneEnable: { enabled: false } };
        case "VtolTransition":
            return { VtolTransition: { target_state: 0 } };
        case "GuidedLimits":
            return { GuidedLimits: { max_time_s: 0, min_alt_m: 0, max_alt_m: 0, max_horiz_m: 0 } };
        case "SetResumeRepeatDist":
            return { SetResumeRepeatDist: { distance_m: 0 } };
        case "AuxFunction":
            return { AuxFunction: { function: 0, switch_pos: 0 } };
        case "SendScriptMessage":
            return { SendScriptMessage: { id: 0, p1: 0, p2: 0, p3: 0 } };
        default:
            console.warn(`defaultDoCommand: unknown variant "${variant}", falling back to Jump`);
            return { Jump: { target_index: 0, repeat_count: 0 } };
    }
}

function defaultConditionCommand(variant: string): ConditionCommand {
    switch (variant) {
        case "Delay":
            return { Delay: { delay_s: 0 } };
        case "Distance":
            return { Distance: { distance_m: 0 } };
        case "Yaw":
            return { Yaw: { angle_deg: 0, turn_rate_dps: 0, direction: "Clockwise", relative: false } };
        default:
            console.warn(`defaultConditionCommand: unknown variant "${variant}", falling back to Delay`);
            return { Delay: { delay_s: 0 } };
    }
}

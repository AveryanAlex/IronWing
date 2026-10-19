import type { NavCommand, DoCommand, ConditionCommand, GeoPoint3d, MissionCommand } from "./mavkit-types/mission-types";
import { defaultGeoPoint3d } from "./mavkit-types/geo";

export type CommandCategory = "Nav" | "Do" | "Condition";
type CategoryCommands = { Nav: NavCommand; Do: DoCommand; Condition: ConditionCommand };
type VariantOf<T> = T extends string ? T : T extends object ? keyof T : never;
export type CommandVariant<C extends CommandCategory> = VariantOf<CategoryCommands[C]>;
export type CommandKey = { [C in CommandCategory]: `${C}:${CommandVariant<C>}` }[CommandCategory];
export type CommandForKey<K extends CommandKey> = K extends `${infer C extends CommandCategory}:${infer V}`
  ? { [P in C]: Extract<CategoryCommands[C], V | Record<V, unknown>> }
  : never;
type Payload<T> = T extends object
  ? T[keyof T] extends infer Variant
    ? Variant extends object
      ? Variant[keyof Variant]
      : never
    : never
  : never;
export type CommandPayload<K extends CommandKey> = Payload<CommandForKey<K>>;
export type CommandField<K extends CommandKey = CommandKey> = K extends CommandKey
  ? keyof CommandPayload<K> & string
  : never;

const pos = (position?: GeoPoint3d): GeoPoint3d => position ?? defaultGeoPoint3d(0, 0, 0);

/** The editable command registry. SDK unions enforce complete coverage and matching payloads. */
export const COMMAND_DEFINITIONS = {
  "Nav:Waypoint": {
    id: 16,
    create: (position?: GeoPoint3d) => ({
      Nav: {
        Waypoint: { position: pos(position), hold_time_s: 0, acceptance_radius_m: 0, pass_radius_m: 0, yaw_deg: 0 },
      },
    }),
  },
  "Nav:SplineWaypoint": {
    id: 82,
    create: (position?: GeoPoint3d) => ({ Nav: { SplineWaypoint: { position: pos(position), hold_time_s: 0 } } }),
  },
  "Nav:ArcWaypoint": {
    id: 36,
    create: (position?: GeoPoint3d) => ({
      Nav: { ArcWaypoint: { position: pos(position), arc_angle_deg: 0, direction: "clockwise" } },
    }),
  },
  "Nav:Takeoff": {
    id: 22,
    create: (position?: GeoPoint3d) => ({ Nav: { Takeoff: { position: pos(position), pitch_deg: 0 } } }),
  },
  "Nav:Land": {
    id: 21,
    create: (position?: GeoPoint3d) => ({ Nav: { Land: { position: pos(position), abort_alt_m: 0 } } }),
  },
  "Nav:LoiterUnlimited": {
    id: 17,
    create: (position?: GeoPoint3d) => ({
      Nav: { LoiterUnlimited: { position: pos(position), radius_m: 0, direction: "clockwise" } },
    }),
  },
  "Nav:LoiterTurns": {
    id: 18,
    create: (position?: GeoPoint3d) => ({
      Nav: {
        LoiterTurns: { position: pos(position), turns: 0, radius_m: 0, direction: "clockwise", exit_xtrack: false },
      },
    }),
  },
  "Nav:LoiterTime": {
    id: 19,
    create: (position?: GeoPoint3d) => ({
      Nav: { LoiterTime: { position: pos(position), time_s: 0, direction: "clockwise", exit_xtrack: false } },
    }),
  },
  "Nav:LoiterToAlt": {
    id: 31,
    create: (position?: GeoPoint3d) => ({
      Nav: {
        LoiterToAlt: { position: pos(position), radius_m: 0, direction: "clockwise", exit_xtrack: false },
      },
    }),
  },
  "Nav:ContinueAndChangeAlt": {
    id: 30,
    create: (position?: GeoPoint3d) => ({
      Nav: { ContinueAndChangeAlt: { position: pos(position), action: "neutral" } },
    }),
  },
  "Nav:VtolTakeoff": {
    id: 84,
    create: (position?: GeoPoint3d) => ({ Nav: { VtolTakeoff: { position: pos(position) } } }),
  },
  "Nav:VtolLand": {
    id: 85,
    create: (position?: GeoPoint3d) => ({ Nav: { VtolLand: { position: pos(position), options: 0 } } }),
  },
  "Nav:PayloadPlace": {
    id: 94,
    create: (position?: GeoPoint3d) => ({ Nav: { PayloadPlace: { position: pos(position), max_descent_m: 0 } } }),
  },
  "Nav:ReturnToLaunch": { id: 20, create: () => ({ Nav: "ReturnToLaunch" }) },
  "Nav:Delay": { id: 93, create: () => ({ Nav: { Delay: { seconds: 0, hour_utc: 0, min_utc: 0, sec_utc: 0 } } }) },
  "Nav:GuidedEnable": { id: 92, create: () => ({ Nav: { GuidedEnable: { enabled: false } } }) },
  "Nav:AltitudeWait": {
    id: 83,
    create: () => ({ Nav: { AltitudeWait: { altitude_m: 0, descent_rate_mps: 0, wiggle_time_s: 0 } } }),
  },
  "Nav:SetYawSpeed": {
    id: 213,
    create: () => ({ Nav: { SetYawSpeed: { angle_deg: 0, speed_mps: 0, relative: false } } }),
  },
  "Nav:ScriptTime": {
    id: 42702,
    create: () => ({ Nav: { ScriptTime: { command: 0, timeout_s: 0, arg1: 0, arg2: 0, arg3: 0, arg4: 0 } } }),
  },
  "Nav:AttitudeTime": {
    id: 42703,
    create: () => ({ Nav: { AttitudeTime: { time_s: 0, roll_deg: 0, pitch_deg: 0, yaw_deg: 0, climb_rate_mps: 0 } } }),
  },
  "Do:Jump": { id: 177, create: () => ({ Do: { Jump: { target_index: 0, repeat_count: 0 } } }) },
  "Do:JumpTag": { id: 601, create: () => ({ Do: { JumpTag: { tag: 0, repeat_count: 0 } } }) },
  "Do:Tag": { id: 600, create: () => ({ Do: { Tag: { tag: 0 } } }) },
  "Do:PauseContinue": { id: 193, create: () => ({ Do: { PauseContinue: { pause: false } } }) },
  "Do:ChangeSpeed": {
    id: 178,
    create: () => ({ Do: { ChangeSpeed: { speed_type: "airspeed", speed_mps: 0, throttle_pct: 0 } } }),
  },
  "Do:SetReverse": { id: 194, create: () => ({ Do: { SetReverse: { reverse: false } } }) },
  "Do:SetHome": {
    id: 179,
    create: (position?: GeoPoint3d) => ({ Do: { SetHome: { position: pos(position), use_current: false } } }),
  },
  "Do:LandStart": { id: 189, create: (position?: GeoPoint3d) => ({ Do: { LandStart: { position: pos(position) } } }) },
  "Do:ReturnPathStart": {
    id: 188,
    create: (position?: GeoPoint3d) => ({ Do: { ReturnPathStart: { position: pos(position) } } }),
  },
  "Do:GoAround": { id: 191, create: (position?: GeoPoint3d) => ({ Do: { GoAround: { position: pos(position) } } }) },
  "Do:SetRoiLocation": {
    id: 195,
    create: (position?: GeoPoint3d) => ({ Do: { SetRoiLocation: { position: pos(position) } } }),
  },
  "Do:SetRoi": {
    id: 201,
    create: (position?: GeoPoint3d) => ({ Do: { SetRoi: { mode: 0, position: pos(position) } } }),
  },
  "Do:SetRoiNone": { id: 197, create: () => ({ Do: "SetRoiNone" }) },
  "Do:MountControl": { id: 205, create: () => ({ Do: { MountControl: { pitch_deg: 0, roll_deg: 0, yaw_deg: 0 } } }) },
  "Do:GimbalManagerPitchYaw": {
    id: 1000,
    create: () => ({
      Do: {
        GimbalManagerPitchYaw: { pitch_deg: 0, yaw_deg: 0, pitch_rate_dps: 0, yaw_rate_dps: 0, flags: 0, gimbal_id: 0 },
      },
    }),
  },
  "Do:CamTriggerDistance": {
    id: 206,
    create: () => ({ Do: { CamTriggerDistance: { meters: 0, trigger_now: false } } }),
  },
  "Do:ImageStartCapture": {
    id: 2000,
    create: () => ({ Do: { ImageStartCapture: { instance: 0, interval_s: 0, total_images: 0, start_number: 0 } } }),
  },
  "Do:ImageStopCapture": { id: 2001, create: () => ({ Do: { ImageStopCapture: { instance: 0 } } }) },
  "Do:VideoStartCapture": { id: 2500, create: () => ({ Do: { VideoStartCapture: { stream_id: 0 } } }) },
  "Do:VideoStopCapture": { id: 2501, create: () => ({ Do: { VideoStopCapture: { stream_id: 0 } } }) },
  "Do:SetCameraZoom": { id: 531, create: () => ({ Do: { SetCameraZoom: { zoom_type: 0, zoom_value: 0 } } }) },
  "Do:SetCameraFocus": { id: 532, create: () => ({ Do: { SetCameraFocus: { focus_type: 0, focus_value: 0 } } }) },
  "Do:SetCameraSource": {
    id: 534,
    create: () => ({ Do: { SetCameraSource: { instance: 0, primary: 0, secondary: 0 } } }),
  },
  "Do:DigicamConfigure": {
    id: 202,
    create: () => ({
      Do: {
        DigicamConfigure: {
          shooting_mode: 0,
          shutter_speed: 0,
          aperture: 0,
          iso: 0,
          exposure_type: 0,
          cmd_id: 0,
          cutoff_time: 0,
        },
      },
    }),
  },
  "Do:DigicamControl": {
    id: 203,
    create: () => ({
      Do: { DigicamControl: { session: 0, zoom_pos: 0, zoom_step: 0, focus_lock: 0, shooting_cmd: 0, cmd_id: 0 } },
    }),
  },
  "Do:SetServo": { id: 183, create: () => ({ Do: { SetServo: { channel: 0, pwm: 0 } } }) },
  "Do:SetRelay": { id: 181, create: () => ({ Do: { SetRelay: { number: 0, state: false } } }) },
  "Do:RepeatServo": {
    id: 184,
    create: () => ({ Do: { RepeatServo: { channel: 0, pwm: 0, count: 0, cycle_time_s: 0 } } }),
  },
  "Do:RepeatRelay": { id: 182, create: () => ({ Do: { RepeatRelay: { number: 0, count: 0, cycle_time_s: 0 } } }) },
  "Do:FenceEnable": { id: 207, create: () => ({ Do: { FenceEnable: { action: "disable" } } }) },
  "Do:Parachute": { id: 208, create: () => ({ Do: { Parachute: { action: "disable" } } }) },
  "Do:Gripper": { id: 211, create: () => ({ Do: { Gripper: { number: 0, action: "release" } } }) },
  "Do:Sprayer": { id: 216, create: () => ({ Do: { Sprayer: { enabled: false } } }) },
  "Do:Winch": {
    id: 42600,
    create: () => ({ Do: { Winch: { number: 0, action: "relax", release_length_m: 0, release_rate_mps: 0 } } }),
  },
  "Do:EngineControl": {
    id: 223,
    create: () => ({
      Do: { EngineControl: { start: false, cold_start: false, height_delay_m: 0, allow_disarmed: false } },
    }),
  },
  "Do:InvertedFlight": { id: 210, create: () => ({ Do: { InvertedFlight: { inverted: false } } }) },
  "Do:AutotuneEnable": { id: 212, create: () => ({ Do: { AutotuneEnable: { enabled: false } } }) },
  "Do:VtolTransition": { id: 3000, create: () => ({ Do: { VtolTransition: { target_state: 0 } } }) },
  "Do:GuidedLimits": {
    id: 222,
    create: () => ({ Do: { GuidedLimits: { max_time_s: 0, min_alt_m: 0, max_alt_m: 0, max_horiz_m: 0 } } }),
  },
  "Do:SetResumeRepeatDist": { id: 215, create: () => ({ Do: { SetResumeRepeatDist: { distance_m: 0 } } }) },
  "Do:AuxFunction": { id: 218, create: () => ({ Do: { AuxFunction: { function: 0, switch_pos: 0 } } }) },
  "Do:SendScriptMessage": { id: 217, create: () => ({ Do: { SendScriptMessage: { id: 0, p1: 0, p2: 0, p3: 0 } } }) },
  "Condition:Delay": { id: 112, create: () => ({ Condition: { Delay: { delay_s: 0 } } }) },
  "Condition:Distance": { id: 114, create: () => ({ Condition: { Distance: { distance_m: 0 } } }) },
  "Condition:Yaw": {
    id: 115,
    create: () => ({ Condition: { Yaw: { angle_deg: 0, turn_rate_dps: 0, direction: "clockwise", relative: false } } }),
  },
} as const satisfies { [K in CommandKey]: { id: number; create: (position?: GeoPoint3d) => CommandForKey<K> } };

export function isCommandKey(value: string): value is CommandKey {
  return Object.prototype.hasOwnProperty.call(COMMAND_DEFINITIONS, value);
}

export function createDefaultCommand(
  category: CommandCategory,
  variant: string,
  position?: GeoPoint3d,
): MissionCommand {
  const key = `${category}:${variant}`;
  if (!isCommandKey(key)) throw new RangeError(`Unknown mission command ${key}`);
  return COMMAND_DEFINITIONS[key].create(position);
}

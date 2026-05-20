import {
  wasmCalibrateAccel,
  wasmCalibrateCompassAccept,
  wasmCalibrateCompassCancel,
  wasmCalibrateCompassStart,
  wasmCalibrateGyro,
  wasmMotorTest,
  wasmRcOverride,
  wasmRebootVehicle,
  wasmRequestPrearmChecks,
  wasmSetServo,
} from "../wasm";
import { handled, WEB_COMMAND_UNHANDLED } from "./command-handler";
import type { WebCommandArgs, WebCommandResult } from "./command-handler";
import type { RcOverrideChannel } from "../../../calibration";

export async function tryHandleSetupActionCommand(cmd: string, args?: WebCommandArgs): Promise<WebCommandResult> {
  switch (cmd) {
    case "calibrate_accel":
      return handled(await wasmCalibrateAccel());
    case "calibrate_gyro":
      return handled(await wasmCalibrateGyro());
    case "calibrate_compass_start":
      return handled(await wasmCalibrateCompassStart(compassMaskArg(args)));
    case "calibrate_compass_accept":
      return handled(await wasmCalibrateCompassAccept(compassMaskArg(args)));
    case "calibrate_compass_cancel":
      return handled(await wasmCalibrateCompassCancel(compassMaskArg(args)));
    case "reboot_vehicle":
      return handled(await wasmRebootVehicle());
    case "motor_test":
      return handled(await wasmMotorTest(
        Number(args?.motorInstance ?? 0),
        Number(args?.throttlePct ?? 0),
        Number(args?.durationS ?? 0),
      ));
    case "set_servo":
      return handled(await wasmSetServo(Number(args?.instance ?? 0), Number(args?.pwmUs ?? 0)));
    case "rc_override":
      return handled(await wasmRcOverride(rcOverrideChannelsArg(args)));
    case "request_prearm_checks":
      return handled(await wasmRequestPrearmChecks());
    default:
      return WEB_COMMAND_UNHANDLED;
  }
}

function compassMaskArg(args?: WebCommandArgs): number {
  return Number(args?.compassMask ?? 0);
}

function rcOverrideChannelsArg(args?: WebCommandArgs): RcOverrideChannel[] {
  if (!Array.isArray(args?.channels)) {
    throw new Error("missing or invalid rc_override.channels");
  }

  return args.channels as RcOverrideChannel[];
}

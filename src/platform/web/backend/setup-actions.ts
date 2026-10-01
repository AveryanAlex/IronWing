import {
  wasmCalibrateAccel,
  wasmCalibrateAccelConfirm,
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
import { definePlatformCommandHandlers } from "./command-handler";

export const setupActionCommandHandlers = definePlatformCommandHandlers({
  calibrate_accel: async () => wasmCalibrateAccel(),
  calibrate_accel_confirm: async ({ position }) => wasmCalibrateAccelConfirm(position),
  calibrate_gyro: async () => wasmCalibrateGyro(),
  calibrate_compass_start: async ({ compassMask }) => wasmCalibrateCompassStart(compassMask),
  calibrate_compass_accept: async ({ compassMask }) => wasmCalibrateCompassAccept(compassMask),
  calibrate_compass_cancel: async ({ compassMask }) => wasmCalibrateCompassCancel(compassMask),
  reboot_vehicle: async () => wasmRebootVehicle(),
  motor_test: async ({ motorSequence, throttlePct, durationS }) => wasmMotorTest(motorSequence, throttlePct, durationS),
  set_servo: async ({ instance, pwmUs }) => wasmSetServo(instance, pwmUs),
  rc_override: async ({ channels }) => wasmRcOverride(channels),
  request_prearm_checks: async () => wasmRequestPrearmChecks(),
});

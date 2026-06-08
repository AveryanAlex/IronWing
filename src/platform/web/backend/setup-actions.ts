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
import { definePlatformCommandHandlers } from "./command-handler";

export const setupActionCommandHandlers = definePlatformCommandHandlers({
  calibrate_accel: async () => wasmCalibrateAccel(),
  calibrate_gyro: async () => wasmCalibrateGyro(),
  calibrate_compass_start: async ({ compassMask }) => wasmCalibrateCompassStart(compassMask),
  calibrate_compass_accept: async ({ compassMask }) => wasmCalibrateCompassAccept(compassMask),
  calibrate_compass_cancel: async ({ compassMask }) => wasmCalibrateCompassCancel(compassMask),
  reboot_vehicle: async () => wasmRebootVehicle(),
  motor_test: async ({ motorInstance, throttlePct, durationS }) => wasmMotorTest(motorInstance, throttlePct, durationS),
  set_servo: async ({ instance, pwmUs }) => wasmSetServo(instance, pwmUs),
  rc_override: async ({ channels }) => wasmRcOverride(channels),
  request_prearm_checks: async () => wasmRequestPrearmChecks(),
});

// The subset used by setup. Firmware metadata remains authoritative for all
// other SERVOx_FUNCTION values, which must be preserved as numeric parameters.
// https://github.com/ArduPilot/ardupilot/blob/master/libraries/SRV_Channel/SRV_Channel.h
export enum ArduPilotServoFunction {
  Gpio = -1,
  Disabled = 0,
  RcPassThrough = 1,
  Aileron = 4,
  Elevator = 19,
  Rudder = 21,
  SprayerPump = 22,
  SprayerSpinner = 23,
  Gripper = 28,
  Motor1 = 33,
  Motor2 = 34,
  Motor3 = 35,
  Motor4 = 36,
  Motor5 = 37,
  Motor6 = 38,
  Motor7 = 39,
  TricopterYaw = Motor7,
  Motor8 = 40,
  TiltCollective = 41,
  TiltRearCollective = 45,
  TiltRearLeft = 46,
  TiltRearRight = 47,
  RcIn1 = 51,
  RcIn16 = 66,
  Throttle = 70,
  ThrottleLeft = 73,
  ThrottleRight = 74,
  TiltFrontLeft = 75,
  TiltFrontRight = 76,
  ElevonLeft = 77,
  ElevonRight = 78,
  VTailLeft = 79,
  VTailRight = 80,
  BoostThrottle = 81,
  Motor9 = 82,
  Motor10 = 83,
  Motor11 = 84,
  Motor12 = 85,
  RcIn1Mapped = 140,
  RcIn16Mapped = 155,
  Motor13 = 160,
  Motor14 = 161,
  Motor15 = 162,
  Motor16 = 163,
  Motor17 = 164,
  Motor18 = 165,
  Motor19 = 166,
  Motor20 = 167,
  Motor21 = 168,
  Motor22 = 169,
  Motor23 = 170,
  Motor24 = 171,
  Motor25 = 172,
  Motor26 = 173,
  Motor27 = 174,
  Motor28 = 175,
  Motor29 = 176,
  Motor30 = 177,
  Motor31 = 178,
  Motor32 = 179,
}

/** AP_ServoRelayEvents::do_set_servo permits only these function owners. */
export function permitsDirectServoCommand(value: number): boolean {
  return (
    Number.isInteger(value) &&
    ([
      ArduPilotServoFunction.Disabled,
      ArduPilotServoFunction.RcPassThrough,
      ArduPilotServoFunction.SprayerPump,
      ArduPilotServoFunction.SprayerSpinner,
      ArduPilotServoFunction.Gripper,
    ].includes(value) ||
      (value >= ArduPilotServoFunction.RcIn1 && value <= ArduPilotServoFunction.RcIn16) ||
      (value >= ArduPilotServoFunction.RcIn1Mapped && value <= ArduPilotServoFunction.RcIn16Mapped))
  );
}

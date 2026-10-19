import { defaultCommand, withCommandField } from "./mavkit-types";

function commandTypeContracts() {
  const waypoint = defaultCommand("Nav", "Waypoint");
  withCommandField(waypoint, "hold_time_s", 2);
  // @ts-expect-error A servo command is not a navigation variant.
  defaultCommand("Nav", "SetServo");
  // @ts-expect-error Unknown commands cannot silently become waypoints.
  defaultCommand("Nav", "Unknown");
  // @ts-expect-error Waypoints have no PWM field.
  withCommandField(waypoint, "pwm", 1500);
  // @ts-expect-error Numeric fields reject strings.
  withCommandField(waypoint, "hold_time_s", "2");
  const speed = defaultCommand("Do", "ChangeSpeed");
  // @ts-expect-error Command-specific enum values cannot be mixed.
  withCommandField(speed, "speed_type", "release");
}
void commandTypeContracts;

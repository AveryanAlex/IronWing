import { describe, expect, it } from "vitest";
import { parameterEncoding, parameterDisplayValue, parameterRawValue, primaryGpsParameter, PRIMARY_GNSS_MODE_NAMES, gpsSource } from "./ardupilot-parameters";

describe("SDK parameter profiles", () => {
  it("distinguishes family units and preserves sentinels without downloaded metadata", () => {
    const climb = parameterEncoding("copter", "RTL_CLIMB_MIN")!;
    expect(parameterDisplayValue(climb, 300)).toBe(3);
    expect(parameterRawValue(climb, 3)).toBe(300);
    expect(parameterDisplayValue(parameterEncoding("rover", "RTL_SPEED")!, 2.5)).toBe(2.5);
    const plane = parameterEncoding("plane", "ALT_HOLD_RTL")!;
    expect(parameterRawValue(plane, -1)).toBe(-1);
    expect(parameterDisplayValue(plane, 5000)).toBe(50);
  });
  it("prefers the advertised modern GNSS name, with a legacy fallback", () => {
    expect(primaryGpsParameter(PRIMARY_GNSS_MODE_NAMES, ["GPS_GNSS_MODE", "GPS1_GNSS_MODE"])).toBe("GPS1_GNSS_MODE");
    expect(primaryGpsParameter(PRIMARY_GNSS_MODE_NAMES, ["GPS_GNSS_MODE"])).toBe("GPS_GNSS_MODE");
  });
  it("only asks serial receivers for a UART", () => {
    expect(gpsSource(2)?.requires_uart).toBe(true);
    for (const value of [9, 14, 19, 21, 22, 23]) expect(gpsSource(value)?.requires_uart).toBe(false);
    expect(gpsSource(255)).toBeNull();
  });
});

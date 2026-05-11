import { describe, expect, it } from "vitest";

import { createInitialSimVehicle } from "./fixtures";
import { horizontalDistanceM } from "./geo";
import { advanceSimVehicle } from "./step";
import { telemetryDomainFromSimVehicle } from "./telemetry";

describe("vehicle simulator step", () => {
  it("connected disarmed copter remains stationary after 5 seconds", () => {
    const initial = createInitialSimVehicle("quadcopter");

    const { state } = advanceSimVehicle(initial, 5);

    expect(state.connected).toBe(true);
    expect(state.armed).toBe(false);
    expect(state.system_status).toBe("standby");
    expect(state.position).toEqual(initial.position);
    expect(state.heading_deg).toBe(initial.heading_deg);
    expect(state.groundspeed_mps).toBe(0);
    expect(state.climb_rate_mps).toBe(0);
  });

  it("clamps large elapsed times before stepping", () => {
    const initial = {
      ...createInitialSimVehicle("quadcopter"),
      armed: true,
      system_status: "active",
      target: { relative_alt_m: 20 },
    };

    const { state, appliedDtS } = advanceSimVehicle(initial, 60);

    expect(appliedDtS).toBe(1);
    expect(state.position.relative_alt_m).toBeGreaterThan(0);
    expect(state.position.relative_alt_m).toBeLessThan(10);
    expect(state.climb_rate_mps).toBeGreaterThan(0);
  });

  it("copter climbs to a takeoff target and then holds", () => {
    const initial = {
      ...createInitialSimVehicle("quadcopter"),
      armed: true,
      system_status: "active",
      target: { relative_alt_m: 5 },
    };

    const climbed = advanceSimVehicle(initial, 3).state;
    const held = advanceSimVehicle(climbed, 3).state;

    expect(climbed.position.relative_alt_m).toBe(2.5);
    expect(held.position.relative_alt_m).toBe(5);
    expect(held.climb_rate_mps).toBe(0);
    expect(held.groundspeed_mps).toBe(0);
    expect(held.target).toBeNull();
  });

  it("copter guided target moves horizontally and vertically", () => {
    const seeded = createInitialSimVehicle("quadcopter");
    const initial = {
      ...seeded,
      armed: true,
      system_status: "active",
      target: {
        latitude_deg: seeded.position.latitude_deg + 0.0001,
        longitude_deg: seeded.position.longitude_deg + 0.0001,
        relative_alt_m: 8,
      },
    };

    const step = advanceSimVehicle(initial, 1).state;

    expect(step.position.latitude_deg).toBeGreaterThan(initial.position.latitude_deg);
    expect(step.position.longitude_deg).toBeGreaterThan(initial.position.longitude_deg);
    expect(step.position.relative_alt_m).toBe(2.5);
    expect(step.groundspeed_mps).toBeGreaterThan(0);
    expect(step.climb_rate_mps).toBe(2.5);
    expect(horizontalDistanceM(step.position, initial.target!)).toBeLessThan(horizontalDistanceM(initial.position, initial.target!));
  });

  it("maps simulator state into the existing telemetry domain shape", () => {
    const state = {
      ...createInitialSimVehicle("quadcopter"),
      armed: true,
      system_status: "active",
      throttle_pct: 42,
      groundspeed_mps: 3.5,
      climb_rate_mps: 1.25,
    };

    const telemetry = telemetryDomainFromSimVehicle(state);

    expect(telemetry).toEqual({
      available: true,
      complete: true,
      provenance: "stream",
      value: {
        flight: {
          altitude_m: state.position.relative_alt_m,
          speed_mps: state.groundspeed_mps,
          climb_rate_mps: state.climb_rate_mps,
          throttle_pct: state.throttle_pct,
          airspeed_mps: state.airspeed_mps,
        },
        navigation: {
          latitude_deg: state.position.latitude_deg,
          longitude_deg: state.position.longitude_deg,
          heading_deg: state.heading_deg,
          wp_dist_m: 0,
          nav_bearing_deg: state.heading_deg,
          target_bearing_deg: state.heading_deg,
          xtrack_error_m: 0,
        },
        attitude: {
          roll_deg: state.roll_deg,
          pitch_deg: state.pitch_deg,
          yaw_deg: state.heading_deg,
        },
        power: {
          battery_pct: state.battery.remaining_pct,
          battery_voltage_v: state.battery.voltage_v,
          battery_current_a: state.battery.current_a,
          battery_voltage_cells: state.battery.cell_voltages_v,
          energy_consumed_wh: state.battery.energy_consumed_wh,
          battery_time_remaining_s: state.battery.time_remaining_s,
        },
        gps: {
          fix_type: state.gps_fix_type,
          satellites: state.gps_satellites,
          hdop: state.gps_hdop,
        },
        terrain: {
          terrain_height_m: state.site_altitude_m,
          height_above_terrain_m: state.position.relative_alt_m,
        },
        radio: {
          rc_channels: state.rc_channels,
          rc_rssi: state.rc_rssi,
          servo_outputs: state.servo_outputs,
        },
      },
    });
  });

  it("drains armed battery faster than disarmed battery over the same interval", () => {
    const disarmed = createInitialSimVehicle("quadcopter");
    const armed = { ...createInitialSimVehicle("quadcopter"), armed: true, system_status: "active" };

    const disarmedStep = advanceSimVehicle(disarmed, 1);
    const armedStep = advanceSimVehicle(armed, 1);

    expect(armedStep.state.battery.remaining_pct).toBeLessThan(disarmedStep.state.battery.remaining_pct);
    expect(armedStep.state.battery.energy_consumed_wh).toBeGreaterThan(disarmedStep.state.battery.energy_consumed_wh);
  });

  it("seeds absolute home altitude alongside explicit relative flight altitude for airplane and quadplane presets", () => {
    const airplane = createInitialSimVehicle("airplane");
    const quadplane = createInitialSimVehicle("quadplane");

    expect(airplane.home_position.altitude_m).toBe(488);
    expect(airplane.position.relative_alt_m).toBe(0);
    expect(airplane.site_altitude_m).toBe(488);

    expect(quadplane.home_position.altitude_m).toBe(488);
    expect(quadplane.position.relative_alt_m).toBe(0);
    expect(quadplane.site_altitude_m).toBe(488);
    expect(quadplane.custom_mode).toBe(19);
    expect(quadplane.mode_name).toBe("QLOITER");
    expect(quadplane.armed).toBe(false);
    expect(quadplane.groundspeed_mps).toBe(0);
  });
});

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

  it("disarmed airplane stays parked", () => {
    const initial = createInitialSimVehicle("airplane");

    const { state } = advanceSimVehicle(initial, 5);

    expect(state.connected).toBe(true);
    expect(state.armed).toBe(false);
    expect(state.system_status).toBe("standby");
    expect(state.position).toEqual(initial.position);
    expect(state.heading_deg).toBe(initial.heading_deg);
    expect(state.groundspeed_mps).toBe(0);
    expect(state.airspeed_mps).toBe(0);
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

  it("armed airplane flies forward and turns gradually toward a target", () => {
    const seeded = createInitialSimVehicle("airplane");
    const initial = {
      ...seeded,
      armed: true,
      system_status: "active",
      target: {
        latitude_deg: seeded.position.latitude_deg,
        longitude_deg: seeded.position.longitude_deg + 0.002,
        relative_alt_m: 30,
      },
    };

    const step = advanceSimVehicle(initial, 1).state;

    expect(step.position.latitude_deg).toBeGreaterThan(initial.position.latitude_deg);
    expect(step.position.longitude_deg).toBeGreaterThan(initial.position.longitude_deg);
    expect(step.position.relative_alt_m).toBe(3);
    expect(step.heading_deg).toBeGreaterThan(initial.heading_deg);
    expect(step.heading_deg).toBeLessThan(90);
    expect(step.groundspeed_mps).toBeGreaterThan(0);
    expect(step.airspeed_mps).toBe(step.groundspeed_mps);
    expect(step.climb_rate_mps).toBe(3);
    expect(horizontalDistanceM(step.position, initial.target!)).toBeLessThan(horizontalDistanceM(initial.position, initial.target!));
  });

  it("armed airplane without a target enters a forward loiter/orbit instead of straight flight", () => {
    const initial = {
      ...createInitialSimVehicle("airplane"),
      armed: true,
      system_status: "active",
    };

    const step = advanceSimVehicle(initial, 1).state;

    expect(step.position.latitude_deg).toBeGreaterThan(initial.position.latitude_deg);
    expect(step.position.longitude_deg).toBeGreaterThan(initial.position.longitude_deg);
    expect(step.heading_deg).toBeGreaterThan(initial.heading_deg);
    expect(step.groundspeed_mps).toBe(22);
    expect(step.airspeed_mps).toBe(22);
    expect(step.climb_rate_mps).toBe(0);
    expect(step.position.relative_alt_m).toBe(initial.position.relative_alt_m);
    expect(step.target).toBeNull();
  });

  it("armed quadplane in QLOITER stays in hold when no target is active", () => {
    const initial = {
      ...createInitialSimVehicle("quadplane"),
      armed: true,
      system_status: "active",
      groundspeed_mps: 7,
      airspeed_mps: 11,
      throttle_pct: 55,
    };

    const step = advanceSimVehicle(initial, 1).state;

    expect(step.mode_name).toBe("QLOITER");
    expect(step.position).toEqual(initial.position);
    expect(step.heading_deg).toBe(initial.heading_deg);
    expect(step.groundspeed_mps).toBe(0);
    expect(step.airspeed_mps).toBe(0);
    expect(step.climb_rate_mps).toBe(0);
  });

  it("armed quadplane in QSTABILIZE stays in hold when no target is active", () => {
    const initial = {
      ...createInitialSimVehicle("quadplane"),
      armed: true,
      custom_mode: 17,
      mode_name: "QSTABILIZE",
      system_status: "active",
      groundspeed_mps: 6,
      airspeed_mps: 9,
      throttle_pct: 52,
    };

    const step = advanceSimVehicle(initial, 1).state;

    expect(step.mode_name).toBe("QSTABILIZE");
    expect(step.position).toEqual(initial.position);
    expect(step.heading_deg).toBe(initial.heading_deg);
    expect(step.groundspeed_mps).toBe(0);
    expect(step.airspeed_mps).toBe(0);
    expect(step.climb_rate_mps).toBe(0);
  });

  it("airplane clears a completed non-land target and stays armed in the same mode", () => {
    const initial = {
      ...createInitialSimVehicle("airplane"),
      armed: true,
      system_status: "active",
      mode_name: "Cruise",
      heading_deg: 45,
      position: {
        latitude_deg: 47.397742,
        longitude_deg: 8.545594,
        relative_alt_m: 30,
      },
      target: {
        latitude_deg: 47.3978,
        longitude_deg: 8.54565,
        relative_alt_m: 30,
      },
    };

    const step = advanceSimVehicle(initial, 1).state;
    const loiterStep = advanceSimVehicle(step, 1).state;

    expect(step.armed).toBe(true);
    expect(step.system_status).toBe("active");
    expect(step.mode_name).toBe("Cruise");
    expect(step.target).toBeNull();
    expect(step.groundspeed_mps).toBe(22);
    expect(step.airspeed_mps).toBe(22);
    expect(step.position.latitude_deg).toBe(initial.target.latitude_deg);
    expect(step.position.longitude_deg).toBe(initial.target.longitude_deg);
    expect(step.position.relative_alt_m).toBe(initial.target.relative_alt_m);
    expect(loiterStep.target).toBeNull();
    expect(loiterStep.mode_name).toBe("Cruise");
    expect(loiterStep.armed).toBe(true);
    expect(loiterStep.heading_deg).not.toBe(step.heading_deg);
    expect(loiterStep.position.latitude_deg).not.toBe(step.position.latitude_deg);
    expect(loiterStep.position.longitude_deg).not.toBe(step.position.longitude_deg);
  });

  it("airplane land target outside auto stops and disarms when reached", () => {
    const initial = {
      ...createInitialSimVehicle("airplane"),
      armed: true,
      system_status: "active",
      heading_deg: 0,
      position: {
        latitude_deg: 47.397742,
        longitude_deg: 8.545594,
        relative_alt_m: 2,
      },
      target: {
        kind: "land" as const,
        latitude_deg: 47.39785,
        longitude_deg: 8.545594,
        relative_alt_m: 0,
      },
    };

    const step = advanceSimVehicle(initial, 1).state;

    expect(step.armed).toBe(false);
    expect(step.system_status).toBe("standby");
    expect(step.target).toBeNull();
    expect(step.position.relative_alt_m).toBe(0);
    expect(step.groundspeed_mps).toBe(0);
    expect(step.airspeed_mps).toBe(0);
    expect(step.climb_rate_mps).toBe(0);
  });

  it("airplane snaps to a nearby land target instead of overshooting on completion", () => {
    const initial = {
      ...createInitialSimVehicle("airplane"),
      armed: true,
      system_status: "active",
      heading_deg: 0,
      position: {
        latitude_deg: 47.397742,
        longitude_deg: 8.545594,
        relative_alt_m: 2,
      },
      target: {
        kind: "land" as const,
        latitude_deg: 47.39784,
        longitude_deg: 8.545594,
        relative_alt_m: 0,
      },
    };

    const step = advanceSimVehicle(initial, 1).state;

    expect(step.armed).toBe(false);
    expect(step.position.latitude_deg).toBe(initial.target.latitude_deg);
    expect(step.position.longitude_deg).toBe(initial.target.longitude_deg);
    expect(horizontalDistanceM(step.position, initial.target)).toBe(0);
  });

  it("airplane does not prematurely complete a close target behind its limited turn arc", () => {
    const initial = {
      ...createInitialSimVehicle("airplane"),
      armed: true,
      system_status: "active",
      heading_deg: 0,
      position: {
        latitude_deg: 47.397742,
        longitude_deg: 8.545594,
        relative_alt_m: 20,
      },
      target: {
        latitude_deg: 47.397702,
        longitude_deg: 8.545594,
        relative_alt_m: 20,
      },
    };

    const step = advanceSimVehicle(initial, 1).state;

    expect(step.armed).toBe(true);
    expect(step.target).toEqual(initial.target);
    expect(step.position.latitude_deg).not.toBe(initial.target.latitude_deg);
    expect(step.position.longitude_deg).not.toBe(initial.target.longitude_deg);
    expect(horizontalDistanceM(step.position, initial.target)).toBeGreaterThan(0.1);
  });

  it("airplane AUTO ChangeSpeed uses mission speed for plane-family motion", () => {
    const initial = {
      ...createInitialSimVehicle("airplane"),
      armed: true,
      custom_mode: 10,
      mode_name: "AUTO",
      system_status: "active",
      mission: {
        items: [
          { kind: "change_speed" as const, speed_mps: 12 },
          {
            kind: "waypoint" as const,
            latitude_deg: 47.397742,
            longitude_deg: 8.547594,
            relative_alt_m: 20,
          },
        ],
        current_index: 0,
        completed: false,
        speed_mps: 5,
        unsupported_notes: [],
      },
      target: null,
    };

    const result = advanceSimVehicle(initial, 1);
    const step = result.state;

    expect(result.mission_current_changed).toBe(true);
    expect(step.mission.speed_mps).toBe(12);
    expect(step.groundspeed_mps).toBe(12);
    expect(step.airspeed_mps).toBe(12);
    expect(step.position.longitude_deg).toBeGreaterThan(initial.position.longitude_deg);
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

  it("increases armed battery drain and current under higher speed and climb load", () => {
    const lowLoad = {
      ...createInitialSimVehicle("quadcopter"),
      armed: true,
      system_status: "active",
      throttle_pct: 15,
      groundspeed_mps: 0,
      climb_rate_mps: 0,
    };
    const highLoad = {
      ...createInitialSimVehicle("airplane"),
      armed: true,
      system_status: "active",
      throttle_pct: 65,
      groundspeed_mps: 22,
      airspeed_mps: 22,
      climb_rate_mps: 3,
    };

    const lowLoadStep = advanceSimVehicle(lowLoad, 1).state;
    const highLoadStep = advanceSimVehicle(highLoad, 1).state;

    expect(highLoadStep.battery.current_a).toBeGreaterThan(lowLoadStep.battery.current_a);
    expect(highLoadStep.battery.energy_consumed_wh).toBeGreaterThan(lowLoadStep.battery.energy_consumed_wh);
    expect(highLoadStep.battery.remaining_pct).toBeLessThan(lowLoadStep.battery.remaining_pct);
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

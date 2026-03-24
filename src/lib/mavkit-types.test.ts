import { describe, expect, it } from "vitest";

import type {
  GeoPoint3d,
  MissionCommand,
} from "./mavkit-types";
import {
  commandCategory,
  commandDisplayName,
  pascalToDisplay,
  commandHasPosition,
  commandPosition,
  defaultCommand,
  defaultGeoPoint3d,
  geoPoint3dAltitude,
  geoPoint3dLatLon,
  withGeoPoint3dAltitude,
  withGeoPoint3dPosition,
} from "./mavkit-types";

const mslPoint: GeoPoint3d = {
  Msl: { latitude_deg: 47.3977, longitude_deg: 8.5456, altitude_msl_m: 500 },
};

const relHomePoint: GeoPoint3d = {
  RelHome: { latitude_deg: 47.3977, longitude_deg: 8.5456, relative_alt_m: 50 },
};

const terrainPoint: GeoPoint3d = {
  Terrain: { latitude_deg: 47.3977, longitude_deg: 8.5456, altitude_terrain_m: 30 },
};

describe("commandPosition", () => {
  it("returns position for a nav waypoint", () => {
    const cmd: MissionCommand = {
      Nav: {
        Waypoint: {
          position: relHomePoint,
          hold_time_s: 0,
          acceptance_radius_m: 0,
          pass_radius_m: 0,
          yaw_deg: 0,
        },
      },
    };
    expect(commandPosition(cmd)).toEqual(relHomePoint);
  });

  it("returns null for DoChangeSpeed (no position)", () => {
    const cmd: MissionCommand = {
      Do: {
        ChangeSpeed: {
          speed_type: "Airspeed",
          speed_mps: 15,
          throttle_pct: -1,
        },
      },
    };
    expect(commandPosition(cmd)).toBeNull();
  });

  it("returns null for ReturnToLaunch (unit variant)", () => {
    const cmd: MissionCommand = { Nav: "ReturnToLaunch" };
    expect(commandPosition(cmd)).toBeNull();
  });

  it("returns null for SetRoiNone (unit variant)", () => {
    const cmd: MissionCommand = { Do: "SetRoiNone" };
    expect(commandPosition(cmd)).toBeNull();
  });

  it("returns position for DoSetHome", () => {
    const cmd: MissionCommand = {
      Do: { SetHome: { position: mslPoint, use_current: false } },
    };
    expect(commandPosition(cmd)).toEqual(mslPoint);
  });

  it("returns position for DoSetRoi", () => {
    const cmd: MissionCommand = {
      Do: { SetRoi: { mode: 0, position: terrainPoint } },
    };
    expect(commandPosition(cmd)).toEqual(terrainPoint);
  });

  it("returns null for condition commands", () => {
    const cmd: MissionCommand = {
      Condition: { Delay: { delay_s: 5 } },
    };
    expect(commandPosition(cmd)).toBeNull();
  });

  it("returns null for raw other commands", () => {
    const cmd: MissionCommand = {
      Other: {
        command: 999,
        frame: "Global",
        param1: 0,
        param2: 0,
        param3: 0,
        param4: 0,
        x: 0,
        y: 0,
        z: 0,
      },
    };
    expect(commandPosition(cmd)).toBeNull();
  });
});

describe("commandHasPosition", () => {
  it("true for nav waypoint", () => {
    const cmd: MissionCommand = {
      Nav: {
        Waypoint: {
          position: relHomePoint,
          hold_time_s: 0,
          acceptance_radius_m: 0,
          pass_radius_m: 0,
          yaw_deg: 0,
        },
      },
    };
    expect(commandHasPosition(cmd)).toBe(true);
  });

  it("false for return to launch", () => {
    expect(commandHasPosition({ Nav: "ReturnToLaunch" })).toBe(false);
  });
});

describe("commandCategory", () => {
  it("returns nav for Nav commands", () => {
    expect(commandCategory({ Nav: "ReturnToLaunch" })).toBe("nav");
  });

  it("returns do for Do commands", () => {
    expect(commandCategory({ Do: "SetRoiNone" })).toBe("do");
  });

  it("returns condition for Condition commands", () => {
    expect(commandCategory({ Condition: { Delay: { delay_s: 1 } } })).toBe(
      "condition",
    );
  });

  it("returns other for Other commands", () => {
    expect(
      commandCategory({
        Other: {
          command: 1,
          frame: "Mission",
          param1: 0,
          param2: 0,
          param3: 0,
          param4: 0,
          x: 0,
          y: 0,
          z: 0,
        },
      }),
    ).toBe("other");
  });
});

describe("geoPoint3dLatLon", () => {
  it("extracts lat/lon from Msl", () => {
    const { latitude_deg, longitude_deg } = geoPoint3dLatLon(mslPoint);
    expect(latitude_deg).toBe(47.3977);
    expect(longitude_deg).toBe(8.5456);
  });

  it("extracts lat/lon from RelHome", () => {
    const { latitude_deg, longitude_deg } = geoPoint3dLatLon(relHomePoint);
    expect(latitude_deg).toBe(47.3977);
    expect(longitude_deg).toBe(8.5456);
  });

  it("extracts lat/lon from Terrain", () => {
    const { latitude_deg, longitude_deg } = geoPoint3dLatLon(terrainPoint);
    expect(latitude_deg).toBe(47.3977);
    expect(longitude_deg).toBe(8.5456);
  });
});

describe("geoPoint3dAltitude", () => {
  it("returns msl frame and value for Msl point", () => {
    const { value, frame } = geoPoint3dAltitude(mslPoint);
    expect(value).toBe(500);
    expect(frame).toBe("msl");
  });

  it("returns rel_home frame and value for RelHome point", () => {
    const { value, frame } = geoPoint3dAltitude(relHomePoint);
    expect(value).toBe(50);
    expect(frame).toBe("rel_home");
  });

  it("returns terrain frame and value for Terrain point", () => {
    const { value, frame } = geoPoint3dAltitude(terrainPoint);
    expect(value).toBe(30);
    expect(frame).toBe("terrain");
  });
});

describe("withGeoPoint3dPosition", () => {
  it("preserves Msl altitude frame when updating lat/lon", () => {
    const updated = withGeoPoint3dPosition(mslPoint, 48.0, 9.0);
    expect(updated).toEqual({
      Msl: { latitude_deg: 48.0, longitude_deg: 9.0, altitude_msl_m: 500 },
    });
  });

  it("preserves RelHome altitude frame when updating lat/lon", () => {
    const updated = withGeoPoint3dPosition(relHomePoint, 48.0, 9.0);
    expect(updated).toEqual({
      RelHome: { latitude_deg: 48.0, longitude_deg: 9.0, relative_alt_m: 50 },
    });
  });

  it("preserves Terrain altitude frame when updating lat/lon", () => {
    const updated = withGeoPoint3dPosition(terrainPoint, 48.0, 9.0);
    expect(updated).toEqual({
      Terrain: {
        latitude_deg: 48.0,
        longitude_deg: 9.0,
        altitude_terrain_m: 30,
      },
    });
  });
});

describe("withGeoPoint3dAltitude", () => {
  it("preserves Msl frame and lat/lon when updating altitude", () => {
    const updated = withGeoPoint3dAltitude(mslPoint, 600);
    expect(updated).toEqual({
      Msl: { latitude_deg: 47.3977, longitude_deg: 8.5456, altitude_msl_m: 600 },
    });
  });

  it("preserves RelHome frame and lat/lon when updating altitude", () => {
    const updated = withGeoPoint3dAltitude(relHomePoint, 100);
    expect(updated).toEqual({
      RelHome: { latitude_deg: 47.3977, longitude_deg: 8.5456, relative_alt_m: 100 },
    });
  });

  it("preserves Terrain frame and lat/lon when updating altitude", () => {
    const updated = withGeoPoint3dAltitude(terrainPoint, 55);
    expect(updated).toEqual({
      Terrain: {
        latitude_deg: 47.3977,
        longitude_deg: 8.5456,
        altitude_terrain_m: 55,
      },
    });
  });
});

describe("defaultGeoPoint3d", () => {
  it("creates a RelHome point", () => {
    const pt = defaultGeoPoint3d(47.0, 8.0, 100);
    expect(pt).toEqual({
      RelHome: { latitude_deg: 47.0, longitude_deg: 8.0, relative_alt_m: 100 },
    });
  });
});

describe("commandDisplayName", () => {
  it("returns 'Waypoint' for a nav waypoint", () => {
    const cmd: MissionCommand = {
      Nav: {
        Waypoint: {
          position: relHomePoint,
          hold_time_s: 0,
          acceptance_radius_m: 0,
          pass_radius_m: 0,
          yaw_deg: 0,
        },
      },
    };
    expect(commandDisplayName(cmd)).toBe("Waypoint");
  });

  it("returns 'Return To Launch' for the RTL unit variant", () => {
    expect(commandDisplayName({ Nav: "ReturnToLaunch" })).toBe(
      "Return To Launch",
    );
  });

  it("returns 'Change Speed' for DoChangeSpeed", () => {
    const cmd: MissionCommand = {
      Do: {
        ChangeSpeed: { speed_type: "Airspeed", speed_mps: 15, throttle_pct: -1 },
      },
    };
    expect(commandDisplayName(cmd)).toBe("Change Speed");
  });

  it("returns 'Set Roi None' for the unit variant", () => {
    expect(commandDisplayName({ Do: "SetRoiNone" })).toBe("Set Roi None");
  });

  it("returns 'Delay' for ConditionDelay", () => {
    expect(commandDisplayName({ Condition: { Delay: { delay_s: 5 } } })).toBe(
      "Delay",
    );
  });

  it("returns 'Loiter Turns' for nav loiter turns", () => {
    const cmd: MissionCommand = {
      Nav: {
        LoiterTurns: {
          position: relHomePoint,
          turns: 3,
          radius_m: 100,
          direction: "Clockwise",
          exit_xtrack: false,
        },
      },
    };
    expect(commandDisplayName(cmd)).toBe("Loiter Turns");
  });

  it("returns 'Command #999' for unknown other", () => {
    expect(
      commandDisplayName({
        Other: {
          command: 999,
          frame: "Mission",
          param1: 0,
          param2: 0,
          param3: 0,
          param4: 0,
          x: 0,
          y: 0,
          z: 0,
        },
      }),
    ).toBe("Command #999");
  });

  it("returns 'Gimbal Manager Pitch Yaw' for that command", () => {
    const cmd: MissionCommand = {
      Do: {
        GimbalManagerPitchYaw: {
          pitch_deg: 0,
          yaw_deg: 0,
          pitch_rate_dps: 0,
          yaw_rate_dps: 0,
          flags: 0,
          gimbal_id: 0,
        },
      },
    };
    expect(commandDisplayName(cmd)).toBe("Gimbal Manager Pitch Yaw");
  });
});

describe("pascalToDisplay", () => {
  it("converts PascalCase to spaced display name", () => {
    expect(pascalToDisplay("ReturnToLaunch")).toBe("Return To Launch");
    expect(pascalToDisplay("SetRoiNone")).toBe("Set Roi None");
    expect(pascalToDisplay("Waypoint")).toBe("Waypoint");
  });
});

describe("defaultCommand", () => {
  it("creates a Nav Waypoint with position and category nav", () => {
    const cmd = defaultCommand("Nav", "Waypoint");
    expect(commandCategory(cmd)).toBe("nav");
    expect(commandPosition(cmd)).not.toBeNull();
    expect(cmd).toHaveProperty("Nav");
    const nav = (cmd as { Nav: Record<string, unknown> }).Nav;
    expect(nav).toHaveProperty("Waypoint");
  });

  it("creates a Nav ReturnToLaunch as a unit variant (no position)", () => {
    const cmd = defaultCommand("Nav", "ReturnToLaunch");
    expect(commandCategory(cmd)).toBe("nav");
    expect(commandPosition(cmd)).toBeNull();
    expect(cmd).toEqual({ Nav: "ReturnToLaunch" });
  });

  it("creates a Do ChangeSpeed with category do", () => {
    const cmd = defaultCommand("Do", "ChangeSpeed");
    expect(commandCategory(cmd)).toBe("do");
    expect(cmd).toHaveProperty("Do");
    const d = (cmd as { Do: Record<string, unknown> }).Do;
    expect(d).toHaveProperty("ChangeSpeed");
  });

  it("creates a Do SetRoiNone as a unit variant", () => {
    const cmd = defaultCommand("Do", "SetRoiNone");
    expect(commandCategory(cmd)).toBe("do");
    expect(cmd).toEqual({ Do: "SetRoiNone" });
  });

  it("creates a Condition Yaw with category condition", () => {
    const cmd = defaultCommand("Condition", "Yaw");
    expect(commandCategory(cmd)).toBe("condition");
    expect(cmd).toHaveProperty("Condition");
    const c = (cmd as { Condition: Record<string, unknown> }).Condition;
    expect(c).toHaveProperty("Yaw");
  });

  it("uses provided position for position-bearing Nav commands", () => {
    const pos = defaultGeoPoint3d(47.0, 8.0, 100);
    const cmd = defaultCommand("Nav", "Waypoint", pos);
    expect(commandPosition(cmd)).toEqual(pos);
  });

  it("uses provided position for position-bearing Do commands", () => {
    const pos = defaultGeoPoint3d(47.0, 8.0, 100);
    const cmd = defaultCommand("Do", "SetHome", pos);
    expect(commandPosition(cmd)).toEqual(pos);
  });
});

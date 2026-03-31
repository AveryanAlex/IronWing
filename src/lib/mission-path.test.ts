import { describe, expect, it } from "vitest";

import type { TypedDraftItem } from "./mission-draft-typed";
import type { MissionCommand, MissionItem } from "./mavkit-types";
import { missionPathLineCoordinates, missionPathPoints } from "./mission-path";

function makeMissionItem(command: MissionCommand): MissionItem {
  return {
    command,
    current: false,
    autocontinue: true,
  };
}

function makeDraftItem(index: number, command: MissionCommand): TypedDraftItem {
  return {
    uiId: index + 1,
    index,
    document: makeMissionItem(command),
    readOnly: false,
    preview: {
      latitude_deg: 0,
      longitude_deg: 0,
      altitude_m: 999,
    },
  };
}

describe("missionPathPoints", () => {
  it("returns an empty path when there is no home and no positioned items", () => {
    expect(missionPathPoints(null, [])).toEqual([]);
  });

  it("returns the home position first when only home is present", () => {
    expect(
      missionPathPoints(
        { latitude_deg: 47.397742, longitude_deg: 8.545594, altitude_m: 488 },
        [],
      ),
    ).toEqual([
      {
        latitude_deg: 47.397742,
        longitude_deg: 8.545594,
        altitude_m: 488,
        frame: "msl",
        index: null,
        isHome: true,
      },
    ]);
  });

  it("extracts waypoint coordinates from command positions instead of preview fields", () => {
    const items = [
      makeDraftItem(0, {
        Nav: {
          Waypoint: {
            position: {
              RelHome: {
                latitude_deg: 47.4,
                longitude_deg: 8.55,
                relative_alt_m: 30,
              },
            },
            hold_time_s: 0,
            acceptance_radius_m: 1,
            pass_radius_m: 0,
            yaw_deg: 0,
          },
        },
      }),
      makeDraftItem(1, {
        Nav: {
          Takeoff: {
            position: {
              Msl: {
                latitude_deg: 47.41,
                longitude_deg: 8.56,
                altitude_msl_m: 540,
              },
            },
            pitch_deg: 12,
          },
        },
      }),
    ];

    expect(
      missionPathPoints(
        { latitude_deg: 47.397742, longitude_deg: 8.545594, altitude_m: 488 },
        items,
      ),
    ).toEqual([
      {
        latitude_deg: 47.397742,
        longitude_deg: 8.545594,
        altitude_m: 488,
        frame: "msl",
        index: null,
        isHome: true,
      },
      {
        latitude_deg: 47.4,
        longitude_deg: 8.55,
        altitude_m: 30,
        frame: "rel_home",
        index: 0,
        isHome: false,
      },
      {
        latitude_deg: 47.41,
        longitude_deg: 8.56,
        altitude_m: 540,
        frame: "msl",
        index: 1,
        isHome: false,
      },
    ]);
  });

  it("skips mission items without positions", () => {
    const items = [
      makeDraftItem(0, {
        Nav: {
          Delay: {
            seconds: 5,
            hour_utc: 0,
            min_utc: 0,
            sec_utc: 0,
          },
        },
      }),
      makeDraftItem(1, {
        Nav: {
          Waypoint: {
            position: {
              RelHome: {
                latitude_deg: 47.4,
                longitude_deg: 8.55,
                relative_alt_m: 30,
              },
            },
            hold_time_s: 0,
            acceptance_radius_m: 1,
            pass_radius_m: 0,
            yaw_deg: 0,
          },
        },
      }),
    ];

    const points = missionPathPoints(null, items);
    expect(points).toHaveLength(1);
    expect(points[0]?.index).toBe(1);
  });

  it("extracts all supported altitude frames", () => {
    const items = [
      makeDraftItem(0, {
        Nav: {
          Waypoint: {
            position: {
              Msl: {
                latitude_deg: 47.4,
                longitude_deg: 8.55,
                altitude_msl_m: 500,
              },
            },
            hold_time_s: 0,
            acceptance_radius_m: 1,
            pass_radius_m: 0,
            yaw_deg: 0,
          },
        },
      }),
      makeDraftItem(1, {
        Nav: {
          Waypoint: {
            position: {
              RelHome: {
                latitude_deg: 47.41,
                longitude_deg: 8.56,
                relative_alt_m: 40,
              },
            },
            hold_time_s: 0,
            acceptance_radius_m: 1,
            pass_radius_m: 0,
            yaw_deg: 0,
          },
        },
      }),
      makeDraftItem(2, {
        Nav: {
          Waypoint: {
            position: {
              Terrain: {
                latitude_deg: 47.42,
                longitude_deg: 8.57,
                altitude_terrain_m: 25,
              },
            },
            hold_time_s: 0,
            acceptance_radius_m: 1,
            pass_radius_m: 0,
            yaw_deg: 0,
          },
        },
      }),
    ];

    expect(missionPathPoints(null, items).map((point) => [point.frame, point.altitude_m])).toEqual([
      ["msl", 500],
      ["rel_home", 40],
      ["terrain", 25],
    ]);
  });
});

describe("missionPathLineCoordinates", () => {
  it("returns line coordinates in [lon, lat] order", () => {
    const items = [
      makeDraftItem(0, {
        Nav: {
          Waypoint: {
            position: {
              RelHome: {
                latitude_deg: 47.4,
                longitude_deg: 8.55,
                relative_alt_m: 30,
              },
            },
            hold_time_s: 0,
            acceptance_radius_m: 1,
            pass_radius_m: 0,
            yaw_deg: 0,
          },
        },
      }),
    ];

    expect(
      missionPathLineCoordinates(
        { latitude_deg: 47.397742, longitude_deg: 8.545594, altitude_m: 488 },
        items,
      ),
    ).toEqual([
      [8.545594, 47.397742],
      [8.55, 47.4],
    ]);
  });
});

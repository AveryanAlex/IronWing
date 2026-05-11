import { describe, expect, it } from "vitest";

import { advanceMissionCurrent, normalizeMissionPlan, setMissionCurrentIndex } from "./mission";

describe("vehicle simulator mission normalization", () => {
  it("normalizes takeoff, waypoint, land, and unsupported items into simulator mission runtime", () => {
    const mission = normalizeMissionPlan({
      items: [
        {
          command: {
            Nav: {
              Takeoff: {
                position: {
                  RelHome: {
                    latitude_deg: 47.397742,
                    longitude_deg: 8.545594,
                    relative_alt_m: 12,
                  },
                },
                pitch_deg: 15,
              },
            },
          },
          current: false,
          autocontinue: true,
        },
        {
          command: {
            Do: {
              ChangeSpeed: {
                speed_type: "Groundspeed",
                speed_mps: 6,
                throttle_pct: 50,
              },
            },
          },
          current: true,
          autocontinue: true,
        },
        {
          command: {
            Nav: {
              Waypoint: {
                position: {
                  RelHome: {
                    latitude_deg: 47.3979,
                    longitude_deg: 8.5458,
                    relative_alt_m: 14,
                  },
                },
                hold_time_s: 0,
                acceptance_radius_m: 1,
                pass_radius_m: 0,
                yaw_deg: 0,
              },
            },
          },
          current: false,
          autocontinue: true,
        },
        {
          command: { Nav: "ReturnToLaunch" },
          current: false,
          autocontinue: true,
        },
        {
          command: {
            Nav: {
              Land: {
                position: {
                  RelHome: {
                    latitude_deg: 47.397742,
                    longitude_deg: 8.545594,
                    relative_alt_m: 0,
                  },
                },
                abort_alt_m: 20,
              },
            },
          },
          current: false,
          autocontinue: true,
        },
        {
          command: {
            Condition: {
              Delay: {
                delay_s: 5,
              },
            },
          },
          current: false,
          autocontinue: true,
        },
      ],
    });

    expect(mission).toMatchObject({
      current_index: 1,
      completed: false,
      items: [
        {
          kind: "takeoff",
          latitude_deg: 47.397742,
          longitude_deg: 8.545594,
          relative_alt_m: 12,
        },
        {
          kind: "change_speed",
          speed_mps: 6,
        },
        {
          kind: "waypoint",
          latitude_deg: 47.3979,
          longitude_deg: 8.5458,
          relative_alt_m: 14,
        },
        {
          kind: "rtl",
        },
        {
          kind: "land",
          latitude_deg: 47.397742,
          longitude_deg: 8.545594,
        },
        {
          kind: "unsupported",
          note: expect.stringContaining("Delay"),
        },
      ],
    });
    expect(mission.unsupported_notes).toEqual([expect.stringContaining("Delay")]);
  });

  it("unsupported notes include the command display name", () => {
    const mission = normalizeMissionPlan({
      items: [
        {
          command: {
            Nav: {
              SplineWaypoint: {
                position: {
                  RelHome: {
                    latitude_deg: 47.398,
                    longitude_deg: 8.546,
                    relative_alt_m: 20,
                  },
                },
                hold_time_s: 0,
              },
            },
          },
          current: true,
          autocontinue: true,
        },
      ],
    });

    expect(mission.items).toEqual([
      {
        kind: "unsupported",
        note: expect.stringContaining("Spline Waypoint"),
      },
    ]);
    expect(mission.unsupported_notes).toEqual([expect.stringContaining("Spline Waypoint")]);
  });

  it("normalizes missions without a prior ChangeSpeed override to null speed_mps", () => {
    const mission = normalizeMissionPlan({
      items: [
        {
          command: {
            Nav: {
              Waypoint: {
                position: {
                  RelHome: {
                    latitude_deg: 47.3979,
                    longitude_deg: 8.5458,
                    relative_alt_m: 14,
                  },
                },
                hold_time_s: 0,
                acceptance_radius_m: 1,
                pass_radius_m: 0,
                yaw_deg: 0,
              },
            },
          },
          current: true,
          autocontinue: true,
        },
      ],
    });

    expect(mission.speed_mps).toBeNull();
  });

  it("normalizes missions after a prior ChangeSpeed override to that runtime speed", () => {
    const mission = normalizeMissionPlan({
      items: [
        {
          command: {
            Do: {
              ChangeSpeed: {
                speed_type: "Groundspeed",
                speed_mps: 7,
                throttle_pct: 50,
              },
            },
          },
          current: false,
          autocontinue: true,
        },
        {
          command: {
            Nav: {
              Waypoint: {
                position: {
                  RelHome: {
                    latitude_deg: 47.3979,
                    longitude_deg: 8.5458,
                    relative_alt_m: 14,
                  },
                },
                hold_time_s: 0,
                acceptance_radius_m: 1,
                pass_radius_m: 0,
                yaw_deg: 0,
              },
            },
          },
          current: true,
          autocontinue: true,
        },
      ],
    });

    expect(mission.current_index).toBe(1);
    expect(mission.speed_mps).toBe(7);
  });

  it("normalizes non-empty missions with no current item to no restored speed override", () => {
    const mission = normalizeMissionPlan({
      items: [
        {
          command: {
            Do: {
              ChangeSpeed: {
                speed_type: "Groundspeed",
                speed_mps: 7,
                throttle_pct: 50,
              },
            },
          },
          current: false,
          autocontinue: true,
        },
        {
          command: {
            Nav: {
              Waypoint: {
                position: {
                  RelHome: {
                    latitude_deg: 47.3979,
                    longitude_deg: 8.5458,
                    relative_alt_m: 14,
                  },
                },
                hold_time_s: 0,
                acceptance_radius_m: 1,
                pass_radius_m: 0,
                yaw_deg: 0,
              },
            },
          },
          current: false,
          autocontinue: true,
        },
      ],
    });

    expect(mission.current_index).toBeNull();
    expect(mission.completed).toBe(false);
    expect(mission.speed_mps).toBeNull();
  });

  it("setMissionCurrentIndex recomputes restored ChangeSpeed override when moving before and after it", () => {
    const mission = normalizeMissionPlan({
      items: [
        {
          command: {
            Nav: {
              Takeoff: {
                position: {
                  RelHome: {
                    latitude_deg: 47.397742,
                    longitude_deg: 8.545594,
                    relative_alt_m: 12,
                  },
                },
                pitch_deg: 15,
              },
            },
          },
          current: true,
          autocontinue: true,
        },
        {
          command: {
            Do: {
              ChangeSpeed: {
                speed_type: "Groundspeed",
                speed_mps: 9,
                throttle_pct: 50,
              },
            },
          },
          current: false,
          autocontinue: true,
        },
        {
          command: {
            Nav: {
              Waypoint: {
                position: {
                  RelHome: {
                    latitude_deg: 47.3979,
                    longitude_deg: 8.5458,
                    relative_alt_m: 14,
                  },
                },
                hold_time_s: 0,
                acceptance_radius_m: 1,
                pass_radius_m: 0,
                yaw_deg: 0,
              },
            },
          },
          current: false,
          autocontinue: true,
        },
      ],
    });

    const afterChangeSpeed = setMissionCurrentIndex(mission, 2);
    const beforeChangeSpeed = setMissionCurrentIndex(afterChangeSpeed, 1);

    expect(afterChangeSpeed.current_index).toBe(2);
    expect(afterChangeSpeed.speed_mps).toBe(9);
    expect(beforeChangeSpeed.current_index).toBe(1);
    expect(beforeChangeSpeed.speed_mps).toBeNull();
  });

  it("clears current_index when mission advancement completes the final item", () => {
    const mission = normalizeMissionPlan({
      items: [
        {
          command: {
            Nav: {
              Takeoff: {
                position: {
                  RelHome: {
                    latitude_deg: 47.397742,
                    longitude_deg: 8.545594,
                    relative_alt_m: 12,
                  },
                },
                pitch_deg: 15,
              },
            },
          },
          current: true,
          autocontinue: true,
        },
      ],
    });

    expect(advanceMissionCurrent(mission)).toMatchObject({
      current_index: null,
      completed: true,
    });
  });
});

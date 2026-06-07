import { describe, expect, it } from "vitest";

import type { MissionPlan } from "./mission-types";
import { fromMissionWirePlan, toMissionWirePlan } from "./wire";

const loiterPlan: MissionPlan = {
  items: [
    {
      command: {
        Nav: {
          LoiterTime: {
            position: { RelHome: { latitude_deg: 47.397742, longitude_deg: 8.545594, relative_alt_m: 55 } },
            time_s: 12,
            direction: "Clockwise",
            exit_xtrack: false,
          },
        },
      },
      current: true,
      autocontinue: true,
    },
    {
      command: {
        Nav: {
          LoiterTurns: {
            position: { RelHome: { latitude_deg: 47.39795, longitude_deg: 8.54608, relative_alt_m: 45 } },
            turns: 1,
            radius_m: 20,
            direction: "CounterClockwise",
            exit_xtrack: true,
          },
        },
      },
      current: false,
      autocontinue: true,
    },
  ],
};

describe("mission wire enum normalization", () => {
  it("serializes UI loiter directions to Rust wire enum values", () => {
    expect(toMissionWirePlan(loiterPlan)).toMatchObject({
      items: [
        { command: { Nav: { LoiterTime: { direction: "clockwise" } } } },
        { command: { Nav: { LoiterTurns: { direction: "counter_clockwise" } } } },
      ],
    });
    expect(loiterPlan.items[0]?.command).toMatchObject({ Nav: { LoiterTime: { direction: "Clockwise" } } });
  });

  it("normalizes Rust wire loiter directions back to the UI model", () => {
    const wirePlan = toMissionWirePlan(loiterPlan) as MissionPlan;

    expect(fromMissionWirePlan(wirePlan)).toEqual(loiterPlan);
  });
});

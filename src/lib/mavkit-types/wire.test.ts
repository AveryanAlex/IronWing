import { describe, expect, it } from "vitest";

import { toWireMissionPlan } from "../../mission";
import type { MissionPlan } from "./mission-types";

const loiterPlan: MissionPlan = {
  items: [
    {
      command: {
        Nav: {
          LoiterTime: {
            position: { RelHome: { latitude_deg: 47.397742, longitude_deg: 8.545594, relative_alt_m: 55 } },
            time_s: 12,
            direction: "clockwise",
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
            direction: "counter_clockwise",
            exit_xtrack: true,
          },
        },
      },
      current: false,
      autocontinue: true,
    },
  ],
};

describe("mission wire plan conversion", () => {
  it("strips UI-only current flags and preserves generated wire enum values", () => {
    expect(toWireMissionPlan(loiterPlan)).toEqual({
      items: [
        {
          command: {
            Nav: {
              LoiterTime: {
                position: { RelHome: { latitude_deg: 47.397742, longitude_deg: 8.545594, relative_alt_m: 55 } },
                time_s: 12,
                direction: "clockwise",
                exit_xtrack: false,
              },
            },
          },
          autocontinue: true,
        },
        {
          command: {
            Nav: {
              LoiterTurns: {
                position: { RelHome: { latitude_deg: 47.39795, longitude_deg: 8.54608, relative_alt_m: 45 } },
                turns: 1,
                radius_m: 20,
                direction: "counter_clockwise",
                exit_xtrack: true,
              },
            },
          },
          autocontinue: true,
        },
      ],
    });
  });
});

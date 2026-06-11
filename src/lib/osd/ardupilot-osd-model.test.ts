import { describe, expect, it } from "vitest";

import type { ParamStore } from "../../params";
import { buildArduPilotOsdModel, clampOsdCoordinate } from "./ardupilot-osd-model";

function createParamStore(entries: Record<string, number>): ParamStore {
  const params: ParamStore["params"] = {};
  let index = 0;

  for (const [name, value] of Object.entries(entries)) {
    params[name] = {
      name,
      value,
      param_type: Number.isInteger(value) ? "int16" : "real32",
      index: index++,
    };
  }

  return {
    expected_count: index,
    params,
  };
}

describe("ardupilot-osd-model", () => {
  it("returns an unsupported model when no OSD params are present", () => {
    const model = buildArduPilotOsdModel({
      paramStore: createParamStore({ SERIAL1_PROTOCOL: 2 }),
    });

    expect(model.hasOsdParams).toBe(false);
    expect(model.screens).toEqual([]);
    expect(model.itemCount).toBe(0);
  });

  it("treats screen-level OSD params without item triples as unsupported", () => {
    const model = buildArduPilotOsdModel({
      paramStore: createParamStore({
        OSD_TYPE: 1,
        OSD1_ENABLE: 1,
        MSP_OSD_NCELLS: 16,
      }),
    });

    expect(model.hasOsdParams).toBe(false);
    expect(model.itemCount).toBe(0);
    expect(model.screens).toHaveLength(1);
    expect(model.screens[0]?.enabled).toBe(true);
  });

  it("detects item triples by screen and renders only enabled items", () => {
    const model = buildArduPilotOsdModel({
      paramStore: createParamStore({
        OSD1_ENABLE: 1,
        OSD1_ALTITUDE_EN: 1,
        OSD1_ALTITUDE_X: 3,
        OSD1_ALTITUDE_Y: 4,
        OSD1_BAT_VOLT_EN: 0,
        OSD1_BAT_VOLT_X: 10,
        OSD1_BAT_VOLT_Y: 2,
        OSD2_GSPEED_EN: 1,
        OSD2_GSPEED_X: 7,
        OSD2_GSPEED_Y: 9,
      }),
    });

    expect(model.hasOsdParams).toBe(true);
    expect(model.itemCount).toBe(3);
    expect(model.enabledItemCount).toBe(2);
    expect(model.screens.map((screen) => screen.screen)).toEqual([1, 2]);
    expect(model.screens[0]?.enabled).toBe(true);
    expect(model.screens[0]?.enabledItems.map((item) => item.key)).toEqual(["ALTITUDE"]);
    expect(model.screens[0]?.items.find((item) => item.key === "BAT_VOLT")?.label).toBe("Bat Volt");
  });

  it("uses staged edits as the effective preview state", () => {
    const model = buildArduPilotOsdModel({
      paramStore: createParamStore({
        OSD1_ALTITUDE_EN: 0,
        OSD1_ALTITUDE_X: 3,
        OSD1_ALTITUDE_Y: 4,
      }),
      stagedEdits: {
        OSD1_ALTITUDE_EN: { nextValue: 1 },
        OSD1_ALTITUDE_X: { nextValue: 12 },
        OSD1_ALTITUDE_Y: { nextValue: 8 },
      },
    });

    const item = model.screens[0]?.items[0];
    expect(item?.enabled).toBe(true);
    expect(item?.x).toBe(12);
    expect(item?.y).toBe(8);
    expect(item?.staged).toEqual({ enable: true, x: true, y: true });
    expect(model.enabledItemCount).toBe(1);
  });

  it("keeps sparse item params visible but marks incomplete rows", () => {
    const model = buildArduPilotOsdModel({
      paramStore: createParamStore({
        OSD3_MESSAGE_X: 40,
        OSD3_MESSAGE_Y: -2,
      }),
    });

    const item = model.screens[0]?.items[0];
    expect(item?.complete).toBe(false);
    expect(item?.enabled).toBe(false);
    expect(item?.x).toBe(29);
    expect(item?.y).toBe(0);
  });

  it("clamps coordinates to the selected grid", () => {
    expect(clampOsdCoordinate(99, "x", { columns: 20, rows: 10 })).toBe(19);
    expect(clampOsdCoordinate(-5, "y", { columns: 20, rows: 10 })).toBe(0);
    expect(clampOsdCoordinate(4.6, "y", { columns: 20, rows: 10 })).toBe(5);
  });
});

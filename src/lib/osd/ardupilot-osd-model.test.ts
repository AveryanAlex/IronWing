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
    expect(item?.displayX).toBe(12);
    expect(item?.displayY).toBe(8);
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
    expect(item?.x).toBe(40);
    expect(item?.y).toBe(-2);
    expect(item?.displayX).toBe(29);
    expect(item?.displayY).toBe(0);
    expect(item?.xOutOfRange).toBe(true);
    expect(item?.yOutOfRange).toBe(true);
  });

  it("resolves screen-specific HD grids from OSDn_TXT_RES=1 without clipping valid coordinates", () => {
    const model = buildArduPilotOsdModel({
      paramStore: createParamStore({
        OSD1_TXT_RES: 1,
        OSD1_ALTITUDE_EN: 1,
        OSD1_ALTITUDE_X: 40,
        OSD1_ALTITUDE_Y: 17,
      }),
    });

    const screen = model.screens[0];
    const item = screen?.items[0];
    expect(screen?.grid).toEqual({ columns: 50, rows: 18, label: "HD 50 x 18" });
    expect(item?.x).toBe(40);
    expect(item?.y).toBe(17);
    expect(item?.displayX).toBe(40);
    expect(item?.displayY).toBe(17);
    expect(item?.xOutOfRange).toBe(false);
    expect(item?.yOutOfRange).toBe(false);
  });

  it("resolves screen-specific HD grids from staged OSDn_TXT_RES=3", () => {
    const model = buildArduPilotOsdModel({
      paramStore: createParamStore({
        OSD2_TXT_RES: 0,
        OSD2_GSPEED_EN: 1,
        OSD2_GSPEED_X: 55,
        OSD2_GSPEED_Y: 21,
      }),
      stagedEdits: {
        OSD2_TXT_RES: { nextValue: 3 },
      },
    });

    const screen = model.screens[0];
    const item = screen?.items[0];
    expect(screen?.grid).toEqual({ columns: 60, rows: 22, label: "HD 60 x 22" });
    expect(screen?.txtResStaged).toBe(true);
    expect(item?.x).toBe(55);
    expect(item?.y).toBe(21);
    expect(item?.displayX).toBe(55);
    expect(item?.displayY).toBe(21);
  });

  it("tracks disabled screens separately from item enable state", () => {
    const model = buildArduPilotOsdModel({
      paramStore: createParamStore({
        OSD1_ENABLE: 0,
        OSD1_ALTITUDE_EN: 1,
        OSD1_ALTITUDE_X: 3,
        OSD1_ALTITUDE_Y: 4,
      }),
    });

    const screen = model.screens[0];
    expect(screen?.enabled).toBe(false);
    expect(screen?.enableParamName).toBe("OSD1_ENABLE");
    expect(screen?.enabledItems.map((item) => item.key)).toEqual(["ALTITUDE"]);
  });

  it("clamps coordinates to the selected grid", () => {
    expect(clampOsdCoordinate(99, "x", { columns: 20, rows: 10, label: "custom" })).toBe(19);
    expect(clampOsdCoordinate(-5, "y", { columns: 20, rows: 10, label: "custom" })).toBe(0);
    expect(clampOsdCoordinate(4.6, "y", { columns: 20, rows: 10, label: "custom" })).toBe(5);
  });
});

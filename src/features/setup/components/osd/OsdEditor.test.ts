// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import type { ParamStore } from "../../../../params";
import type { ParameterItemModel } from "../../../../lib/params/parameter-item-model";
import {
  buildArduPilotOsdModel,
  type ArduPilotOsdModel,
} from "../../../../lib/osd/ardupilot-osd-model";
import OsdEditor from "./OsdEditor.svelte";

function createParamStore(entries: Record<string, number>): ParamStore {
  const params: ParamStore["params"] = {};
  let index = 0;

  for (const [name, value] of Object.entries(entries)) {
    params[name] = {
      name,
      value,
      param_type: "int16",
      index: index++,
    };
  }

  return { expected_count: index, params };
}

function createItemIndex(entries: Record<string, number>): Map<string, ParameterItemModel> {
  return new Map(
    Object.entries(entries).map(([name, value], order) => [
      name,
      {
        name,
        rawName: name,
        label: name,
        description: null,
        value,
        valueText: String(value),
        valueLabel: null,
        units: null,
        rebootRequired: false,
        order,
        increment: 1,
        range: null,
        readOnly: false,
      },
    ]),
  );
}

describe("OsdEditor", () => {
  afterEach(cleanup);

  it("places an available item with its enable value and only changed default coordinates", async () => {
    const parameters = {
      OSD1_ALTITUDE_EN: 1,
      OSD1_ALTITUDE_X: 0,
      OSD1_ALTITUDE_Y: 0,
      OSD1_BAT_VOLT_EN: 0,
      OSD1_BAT_VOLT_X: 0,
      OSD1_BAT_VOLT_Y: 0,
    };
    const model: ArduPilotOsdModel = buildArduPilotOsdModel({
      paramStore: createParamStore(parameters),
    });
    const itemIndex = createItemIndex(parameters);
    const staged: Array<[string, number]> = [];

    render(OsdEditor, {
      props: {
        model,
        selectedScreen: 1,
        itemIndex,
        onSelectScreen: () => {},
        onStageParam: (name, value) => staged.push([name, value]),
      },
    });

    await fireEvent.click(screen.getByRole("button", { name: "Place on grid" }));

    expect(staged).toEqual([
      ["OSD1_BAT_VOLT_EN", 1],
      ["OSD1_BAT_VOLT_X", 1],
    ]);
  });

  it("removes a placed item and resets only its staged coordinates to live values", async () => {
    const parameters = {
      OSD1_BAT_VOLT_EN: 1,
      OSD1_BAT_VOLT_X: 3,
      OSD1_BAT_VOLT_Y: 4,
    };
    const model: ArduPilotOsdModel = buildArduPilotOsdModel({
      paramStore: createParamStore(parameters),
      stagedEdits: {
        OSD1_BAT_VOLT_X: { nextValue: 12 },
      },
    });
    const itemIndex = createItemIndex(parameters);
    const staged: Array<[string, number]> = [];

    render(OsdEditor, {
      props: {
        model,
        selectedScreen: 1,
        itemIndex,
        onSelectScreen: () => {},
        onStageParam: (name, value) => staged.push([name, value]),
      },
    });

    await fireEvent.click(screen.getByRole("button", { name: "Remove Bat Volt from Screen 1" }));

    expect(staged).toEqual([
      ["OSD1_BAT_VOLT_EN", 0],
      ["OSD1_BAT_VOLT_X", 3],
    ]);
  });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import type { ParamStore } from "../../../../params";
import { buildArduPilotOsdModel } from "../../../../lib/osd/ardupilot-osd-model";
import {
  osdDisplayTargetPreset,
  type OsdDisplayTargetSelection,
} from "../../../../lib/osd/osd-display-target";
import { buildParameterItemIndex } from "../../../../lib/params/parameter-item-model";
import { buildSerialPortModel } from "../../../../lib/setup/serial-port-model";
import type { StagedParameterEdit } from "../../../../lib/stores/params";
import { setupWorkspaceTestIds } from "../../setup-workspace-test-ids";
import OsdSetupGuide from "./OsdSetupGuide.svelte";

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

function renderGuide(
  parameters: Record<string, number>,
  displayTarget: OsdDisplayTargetSelection | null,
  readOnlyNames: string[] = [],
  stagedEdits: Record<string, StagedParameterEdit> = {},
) {
  const paramStore = createParamStore(parameters);
  const itemIndex = buildParameterItemIndex(paramStore, null);
  for (const name of readOnlyNames) {
    const item = itemIndex.get(name);
    if (item) {
      itemIndex.set(name, { ...item, readOnly: true });
    }
  }

  const targetChanges: Array<OsdDisplayTargetSelection | null> = [];
  const staged: Array<[string, number]> = [];
  render(OsdSetupGuide, {
    props: {
      osdModel: buildArduPilotOsdModel({
        paramStore,
        stagedEdits,
        displayTarget,
        displayTargetScreen: 1,
      }),
      serialModel: buildSerialPortModel({ paramStore, metadata: null, stagedEdits }),
      selectedScreen: 1,
      paramStore,
      stagedEdits,
      itemIndex,
      displayTarget,
      onStageParam: (name, value) => staged.push([name, value]),
      onDisplayTargetChange: (selection) => targetChanges.push(selection),
    },
  });

  return { staged, targetChanges };
}

afterEach(cleanup);

describe("OsdSetupGuide", () => {
  it("changes the connected display preference without staging parameters", async () => {
    const { staged, targetChanges } = renderGuide({
      OSD_TYPE: 5,
      MSP_OPTIONS: 0,
      OSD1_TXT_RES: 1,
      OSD1_ALTITUDE_EN: 1,
      OSD1_ALTITUDE_X: 3,
      OSD1_ALTITUDE_Y: 4,
    }, null);

    await fireEvent.change(screen.getByTestId(setupWorkspaceTestIds.osdSetupDisplayTargetSelect), {
      target: { value: "dji_wtfos" },
    });

    expect(staged).toEqual([]);
    expect(targetChanges).toEqual([osdDisplayTargetPreset("dji_wtfos")]);
  });

  it("stages only the active screen TXT_RES from the explicit action", async () => {
    const target = osdDisplayTargetPreset("walksnail_avatar");
    const { staged } = renderGuide({
      OSD_TYPE: 5,
      MSP_OPTIONS: 0,
      OSD1_TXT_RES: 1,
      OSD1_ALTITUDE_EN: 1,
      OSD1_ALTITUDE_X: 3,
      OSD1_ALTITUDE_Y: 4,
      OSD2_TXT_RES: 0,
      OSD2_ALTITUDE_EN: 1,
      OSD2_ALTITUDE_X: 3,
      OSD2_ALTITUDE_Y: 4,
    }, target);

    const action = screen.getByTestId(setupWorkspaceTestIds.osdSetupStageGridAction);
    expect(action.textContent).toContain("Stage OSD1_TXT_RES for Screen 1");
    await fireEvent.click(action);

    expect(staged).toEqual([["OSD1_TXT_RES", 3]]);
  });

  it("replaces the action with staged status when the target mode is already staged", () => {
    const target = osdDisplayTargetPreset("walksnail_avatar");
    renderGuide({
      OSD_TYPE: 5,
      MSP_OPTIONS: 0,
      OSD1_TXT_RES: 1,
      OSD1_ALTITUDE_EN: 1,
      OSD1_ALTITUDE_X: 3,
      OSD1_ALTITUDE_Y: 4,
    }, target, [], {
      OSD1_TXT_RES: {
        name: "OSD1_TXT_RES",
        label: "OSD1_TXT_RES",
        rawName: "OSD1_TXT_RES",
        description: null,
        currentValue: 1,
        currentValueText: "1",
        nextValue: 3,
        nextValueText: "3",
        units: null,
        rebootRequired: false,
        order: 2,
      },
    });

    expect(screen.queryByTestId(setupWorkspaceTestIds.osdSetupStageGridAction)).toBeNull();
    const badge = screen.getByTestId(`${setupWorkspaceTestIds.osdSetupStagedPrefix}-OSD1_TXT_RES`);
    expect(badge.parentElement?.textContent).toMatch(/OSD1_TXT_RES=3.*is staged for Screen 1/i);
  });

  it("disables target-mode staging for missing and read-only TXT_RES parameters", () => {
    const target = osdDisplayTargetPreset("hdzero");
    renderGuide({
      OSD_TYPE: 5,
      MSP_OPTIONS: 0,
      OSD1_ALTITUDE_EN: 1,
      OSD1_ALTITUDE_X: 3,
      OSD1_ALTITUDE_Y: 4,
    }, target);
    expect(screen.getByTestId<HTMLButtonElement>(setupWorkspaceTestIds.osdSetupStageGridAction).disabled).toBe(true);

    cleanup();
    renderGuide({
      OSD_TYPE: 5,
      MSP_OPTIONS: 0,
      OSD1_TXT_RES: 0,
      OSD1_ALTITUDE_EN: 1,
      OSD1_ALTITUDE_X: 3,
      OSD1_ALTITUDE_Y: 4,
    }, target, ["OSD1_TXT_RES"]);
    expect(screen.getByTestId<HTMLButtonElement>(setupWorkspaceTestIds.osdSetupStageGridAction).disabled).toBe(true);
    expect(screen.getByText(/OSD1_TXT_RES is read-only/i)).toBeTruthy();
  });
});

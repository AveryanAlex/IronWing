// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { ParamStore } from "../../../../params";
import type { ParameterItemModel } from "../../../../lib/params/parameter-item-model";
import {
  buildArduPilotOsdModel,
  type ArduPilotOsdModel,
} from "../../../../lib/osd/ardupilot-osd-model";
import { setupWorkspaceTestIds } from "../../setup-workspace-test-ids";
import OsdEditor from "./OsdEditor.svelte";

const OriginalPointerEvent = globalThis.PointerEvent;

class TestPointerEvent extends MouseEvent {
  readonly pointerId: number;
  readonly pointerType: string;

  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 0;
    this.pointerType = init.pointerType ?? "mouse";
  }
}

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

function renderEditor(
  parameters: Record<string, number>,
  stagedEdits: Record<string, { nextValue: number }> = {},
) {
  const model: ArduPilotOsdModel = buildArduPilotOsdModel({
    paramStore: createParamStore(parameters),
    stagedEdits,
  });
  const staged: Array<[string, number]> = [];

  render(OsdEditor, {
    props: {
      model,
      selectedScreen: 1,
      itemIndex: createItemIndex(parameters),
      onSelectScreen: () => {},
      onStageParam: (name, value) => staged.push([name, value]),
    },
  });

  return { model, staged };
}

function setRect(element: Element, rect: { left: number; top: number; width: number; height: number }) {
  const value = {
    ...rect,
    x: rect.left,
    y: rect.top,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    toJSON: () => ({}),
  } as DOMRect;
  Object.defineProperty(element, "getBoundingClientRect", { configurable: true, value: () => value });
}

function installPointerCapture(element: Element) {
  const captured = new Set<number>();
  Object.defineProperties(element, {
    setPointerCapture: {
      configurable: true,
      value: (pointerId: number) => captured.add(pointerId),
    },
    hasPointerCapture: {
      configurable: true,
      value: (pointerId: number) => captured.has(pointerId),
    },
    releasePointerCapture: {
      configurable: true,
      value: (pointerId: number) => captured.delete(pointerId),
    },
  });
}

function prepareDragSurfaces(source: Element) {
  const grid = screen.getByTestId(setupWorkspaceTestIds.osdGrid);
  const library = screen.getByTestId(setupWorkspaceTestIds.osdLibrary);
  setRect(grid, { left: 0, top: 0, width: 300, height: 160 });
  setRect(library, { left: 320, top: 0, width: 300, height: 400 });
  installPointerCapture(source);
}

beforeAll(() => {
  Object.defineProperty(globalThis, "PointerEvent", {
    configurable: true,
    value: TestPointerEvent,
  });
});

afterAll(() => {
  Object.defineProperty(globalThis, "PointerEvent", {
    configurable: true,
    value: OriginalPointerEvent,
  });
});

afterEach(cleanup);

describe("OsdEditor", () => {
  it("renders distinct direct percentage positions for placed items", () => {
    renderEditor({
      OSD1_ALTITUDE_EN: 1,
      OSD1_ALTITUDE_X: 3,
      OSD1_ALTITUDE_Y: 4,
      OSD1_BAT_VOLT_EN: 1,
      OSD1_BAT_VOLT_X: 24,
      OSD1_BAT_VOLT_Y: 9,
    });

    const altitude = screen.getByTestId(`${setupWorkspaceTestIds.osdGridItemPrefix}-1-ALTITUDE`);
    const battery = screen.getByTestId(`${setupWorkspaceTestIds.osdGridItemPrefix}-1-BAT_VOLT`);

    expect(altitude.style.left).toBe("10%");
    expect(altitude.style.top).toBe("25%");
    expect(battery.style.left).toBe("80%");
    expect(battery.style.top).toBe("56.25%");
    expect(battery.style.width).toBe("20%");
    expect(battery.style.minWidth).toBe("2rem");
    expect(battery.style.maxWidth).toBe("6rem");
  });

  it("filters available chips by label or raw parameter prefix and links to all screen parameters", async () => {
    renderEditor({
      OSD1_ALTITUDE_EN: 1,
      OSD1_ALTITUDE_X: 0,
      OSD1_ALTITUDE_Y: 0,
      OSD1_GPSLAT_EN: 0,
      OSD1_GPSLAT_X: 9,
      OSD1_GPSLAT_Y: 13,
      OSD1_GSPEED_EN: 0,
      OSD1_GSPEED_X: 2,
      OSD1_GSPEED_Y: 2,
    });

    await fireEvent.input(screen.getByTestId(setupWorkspaceTestIds.osdLibrarySearch), {
      target: { value: "OSD1_GPSLAT" },
    });

    expect(screen.getByTestId(`${setupWorkspaceTestIds.osdLibraryItemPrefix}-1-GPSLAT`)).toBeTruthy();
    expect(screen.queryByTestId(`${setupWorkspaceTestIds.osdLibraryItemPrefix}-1-GSPEED`)).toBeNull();
    expect(screen.getByTestId(setupWorkspaceTestIds.osdAdvancedParametersLink).getAttribute("href"))
      .toBe("/setup/full-parameters?search=OSD1_&filter=all");
  });

  it("places an available item from its compact chip with only changed default coordinates", async () => {
    const { staged } = renderEditor({
      OSD1_ALTITUDE_EN: 1,
      OSD1_ALTITUDE_X: 0,
      OSD1_ALTITUDE_Y: 0,
      OSD1_BAT_VOLT_EN: 0,
      OSD1_BAT_VOLT_X: 0,
      OSD1_BAT_VOLT_Y: 0,
    });

    await fireEvent.click(screen.getByRole("button", { name: /Bat Volt.*press to place/i }));

    expect(staged).toEqual([
      ["OSD1_BAT_VOLT_EN", 1],
      ["OSD1_BAT_VOLT_X", 1],
    ]);
  });

  it("previews a library drag and stages enable plus final coordinates only on release", async () => {
    const { staged } = renderEditor({
      OSD1_ALTITUDE_EN: 1,
      OSD1_ALTITUDE_X: 0,
      OSD1_ALTITUDE_Y: 0,
      OSD1_BAT_VOLT_EN: 0,
      OSD1_BAT_VOLT_X: 0,
      OSD1_BAT_VOLT_Y: 0,
    });
    const chip = screen.getByTestId(`${setupWorkspaceTestIds.osdLibraryItemPrefix}-1-BAT_VOLT`);
    prepareDragSurfaces(chip);

    await fireEvent.pointerDown(chip, {
      button: 0,
      clientX: 350,
      clientY: 80,
      pointerId: 7,
      pointerType: "mouse",
    });
    await fireEvent.pointerMove(window, { clientX: 125, clientY: 75, pointerId: 7, pointerType: "mouse" });

    expect(staged).toEqual([]);

    await fireEvent.pointerUp(window, { clientX: 125, clientY: 75, pointerId: 7, pointerType: "mouse" });

    expect(staged).toEqual([
      ["OSD1_BAT_VOLT_EN", 1],
      ["OSD1_BAT_VOLT_X", 12],
      ["OSD1_BAT_VOLT_Y", 7],
    ]);
  });

  it("moves a placed chip with its grab offset and commits only its final cell", async () => {
    const { staged } = renderEditor({
      OSD1_BAT_VOLT_EN: 1,
      OSD1_BAT_VOLT_X: 3,
      OSD1_BAT_VOLT_Y: 4,
    });
    const chip = screen.getByTestId(`${setupWorkspaceTestIds.osdGridItemPrefix}-1-BAT_VOLT`);
    prepareDragSurfaces(chip);

    await fireEvent.pointerDown(chip, {
      button: 0,
      clientX: 35,
      clientY: 45,
      pointerId: 11,
      pointerType: "mouse",
    });
    await fireEvent.pointerMove(window, { clientX: 125, clientY: 95, pointerId: 11, pointerType: "mouse" });

    expect(staged).toEqual([]);
    expect(chip.getAttribute("data-grid-x")).toBe("12");
    expect(chip.getAttribute("data-grid-y")).toBe("9");

    await fireEvent.pointerUp(window, { clientX: 125, clientY: 95, pointerId: 11, pointerType: "mouse" });

    expect(staged).toEqual([
      ["OSD1_BAT_VOLT_X", 12],
      ["OSD1_BAT_VOLT_Y", 9],
    ]);
  });

  it("disables a chip dropped into the library and restores its staged coordinate", async () => {
    const { staged } = renderEditor(
      {
        OSD1_BAT_VOLT_EN: 1,
        OSD1_BAT_VOLT_X: 3,
        OSD1_BAT_VOLT_Y: 4,
      },
      { OSD1_BAT_VOLT_X: { nextValue: 12 } },
    );
    const chip = screen.getByTestId(`${setupWorkspaceTestIds.osdGridItemPrefix}-1-BAT_VOLT`);
    prepareDragSurfaces(chip);

    await fireEvent.pointerDown(chip, {
      button: 0,
      clientX: 125,
      clientY: 45,
      pointerId: 13,
      pointerType: "mouse",
    });
    await fireEvent.pointerMove(window, { clientX: 350, clientY: 100, pointerId: 13, pointerType: "mouse" });
    await fireEvent.pointerUp(window, { clientX: 350, clientY: 100, pointerId: 13, pointerType: "mouse" });

    expect(staged).toEqual([
      ["OSD1_BAT_VOLT_EN", 0],
      ["OSD1_BAT_VOLT_X", 3],
    ]);
  });

  it("cancels a drag released outside the grid and library", async () => {
    const { staged } = renderEditor({
      OSD1_BAT_VOLT_EN: 1,
      OSD1_BAT_VOLT_X: 3,
      OSD1_BAT_VOLT_Y: 4,
    });
    const chip = screen.getByTestId(`${setupWorkspaceTestIds.osdGridItemPrefix}-1-BAT_VOLT`);
    prepareDragSurfaces(chip);

    await fireEvent.pointerDown(chip, {
      button: 0,
      clientX: 35,
      clientY: 45,
      pointerId: 17,
      pointerType: "mouse",
    });
    await fireEvent.pointerMove(window, { clientX: 700, clientY: 700, pointerId: 17, pointerType: "mouse" });
    await fireEvent.pointerUp(window, { clientX: 700, clientY: 700, pointerId: 17, pointerType: "mouse" });

    expect(staged).toEqual([]);
  });

  it("moves and removes a focused grid chip from the keyboard", async () => {
    const { staged } = renderEditor({
      OSD1_BAT_VOLT_EN: 1,
      OSD1_BAT_VOLT_X: 3,
      OSD1_BAT_VOLT_Y: 4,
    });
    const chip = screen.getByTestId(`${setupWorkspaceTestIds.osdGridItemPrefix}-1-BAT_VOLT`);

    await fireEvent.keyDown(chip, { key: "ArrowRight" });
    await fireEvent.keyDown(chip, { key: "Delete" });

    expect(staged).toEqual([
      ["OSD1_BAT_VOLT_X", 4],
      ["OSD1_BAT_VOLT_EN", 0],
    ]);
  });
});

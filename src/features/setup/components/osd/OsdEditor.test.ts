// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { ParamStore } from "../../../../params";
import type { ParameterItemModel } from "../../../../lib/params/parameter-item-model";
import {
  buildArduPilotOsdModel,
  type ArduPilotOsdModel,
} from "../../../../lib/osd/ardupilot-osd-model";
import {
  osdDisplayTargetPreset,
  type OsdDisplayTargetSelection,
} from "../../../../lib/osd/osd-display-target";
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
  displayTarget: OsdDisplayTargetSelection | null = null,
) {
  const model: ArduPilotOsdModel = buildArduPilotOsdModel({
    paramStore: createParamStore(parameters),
    stagedEdits,
    displayTarget,
    displayTargetScreen: 1,
  });
  const staged: Array<[string, number]> = [];

  render(OsdEditor, {
    props: {
      model,
      selectedScreen: 1,
      itemIndex: createItemIndex(parameters),
      previewSource: {
        telemetry: {},
        vehicleState: null,
        homePosition: null,
        statusMessage: null,
        connected: false,
        paramValues: parameters,
      },
      displayTarget,
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

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("OsdEditor", () => {
  it("resolves Auto to a 4:3 analog frame and a 16:9 digital frame", () => {
    renderEditor({
      OSD_TYPE: 1,
      OSD1_ALTITUDE_EN: 1,
      OSD1_ALTITUDE_X: 3,
      OSD1_ALTITUDE_Y: 4,
    });

    expect(screen.getByTestId(setupWorkspaceTestIds.osdFrame).getAttribute("data-frame-aspect")).toBe("4:3");
    expect(screen.getByTestId(setupWorkspaceTestIds.osdGrid).getAttribute("data-grid-rows")).toBe("16");
    expect(screen.getByTestId(setupWorkspaceTestIds.osdAnalogStandardSelect)).toBeTruthy();

    cleanup();
    renderEditor({
      OSD_TYPE: 5,
      OSD1_TXT_RES: 1,
      OSD1_ALTITUDE_EN: 1,
      OSD1_ALTITUDE_X: 3,
      OSD1_ALTITUDE_Y: 4,
    });

    expect(screen.getByTestId(setupWorkspaceTestIds.osdFrame).getAttribute("data-frame-aspect")).toBe("16:9");
    expect(screen.getByTestId(setupWorkspaceTestIds.osdGrid).getAttribute("data-grid-columns")).toBe("50");
    expect(screen.getByTestId(setupWorkspaceTestIds.osdGrid).getAttribute("data-grid-rows")).toBe("18");
    expect(screen.queryByTestId(setupWorkspaceTestIds.osdAnalogStandardSelect)).toBeNull();
  });

  it("requires a DisplayPort target while keeping removal available", async () => {
    const { staged } = renderEditor({
      OSD_TYPE: 5,
      OSD1_TXT_RES: 3,
      OSD1_BAT_VOLT_EN: 1,
      OSD1_BAT_VOLT_X: 3,
      OSD1_BAT_VOLT_Y: 4,
    });
    const warning = screen.getByTestId(setupWorkspaceTestIds.osdDisplayCompatibilityWarning);
    const chip = screen.getByTestId(`${setupWorkspaceTestIds.osdGridItemPrefix}-1-BAT_VOLT`);

    expect(warning.textContent).toContain("Display target required");
    expect(screen.getByTestId(setupWorkspaceTestIds.osdPreviewStatus).textContent).toContain("Display target required");

    await fireEvent.keyDown(chip, { key: "ArrowRight" });
    await fireEvent.keyDown(chip, { key: "Delete" });

    expect(staged).toEqual([["OSD1_BAT_VOLT_EN", 0]]);
  });

  it("blocks coordinate operations while the effective mode mismatches the target", async () => {
    const { staged } = renderEditor(
      {
        OSD_TYPE: 5,
        OSD1_TXT_RES: 1,
        OSD1_BAT_VOLT_EN: 1,
        OSD1_BAT_VOLT_X: 3,
        OSD1_BAT_VOLT_Y: 4,
        OSD1_ALTITUDE_EN: 0,
        OSD1_ALTITUDE_X: 8,
        OSD1_ALTITUDE_Y: 8,
      },
      {},
      osdDisplayTargetPreset("walksnail_avatar"),
    );
    const placed = screen.getByTestId(`${setupWorkspaceTestIds.osdGridItemPrefix}-1-BAT_VOLT`);
    const available = screen.getByTestId(`${setupWorkspaceTestIds.osdLibraryItemPrefix}-1-ALTITUDE`);

    expect(screen.getByTestId(setupWorkspaceTestIds.osdDisplayCompatibilityWarning).textContent)
      .toContain("Pending target grid");
    expect((available as HTMLButtonElement).disabled).toBe(true);

    await fireEvent.keyDown(placed, { key: "ArrowRight" });
    await fireEvent.click(available);
    expect(staged).toEqual([]);
  });

  it("unlocks coordinate editing for matching current and staged target modes", async () => {
    const target = osdDisplayTargetPreset("walksnail_avatar");
    const current = renderEditor(
      {
        OSD_TYPE: 5,
        OSD1_TXT_RES: 3,
        OSD1_BAT_VOLT_EN: 1,
        OSD1_BAT_VOLT_X: 3,
        OSD1_BAT_VOLT_Y: 4,
      },
      {},
      target,
    );

    expect(screen.queryByTestId(setupWorkspaceTestIds.osdDisplayCompatibilityWarning)).toBeNull();
    await fireEvent.keyDown(
      screen.getByTestId(`${setupWorkspaceTestIds.osdGridItemPrefix}-1-BAT_VOLT`),
      { key: "ArrowRight" },
    );
    expect(current.staged).toEqual([["OSD1_BAT_VOLT_X", 4]]);

    cleanup();
    const pending = renderEditor(
      {
        OSD_TYPE: 5,
        OSD1_TXT_RES: 1,
        OSD1_BAT_VOLT_EN: 1,
        OSD1_BAT_VOLT_X: 3,
        OSD1_BAT_VOLT_Y: 4,
      },
      { OSD1_TXT_RES: { nextValue: 3 } },
      target,
    );

    expect(screen.queryByTestId(setupWorkspaceTestIds.osdDisplayCompatibilityWarning)).toBeNull();
    await fireEvent.keyDown(
      screen.getByTestId(`${setupWorkspaceTestIds.osdGridItemPrefix}-1-BAT_VOLT`),
      { key: "ArrowRight" },
    );
    expect(pending.staged).toEqual([["OSD1_BAT_VOLT_X", 4]]);
  });

  it("changes the grid when mode-3 targets use different device geometry", () => {
    const parameters = {
      OSD_TYPE: 5,
      OSD1_TXT_RES: 3,
      OSD1_BAT_VOLT_EN: 1,
      OSD1_BAT_VOLT_X: 3,
      OSD1_BAT_VOLT_Y: 4,
    };
    renderEditor(parameters, {}, osdDisplayTargetPreset("walksnail_avatar"));
    expect(screen.getByTestId(setupWorkspaceTestIds.osdGrid).getAttribute("data-grid-columns")).toBe("53");
    expect(screen.getByTestId(setupWorkspaceTestIds.osdGrid).getAttribute("data-grid-rows")).toBe("20");

    cleanup();
    renderEditor(parameters, {}, osdDisplayTargetPreset("dji_wtfos"));
    expect(screen.getByTestId(setupWorkspaceTestIds.osdGrid).getAttribute("data-grid-columns")).toBe("60");
    expect(screen.getByTestId(setupWorkspaceTestIds.osdGrid).getAttribute("data-grid-rows")).toBe("22");
  });

  it("persists an explicit frame aspect independently of backend Auto detection", async () => {
    const parameters = {
      OSD_TYPE: 1,
      OSD1_ALTITUDE_EN: 1,
      OSD1_ALTITUDE_X: 3,
      OSD1_ALTITUDE_Y: 4,
    };
    renderEditor(parameters);

    await fireEvent.change(screen.getByTestId(setupWorkspaceTestIds.osdFrameAspectSelect), {
      target: { value: "16:9" },
    });

    expect(screen.getByTestId(setupWorkspaceTestIds.osdFrame).getAttribute("data-frame-aspect")).toBe("16:9");
    expect(localStorage.getItem("ironwing.setup.osd.frame_aspect")).toBe("16:9");

    cleanup();
    renderEditor(parameters);
    expect(screen.getByTestId<HTMLSelectElement>(setupWorkspaceTestIds.osdFrameAspectSelect).value).toBe("16:9");
    expect(screen.getByTestId(setupWorkspaceTestIds.osdFrame).getAttribute("data-frame-aspect")).toBe("16:9");
  });

  it("uses the NTSC 30x13 grid for clipping and drag bounds", async () => {
    const { staged } = renderEditor({
      OSD_TYPE: 1,
      OSD1_ALTITUDE_EN: 1,
      OSD1_ALTITUDE_X: 3,
      OSD1_ALTITUDE_Y: 15,
      OSD1_BAT_VOLT_EN: 0,
      OSD1_BAT_VOLT_X: 0,
      OSD1_BAT_VOLT_Y: 0,
    });

    await fireEvent.change(screen.getByTestId(setupWorkspaceTestIds.osdAnalogStandardSelect), {
      target: { value: "ntsc" },
    });

    const grid = screen.getByTestId(setupWorkspaceTestIds.osdGrid);
    const altitude = screen.getByTestId(`${setupWorkspaceTestIds.osdGridItemPrefix}-1-ALTITUDE`);
    expect(grid.getAttribute("data-grid-columns")).toBe("30");
    expect(grid.getAttribute("data-grid-rows")).toBe("13");
    expect(altitude.getAttribute("data-current-glyph-count")).toBe("0");
    expect(screen.getByText(/1 item is outside the NTSC 30 x 13 grid/i)).toBeTruthy();
    expect(localStorage.getItem("ironwing.setup.osd.analog_standard")).toBe("ntsc");

    const chip = screen.getByTestId(`${setupWorkspaceTestIds.osdLibraryItemPrefix}-1-BAT_VOLT`);
    prepareDragSurfaces(chip);
    await fireEvent.pointerDown(chip, {
      button: 0,
      clientX: 350,
      clientY: 80,
      pointerId: 23,
      pointerType: "mouse",
    });
    await fireEvent.pointerMove(window, { clientX: 125, clientY: 159, pointerId: 23, pointerType: "mouse" });
    await fireEvent.pointerUp(window, { clientX: 125, clientY: 159, pointerId: 23, pointerType: "mouse" });

    expect(staged).toEqual([
      ["OSD1_BAT_VOLT_EN", 1],
      ["OSD1_BAT_VOLT_X", 12],
      ["OSD1_BAT_VOLT_Y", 12],
    ]);
  });

  it("centers a 4:3 analog grid plane at 75% width when pillarboxed in 16:9", async () => {
    renderEditor({
      OSD_TYPE: 1,
      OSD1_ALTITUDE_EN: 1,
      OSD1_ALTITUDE_X: 3,
      OSD1_ALTITUDE_Y: 4,
    });

    await fireEvent.change(screen.getByTestId(setupWorkspaceTestIds.osdFrameAspectSelect), {
      target: { value: "16:9" },
    });
    await fireEvent.change(screen.getByTestId(setupWorkspaceTestIds.osdAnalogWidePresentationSelect), {
      target: { value: "pillarbox" },
    });

    const grid = screen.getByTestId(setupWorkspaceTestIds.osdGrid);
    expect(grid.getAttribute("data-grid-presentation")).toBe("pillarbox");
    expect(grid.style.left).toBe("12.5%");
    expect(grid.style.width).toBe("75%");
    expect(localStorage.getItem("ironwing.setup.osd.analog_wide_presentation")).toBe("pillarbox");
  });

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

    expect(altitude.getAttribute("data-grid-x")).toBe("3");
    expect(altitude.getAttribute("data-grid-y")).toBe("4");
    expect(altitude.getAttribute("data-max-width")).toBe("5");
    expect(altitude.querySelectorAll("[data-osd-hit-cell]")).toHaveLength(5);
    expect(battery.getAttribute("data-grid-x")).toBe("24");
    expect(battery.getAttribute("data-grid-y")).toBe("9");
    expect(battery.getAttribute("data-max-width")).toBe("6");
    expect(battery.querySelectorAll("[data-osd-hit-cell]")).toHaveLength(5);
    expect(battery.getAttribute("data-mode")).toBe("live");
  });

  it("exposes pointer cells only for glyphs that remain visible after overlap", () => {
    renderEditor({
      OSD1_MESSAGE_EN: 1,
      OSD1_MESSAGE_X: 0,
      OSD1_MESSAGE_Y: 0,
      OSD1_HEADING_EN: 1,
      OSD1_HEADING_X: 0,
      OSD1_HEADING_Y: 0,
    });

    const message = screen.getByTestId(`${setupWorkspaceTestIds.osdGridItemPrefix}-1-MESSAGE`);
    const heading = screen.getByTestId(`${setupWorkspaceTestIds.osdGridItemPrefix}-1-HEADING`);
    const messageCells = [...message.querySelectorAll("[data-osd-hit-cell]")].map((cell) => cell.getAttribute("data-cell-x"));
    const headingCells = [...heading.querySelectorAll("[data-osd-hit-cell]")].map((cell) => cell.getAttribute("data-cell-x"));

    expect(message.getAttribute("data-max-width")).toBe("26");
    expect(messageCells).not.toContain("0");
    expect(messageCells).toContain("4");
    expect(headingCells.sort()).toEqual(["0", "1", "2", "3"]);
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
      .toBe("/setup/parameters?search=OSD1_&filter=all");
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
      ["OSD1_BAT_VOLT_X", 5],
    ]);
  });

  it("opens in pilot preview, persists cards mode, and keeps maximum card footprints", async () => {
    const parameters = {
      OSD1_BAT_VOLT_EN: 1,
      OSD1_BAT_VOLT_X: 3,
      OSD1_BAT_VOLT_Y: 4,
    };
    renderEditor(parameters);

    const grid = screen.getByTestId(setupWorkspaceTestIds.osdGrid);
    expect(grid.getAttribute("data-editor-mode")).toBe("live");

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.osdCardsMode));
    expect(grid.getAttribute("data-editor-mode")).toBe("cards");
    expect(localStorage.getItem("ironwing.setup.osd.editor_mode")).toBe("cards");
    expect(screen.getByTestId(`${setupWorkspaceTestIds.osdGridItemPrefix}-1-BAT_VOLT`).style.width).toBe("20%");

    cleanup();
    renderEditor(parameters);
    expect(screen.getByTestId(setupWorkspaceTestIds.osdGrid).getAttribute("data-editor-mode")).toBe("cards");
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
    expect(screen.getByTestId(setupWorkspaceTestIds.osdGrid).querySelector("[data-osd-max-outline]")?.getAttribute("data-outline-tone"))
      .toBe("drag");

    await fireEvent.pointerUp(window, { clientX: 125, clientY: 95, pointerId: 11, pointerType: "mouse" });

    expect(staged).toEqual([
      ["OSD1_BAT_VOLT_X", 12],
      ["OSD1_BAT_VOLT_Y", 9],
    ]);
    expect(screen.getByTestId(setupWorkspaceTestIds.osdGrid).querySelector("[data-osd-max-outline]"))
      .toBeNull();
  });

  it("shows the maximum outline only while inspecting and not merely because an item is staged", async () => {
    renderEditor(
      {
        OSD1_BAT_VOLT_EN: 1,
        OSD1_BAT_VOLT_X: 3,
        OSD1_BAT_VOLT_Y: 4,
      },
      { OSD1_BAT_VOLT_X: { nextValue: 12 } },
    );
    const grid = screen.getByTestId(setupWorkspaceTestIds.osdGrid);
    const item = screen.getByTestId(`${setupWorkspaceTestIds.osdGridItemPrefix}-1-BAT_VOLT`);

    expect(grid.querySelector("[data-osd-max-outline]")).toBeNull();
    await fireEvent.pointerEnter(item);
    expect(grid.querySelector("[data-osd-max-outline]")?.getAttribute("data-outline-tone")).toBe("inspect");
    await fireEvent.pointerLeave(item);
    expect(grid.querySelector("[data-osd-max-outline]")).toBeNull();
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

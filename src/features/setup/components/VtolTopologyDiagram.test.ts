// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ParamStore } from "../../../params";
import { buildVtolTopologyModel } from "../../../lib/setup/vtol-topology-model";
import { setupControlLocked } from "../../../lib/setup/control-availability";
import VtolTopologyDiagram from "./VtolTopologyDiagram.svelte";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});

function topology() {
  const entries: Record<string, number> = {
    Q_ENABLE: 1,
    Q_FRAME_CLASS: 7,
    Q_FRAME_TYPE: 0,
    Q_TILT_ENABLE: 1,
    Q_TILT_TYPE: 0,
    Q_TILT_MASK: 0,
  };
  const params: ParamStore["params"] = {};
  let index = 0;
  for (const [name, value] of Object.entries(entries)) {
    params[name] = { name, value, param_type: "real32", index: index++ };
  }
  return buildVtolTopologyModel({
    paramStore: { params, expected_count: index },
    stagedEdits: {},
  }).proposed;
}

describe("VtolTopologyDiagram", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("selects tilt-mask motors from the diagram without presenting the Tri yaw actuator as a propeller", async () => {
    const onMotorToggle = vi.fn();
    render(VtolTopologyDiagram, {
      props: {
        topology: topology(),
        selectableMask: "tilt",
        onMotorToggle,
      },
    });

    await fireEvent.click(screen.getByRole("button", { name: "Add Motor 1 from tilt mask" }));
    expect(onMotorToggle).toHaveBeenCalledWith(1);
    expect(screen.queryByRole("button", { name: /Motor 7/ })).toBeNull();
    expect(screen.getByText("Rear yaw servo")).toBeTruthy();
  });

  it("keeps a locked motor diagram explainable without toggling a motor", async () => {
    const onMotorToggle = vi.fn();
    render(VtolTopologyDiagram, {
      props: {
        topology: topology(),
        selectableMask: "tilt",
        availability: setupControlLocked(
          "apply_required",
          "Apply the staged configuration first",
          "Q_TILT_MASK becomes available after reboot and reconnect.",
        ),
        onMotorToggle,
      },
    });

    expect(screen.queryByRole("button", { name: /Motor 1/ })).toBeNull();
    await fireEvent.click(screen.getByLabelText(/Motor selection diagram.*Apply the staged configuration first/i));
    expect(await screen.findByText(/Q_TILT_MASK becomes available/i)).toBeTruthy();
    expect(onMotorToggle).not.toHaveBeenCalled();
  });
});

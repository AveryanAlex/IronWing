// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ParamMeta, ParamMetadataMap } from "../../../param-metadata";
import type { ParamStore } from "../../../params";
import type { VehicleState } from "../../../telemetry";
import type { ParamInputParams } from "../primitives/param-helpers";
import { FrameOrientationSection } from "./FrameOrientationSection";

function makeVehicleState(vehicle_type: string): VehicleState {
  return {
    armed: false,
    custom_mode: 0,
    mode_name: "",
    system_status: "",
    vehicle_type,
    autopilot: "",
    system_id: 1,
    component_id: 1,
    heartbeat_received: true,
  };
}

function makeStore(entries: Record<string, number>): ParamStore {
  const params: ParamStore["params"] = {};
  let index = 0;

  for (const [name, value] of Object.entries(entries)) {
    params[name] = { name, value, param_type: "real32", index: index++ };
  }

  return { params, expected_count: index };
}

function makeMetadata(entries: Record<string, ParamMeta>): ParamMetadataMap {
  return new Map(Object.entries(entries));
}

function makeParams({
  store = {
    Q_ENABLE: 0,
    AHRS_ORIENTATION: 0,
  },
  staged = {},
  metadata = makeMetadata({
    Q_ENABLE: {
      humanName: "QuadPlane Enable",
      description: "",
      values: [
        { code: 0, label: "Disabled" },
        { code: 1, label: "Enabled (QuadPlane)" },
      ],
    },
    Q_FRAME_CLASS: {
      humanName: "QuadPlane Frame Class",
      description: "",
      values: [
        { code: 1, label: "Quad" },
        { code: 10, label: "Custom" },
      ],
    },
    Q_FRAME_TYPE: {
      humanName: "QuadPlane Frame Type",
      description: "",
      values: [
        { code: 0, label: "Plus" },
        { code: 1, label: "X" },
      ],
    },
    AHRS_ORIENTATION: {
      humanName: "Board Orientation",
      description: "",
      values: [{ code: 0, label: "None" }],
    },
  }),
}: {
  store?: Record<string, number>;
  staged?: Record<string, number>;
  metadata?: ParamMetadataMap | null;
} = {}): ParamInputParams {
  return {
    store: makeStore(store),
    staged: new Map(Object.entries(staged)),
    metadata,
    stage: () => {},
  };
}

function renderSection({
  params = makeParams(),
  vehicleState = makeVehicleState("Fixed_Wing"),
}: {
  params?: ParamInputParams;
  vehicleState?: VehicleState | null;
} = {}) {
  return render(
    <FrameOrientationSection params={params} vehicleState={vehicleState} />,
  );
}

function getParamSelect(container: HTMLElement, paramName: string): HTMLSelectElement {
  const wrapper = container.querySelector(`[data-setup-param="${paramName}"]`);
  if (!(wrapper instanceof HTMLElement)) {
    throw new Error(`Missing param wrapper for ${paramName}`);
  }

  const select = wrapper.querySelector("select");
  if (!(select instanceof HTMLSelectElement)) {
    throw new Error(`Missing select for ${paramName}`);
  }

  return select;
}

describe("FrameOrientationSection", () => {
  it("replaces the fixed-wing dead end with a QuadPlane enable path", () => {
    const { container } = renderSection();

    expect(screen.getByText("QuadPlane Configuration")).toBeTruthy();
    expect(getParamSelect(container, "Q_ENABLE")).toBeTruthy();
    expect(
      screen.getByText(/Plane firmware can expose a QuadPlane setup path here/i),
    ).toBeTruthy();
    expect(
      screen.queryByText(/fixed-wing aircraft do not use frame class or type configuration/i),
    ).toBeNull();
  });

  it("keeps staged Q_ENABLE explicit until reboot and param refresh happen", () => {
    const { container } = renderSection({
      params: makeParams({
        staged: { Q_ENABLE: 1 },
        metadata: makeMetadata({
          AHRS_ORIENTATION: {
            humanName: "Board Orientation",
            description: "",
            values: [{ code: 0, label: "None" }],
          },
        }),
      }),
    });

    const qEnableSelect = getParamSelect(container, "Q_ENABLE");
    const qEnableOptions = within(qEnableSelect).getAllByRole("option");

    expect(qEnableOptions.map((option) => option.textContent)).toContain("Disabled");
    expect(qEnableOptions.map((option) => option.textContent)).toContain("Enabled (QuadPlane)");
    expect(screen.getByText(/QuadPlane enable is staged/i)).toBeTruthy();
  });

  it("switches to Q_FRAME ownership after refreshed QuadPlane params appear", () => {
    const { container } = renderSection({
      params: makeParams({
        store: {
          Q_ENABLE: 1,
          Q_FRAME_CLASS: 1,
          Q_FRAME_TYPE: 1,
          AHRS_ORIENTATION: 0,
        },
      }),
    });

    expect(screen.getByText("QuadPlane Frame")).toBeTruthy();
    expect(getParamSelect(container, "Q_FRAME_CLASS")).toBeTruthy();
    expect(getParamSelect(container, "Q_FRAME_TYPE")).toBeTruthy();
    expect(screen.getByText(/Motor layout preview/i)).toBeTruthy();
    expect(container.querySelector('[data-setup-param="Q_ENABLE"]')).toBeNull();
  });

  it("keeps partial VTOL param refreshes explicit and avoids showing the wrong frame UI", () => {
    const { container } = renderSection({
      params: makeParams({
        store: {
          Q_ENABLE: 1,
          Q_FRAME_CLASS: 1,
          AHRS_ORIENTATION: 0,
        },
      }),
    });

    expect(
      screen.getByText(/QuadPlane parameters are only partially available right now/i),
    ).toBeTruthy();
    expect(container.querySelector('[data-setup-param="Q_FRAME_CLASS"]')).toBeNull();
    expect(container.querySelector('[data-setup-param="Q_FRAME_TYPE"]')).toBeNull();
  });

  it("renders tilt-rotor specific copy for QuadPlane tilt profiles", () => {
    renderSection({
      params: makeParams({
        store: {
          Q_ENABLE: 1,
          Q_FRAME_CLASS: 10,
          Q_FRAME_TYPE: 0,
          Q_TILT_ENABLE: 1,
          AHRS_ORIENTATION: 0,
        },
      }),
    });

    expect(screen.getByText("Tilt-Rotor QuadPlane Frame")).toBeTruthy();
    expect(screen.getByText(/Tilt-rotor QuadPlane detected/i)).toBeTruthy();
  });

  it("renders tailsitter specific copy for QuadPlane tailsitter profiles", () => {
    renderSection({
      params: makeParams({
        store: {
          Q_ENABLE: 1,
          Q_FRAME_CLASS: 10,
          Q_FRAME_TYPE: 0,
          Q_TAILSIT_ENABLE: 1,
          AHRS_ORIENTATION: 0,
        },
      }),
    });

    expect(screen.getByText("Tailsitter QuadPlane Frame")).toBeTruthy();
    expect(screen.getByText(/Tailsitter QuadPlane detected/i)).toBeTruthy();
  });

  it("surfaces incomplete frame metadata instead of crashing when Q_FRAME enums are missing", () => {
    renderSection({
      params: makeParams({
        store: {
          Q_ENABLE: 1,
          Q_FRAME_CLASS: 1,
          Q_FRAME_TYPE: 1,
          AHRS_ORIENTATION: 0,
        },
        metadata: makeMetadata({
          Q_ENABLE: {
            humanName: "QuadPlane Enable",
            description: "",
            values: [
              { code: 0, label: "Disabled" },
              { code: 1, label: "Enabled (QuadPlane)" },
            ],
          },
          AHRS_ORIENTATION: {
            humanName: "Board Orientation",
            description: "",
            values: [{ code: 0, label: "None" }],
          },
        }),
      }),
    });

    expect(
      screen.getByText(/QuadPlane frame metadata is incomplete/i),
    ).toBeTruthy();
  });
});

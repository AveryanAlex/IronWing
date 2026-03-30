// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RcReceiverSection } from "./RcReceiverSection";
import type { ParamInputParams } from "../primitives/param-helpers";
import type { ParamStore } from "../../../params";
import type { Telemetry } from "../../../telemetry";

function makeStore(entries: Record<string, number>): ParamStore {
  const params: ParamStore["params"] = {};
  let index = 0;

  for (const [name, value] of Object.entries(entries)) {
    params[name] = { name, value, param_type: "real32", index: index++ };
  }

  return { params, expected_count: index };
}

function makeParams(overrides: Partial<ParamInputParams> = {}): ParamInputParams {
  return {
    store: makeStore({
      RCMAP_ROLL: 1,
      RCMAP_PITCH: 2,
      RCMAP_THROTTLE: 3,
      RCMAP_YAW: 4,
      RC_PROTOCOLS: 0,
      RSSI_TYPE: 3,
    }),
    staged: new Map(),
    metadata: null,
    stage: () => {},
    ...overrides,
  };
}

function renderSection({
  connected = true,
  telemetry = null,
  params = makeParams(),
}: {
  connected?: boolean;
  telemetry?: Telemetry | null;
  params?: ParamInputParams;
}) {
  return render(
    <RcReceiverSection
      params={params}
      connected={connected}
      telemetry={telemetry}
    />,
  );
}

afterEach(() => {
  cleanup();
});

describe("RcReceiverSection", () => {
  it("shows staged RC serial protocol assignments after rerender", () => {
    const store = makeStore({
      RCMAP_ROLL: 1,
      RCMAP_PITCH: 2,
      RCMAP_THROTTLE: 3,
      RCMAP_YAW: 4,
      RC_PROTOCOLS: 0,
      RSSI_TYPE: 3,
      SERIAL2_PROTOCOL: 1,
    });

    const { rerender } = renderSection({
      params: makeParams({
        store,
        staged: new Map(),
      }),
    });

    expect(screen.getByText(/No serial port configured for RC input/i)).toBeTruthy();
    expect(screen.queryByText("SERIAL2")).toBeNull();

    rerender(
      <RcReceiverSection
        params={makeParams({
          store,
          staged: new Map([["SERIAL2_PROTOCOL", 23]]),
        })}
        connected
        telemetry={null}
      />,
    );

    expect(screen.getByText(/RC input configured on:/i)).toBeTruthy();
    expect(screen.getByText("SERIAL2")).toBeTruthy();
    expect(screen.queryByText(/No serial port configured for RC input/i)).toBeNull();
  });

  it("renders up to 18 live channels with RSSI and mapping badges", () => {
    renderSection({
      telemetry: {
        rc_channels: [
          1000, 1050, 1100, 1150, 1200, 1250, 1300, 1350, 1400,
          1450, 1500, 1550, 1600, 1650, 1700, 1750, 1800, 1850,
        ],
        rc_rssi: 72,
      },
    });

    expect(screen.getByText("RSSI 72%")).toBeTruthy();
    expect(screen.getByText("CH1")).toBeTruthy();
    expect(screen.getByText("CH18")).toBeTruthy();
    expect(screen.getByText("1850")).toBeTruthy();
    expect(screen.getByLabelText("Roll mapped to channel 1")).toBeTruthy();
    expect(screen.getByLabelText("Pitch mapped to channel 2")).toBeTruthy();
    expect(screen.getByLabelText("Throttle mapped to channel 3")).toBeTruthy();
    expect(screen.getByLabelText("Yaw mapped to channel 4")).toBeTruthy();
  });

  it("shows a waiting state when connected but RC telemetry is not live yet", () => {
    renderSection({
      telemetry: { rc_rssi: 55 },
    });

    expect(screen.getByText(/Waiting for live RC channel data/i)).toBeTruthy();
    expect(screen.getByText("RSSI 55%")).toBeTruthy();
  });

  it("shows a disconnected state instead of a blank panel", () => {
    renderSection({
      connected: false,
      telemetry: {
        rc_channels: [1000, 1500, 2000],
        rc_rssi: 90,
      },
    });

    expect(screen.getByText("Connect to a vehicle to see live RC values.")).toBeTruthy();
    expect(screen.queryByText(/Waiting for live RC channel data/i)).toBeNull();
  });

  it("renders valid partial telemetry and ignores invalid mapping values", () => {
    const params = makeParams({
      store: makeStore({
        RCMAP_ROLL: 0,
        RCMAP_PITCH: 19,
        RCMAP_THROTTLE: 2.5,
        RCMAP_YAW: 4,
        RC_PROTOCOLS: 0,
        RSSI_TYPE: 3,
      }),
    });

    renderSection({
      params,
      telemetry: {
        rc_channels: [1100, Number.NaN, 65535, 1400],
      },
    });

    expect(screen.getByText("RSSI --")).toBeTruthy();
    expect(screen.getByText("CH1")).toBeTruthy();
    expect(screen.getByText("CH4")).toBeTruthy();
    expect(screen.queryByText("CH2")).toBeNull();
    expect(screen.queryByText("CH3")).toBeNull();
    expect(screen.getByLabelText("Yaw mapped to channel 4")).toBeTruthy();
    expect(screen.queryByLabelText("Roll mapped to channel 1")).toBeNull();
    expect(screen.queryByLabelText("Pitch mapped to channel 19")).toBeNull();
    expect(screen.queryByLabelText("Throttle mapped to channel 2")).toBeNull();
  });
});

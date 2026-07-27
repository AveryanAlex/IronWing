// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import AttitudeOrientationGauge from "./AttitudeOrientationGauge.svelte";

afterEach(() => {
  cleanup();
});

describe("AttitudeOrientationGauge", () => {
  it("keeps attitude values available when WebGL cannot initialize", () => {
    render(AttitudeOrientationGauge, {
      props: {
        pitchDeg: -4.25,
        rollDeg: 12.5,
        vehicleType: "quadrotor",
        yawDeg: 87.75,
      },
    });

    expect(screen.getByRole("img", { name: "Three-dimensional vehicle attitude, north referenced" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("3D view unavailable");
    expect(screen.getByText("live")).toBeTruthy();
    expect(screen.getByText("12.5°")).toBeTruthy();
    expect(screen.getByText("-4.3°")).toBeTruthy();
    expectAllByText("87.8°", 2);
  });

  it("preserves waiting and stale status semantics", () => {
    const waiting = render(AttitudeOrientationGauge);
    expect(screen.getByText("waiting")).toBeTruthy();
    waiting.unmount();

    render(AttitudeOrientationGauge, { props: { rollDeg: 2, stale: true } });
    expect(screen.getByText("stale")).toBeTruthy();
  });
});

function expectAllByText(text: string, count: number) {
  expect(screen.getAllByText(text)).toHaveLength(count);
}

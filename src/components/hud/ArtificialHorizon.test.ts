// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import ArtificialHorizon from "./ArtificialHorizon.svelte";

describe("ArtificialHorizon", () => {
  afterEach(() => {
    cleanup();
  });

  it("projects instruments from the SVS viewport", () => {
    const { container } = render(ArtificialHorizon, {
      pitch: 10,
      roll: 0,
      size: { width: 400, height: 300 },
      verticalFovDeg: 60,
      projectionViewport: {
        width: 800,
        height: 600,
        offsetLeft: 200,
        offsetTop: 100,
      },
    });

    const projectionGroup = container.querySelector<SVGGElement>("[data-testid='hud-horizon-projection']");

    expect(projectionGroup?.getAttribute("transform")).toContain("translate(200, 200)");
    expect(container.querySelector("[data-testid='hud-horizon-line']")).toBeNull();
    expect(container.querySelector("[data-testid='hud-horizon-grid']")).toBeNull();
  });

  it("allows stabilized visual attitude without changing pitch and roll readouts", () => {
    const { container } = render(ArtificialHorizon, {
      pitch: 20,
      roll: 15,
      visualPitch: 0,
      visualRoll: 0,
      size: { width: 400, height: 300 },
      verticalFovDeg: 60,
    });

    const projectionGroup = container.querySelector<SVGGElement>("[data-testid='hud-horizon-projection']");

    expect(projectionGroup?.getAttribute("transform")).toContain("rotate(0)");
    expect(container.textContent).toContain("P 20.0°");
    expect(container.textContent).toContain("R 15.0°");
  });

  it("renders central instruments without a local attitude-fill rectangle", () => {
    const { container } = render(ArtificialHorizon, {
      pitch: 0,
      roll: 0,
      size: { width: 400, height: 300 },
    });

    expect(container.querySelector("[data-testid='hud-horizon-sky']")).toBeNull();
    expect(container.querySelector("[data-testid='hud-horizon-ground']")).toBeNull();
    expect(container.querySelector("[data-testid='hud-horizon-grid']")).toBeNull();
    expect(container.querySelector("[data-testid='hud-horizon-line']")).toBeNull();
    expect(container.textContent).toContain("P 0.0°");
  });
});

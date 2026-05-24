// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import AttitudeBackground from "./AttitudeBackground.svelte";

describe("AttitudeBackground", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders projected sky, ground, grid, and horizon separator", () => {
    const { container } = render(AttitudeBackground, {
      pitch: 10,
      roll: 0,
      size: { width: 800, height: 600 },
      verticalFovDeg: 60,
    });

    const horizonLine = container.querySelector<SVGLineElement>("[data-testid='attitude-background-horizon-line']");
    const skyGrid = container.querySelector<SVGGElement>("[data-testid='attitude-background-sky-grid']");
    const groundGrid = container.querySelector<SVGGElement>("[data-testid='attitude-background-ground-grid']");
    const focalLengthPx = (600 / 2) / Math.tan(toRadians(60 / 2));
    const expectedHorizonY = Math.tan(toRadians(10)) * focalLengthPx;

    expect(container.querySelector("[data-testid='attitude-background-sky']")).not.toBeNull();
    expect(container.querySelector("[data-testid='attitude-background-ground']")).not.toBeNull();
    expect(skyGrid?.querySelector("line")).not.toBeNull();
    expect(groundGrid?.querySelector("line")).not.toBeNull();
    expect(skyGrid?.getAttribute("transform")).toBe(`translate(0, ${expectedHorizonY})`);
    expect(groundGrid?.getAttribute("transform")).toBe(`translate(0, ${expectedHorizonY})`);
    expect(numberAttribute(horizonLine, "y1")).toBeCloseTo(expectedHorizonY, 3);
    expect(numberAttribute(horizonLine, "y2")).toBeCloseTo(expectedHorizonY, 3);
    expect(numberAttribute(horizonLine, "x1")).toBe(-800);
    expect(numberAttribute(horizonLine, "x2")).toBe(800);
  });

  it("keeps the sky grid orthographic and extends ground depth lines across the horizon", () => {
    const { container } = render(AttitudeBackground, {
      pitch: 0,
      roll: 0,
      size: { width: 800, height: 600 },
      verticalFovDeg: 60,
    });

    const skyGrid = container.querySelector<SVGGElement>("[data-testid='attitude-background-sky-grid']");
    const groundGrid = container.querySelector<SVGGElement>("[data-testid='attitude-background-ground-grid']");
    const skyVerticalLine = skyGrid?.querySelector<SVGLineElement>("line");
    const groundDepthLines = Array.from(groundGrid?.querySelectorAll<SVGLineElement>("line") ?? []).filter(
      (line) => numberAttribute(line, "x1") === numberAttribute(line, "x2") && numberAttribute(line, "y1") === 0,
    );
    const minGroundDepthX = Math.min(...groundDepthLines.map((line) => numberAttribute(line, "x1")));
    const maxGroundDepthX = Math.max(...groundDepthLines.map((line) => numberAttribute(line, "x1")));

    expect(numberAttribute(skyVerticalLine, "x1")).toBe(numberAttribute(skyVerticalLine, "x2"));
    expect(numberAttribute(skyVerticalLine, "y2")).toBe(0);
    expect(groundDepthLines.length).toBeGreaterThan(0);
    expect(minGroundDepthX).toBeLessThanOrEqual(-400);
    expect(maxGroundDepthX).toBeGreaterThanOrEqual(400);
  });

  it("extends ground cross-lines across the full visible ground area", () => {
    const { container } = render(AttitudeBackground, {
      pitch: 0,
      roll: 0,
      size: { width: 800, height: 600 },
      verticalFovDeg: 60,
    });

    const groundGrid = container.querySelector<SVGGElement>("[data-testid='attitude-background-ground-grid']");
    const crossLines = Array.from(groundGrid?.querySelectorAll<SVGLineElement>("line") ?? []).filter((line) => {
      const y1 = numberAttribute(line, "y1");
      return y1 === numberAttribute(line, "y2") && y1 > 0;
    });
    const farWidth = lineWidth(crossLines[0]);
    const nearWidth = lineWidth(crossLines[crossLines.length - 1]);

    expect(crossLines.length).toBeGreaterThan(0);
    expect(farWidth).toBeGreaterThan(800);
    expect(nearWidth).toBe(farWidth);
  });

  it("covers the full screen width with horizon-to-viewer ground lines", () => {
    const { container } = render(AttitudeBackground, {
      pitch: 0,
      roll: 0,
      size: { width: 800, height: 600 },
      verticalFovDeg: 60,
    });

    const groundGrid = container.querySelector<SVGGElement>("[data-testid='attitude-background-ground-grid']");
    const depthLines = Array.from(groundGrid?.querySelectorAll<SVGLineElement>("line") ?? []).filter(
      (line) => numberAttribute(line, "x1") === numberAttribute(line, "x2") && numberAttribute(line, "y1") === 0,
    );
    const minX = Math.min(...depthLines.map((line) => numberAttribute(line, "x1")));
    const maxX = Math.max(...depthLines.map((line) => numberAttribute(line, "x1")));

    expect(depthLines.length).toBeGreaterThan(0);
    expect(minX).toBeLessThanOrEqual(-400);
    expect(maxX).toBeGreaterThanOrEqual(400);
  });

  it("covers side ground near the horizon with horizon-to-viewer lines", () => {
    const { container } = render(AttitudeBackground, {
      pitch: 20,
      roll: 0,
      size: { width: 800, height: 600 },
      verticalFovDeg: 60,
    });

    const groundGrid = container.querySelector<SVGGElement>("[data-testid='attitude-background-ground-grid']");
    const depthLines = Array.from(groundGrid?.querySelectorAll<SVGLineElement>("line") ?? []).filter(
      (line) => numberAttribute(line, "x1") === numberAttribute(line, "x2") && numberAttribute(line, "y1") === 0,
    );
    const minX = Math.min(...depthLines.map((line) => numberAttribute(line, "x1")));
    const maxX = Math.max(...depthLines.map((line) => numberAttribute(line, "x1")));

    expect(depthLines.length).toBeGreaterThan(0);
    expect(minX).toBeLessThanOrEqual(-400);
    expect(maxX).toBeGreaterThanOrEqual(400);
  });
});

function lineWidth(element: Element | null | undefined): number {
  return numberAttribute(element, "x2") - numberAttribute(element, "x1");
}

function numberAttribute(element: Element | null | undefined, attributeName: string): number {
  const value = element?.getAttribute(attributeName);
  expect(value).not.toBeNull();
  return Number(value);
}

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

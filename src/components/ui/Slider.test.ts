// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Slider from "./Slider.svelte";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Slider", () => {
  it("keeps logarithmic slider accessibility and keyboard changes in the raw domain", async () => {
    const onValueChange = vi.fn();
    const onValueCommit = vi.fn();
    render(Slider, {
      props: {
        value: 181,
        min: 1,
        max: 32767,
        step: 1,
        scale: "log",
        unit: " m",
        ariaLabel: "Waypoint radius",
        onValueChange,
        onValueCommit,
      },
    });

    const slider = screen.getByRole("slider", { name: "Waypoint radius" });
    expect(slider.getAttribute("aria-valuemin")).toBe("1");
    expect(slider.getAttribute("aria-valuemax")).toBe("32767");
    expect(slider.getAttribute("aria-valuenow")).toBe("181");
    expect(slider.getAttribute("aria-valuetext")).toBe("181 m");

    await fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(onValueChange).toHaveBeenLastCalledWith(182);
    expect(onValueCommit).toHaveBeenLastCalledWith(182);
    expect(slider.getAttribute("aria-valuenow")).toBe("182");

    await fireEvent.keyDown(slider, { key: "End" });
    expect(onValueChange).toHaveBeenLastCalledWith(32767);
    expect(onValueCommit).toHaveBeenLastCalledWith(32767);
  });

  it("converts logarithmic pointer positions back to raw values", async () => {
    const onValueChange = vi.fn();
    render(Slider, {
      props: {
        value: 1,
        min: 1,
        max: 32767,
        step: 1,
        scale: "log",
        testId: "log-slider",
        onValueChange,
      },
    });

    const root = screen.getByTestId("log-slider");
    vi.spyOn(root, "getBoundingClientRect").mockReturnValue({
      bottom: 20,
      height: 20,
      left: 0,
      right: 1000,
      top: 0,
      width: 1000,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    await fireEvent.pointerDown(root, { button: 0, clientX: 500, clientY: 10 });
    expect(onValueChange).toHaveBeenLastCalledWith(181);
    await fireEvent.pointerUp(document);
  });

  it("retains linear keyboard behavior by default", async () => {
    const onValueChange = vi.fn();
    render(Slider, {
      props: {
        value: 5,
        min: 0,
        max: 10,
        step: 1,
        ariaLabel: "Linear value",
        onValueChange,
      },
    });

    await fireEvent.keyDown(screen.getByRole("slider", { name: "Linear value" }), { key: "ArrowRight" });
    expect(onValueChange).toHaveBeenLastCalledWith(6);
  });
});

// @vitest-environment jsdom

import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { SetupCheckbox } from "./SetupCheckbox";

afterEach(() => {
  cleanup();
});

describe("SetupCheckbox", () => {
  it("renders an interactive checkbox button and calls onChange", () => {
    const onChange = vi.fn();

    render(<SetupCheckbox checked={false} onChange={onChange} />);

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox.tagName).toBe("BUTTON");
    expect(checkbox.getAttribute("aria-checked")).toBe("false");

    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("renders a mixed state checkbox with aria-checked=mixed", () => {
    render(<SetupCheckbox checked="mixed" />);

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox.tagName).toBe("SPAN");
    expect(checkbox.getAttribute("aria-checked")).toBe("mixed");
  });

  it("renders a non-interactive span when disabled even if onChange is provided", () => {
    const onChange = vi.fn();

    render(<SetupCheckbox checked={true} onChange={onChange} disabled />);

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox.tagName).toBe("SPAN");
    expect(checkbox.getAttribute("aria-checked")).toBe("true");

    fireEvent.click(checkbox);
    expect(onChange).not.toHaveBeenCalled();
  });
});

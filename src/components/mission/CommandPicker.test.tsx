// @vitest-environment jsdom

import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { CommandPicker } from "./CommandPicker";

afterEach(() => {
  cleanup();
});

// Radix DropdownMenu relies on pointer events that jsdom does not fully
// support, so we test the trigger rendering and the exported contract
// (variant lists, display name delegation) rather than portal interactions.

describe("CommandPicker", () => {
  it("renders trigger button with current command name", () => {
    render(
      <CommandPicker currentName="Waypoint" onSelect={() => {}} />,
    );

    const button = screen.getByRole("button", { name: /Waypoint/i });
    expect(button).toBeTruthy();
    expect(button.getAttribute("aria-haspopup")).toBe("menu");
  });

  it("disables trigger when disabled prop is true", () => {
    render(
      <CommandPicker currentName="Waypoint" onSelect={() => {}} disabled />,
    );

    const button = screen.getByRole("button", { name: /Waypoint/i });
    expect(button.hasAttribute("disabled")).toBe(true);
  });

  it("opens menu on pointerdown and shows category labels", async () => {
    render(
      <CommandPicker currentName="Waypoint" onSelect={() => {}} />,
    );

    const trigger = screen.getByRole("button", { name: /Waypoint/i });

    // Radix DropdownMenu opens on pointerdown, not click
    trigger.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      ctrlKey: false,
      pointerId: 1,
      pointerType: "mouse",
    }));

    // Wait for the portal to render
    const nav = await screen.findByText("Navigation");
    expect(nav).toBeTruthy();
    expect(screen.getByText("Actions")).toBeTruthy();
    expect(screen.getByText("Conditions")).toBeTruthy();
  });

  it("calls onSelect with correct category and variant on item click", async () => {
    const onSelect = vi.fn();
    render(
      <CommandPicker currentName="Waypoint" onSelect={onSelect} />,
    );

    const trigger = screen.getByRole("button", { name: /Waypoint/i });
    trigger.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      ctrlKey: false,
      pointerId: 1,
      pointerType: "mouse",
    }));

    const item = await screen.findByRole("menuitem", { name: /Return To Launch/i });
    item.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true,
      cancelable: true,
      button: 0,
      pointerId: 1,
      pointerType: "mouse",
    }));
    // Radix fires onSelect on click (pointerup + click sequence)
    item.click();

    expect(onSelect).toHaveBeenCalledWith("Nav", "ReturnToLaunch");
  });
});

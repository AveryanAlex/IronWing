// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import Menu from "./Menu.svelte";

describe("Menu", () => {
  afterEach(() => {
    cleanup();
  });

  it("opens via trigger and fires item callbacks", async () => {
    const onCopy = vi.fn();
    render(Menu, {
      props: {
        triggerLabel: "More",
        items: [
          { id: "copy", label: "Copy", onSelect: onCopy },
          { id: "delete", label: "Delete", onSelect: () => {}, destructive: true },
        ],
      },
    });

    const trigger = screen.getByRole("button", { name: "More" });
    // Bits UI's DropdownMenu trigger toggles open on Enter/Space keypress.
    // We use Enter instead of click because jsdom does not dispatch a synthetic
    // pointerdown alongside fireEvent.click, which is what Bits UI relies on.
    trigger.focus();
    await fireEvent.keyDown(trigger, { key: "Enter" });

    // Bits UI's floating content portal sets visibility:hidden until positioning
    // completes, so role-based queries (which honour the accessibility tree)
    // don't pick the menuitems up in jsdom. Fall back to a DOM selector inside
    // the portal.
    await waitFor(() => {
      expect(document.querySelector('[role="menuitem"]')).toBeTruthy();
    });

    const menuItems = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    const copyItem = menuItems.find((item) => item.textContent?.trim() === "Copy");
    expect(copyItem).toBeTruthy();

    await fireEvent.click(copyItem!);
    expect(onCopy).toHaveBeenCalledOnce();
  });
});

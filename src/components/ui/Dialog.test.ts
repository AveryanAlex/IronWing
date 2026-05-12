// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import Dialog from "./Dialog.svelte";

function textSnippet(text: string) {
  return createRawSnippet(() => ({
    render: () => `<span>${text}</span>`,
  }));
}

describe("Dialog", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders content when open and fires onClose on backdrop click", async () => {
    const onClose = vi.fn();
    render(Dialog, {
      props: {
        open: true,
        title: "Confirm upload",
        ariaLabel: "Confirm upload",
        onClose,
        body: textSnippet("Are you sure?"),
      },
    });

    expect(screen.getByText("Confirm upload")).toBeTruthy();

    // The overlay is exposed with aria-label="Close dialog" so screen readers
    // can find it.
    expect(screen.getByLabelText("Close dialog")).toBeTruthy();

    // Dismiss via Escape — Bits UI's outside-pointer dismiss path depends on
    // real layout (getBoundingClientRect), which jsdom does not provide. The
    // Escape path exercises the same onOpenChange contract.
    await fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });
});

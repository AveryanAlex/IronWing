// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import IconButton from "./IconButton.svelte";

function iconSnippet() {
  return createRawSnippet(() => ({
    render: () => `<span aria-hidden="true">i</span>`,
  }));
}

describe("IconButton", () => {
  afterEach(() => {
    cleanup();
  });

  it("requires aria-label and forwards clicks", async () => {
    const onClick = vi.fn();
    const { getByRole } = render(IconButton, {
      props: { ariaLabel: "Undo", onclick: onClick, children: iconSnippet() },
    });
    const btn = getByRole("button", { name: "Undo" });
    await fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });
});

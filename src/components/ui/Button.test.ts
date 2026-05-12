// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import Button from "./Button.svelte";

function textSnippet(text: string) {
  return createRawSnippet(() => ({
    render: () => `<span>${text}</span>`,
  }));
}

describe("Button", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders provided label and forwards click", async () => {
    const onClick = vi.fn();
    const { getByRole } = render(Button, {
      props: { onclick: onClick, children: textSnippet("Save") },
    });
    const btn = getByRole("button", { name: "Save" });
    await fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("ignores clicks when disabled", async () => {
    const onClick = vi.fn();
    const { getByRole } = render(Button, {
      props: { onclick: onClick, disabled: true, children: textSnippet("Save") },
    });
    await fireEvent.click(getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("applies tone and size data attributes", () => {
    const { getByRole } = render(Button, {
      props: { tone: "danger", size: "sm", children: textSnippet("Delete") },
    });
    const btn = getByRole("button");
    expect(btn.getAttribute("data-tone")).toBe("danger");
    expect(btn.getAttribute("data-size")).toBe("sm");
  });
});

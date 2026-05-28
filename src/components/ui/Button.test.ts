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

  it("applies variant and size data attributes", () => {
    const { getByRole } = render(Button, {
      props: { variant: "destructive", size: "sm", children: textSnippet("Delete") },
    });
    const btn = getByRole("button");
    expect(btn.getAttribute("data-variant")).toBe("destructive");
    expect(btn.getAttribute("data-size")).toBe("sm");
  });

  it("provides a first-class warning variant for cancellable in-flight actions", () => {
    const { getByRole } = render(Button, {
      props: { variant: "warning", size: "icon", children: textSnippet("Cancel") },
    });
    const btn = getByRole("button");
    expect(btn.getAttribute("data-variant")).toBe("warning");
    expect(btn.className).toContain("bg-warning");
    expect(btn.className).not.toContain("bg-accent");
  });

  it("supports tonal soft, solid, bare, and pill APIs without call-site color overrides", async () => {
    const { getByRole, rerender } = render(Button, {
      props: { variant: "soft", tone: "success", shape: "pill", children: textSnippet("Stage") },
    });
    let btn = getByRole("button");
    expect(btn.getAttribute("data-variant")).toBe("soft");
    expect(btn.getAttribute("data-tone")).toBe("success");
    expect(btn.getAttribute("data-shape")).toBe("pill");
    expect(btn.className).toContain("bg-success/10");
    expect(btn.className).toContain("rounded-full");

    await rerender({ variant: "solid", tone: "success", children: textSnippet("Apply") });
    btn = getByRole("button");
    expect(btn.className).toContain("bg-success");
    expect(btn.className).toContain("text-black");

    await rerender({ variant: "bare", children: textSnippet("Toggle") });
    btn = getByRole("button");
    expect(btn.className).toContain("bg-transparent");
    expect(btn.className).toContain("shadow-none");
  });
});

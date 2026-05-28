// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import Badge from "./Badge.svelte";

function textSnippet(text: string) {
  return createRawSnippet(() => ({
    render: () => `<span>${text}</span>`,
  }));
}

describe("Badge", () => {
  afterEach(() => {
    cleanup();
  });

  it("supports micro tint badges and primary muted surfaces", async () => {
    const { getByText, rerender } = render(Badge, {
      props: { variant: "tint", tone: "warning", size: "micro", children: textSnippet("DO") },
    });
    let badge = getByText("DO").closest("[data-variant]") as HTMLElement;
    expect(badge.getAttribute("data-variant")).toBe("tint");
    expect(badge.getAttribute("data-size")).toBe("micro");
    expect(badge.className).toContain("bg-warning/15");

    await rerender({ variant: "muted", surface: "primary", children: textSnippet("3 generated") });
    badge = getByText("3 generated").closest("[data-variant]") as HTMLElement;
    expect(badge.getAttribute("data-surface")).toBe("primary");
    expect(badge.className).toContain("bg-bg-primary");
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import Card from "./Card.svelte";

function textSnippet(text: string) {
  return createRawSnippet(() => ({
    render: () => `<span>${text}</span>`,
  }));
}

describe("Card", () => {
  afterEach(() => {
    cleanup();
  });

  it("applies tone and density data attributes", () => {
    const { container } = render(Card, {
      props: { tone: "warning", density: "compact", children: textSnippet("Body") },
    });
    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute("data-tone")).toBe("warning");
    expect(root.getAttribute("data-density")).toBe("compact");
  });
});

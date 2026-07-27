// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/svelte";
import ExternalLink from "./ExternalLink.svelte";

vi.mock("@platform/core", () => ({
  openUrl: vi.fn(),
}));

describe("ExternalLink", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders an accessible compact icon link", () => {
    const { getByRole } = render(ExternalLink, {
      props: {
        href: "https://ardupilot.org",
        variant: "icon",
        "aria-label": "Open ArduPilot documentation",
      },
    });

    const link = getByRole("link", { name: "Open ArduPilot documentation" });
    expect(link.getAttribute("data-variant")).toBe("icon");
    expect(link.className).toContain("size-8");
    expect(link.querySelector("svg")).not.toBeNull();
  });
});

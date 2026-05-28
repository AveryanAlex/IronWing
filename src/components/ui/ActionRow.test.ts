// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import ActionRow from "./ActionRow.svelte";

function contentSnippet() {
  return createRawSnippet(() => ({
    render: () => `<button>Action</button>`,
  }));
}

describe("ActionRow", () => {
  afterEach(() => {
    cleanup();
  });

  it("supports always-stacked rows without important call-site overrides", () => {
    const { getByTestId } = render(ActionRow, {
      props: { align: "stretch", direction: "column", testId: "actions", children: contentSnippet() },
    });
    const row = getByTestId("actions");
    expect(row.getAttribute("data-direction")).toBe("column");
    expect(row.className).toContain("flex-col");
    expect(row.className).toContain("items-stretch");
    expect(row.className).not.toContain("sm:flex-row");
  });
});

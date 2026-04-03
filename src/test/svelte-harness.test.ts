// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { afterEach, expect, test } from "vitest";

import App from "../App.svelte";

afterEach(() => {
  cleanup();
});

test("mounts the active Svelte shell through the Vitest harness", () => {
  const { getByRole, getByText } = render(App);

  expect(document.title).toBe("IronWing");
  expect(getByRole("heading", { name: "Svelte runtime online" })).toBeTruthy();
  expect(
    getByText(/The active frontend boot path now mounts a minimal Svelte shell\./i),
  ).toBeTruthy();
  expect(getByText("Svelte 5")).toBeTruthy();
});

// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { afterEach, expect, test } from "vitest";

import AsyncCanary from "./AsyncCanary.svelte";

afterEach(() => {
  cleanup();
});

test("compiles and resolves Svelte experimental async await expressions", async () => {
  const { findByTestId, getByTestId } = render(AsyncCanary);

  expect(getByTestId("async-pending").textContent).toBe("pending");
  expect((await findByTestId("async-canary")).textContent).toBe("async-ready");
});

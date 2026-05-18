import { describe, expect, it } from "vitest";

import { fetch } from "./http";

describe("web platform http", () => {
  it("exports the browser/global fetch binding", () => {
    expect(typeof fetch).toBe("function");
    expect(fetch.name).toContain("fetch");
  });
});

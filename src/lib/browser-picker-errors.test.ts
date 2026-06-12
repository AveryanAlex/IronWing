import { describe, expect, it } from "vitest";

import { isBrowserPickerAbortError } from "./browser-picker-errors";

describe("isBrowserPickerAbortError", () => {
  it("detects DOMException AbortError values", () => {
    expect(isBrowserPickerAbortError(new DOMException("Picker dismissed", "AbortError"))).toBe(true);
    expect(isBrowserPickerAbortError(new DOMException("Permission denied", "NotAllowedError"))).toBe(false);
  });

  it("detects object-like AbortError values without requiring Error", () => {
    expect(isBrowserPickerAbortError({ name: "AbortError" })).toBe(true);
    expect(isBrowserPickerAbortError({ name: "AbortError", message: "cancelled" })).toBe(true);
  });

  it("rejects non-abort values", () => {
    expect(isBrowserPickerAbortError(new Error("AbortError"))).toBe(false);
    expect(isBrowserPickerAbortError({ name: "NotAllowedError" })).toBe(false);
    expect(isBrowserPickerAbortError(null)).toBe(false);
    expect(isBrowserPickerAbortError("AbortError")).toBe(false);
  });
});

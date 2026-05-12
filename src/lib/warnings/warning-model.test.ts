import { describe, expect, it } from "vitest";
import { sortBySeverity, type Warning } from "./warning-model";

function makeWarning(id: string, severity: Warning["severity"]): Warning {
  return { id, severity, title: id };
}

describe("sortBySeverity", () => {
  it("orders blocking before danger before warning before info before success", () => {
    const input: Warning[] = [
      makeWarning("a", "info"),
      makeWarning("b", "blocking"),
      makeWarning("c", "warning"),
      makeWarning("d", "success"),
      makeWarning("e", "danger"),
    ];
    const sorted = sortBySeverity(input);
    expect(sorted.map((w) => w.id)).toEqual(["b", "e", "c", "a", "d"]);
  });

  it("preserves relative order for equal severity (stable sort)", () => {
    const input: Warning[] = [
      makeWarning("a", "warning"),
      makeWarning("b", "warning"),
      makeWarning("c", "warning"),
    ];
    const sorted = sortBySeverity(input);
    expect(sorted.map((w) => w.id)).toEqual(["a", "b", "c"]);
  });

  it("does not mutate the input array", () => {
    const input: Warning[] = [makeWarning("a", "info"), makeWarning("b", "blocking")];
    const snapshot = input.map((w) => w.id);
    sortBySeverity(input);
    expect(input.map((w) => w.id)).toEqual(snapshot);
  });

  it("returns a new array even when input is already sorted", () => {
    const input: Warning[] = [makeWarning("a", "blocking"), makeWarning("b", "danger")];
    const sorted = sortBySeverity(input);
    expect(sorted).not.toBe(input);
    expect(sorted.map((w) => w.id)).toEqual(["a", "b"]);
  });
});

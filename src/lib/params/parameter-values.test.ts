import { describe, expect, it } from "vitest";
import type { ParamStore } from "../../params";
import { hasPendingParameterEdit, readAppliedParameter, readProposedParameter, resolveParameterValue } from "./parameter-values";

const paramStore: ParamStore = {
  expected_count: 2,
  params: {
    NEW: { name: "NEW", value: 10, index: 0, param_type: "real32" },
    OLD: { name: "OLD", value: 20, index: 1, param_type: "real32" },
  },
};

describe("parameter value layers", () => {
  it("keeps applied reads independent of preview changes", () => {
    const input = { paramStore, stagedEdits: { NEW: { nextValue: 30 } }, draftOverrides: { NEW: 0 } };
    expect(readAppliedParameter(input.paramStore, "NEW")).toBe(10);
    expect(readProposedParameter(input, "NEW")).toBe(0);
    expect(readProposedParameter({ ...input, draftOverrides: { NEW: NaN } }, "NEW")).toBe(30);
    expect(resolveParameterValue(10, { nextValue: Infinity }, NaN)).toBe(10);
  });
  it("resolves firmware parameter aliases in name order", () => {
    const input = { paramStore, stagedEdits: { OLD: { nextValue: 30 } } };
    expect(readProposedParameter(input, "NEW", "OLD")).toBe(10);
    expect(readProposedParameter(input, "MISSING", "OLD")).toBe(30);
    expect(readProposedParameter(input, "MISSING")).toBeNull();
  });
  it("ignores invalid edits and detects actual pending changes", () => {
    expect(hasPendingParameterEdit({ paramStore, stagedEdits: { NEW: { nextValue: 10 } } }, "NEW")).toBe(false);
    expect(hasPendingParameterEdit({ paramStore, stagedEdits: { NEW: { nextValue: NaN } } }, "NEW")).toBe(false);
    expect(hasPendingParameterEdit({ paramStore, stagedEdits: { NEW: { nextValue: 0 } } }, "NEW")).toBe(true);
  });
});

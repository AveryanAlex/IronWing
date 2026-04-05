import { describe, expect, it } from "vitest";

import type { ParamMetadataMap } from "../../param-metadata";
import type { ParamStore } from "../../params";
import type { StagedParameterEdit } from "../stores/params-staged-edits";
import {
  buildParameterExpertView,
  type ParameterExpertFilter,
} from "./parameter-expert-view";

function createParamStore(): ParamStore {
  return {
    expected_count: 4,
    params: {
      ARMING_CHECK: { name: "ARMING_CHECK", value: 1, param_type: "uint8", index: 0 },
      FS_THR_ENABLE: { name: "FS_THR_ENABLE", value: 0, param_type: "uint8", index: 1 },
      LOG_BITMASK: { name: "LOG_BITMASK", value: 5, param_type: "uint32", index: 2 },
      FORMAT_VERSION: { name: "FORMAT_VERSION", value: 3, param_type: "uint32", index: 3 },
    },
  };
}

function createMetadata(): ParamMetadataMap {
  return new Map([
    [
      "ARMING_CHECK",
      {
        humanName: "Arming checks",
        description: "Controls pre-arm validation.",
        values: [
          { code: 0, label: "Disabled" },
          { code: 1, label: "All checks" },
        ],
        userLevel: "Standard",
      },
    ],
    [
      "FS_THR_ENABLE",
      {
        humanName: "Throttle failsafe",
        description: "Select the throttle failsafe behavior.",
        values: [
          { code: 0, label: "Disabled" },
          { code: 1, label: "Enabled always" },
        ],
      },
    ],
    [
      "LOG_BITMASK",
      {
        humanName: "Log bitmask",
        description: "Enabled log streams.",
        bitmask: [
          { bit: 0, label: "Fast attitude" },
          { bit: 2, label: "PID" },
        ],
        userLevel: "Advanced",
      },
    ],
    [
      "FORMAT_VERSION",
      {
        humanName: "Format version",
        description: "Current parameter table format version.",
        readOnly: true,
      },
    ],
  ]);
}

function createStagedEdits(): Record<string, StagedParameterEdit> {
  return {
    LOG_BITMASK: {
      name: "LOG_BITMASK",
      label: "Log bitmask",
      rawName: "LOG_BITMASK",
      description: "Enabled log streams.",
      currentValue: 5,
      currentValueText: "5",
      nextValue: 1,
      nextValueText: "1",
      units: null,
      rebootRequired: false,
      order: 2,
    },
  };
}

function buildView(
  filter: ParameterExpertFilter,
  searchText = "",
  overrides: {
    metadata?: ParamMetadataMap | null;
    highlightTargets?: string[];
    retainedFailures?: Record<string, { message: string }>;
    stagedEdits?: Record<string, StagedParameterEdit>;
  } = {},
) {
  return buildParameterExpertView({
    paramStore: createParamStore(),
    metadata: "metadata" in overrides ? (overrides.metadata ?? null) : createMetadata(),
    stagedEdits: overrides.stagedEdits ?? createStagedEdits(),
    retainedFailures: overrides.retainedFailures ?? {},
    filter,
    searchText,
    highlightTargets: overrides.highlightTargets,
  });
}

describe("buildParameterExpertView", () => {
  it("groups rows by prefix, honors filters, and keeps highlighted workflow targets visible", () => {
    const view = buildView("standard", "", {
      highlightTargets: ["LOG_BITMASK", "UNKNOWN_PARAM"],
    });

    expect(view.totalCount).toBe(4);
    expect(view.highlightedCount).toBe(1);
    expect(view.forcedHighlightCount).toBe(1);
    expect(view.missingHighlightTargets).toEqual(["UNKNOWN_PARAM"]);
    expect(view.groups.map((group) => group.key)).toEqual(["ARMING", "FS", "LOG", "FORMAT"]);

    const logRow = view.groups.find((group) => group.key === "LOG")?.rows[0];
    expect(logRow?.isHighlighted).toBe(true);
    expect(logRow?.editorKind).toBe("bitmask");
    expect(logRow?.bitmaskOptions.map((option) => option.label)).toEqual(["Fast attitude", "PID"]);
  });

  it("reports staged rows hidden by the active filter or search", () => {
    const standardView = buildView("standard", "arming");
    expect(standardView.groups).toHaveLength(1);
    expect(standardView.hiddenStagedRows.map((row) => row.name)).toEqual(["LOG_BITMASK"]);

    const modifiedView = buildView("modified");
    expect(modifiedView.groups).toHaveLength(1);
    expect(modifiedView.groups[0]?.rows.map((row) => row.name)).toEqual(["LOG_BITMASK"]);
  });

  it("falls back to raw-name numeric rows when metadata is unavailable", () => {
    const view = buildView("standard", "", {
      metadata: null,
      stagedEdits: {},
    });

    expect(view.metadataAvailable).toBe(false);
    expect(view.groups.map((group) => group.key)).toEqual(["ARMING", "FS", "LOG", "FORMAT"]);
    expect(view.groups[0]?.rows[0]).toMatchObject({
      name: "ARMING_CHECK",
      label: "ARMING_CHECK",
      editorKind: "number",
      valueLabel: null,
    });
  });

  it("drops malformed metadata decorations and preserves read-only rows", () => {
    const metadata = createMetadata();
    metadata.set("ARMING_CHECK", {
      humanName: "  ",
      description: "  ",
      values: [
        { code: Number.NaN, label: "Broken" },
        { code: 9, label: "   " },
      ],
      bitmask: [
        { bit: -1, label: "Bad" },
        { bit: 35, label: "Too high" },
      ],
    });

    const view = buildView("all", "", {
      metadata,
      stagedEdits: {},
      retainedFailures: {
        FORMAT_VERSION: { message: "Vehicle kept the read-only value unchanged." },
      },
    });

    const armingRow = view.groups.find((group) => group.key === "ARMING")?.rows[0];
    const formatRow = view.groups.find((group) => group.key === "FORMAT")?.rows[0];

    expect(armingRow).toMatchObject({
      label: "ARMING_CHECK",
      description: null,
      editorKind: "number",
      enumOptions: [],
      bitmaskOptions: [],
    });
    expect(formatRow?.readOnly).toBe(true);
    expect(formatRow?.failureMessage).toBe("Vehicle kept the read-only value unchanged.");
  });
});

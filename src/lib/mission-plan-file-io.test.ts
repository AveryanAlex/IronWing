// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import surveyComplexFixtureJson from "../../tests/contracts/survey-complex.plan.json";
import type { GeoPoint3d, MissionPlan } from "./mavkit-types";
import {
  createMissionPlanFileIo,
  type MissionPlanFileExportInput,
  type MissionPlanFileIoDependencies,
} from "./mission-plan-file-io";

function createIo(overrides: Partial<MissionPlanFileIoDependencies> = {}) {
  const openTextFile = vi.fn<NonNullable<MissionPlanFileIoDependencies["openTextFile"]>>();
  const saveTextFile = vi.fn<NonNullable<MissionPlanFileIoDependencies["saveTextFile"]>>();

  return {
    openTextFile,
    saveTextFile,
    io: createMissionPlanFileIo({
      openTextFile,
      saveTextFile,
      ...overrides,
    }),
  };
}

function makeSurveyOnlyPlan() {
  const surveyOnly = structuredClone(surveyComplexFixtureJson) as {
    mission?: { items?: Array<{ type?: string }> };
  };

  surveyOnly.mission = surveyOnly.mission ?? {};
  surveyOnly.mission.items = (surveyOnly.mission.items ?? []).filter((item) => item.type === "ComplexItem");

  return surveyOnly;
}

function makeUnknownComplexPlan() {
  return {
    fileType: "Plan",
    version: 1,
    groundStation: "QGroundControl",
    mission: {
      version: 2,
      firmwareType: 12,
      vehicleType: 2,
      cruiseSpeed: 15,
      hoverSpeed: 5,
      plannedHomePosition: [47.397742, 8.545594, 488],
      items: [
        {
          type: "ComplexItem",
          complexItemType: "MadeUpPattern",
          TransectStyleComplexItem: {
            Items: [
              {
                type: "SimpleItem",
                autoContinue: true,
                command: 16,
                frame: 3,
                params: [0, 0, 0, 0, 47.4, 8.55, 20],
              },
            ],
          },
        },
      ],
    },
  };
}

function makeExportInput(overrides: Partial<MissionPlanFileExportInput> = {}): MissionPlanFileExportInput {
  return {
    mission: { items: [] } satisfies MissionPlan,
    home: null,
    fence: {
      return_point: {
        latitude_deg: 47.39,
        longitude_deg: 8.53,
      },
      regions: [],
    },
    rally: {
      points: [
        {
          Msl: {
            latitude_deg: 47.397,
            longitude_deg: 8.545,
            altitude_msl_m: 500,
          },
        } satisfies GeoPoint3d,
      ],
    },
    suggestedName: "mission.plan",
    ...overrides,
  };
}

describe("createMissionPlanFileIo", () => {
  it("returns cancelled when the browser picker is dismissed", async () => {
    const { io, openTextFile } = createIo();
    openTextFile.mockResolvedValueOnce(null);

    await expect(io.importFromPicker()).resolves.toEqual({ status: "cancelled" });
  });

  it("rejects invalid JSON instead of silently importing an empty plan", async () => {
    const { io, openTextFile } = createIo();
    openTextFile.mockResolvedValueOnce({
      name: "broken.plan",
      contents: "{ not valid json",
    });

    await expect(io.importFromPicker()).rejects.toThrow(/json/i);
  });

  it("rejects lossy unknown ComplexItem imports instead of flattening them", async () => {
    const { io, openTextFile } = createIo();
    openTextFile.mockResolvedValueOnce({
      name: "unknown-complex.plan",
      contents: JSON.stringify(makeUnknownComplexPlan()),
    });

    await expect(io.importFromPicker()).rejects.toThrow(/complex|preserv/i);
  });

  it("rejects plan files that do not contain mission, survey, fence, rally, or home data", async () => {
    const { io, openTextFile } = createIo();
    openTextFile.mockResolvedValueOnce({
      name: "empty.plan",
      contents: JSON.stringify({
        fileType: "Plan",
        version: 1,
        groundStation: "QGroundControl",
        mission: {
          items: [],
        },
      }),
    });

    await expect(io.importFromPicker()).rejects.toThrow(/did not contain/i);
  });

  it("imports survey-only plans without inventing placeholder mission items", async () => {
    const { io, openTextFile } = createIo();
    openTextFile.mockResolvedValueOnce({
      name: "survey-only.plan",
      contents: JSON.stringify(makeSurveyOnlyPlan()),
    });

    const result = await io.importFromPicker();

    expect(result).toMatchObject({
      status: "success",
      fileName: "survey-only.plan",
      missionItemCount: 0,
      surveyRegionCount: 2,
    });

    if (result.status !== "success") {
      throw new Error("expected a successful import result");
    }

    expect(result.data.mission.items).toHaveLength(0);
    expect(result.data.surveyRegions).toHaveLength(2);
    expect(result.warningCount).toBeGreaterThan(0);
  });

  it("exports .plan JSON with warnings and still reports success", async () => {
    const { io, saveTextFile } = createIo();
    saveTextFile.mockResolvedValueOnce({ name: "saved.plan" });

    const result = await io.exportToPicker(makeExportInput());

    expect(result).toMatchObject({
      status: "success",
      fileName: "saved.plan",
    });

    if (result.status !== "success") {
      throw new Error("expected a successful export result");
    }

    expect(result.warningCount).toBeGreaterThan(0);
    expect(result.warnings.join(" ")).toMatch(/omitted|lossy/i);
    expect(JSON.parse(result.contents)).toMatchObject({
      fileType: "Plan",
      mission: {
        items: [],
      },
    });
    expect(saveTextFile).toHaveBeenCalledWith({
      suggestedName: "mission.plan",
      contents: result.contents,
    });
  });
});

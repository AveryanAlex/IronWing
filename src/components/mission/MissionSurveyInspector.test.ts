// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import MissionSurveyInspector from "./MissionSurveyInspector.svelte";
import { missionWorkspaceTestIds } from "./mission-workspace-test-ids";
import { defaultGeoPoint3d, type MissionItem } from "../../lib/mavkit-types";
import { getBuiltinCameras } from "../../lib/survey-camera-catalog";
import { createSurveyRegion, type SurveyRegion } from "../../lib/survey-region";

const BUILTIN_CAMERA = getBuiltinCameras().find((camera) => camera.canonicalName === "DJI Mavic 3E") ?? getBuiltinCameras()[0]!;

function makeWaypoint(latitude_deg: number, longitude_deg: number, altitude_m: number): MissionItem {
  return {
    command: {
      Nav: {
        Waypoint: {
          position: defaultGeoPoint3d(latitude_deg, longitude_deg, altitude_m),
          hold_time_s: 0,
          acceptance_radius_m: 1,
          pass_radius_m: 0,
          yaw_deg: 0,
        },
      },
    },
    current: false,
    autocontinue: true,
  };
}

function makeGridRegion(overrides: Partial<SurveyRegion> = {}): SurveyRegion {
  const region = createSurveyRegion([
    { latitude_deg: 47.3981, longitude_deg: 8.5451 },
    { latitude_deg: 47.3981, longitude_deg: 8.5458 },
    { latitude_deg: 47.3976, longitude_deg: 8.5458 },
    { latitude_deg: 47.3976, longitude_deg: 8.5451 },
  ]);

  return {
    ...region,
    ...overrides,
    params: {
      ...region.params,
      ...overrides.params,
    },
    camera: overrides.camera ?? region.camera,
    polygon: overrides.polygon ?? region.polygon,
    polyline: overrides.polyline ?? region.polyline,
    generatedItems: overrides.generatedItems ?? region.generatedItems,
    generatedTransects: overrides.generatedTransects ?? region.generatedTransects,
    generatedCrosshatch: overrides.generatedCrosshatch ?? region.generatedCrosshatch,
    generatedLayers: overrides.generatedLayers ?? region.generatedLayers,
    generatedStats: overrides.generatedStats ?? region.generatedStats,
    importWarnings: overrides.importWarnings ?? region.importWarnings,
    manualEdits: overrides.manualEdits ?? region.manualEdits,
  };
}

function renderInspector(region: SurveyRegion, overrides: Partial<{
  surveyPrompt: { kind: "confirm-regenerate" | "confirm-dissolve"; regionId: string; message: string } | null;
  onUpdateRegion: ReturnType<typeof vi.fn>;
  onGenerateRegion: ReturnType<typeof vi.fn>;
  onPromptDissolveRegion: ReturnType<typeof vi.fn>;
  onDeleteRegion: ReturnType<typeof vi.fn>;
  onConfirmSurveyPrompt: ReturnType<typeof vi.fn>;
  onDismissSurveyPrompt: ReturnType<typeof vi.fn>;
  onMarkGeneratedItemEdited: ReturnType<typeof vi.fn>;
}> = {}) {
  const props = {
    region,
    cruiseSpeed: 15,
    surveyPrompt: overrides.surveyPrompt ?? null,
    onUpdateRegion: overrides.onUpdateRegion ?? vi.fn(),
    onGenerateRegion: overrides.onGenerateRegion ?? vi.fn(),
    onPromptDissolveRegion: overrides.onPromptDissolveRegion ?? vi.fn(),
    onDeleteRegion: overrides.onDeleteRegion ?? vi.fn(),
    onConfirmSurveyPrompt: overrides.onConfirmSurveyPrompt ?? vi.fn(),
    onDismissSurveyPrompt: overrides.onDismissSurveyPrompt ?? vi.fn(),
    onMarkGeneratedItemEdited: overrides.onMarkGeneratedItemEdited ?? vi.fn(),
  };

  return {
    ...render(MissionSurveyInspector, props),
    props,
  };
}

afterEach(() => {
  cleanup();
  if (typeof localStorage?.clear === "function") {
    localStorage.clear();
  }
  vi.restoreAllMocks();
});

describe("MissionSurveyInspector", () => {
  it("blocks generation for camera-less imported regions until a valid camera is chosen", async () => {
    const onUpdateRegion = vi.fn();
    const region = makeGridRegion({
      cameraId: null,
      camera: null,
      qgcPassthrough: {},
      importWarnings: ["Imported survey metadata preserved."],
    });
    const rendered = renderInspector(region, { onUpdateRegion });

    expect((screen.getByTestId(missionWorkspaceTestIds.surveyGenerate) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId(missionWorkspaceTestIds.cameraCurrent).textContent).toContain("Choose a valid camera");

    await fireEvent.change(screen.getByTestId(missionWorkspaceTestIds.cameraSearch), {
      target: { value: "Mavic 3E" },
    });
    await fireEvent.click(screen.getByRole("button", { name: /Use DJI Mavic 3E/i }));

    expect(onUpdateRegion).toHaveBeenCalledTimes(1);
    const [, updater] = onUpdateRegion.mock.calls[0] as [string, (current: SurveyRegion) => SurveyRegion];
    const updatedRegion = updater(region);
    expect(updatedRegion.camera?.canonicalName).toBe(BUILTIN_CAMERA.canonicalName);
    expect(updatedRegion.cameraId).toBe(BUILTIN_CAMERA.canonicalName);

    await rendered.rerender({
      ...rendered.props,
      region: updatedRegion,
      onUpdateRegion,
    });
    expect((screen.getByTestId(missionWorkspaceTestIds.surveyGenerate) as HTMLButtonElement).disabled).toBe(false);
  });

  it("validates custom camera form values and surfaces save failures without hiding builtin cameras", async () => {
    const region = makeGridRegion();
    renderInspector(region);

    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.cameraCustomToggle));
    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.cameraCustomSave));

    expect(screen.getByTestId(missionWorkspaceTestIds.cameraWarning).textContent).toContain("canonical name, brand, and model");

    const originalLocalStorage = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: originalLocalStorage?.getItem?.bind(originalLocalStorage) ?? (() => null),
        setItem: () => {
          throw new Error("quota");
        },
        removeItem: originalLocalStorage?.removeItem?.bind(originalLocalStorage) ?? (() => undefined),
        clear: originalLocalStorage?.clear?.bind(originalLocalStorage) ?? (() => undefined),
        key: originalLocalStorage?.key?.bind(originalLocalStorage) ?? (() => null),
        get length() {
          return originalLocalStorage?.length ?? 0;
        },
      },
    });

    await fireEvent.input(screen.getByTestId(missionWorkspaceTestIds.cameraCustomName), {
      target: { value: "Custom Survey Cam 24mm" },
    });
    await fireEvent.input(screen.getByTestId(missionWorkspaceTestIds.cameraCustomBrand), {
      target: { value: "Custom" },
    });
    await fireEvent.input(screen.getByTestId(missionWorkspaceTestIds.cameraCustomModel), {
      target: { value: "Survey Cam 24mm" },
    });
    await fireEvent.input(screen.getByTestId(missionWorkspaceTestIds.cameraCustomSensorWidth), {
      target: { value: "23.5" },
    });
    await fireEvent.input(screen.getByTestId(missionWorkspaceTestIds.cameraCustomSensorHeight), {
      target: { value: "15.6" },
    });
    await fireEvent.input(screen.getByTestId(missionWorkspaceTestIds.cameraCustomImageWidth), {
      target: { value: "6000" },
    });
    await fireEvent.input(screen.getByTestId(missionWorkspaceTestIds.cameraCustomImageHeight), {
      target: { value: "4000" },
    });
    await fireEvent.input(screen.getByTestId(missionWorkspaceTestIds.cameraCustomFocal), {
      target: { value: "24" },
    });

    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.cameraCustomSave));

    expect(screen.getByTestId(missionWorkspaceTestIds.cameraWarning).textContent).toContain("not saved");

    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: originalLocalStorage,
    });

    await fireEvent.change(screen.getByTestId(missionWorkspaceTestIds.cameraSearch), {
      target: { value: "Mavic 3E" },
    });
    expect(screen.getByRole("button", { name: /Use DJI Mavic 3E/i })).toBeTruthy();
  });

  it("ignores invalid numeric edits and routes subordinate generated-item changes through manual-edit callbacks", async () => {
    const onUpdateRegion = vi.fn();
    const onMarkGeneratedItemEdited = vi.fn();
    const region = makeGridRegion({
      cameraId: BUILTIN_CAMERA.canonicalName,
      camera: BUILTIN_CAMERA,
      generatedItems: [makeWaypoint(47.3982, 8.5454, 55)],
    });

    renderInspector(region, {
      onUpdateRegion,
      onMarkGeneratedItemEdited,
    });

    await fireEvent.change(screen.getByTestId(`${missionWorkspaceTestIds.surveyParamPrefix}-altitude_m`), {
      target: { value: "" },
    });
    expect(onUpdateRegion).not.toHaveBeenCalled();

    await fireEvent.click(screen.getByTestId(`${missionWorkspaceTestIds.surveyGeneratedItemPrefix}-0`));
    await fireEvent.change(screen.getByTestId(missionWorkspaceTestIds.surveyGeneratedAltitude), {
      target: { value: "80" },
    });

    expect(onMarkGeneratedItemEdited).toHaveBeenCalledTimes(1);
    const [regionId, localIndex, editedItem] = onMarkGeneratedItemEdited.mock.calls[0] as [string, number, MissionItem];
    expect(regionId).toBe(region.id);
    expect(localIndex).toBe(0);
    expect(JSON.stringify(editedItem.command)).toContain("80");
  });

  it("renders survey prompts inline and routes confirm or dismiss through the planner callbacks", async () => {
    const onConfirmSurveyPrompt = vi.fn();
    const onDismissSurveyPrompt = vi.fn();
    const region = makeGridRegion({
      cameraId: BUILTIN_CAMERA.canonicalName,
      camera: BUILTIN_CAMERA,
      generatedItems: [makeWaypoint(47.3982, 8.5454, 55)],
    });

    renderInspector(region, {
      surveyPrompt: {
        kind: "confirm-regenerate",
        regionId: region.id,
        message: "Regenerating this survey will overwrite 1 manual edit.",
      },
      onConfirmSurveyPrompt,
      onDismissSurveyPrompt,
    });

    expect(screen.getByTestId(missionWorkspaceTestIds.surveyPromptKind).textContent).toContain("confirm-regenerate");

    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.surveyPromptDismiss));
    expect(onDismissSurveyPrompt).toHaveBeenCalledTimes(1);

    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.surveyPromptConfirm));
    expect(onConfirmSurveyPrompt).toHaveBeenCalledTimes(1);
  });
});

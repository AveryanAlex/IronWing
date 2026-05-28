// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import MissionSurveyInspector from "./components/MissionSurveyInspector.svelte";
import { missionWorkspaceTestIds } from "./mission-workspace-test-ids";
import { defaultGeoPoint3d, type MissionItem } from "../../lib/mavkit-types";
import { getBuiltinCameras } from "../../lib/survey-camera-catalog";
import { createSurveyRegion, type SurveyRegion } from "../../lib/survey-region";

const BUILTIN_CAMERA = getBuiltinCameras().find((camera) => camera.canonicalName === "DJI Mavic 3E") ?? getBuiltinCameras()[0]!;

type CustomCameraFormValues = {
  name: string;
  brand: string;
  model: string;
  sensorWidth: string;
  sensorHeight: string;
  imageWidth: string;
  imageHeight: string;
  focal: string;
  minTrigger: string;
};

const CUSTOM_CAMERA_FORM_DEFAULTS: CustomCameraFormValues = {
  name: "Custom Survey Cam 24mm",
  brand: "Custom",
  model: "Survey Cam 24mm",
  sensorWidth: "23.5",
  sensorHeight: "15.6",
  imageWidth: "6000",
  imageHeight: "4000",
  focal: "24",
  minTrigger: "1.5",
};

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

async function fillCustomCameraForm(overrides: Partial<CustomCameraFormValues> = {}) {
  const values = { ...CUSTOM_CAMERA_FORM_DEFAULTS, ...overrides };
  const fields = [
    [missionWorkspaceTestIds.cameraCustomName, values.name],
    [missionWorkspaceTestIds.cameraCustomBrand, values.brand],
    [missionWorkspaceTestIds.cameraCustomModel, values.model],
    [missionWorkspaceTestIds.cameraCustomSensorWidth, values.sensorWidth],
    [missionWorkspaceTestIds.cameraCustomSensorHeight, values.sensorHeight],
    [missionWorkspaceTestIds.cameraCustomImageWidth, values.imageWidth],
    [missionWorkspaceTestIds.cameraCustomImageHeight, values.imageHeight],
    [missionWorkspaceTestIds.cameraCustomFocal, values.focal],
    [missionWorkspaceTestIds.cameraCustomMinTrigger, values.minTrigger],
  ] as const;

  for (const [testId, value] of fields) {
    await fireEvent.input(screen.getByTestId(testId), {
      target: { value },
    });
  }
}

function installFailingLocalStorage() {
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

  return () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: originalLocalStorage,
    });
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
    const onGenerateRegion = vi.fn();
    const region = makeGridRegion({
      cameraId: null,
      camera: null,
      qgcPassthrough: {},
      importWarnings: ["Imported survey metadata preserved."],
    });
    const rendered = renderInspector(region, { onUpdateRegion, onGenerateRegion });

    expect((screen.getByTestId(missionWorkspaceTestIds.surveyGenerate) as HTMLButtonElement).disabled).toBe(true);

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

    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.surveyGenerate));
    expect(onGenerateRegion).toHaveBeenCalledWith(region.id);
  });

  it("validates custom camera form values and handles save failure then success", async () => {
    const onUpdateRegion = vi.fn();
    const region = makeGridRegion();
    renderInspector(region, { onUpdateRegion });

    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.cameraCustomToggle));
    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.cameraCustomSave));

    expect(screen.getByTestId(missionWorkspaceTestIds.cameraWarning).textContent).toContain("canonical name, brand, and model");

    await fillCustomCameraForm({ focal: "0" });
    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.cameraCustomSave));
    expect(screen.getByTestId(missionWorkspaceTestIds.cameraWarning).textContent).toContain("positive sensor, image, and focal-length values");

    await fillCustomCameraForm();

    const restoreLocalStorage = installFailingLocalStorage();
    try {
      await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.cameraCustomSave));
      expect(screen.getByTestId(missionWorkspaceTestIds.cameraWarning).textContent).toContain("not saved");
      expect(onUpdateRegion).not.toHaveBeenCalled();
    } finally {
      restoreLocalStorage();
    }

    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.cameraCustomSave));

    expect(onUpdateRegion).toHaveBeenCalledTimes(1);
    const [, updater] = onUpdateRegion.mock.calls[0] as [string, (current: SurveyRegion) => SurveyRegion];
    const updatedRegion = updater(region);
    expect(updatedRegion.camera?.canonicalName).toBe("Custom Survey Cam 24mm");
    expect(updatedRegion.camera?.minTriggerInterval_s).toBe(1.5);
  });

  it("routes subordinate generated-item changes through manual-edit callbacks", async () => {
    const onMarkGeneratedItemEdited = vi.fn();
    const region = makeGridRegion({
      cameraId: BUILTIN_CAMERA.canonicalName,
      camera: BUILTIN_CAMERA,
      generatedItems: [makeWaypoint(47.3982, 8.5454, 55)],
    });

    renderInspector(region, {
      onMarkGeneratedItemEdited,
    });

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
});

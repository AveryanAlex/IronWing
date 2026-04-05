import { describe, expect, it, vi } from "vitest";

import type { CorridorResult } from "./corridor-scan";
import { getBuiltinCameras } from "./survey-camera-catalog";
import {
    createCorridorRegion,
    createSurveyDraftExtension,
    createSurveyRegion,
    insertSurveyRegion,
    type SurveyDraftExtension,
} from "./survey-region";
import type { StructureScanResult } from "./structure-scan";
import type { SurveyResult } from "./survey-grid";
import {
    buildSurveyGenerationRequest,
    createSurveyDissolvePrompt,
    createSurveyRegeneratePrompt,
    normalizeSurveyAuthoringExtension,
    reindexSurveyBlocksAfterDissolve,
    resolveSurveyGenerationBlockedReason,
    resolveSurveyInsertionSite,
    runSurveyGenerationRequest,
} from "./mission-survey-authoring";

const CAMERA = getBuiltinCameras()[0]!;
const POLYGON = [
    { latitude_deg: 47.3981, longitude_deg: 8.5451 },
    { latitude_deg: 47.3984, longitude_deg: 8.5463 },
    { latitude_deg: 47.3977, longitude_deg: 8.5468 },
];
const POLYLINE = [
    { latitude_deg: 47.3981, longitude_deg: 8.5451 },
    { latitude_deg: 47.3984, longitude_deg: 8.5463 },
];

function makeOrderedSurveyExtension(): SurveyDraftExtension {
    let extension = createSurveyDraftExtension();
    const first = createSurveyRegion(POLYGON);
    const second = createSurveyRegion(POLYGON);
    const third = createCorridorRegion(POLYLINE);

    extension = insertSurveyRegion(extension, first, 0, 0);
    extension = insertSurveyRegion(extension, second, 0, 1);
    extension = insertSurveyRegion(extension, third, 1, 2);
    return extension;
}

describe("mission-survey-authoring", () => {
    it("resolves insertion sites after home, manual items, and survey blocks", () => {
        const extension = makeOrderedSurveyExtension();
        const firstRegionId = extension.surveyRegionOrder[0]?.regionId ?? "";
        const secondRegionId = extension.surveyRegionOrder[1]?.regionId ?? "";

        expect(resolveSurveyInsertionSite({ kind: "home" }, extension)).toEqual({
            position: 0,
            orderIndex: 0,
        });
        expect(resolveSurveyInsertionSite({ kind: "mission-item", index: 0 }, extension)).toEqual({
            position: 1,
            orderIndex: 2,
        });
        expect(resolveSurveyInsertionSite({ kind: "survey-block", regionId: firstRegionId }, extension)).toEqual({
            position: 0,
            orderIndex: 1,
        });
        expect(resolveSurveyInsertionSite({ kind: "survey-block", regionId: secondRegionId }, extension)).toEqual({
            position: 0,
            orderIndex: 2,
        });
    });

    it("reindexes remaining survey blocks when a dissolved block becomes manual mission items", () => {
        const extension = makeOrderedSurveyExtension();
        const firstRegionId = extension.surveyRegionOrder[0]?.regionId ?? "";
        const reindexed = reindexSurveyBlocksAfterDissolve(extension, 1, firstRegionId, 2);

        expect(reindexed.surveyRegionOrder).toEqual([
            { regionId: extension.surveyRegionOrder[1]?.regionId ?? "", position: 2 },
            { regionId: extension.surveyRegionOrder[2]?.regionId ?? "", position: 3 },
        ]);
    });

    it("normalizes region authoring state from missing cameras and preserved import metadata", () => {
        const authored = normalizeSurveyAuthoringExtension(insertSurveyRegion(
            createSurveyDraftExtension(),
            createSurveyRegion(POLYGON),
            0,
            0,
        ));
        const authoredRegion = authored.surveyRegions.get(authored.surveyRegionOrder[0]?.regionId ?? "")!;

        expect(authoredRegion.generationState).toBe("blocked");
        expect(authoredRegion.generationMessage).toContain("Choose a camera");

        const imported = createSurveyRegion(POLYGON);
        imported.qgcPassthrough = {
            TransectStyleComplexItem: {
                CameraCalc: {
                    CameraName: "Manual (no camera specs)",
                },
            },
        };
        const importedExtension = normalizeSurveyAuthoringExtension(insertSurveyRegion(
            createSurveyDraftExtension(),
            imported,
            0,
            0,
        ));
        const importedRegion = importedExtension.surveyRegions.get(imported.id)!;

        expect(importedRegion.generationState).toBe("blocked");
        expect(importedRegion.generationMessage).toContain("preserved for export only");
    });

    it("builds grid, corridor, and structure generation requests from the existing survey engines", () => {
        const grid = createSurveyRegion(POLYGON);
        grid.cameraId = CAMERA.canonicalName;
        const corridor = createCorridorRegion(POLYLINE);
        corridor.cameraId = CAMERA.canonicalName;
        const structure = createSurveyRegion(POLYGON, "structure");
        structure.cameraId = CAMERA.canonicalName;

        const gridRequest = buildSurveyGenerationRequest(grid);
        const corridorRequest = buildSurveyGenerationRequest(corridor);
        const structureRequest = buildSurveyGenerationRequest(structure);

        expect(gridRequest).toMatchObject({ ok: true, request: { kind: "grid" } });
        expect(corridorRequest).toMatchObject({ ok: true, request: { kind: "corridor" } });
        expect(structureRequest).toMatchObject({ ok: true, request: { kind: "structure" } });
        expect(gridRequest.ok && gridRequest.request.params.camera).toEqual(CAMERA);
        expect(corridorRequest.ok && corridorRequest.request.params.camera).toEqual(CAMERA);
        expect(structureRequest.ok && structureRequest.request.params.camera).toEqual(CAMERA);
    });

    it("blocks generation for malformed geometry and unresolved imported cameras", () => {
        const malformed = createSurveyRegion(POLYGON.slice(0, 2));
        malformed.cameraId = CAMERA.canonicalName;
        const unresolved = createSurveyRegion(POLYGON);
        unresolved.cameraId = "missing-camera";

        expect(resolveSurveyGenerationBlockedReason(malformed)).toMatchObject({
            code: "invalid_geometry",
        });
        expect(resolveSurveyGenerationBlockedReason(unresolved)).toMatchObject({
            code: "unresolved_camera",
        });
    });

    it("creates explicit regenerate and dissolve prompts", () => {
        const region = createSurveyRegion(POLYGON);
        region.generatedItems = [{ command: { Nav: "ReturnToLaunch" }, current: false, autocontinue: true }];
        region.manualEdits.set(0, { command: { Nav: "ReturnToLaunch" }, current: false, autocontinue: true });

        expect(createSurveyRegeneratePrompt(region)).toMatchObject({
            kind: "confirm-regenerate",
            regionId: region.id,
            manualEditCount: 1,
        });
        expect(createSurveyDissolvePrompt(region)).toMatchObject({
            kind: "confirm-dissolve",
            regionId: region.id,
            generatedItemCount: 1,
            manualEditCount: 1,
        });
    });

    it("dispatches survey generation through the injected engine runners", async () => {
        const grid = createSurveyRegion(POLYGON);
        grid.cameraId = CAMERA.canonicalName;
        const corridor = createCorridorRegion(POLYLINE);
        corridor.cameraId = CAMERA.canonicalName;
        const structure = createSurveyRegion(POLYGON, "structure");
        structure.cameraId = CAMERA.canonicalName;

        const gridRequest = buildSurveyGenerationRequest(grid);
        const corridorRequest = buildSurveyGenerationRequest(corridor);
        const structureRequest = buildSurveyGenerationRequest(structure);

        const engines = {
            grid: vi.fn(async (): Promise<SurveyResult> => ({ ok: false, errors: [{ code: "invalid_overlap", message: "grid" }] })),
            corridor: vi.fn(async (): Promise<CorridorResult> => ({ ok: false, errors: [{ code: "invalid_width", message: "corridor" }] })),
            structure: vi.fn(async (): Promise<StructureScanResult> => ({ ok: false, errors: [{ code: "invalid_layer_count", message: "structure" }] })),
        };

        if (gridRequest.ok) {
            const result = await runSurveyGenerationRequest(gridRequest.request, engines);
            expect(result).toEqual({ ok: false, errors: [{ code: "invalid_overlap", message: "grid" }] });
        }
        if (corridorRequest.ok) {
            const result = await runSurveyGenerationRequest(corridorRequest.request, engines);
            expect(result).toEqual({ ok: false, errors: [{ code: "invalid_width", message: "corridor" }] });
        }
        if (structureRequest.ok) {
            const result = await runSurveyGenerationRequest(structureRequest.request, engines);
            expect(result).toEqual({ ok: false, errors: [{ code: "invalid_layer_count", message: "structure" }] });
        }

        expect(engines.grid).toHaveBeenCalledOnce();
        expect(engines.corridor).toHaveBeenCalledOnce();
        expect(engines.structure).toHaveBeenCalledOnce();
    });
});

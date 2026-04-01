import { useCallback, useMemo, useRef, useState } from "react";

import type { HomePosition } from "../mission";
import { generateCorridor, estimateCorridorWaypointCount } from "../lib/corridor-scan";
import { resolveStartCorner } from "../lib/mission-grid";
import type { GeoPoint2d, MissionItem } from "../lib/mavkit-types";
import {
    addRecentCamera,
    findCamera,
    saveCustomCamera as persistCustomCamera,
    type CatalogCamera,
} from "../lib/survey-camera-catalog";
import {
    estimateSurveyFlightTime,
    formatSurveyStats,
    type FormattedSurveyStats,
} from "../lib/survey-preview";
import {
    addSurveyRegion,
    applyGenerationResult,
    createCorridorRegion,
    createStructureRegion,
    createSurveyDraftExtension,
    createSurveyRegion,
    dissolveSurveyRegion,
    regionHasManualEdits,
    removeSurveyRegion,
    updateSurveyRegion,
    type SurveyDraftExtension,
    type SurveyGenerationResult,
    type SurveyPatternType,
    type SurveyRegion,
    type SurveyRegionParams,
} from "../lib/survey-region";
import {
    estimateStructureScanWaypointCount,
    generateStructureScan,
} from "../lib/structure-scan";
import {
    estimateSurveyWaypointCount,
    generateSurvey,
    type TerrainLookup,
} from "../lib/survey-grid";

const DEFAULT_CORRIDOR_WIDTH_M = 50;

const DEFAULT_PARAMS: SurveyRegionParams = {
    sideOverlap_pct: 70,
    frontOverlap_pct: 80,
    altitude_m: 50,
    trackAngle_deg: 0,
    orientation: "landscape",
    crosshatch: false,
    turnaroundDistance_m: 0,
    terrainFollow: false,
    captureMode: "distance",
    startCorner: "bottom_left",
    turnDirection: "clockwise",
    leftWidth_m: 0,
    rightWidth_m: 0,
    structureHeight_m: 20,
    scanDistance_m: 15,
    layerCount: 3,
    layerOrder: "bottom_to_top",
};

export type SurveyPlannerMissionMutators = {
    selectedIndex?: number | null;
    displayTotal?: number;
    insertGeneratedAfter?: (index: number, items: MissionItem[]) => void;
};

export type UseSurveyPlannerOptions = {
    homePosition: HomePosition | null;
    missionMutators?: SurveyPlannerMissionMutators;
    cruiseSpeed_mps: number;
    terrainLookup?: TerrainLookup;
};

export type UseSurveyPlannerResult = {
    surveyMode: boolean;
    patternType: SurveyPatternType;
    activeRegionId: string | null;
    regions: SurveyDraftExtension;
    isDrawing: boolean;
    drawingVertices: GeoPoint2d[];
    selectedCamera: CatalogCamera | null;
    params: SurveyRegionParams;
    isGenerating: boolean;
    showCustomCameraForm: boolean;
    canGenerate: boolean;
    activeRegion: SurveyRegion | null;
    allRegions: SurveyRegion[];
    estimatedWaypointCount: number | null;
    formattedStats: FormattedSurveyStats | null;
    activeRegionFlightTime_s: number | null;
    activeRegionHasManualEdits: boolean;
    enterSurveyMode: () => void;
    exitSurveyMode: () => void;
    createRegion: (polygon: GeoPoint2d[]) => SurveyRegion;
    selectRegion: (regionId: string) => void;
    deleteRegion: (regionId: string) => void;
    dissolveRegion: (regionId: string) => MissionItem[];
    startDraw: () => void;
    stopDraw: () => void;
    addVertex: (latitude_deg: number, longitude_deg: number) => void;
    completePolygon: () => SurveyRegion | null;
    completeLine: () => SurveyRegion | null;
    moveVertex: (index: number, latitude_deg: number, longitude_deg: number) => void;
    setPatternType: (type: SurveyPatternType) => void;
    setCamera: (camera: CatalogCamera | null) => void;
    setParam: <K extends keyof SurveyRegionParams>(key: K, value: SurveyRegionParams[K]) => void;
    generate: () => Promise<SurveyGenerationResult | null>;
    openCustomCameraForm: () => void;
    closeCustomCameraForm: () => void;
    saveCustomCamera: (camera: CatalogCamera) => CatalogCamera;
};

function clonePoint(point: GeoPoint2d): GeoPoint2d {
    return { ...point };
}

function clonePoints(points: GeoPoint2d[]): GeoPoint2d[] {
    return points.map(clonePoint);
}

function defaultOrientationForCamera(camera: CatalogCamera): SurveyRegionParams["orientation"] {
    return camera.landscape ? "landscape" : "portrait";
}

function resolveRegionStartCorner(
    polygon: GeoPoint2d[],
    homePosition: HomePosition | null,
    trackAngle_deg: number,
    fallback: SurveyRegionParams["startCorner"],
): SurveyRegionParams["startCorner"] {
    if (!homePosition || polygon.length < 3) {
        return fallback;
    }

    return resolveStartCorner(polygon, homePosition, trackAngle_deg);
}

function regionInsertionIndex(missionMutators?: SurveyPlannerMissionMutators): number {
    if (typeof missionMutators?.selectedIndex === "number") {
        return missionMutators.selectedIndex;
    }

    if (typeof missionMutators?.displayTotal === "number") {
        return missionMutators.displayTotal - 1;
    }

    return -1;
}

function orderedRegions(extension: SurveyDraftExtension): SurveyRegion[] {
    return extension.surveyRegionOrder
        .map((block) => extension.surveyRegions.get(block.regionId) ?? null)
        .filter((region): region is SurveyRegion => region !== null);
}

function regionBlockPosition(extension: SurveyDraftExtension, regionId: string): number | null {
    return extension.surveyRegionOrder.find((block) => block.regionId === regionId)?.position ?? null;
}

function syncRegionWithPlannerState(
    region: SurveyRegion,
    selectedCamera: CatalogCamera | null,
    params: SurveyRegionParams,
    homePosition: HomePosition | null,
): SurveyRegion {
    const nextPolygon = clonePoints(region.polygon);
    const nextPolyline = clonePoints(region.polyline);
    const nextParams = {
        ...params,
        startCorner: region.patternType === "grid"
            ? resolveRegionStartCorner(
                nextPolygon,
                homePosition,
                params.trackAngle_deg,
                params.startCorner,
            )
            : params.startCorner,
    };

    return {
        ...region,
        polygon: nextPolygon,
        polyline: nextPolyline,
        corridorPolygon: clonePoints(region.corridorPolygon),
        cameraId: selectedCamera?.canonicalName ?? null,
        camera: selectedCamera ? { ...selectedCamera } : null,
        params: nextParams,
    };
}

function paramsForPatternType(
    current: SurveyRegionParams,
    nextPatternType: SurveyPatternType,
): SurveyRegionParams {
    if (nextPatternType === "corridor") {
        return {
            ...current,
            crosshatch: false,
            leftWidth_m: current.leftWidth_m > 0 ? current.leftWidth_m : DEFAULT_CORRIDOR_WIDTH_M,
            rightWidth_m: current.rightWidth_m > 0 ? current.rightWidth_m : DEFAULT_CORRIDOR_WIDTH_M,
        };
    }

    return {
        ...current,
        leftWidth_m: 0,
        rightWidth_m: 0,
    };
}

export function useSurveyPlanner({
    homePosition,
    missionMutators,
    cruiseSpeed_mps,
    terrainLookup,
}: UseSurveyPlannerOptions): UseSurveyPlannerResult {
    const [surveyMode, setSurveyMode] = useState(false);
    const [patternTypeState, setPatternTypeState] = useState<SurveyPatternType>("grid");
    const [activeRegionId, setActiveRegionId] = useState<string | null>(null);
    const [regions, setRegions] = useState<SurveyDraftExtension>(() => createSurveyDraftExtension());
    const [isDrawing, setIsDrawing] = useState(false);
    const [drawingVertices, setDrawingVertices] = useState<GeoPoint2d[]>([]);
    const [selectedCamera, setSelectedCameraState] = useState<CatalogCamera | null>(null);
    const [params, setParamsState] = useState<SurveyRegionParams>(DEFAULT_PARAMS);
    const [isGenerating, setIsGenerating] = useState(false);
    const [showCustomCameraForm, setShowCustomCameraForm] = useState(false);

    const patternTypeRef = useRef(patternTypeState);
    const regionsRef = useRef(regions);
    const activeRegionIdRef = useRef(activeRegionId);
    const selectedCameraRef = useRef(selectedCamera);
    const paramsRef = useRef(params);

    patternTypeRef.current = patternTypeState;
    regionsRef.current = regions;
    activeRegionIdRef.current = activeRegionId;
    selectedCameraRef.current = selectedCamera;
    paramsRef.current = params;

    const commitPatternType = useCallback((next: SurveyPatternType) => {
        patternTypeRef.current = next;
        setPatternTypeState(next);
        return next;
    }, []);

    const commitRegions = useCallback((next: SurveyDraftExtension) => {
        regionsRef.current = next;
        setRegions(next);
        return next;
    }, []);

    const commitActiveRegionId = useCallback((next: string | null) => {
        activeRegionIdRef.current = next;
        setActiveRegionId(next);
        return next;
    }, []);

    const commitSelectedCamera = useCallback((next: CatalogCamera | null) => {
        const nextCamera = next ? { ...next } : null;
        selectedCameraRef.current = nextCamera;
        setSelectedCameraState(nextCamera);
        return nextCamera;
    }, []);

    const commitParams = useCallback((next: SurveyRegionParams) => {
        const nextParams = { ...next };
        paramsRef.current = nextParams;
        setParamsState(nextParams);
        return nextParams;
    }, []);

    const activeRegion = useMemo(
        () => (activeRegionId ? regions.surveyRegions.get(activeRegionId) ?? null : null),
        [activeRegionId, regions],
    );

    const allRegions = useMemo(() => orderedRegions(regions), [regions]);

    const estimatedWaypointCount = useMemo(() => {
        if (!activeRegion || !selectedCamera) {
            return null;
        }

        if (activeRegion.patternType === "corridor") {
            return estimateCorridorWaypointCount({
                polyline: activeRegion.polyline,
                camera: selectedCamera,
                orientation: params.orientation,
                altitude_m: params.altitude_m,
                sideOverlap_pct: params.sideOverlap_pct,
                frontOverlap_pct: params.frontOverlap_pct,
                leftWidth_m: params.leftWidth_m,
                rightWidth_m: params.rightWidth_m,
                turnaroundDistance_m: params.turnaroundDistance_m,
                terrainFollow: params.terrainFollow,
                captureMode: params.captureMode,
            });
        }

        if (activeRegion.patternType === "structure") {
            return estimateStructureScanWaypointCount({
                polygon: activeRegion.polygon,
                camera: selectedCamera,
                orientation: params.orientation,
                altitude_m: params.altitude_m,
                structureHeight_m: params.structureHeight_m,
                scanDistance_m: params.scanDistance_m,
                layerCount: params.layerCount,
                layerOrder: params.layerOrder,
                sideOverlap_pct: params.sideOverlap_pct,
                frontOverlap_pct: params.frontOverlap_pct,
                terrainFollow: params.terrainFollow,
                captureMode: params.captureMode,
            });
        }

        return estimateSurveyWaypointCount({
            polygon: activeRegion.polygon,
            camera: selectedCamera,
            orientation: params.orientation,
            altitude_m: params.altitude_m,
            sideOverlap_pct: params.sideOverlap_pct,
            frontOverlap_pct: params.frontOverlap_pct,
            trackAngle_deg: params.trackAngle_deg,
            startCorner: params.startCorner,
            turnDirection: params.turnDirection,
            crosshatch: params.crosshatch,
            turnaroundDistance_m: params.turnaroundDistance_m,
            terrainFollow: params.terrainFollow,
            captureMode: params.captureMode,
        });
    }, [activeRegion, params, selectedCamera]);

    const activeRegionFlightTime_s = useMemo(() => {
        if (!activeRegion || activeRegion.generatedItems.length === 0) {
            return null;
        }

        return estimateSurveyFlightTime(activeRegion.generatedItems, cruiseSpeed_mps);
    }, [activeRegion, cruiseSpeed_mps]);

    const formattedStats = useMemo(() => {
        if (!activeRegion?.generatedStats) {
            return null;
        }

        return formatSurveyStats(activeRegion.generatedStats, activeRegionFlightTime_s);
    }, [activeRegion, activeRegionFlightTime_s]);

    const activeRegionHasManualEdits = useMemo(
        () => (activeRegion ? regionHasManualEdits(activeRegion) : false),
        [activeRegion],
    );

    const canGenerate = useMemo(() => {
        if (!surveyMode || !activeRegion || !selectedCamera || isDrawing || isGenerating || estimatedWaypointCount === null) {
            return false;
        }

        if (activeRegion.patternType === "corridor") {
            return (
                activeRegion.polyline.length >= 2
                && params.leftWidth_m > 0
                && params.rightWidth_m > 0
            );
        }

        return activeRegion.polygon.length >= 3;
    }, [activeRegion, estimatedWaypointCount, isDrawing, isGenerating, params.leftWidth_m, params.rightWidth_m, selectedCamera, surveyMode]);

    const enterSurveyMode = useCallback(() => {
        setSurveyMode(true);
    }, []);

    const exitSurveyMode = useCallback(() => {
        setSurveyMode(false);
        setIsDrawing(false);
        setDrawingVertices([]);
        setShowCustomCameraForm(false);
    }, []);

    const selectRegion = useCallback((regionId: string) => {
        const region = regionsRef.current.surveyRegions.get(regionId);
        if (!region) {
            return;
        }

        commitActiveRegionId(regionId);
        commitPatternType(region.patternType);
        commitSelectedCamera(region.camera);
        commitParams(region.params);
    }, [commitActiveRegionId, commitParams, commitPatternType, commitSelectedCamera]);

    const createRegionFromGeometry = useCallback((geometry: GeoPoint2d[], nextPatternType: SurveyPatternType) => {
        const nextRegion = nextPatternType === "corridor"
            ? createCorridorRegion(clonePoints(geometry))
            : nextPatternType === "structure"
                ? createStructureRegion(clonePoints(geometry))
                : createSurveyRegion(clonePoints(geometry));
        const seededRegion = syncRegionWithPlannerState(
            nextRegion,
            selectedCameraRef.current,
            paramsForPatternType(paramsRef.current, nextPatternType),
            homePosition,
        );

        commitRegions(addSurveyRegion(
            regionsRef.current,
            seededRegion,
            regionInsertionIndex(missionMutators),
        ));
        commitActiveRegionId(seededRegion.id);
        commitPatternType(seededRegion.patternType);
        commitSelectedCamera(seededRegion.camera);
        commitParams(seededRegion.params);
        setSurveyMode(true);

        return seededRegion;
    }, [commitActiveRegionId, commitParams, commitPatternType, commitRegions, commitSelectedCamera, homePosition, missionMutators]);

    const createRegion = useCallback((polygon: GeoPoint2d[]) => {
        return createRegionFromGeometry(polygon, "grid");
    }, [createRegionFromGeometry]);

    const deleteRegion = useCallback((regionId: string) => {
        const nextRegions = removeSurveyRegion(regionsRef.current, regionId);
        commitRegions(nextRegions);

        if (activeRegionIdRef.current !== regionId) {
            return;
        }

        const nextRegion = orderedRegions(nextRegions)[0] ?? null;
        commitActiveRegionId(nextRegion?.id ?? null);
        if (nextRegion) {
            commitPatternType(nextRegion.patternType);
            commitSelectedCamera(nextRegion.camera);
            commitParams(nextRegion.params);
        }
    }, [commitActiveRegionId, commitParams, commitPatternType, commitRegions, commitSelectedCamera]);

    const dissolveRegion = useCallback((regionId: string) => {
        const currentRegion = regionsRef.current.surveyRegions.get(regionId);
        if (!currentRegion) {
            return [];
        }

        const dissolveResult = dissolveSurveyRegion(regionsRef.current, regionId);
        const blockPosition = regionBlockPosition(regionsRef.current, regionId);

        commitRegions(dissolveResult.extension);
        if (activeRegionIdRef.current === regionId) {
            const nextRegion = orderedRegions(dissolveResult.extension)[0] ?? null;
            commitActiveRegionId(nextRegion?.id ?? null);
            if (nextRegion) {
                commitPatternType(nextRegion.patternType);
                commitSelectedCamera(nextRegion.camera);
                commitParams(nextRegion.params);
            }
        }

        if (dissolveResult.dissolvedItems.length > 0 && missionMutators?.insertGeneratedAfter) {
            missionMutators.insertGeneratedAfter((blockPosition ?? 0) - 1, dissolveResult.dissolvedItems);
        }

        return dissolveResult.dissolvedItems;
    }, [commitActiveRegionId, commitParams, commitPatternType, commitRegions, commitSelectedCamera, missionMutators]);

    const startDraw = useCallback(() => {
        setSurveyMode(true);
        setIsDrawing(true);
        setDrawingVertices([]);
    }, []);

    const stopDraw = useCallback(() => {
        setIsDrawing(false);
    }, []);

    const addVertex = useCallback((latitude_deg: number, longitude_deg: number) => {
        setDrawingVertices((current) => [...current, { latitude_deg, longitude_deg }]);
    }, []);

    const completePolygon = useCallback(() => {
        if (drawingVertices.length < 3) {
            return null;
        }

        const nextPatternType = patternTypeRef.current === "structure" ? "structure" : "grid";
        const region = createRegionFromGeometry(drawingVertices, nextPatternType);
        setIsDrawing(false);
        setDrawingVertices([]);
        return region;
    }, [createRegionFromGeometry, drawingVertices]);

    const completeLine = useCallback(() => {
        if (drawingVertices.length < 2) {
            return null;
        }

        const region = createRegionFromGeometry(drawingVertices, "corridor");
        setIsDrawing(false);
        setDrawingVertices([]);
        return region;
    }, [createRegionFromGeometry, drawingVertices]);

    const moveVertex = useCallback((index: number, latitude_deg: number, longitude_deg: number) => {
        const nextPoint = { latitude_deg, longitude_deg };

        if (isDrawing) {
            setDrawingVertices((current) => current.map((point, pointIndex) => (
                pointIndex === index ? nextPoint : point
            )));
            return;
        }

        const currentActiveRegionId = activeRegionIdRef.current;
        if (!currentActiveRegionId) {
            return;
        }

        commitRegions(updateSurveyRegion(regionsRef.current, currentActiveRegionId, (region) => {
            if (region.patternType === "corridor") {
                return {
                    ...region,
                    polyline: region.polyline.map((point, pointIndex) => (
                        pointIndex === index ? nextPoint : clonePoint(point)
                    )),
                };
            }

            const polygon = region.polygon.map((point, pointIndex) => (
                pointIndex === index ? nextPoint : clonePoint(point)
            ));
            const nextParams = {
                ...region.params,
                startCorner: region.patternType === "grid"
                    ? resolveRegionStartCorner(
                        polygon,
                        homePosition,
                        region.params.trackAngle_deg,
                        region.params.startCorner,
                    )
                    : region.params.startCorner,
            };

            return {
                ...region,
                polygon,
                params: nextParams,
            };
        }));
    }, [commitRegions, homePosition, isDrawing]);

    const setPatternType = useCallback((nextPatternType: SurveyPatternType) => {
        commitPatternType(nextPatternType);
        setSurveyMode(true);
        setIsDrawing(false);
        setDrawingVertices([]);
        commitParams(paramsForPatternType(paramsRef.current, nextPatternType));

        const currentActiveRegionId = activeRegionIdRef.current;
        const currentActiveRegion = currentActiveRegionId
            ? regionsRef.current.surveyRegions.get(currentActiveRegionId) ?? null
            : null;
        if (currentActiveRegion && currentActiveRegion.patternType !== nextPatternType) {
            commitActiveRegionId(null);
        }
    }, [commitActiveRegionId, commitParams, commitPatternType]);

    const setCamera = useCallback((camera: CatalogCamera | null) => {
        const nextCamera = commitSelectedCamera(camera);
        const nextOrientation = nextCamera ? defaultOrientationForCamera(nextCamera) : paramsRef.current.orientation;
        const nextParams = commitParams({
            ...paramsRef.current,
            orientation: nextOrientation,
        });

        if (nextCamera) {
            addRecentCamera(nextCamera.canonicalName);
        }

        const currentActiveRegionId = activeRegionIdRef.current;
        if (!currentActiveRegionId) {
            return;
        }

        commitRegions(updateSurveyRegion(regionsRef.current, currentActiveRegionId, (region) => ({
            ...region,
            cameraId: nextCamera?.canonicalName ?? null,
            camera: nextCamera ? { ...nextCamera } : null,
            params: {
                ...region.params,
                orientation: nextParams.orientation,
            },
        })));
    }, [commitParams, commitRegions, commitSelectedCamera]);

    const setParam = useCallback(<K extends keyof SurveyRegionParams>(key: K, value: SurveyRegionParams[K]) => {
        const currentActiveRegionId = activeRegionIdRef.current;
        const currentRegion = currentActiveRegionId
            ? regionsRef.current.surveyRegions.get(currentActiveRegionId) ?? null
            : null;
        const currentPolygon = currentRegion?.patternType === "grid" ? currentRegion.polygon : [];
        const nextParams = {
            ...paramsRef.current,
            [key]: value,
        };

        if (key === "trackAngle_deg") {
            nextParams.startCorner = resolveRegionStartCorner(
                currentPolygon,
                homePosition,
                nextParams.trackAngle_deg,
                nextParams.startCorner,
            );
        }

        if (patternTypeRef.current === "corridor") {
            nextParams.crosshatch = false;
        }

        commitParams(nextParams);

        if (!currentActiveRegionId) {
            return;
        }

        commitRegions(updateSurveyRegion(regionsRef.current, currentActiveRegionId, (region) => {
            const updatedParams = {
                ...region.params,
                [key]: value,
            };

            if (region.patternType === "grid" && key === "trackAngle_deg") {
                updatedParams.startCorner = resolveRegionStartCorner(
                    region.polygon,
                    homePosition,
                    updatedParams.trackAngle_deg,
                    updatedParams.startCorner,
                );
            }

            if (region.patternType === "corridor") {
                updatedParams.crosshatch = false;
            }

            return {
                ...region,
                params: updatedParams,
            };
        }));
    }, [commitParams, commitRegions, homePosition]);

    const generate = useCallback(async () => {
        const currentActiveRegionId = activeRegionIdRef.current;
        const currentSelectedCamera = selectedCameraRef.current;
        const currentActiveRegion = currentActiveRegionId
            ? regionsRef.current.surveyRegions.get(currentActiveRegionId) ?? null
            : null;

        if (!currentActiveRegion || !currentSelectedCamera) {
            return null;
        }

        const currentParams = paramsRef.current;
        const regionForGeneration = syncRegionWithPlannerState(
            currentActiveRegion,
            currentSelectedCamera,
            currentParams,
            homePosition,
        );
        setIsGenerating(true);
        try {
            let result: SurveyGenerationResult;
            if (regionForGeneration.patternType === "corridor") {
                result = await generateCorridor({
                    polyline: regionForGeneration.polyline,
                    camera: currentSelectedCamera,
                    orientation: currentParams.orientation,
                    altitude_m: currentParams.altitude_m,
                    sideOverlap_pct: currentParams.sideOverlap_pct,
                    frontOverlap_pct: currentParams.frontOverlap_pct,
                    leftWidth_m: currentParams.leftWidth_m,
                    rightWidth_m: currentParams.rightWidth_m,
                    turnaroundDistance_m: currentParams.turnaroundDistance_m,
                    terrainFollow: currentParams.terrainFollow,
                    terrainLookup,
                    captureMode: currentParams.captureMode,
                });
            } else if (regionForGeneration.patternType === "structure") {
                result = await generateStructureScan({
                    polygon: regionForGeneration.polygon,
                    camera: currentSelectedCamera,
                    orientation: currentParams.orientation,
                    altitude_m: currentParams.altitude_m,
                    structureHeight_m: currentParams.structureHeight_m,
                    scanDistance_m: currentParams.scanDistance_m,
                    layerCount: currentParams.layerCount,
                    layerOrder: currentParams.layerOrder,
                    sideOverlap_pct: currentParams.sideOverlap_pct,
                    frontOverlap_pct: currentParams.frontOverlap_pct,
                    terrainFollow: currentParams.terrainFollow,
                    terrainLookup,
                    captureMode: currentParams.captureMode,
                });
            } else {
                result = await generateSurvey({
                    polygon: regionForGeneration.polygon,
                    camera: currentSelectedCamera,
                    orientation: currentParams.orientation,
                    altitude_m: currentParams.altitude_m,
                    sideOverlap_pct: currentParams.sideOverlap_pct,
                    frontOverlap_pct: currentParams.frontOverlap_pct,
                    trackAngle_deg: currentParams.trackAngle_deg,
                    startCorner: currentParams.startCorner,
                    turnDirection: currentParams.turnDirection,
                    crosshatch: currentParams.crosshatch,
                    turnaroundDistance_m: currentParams.turnaroundDistance_m,
                    terrainFollow: currentParams.terrainFollow,
                    terrainLookup,
                    captureMode: currentParams.captureMode,
                });
            }

            commitRegions(updateSurveyRegion(regionsRef.current, regionForGeneration.id, (region) => (
                applyGenerationResult(
                    syncRegionWithPlannerState(region, currentSelectedCamera, currentParams, homePosition),
                    result,
                )
            )));

            return result;
        } finally {
            setIsGenerating(false);
        }
    }, [commitRegions, homePosition, terrainLookup]);

    const openCustomCameraForm = useCallback(() => {
        setShowCustomCameraForm(true);
    }, []);

    const closeCustomCameraForm = useCallback(() => {
        setShowCustomCameraForm(false);
    }, []);

    const saveCustomCamera = useCallback((camera: CatalogCamera) => {
        persistCustomCamera(camera);
        const persisted = findCamera(camera.canonicalName) ?? camera;
        setCamera(persisted);
        setShowCustomCameraForm(false);
        return persisted;
    }, [setCamera]);

    return {
        surveyMode,
        patternType: patternTypeState,
        activeRegionId,
        regions,
        isDrawing,
        drawingVertices,
        selectedCamera,
        params,
        isGenerating,
        showCustomCameraForm,
        canGenerate,
        activeRegion,
        allRegions,
        estimatedWaypointCount,
        formattedStats,
        activeRegionFlightTime_s,
        activeRegionHasManualEdits,
        enterSurveyMode,
        exitSurveyMode,
        createRegion,
        selectRegion,
        deleteRegion,
        dissolveRegion,
        startDraw,
        stopDraw,
        addVertex,
        completePolygon,
        completeLine,
        moveVertex,
        setPatternType,
        setCamera,
        setParam,
        generate,
        openCustomCameraForm,
        closeCustomCameraForm,
        saveCustomCamera,
    };
}

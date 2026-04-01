import { Group, Panel, Separator } from "react-resizable-panels";
import { MissionMap } from "../MissionMap";
import { MapContextMenu } from "../MapContextMenu";
import { MissionWorkspaceHeader } from "./MissionWorkspaceHeader";
import { MissionDesktopShell } from "./MissionDesktopShell";
import { ImportChoiceDialog } from "./ImportChoiceDialog";
import { ImportErrorDialog } from "./ImportErrorDialog";
import { ExportDomainDialog } from "./ExportDomainDialog";
import { MissionTerrainProfile } from "./MissionTerrainProfile";
import { SurveyPlannerPanel } from "./SurveyPlannerPanel";
import type { useSession } from "../../hooks/use-session";
import type { useMission } from "../../hooks/use-mission";
import type { useDeviceLocation } from "../../hooks/use-device-location";
import { useMissionTerrain } from "../../hooks/use-mission-terrain";
import { useSurveyPlanner } from "../../hooks/use-survey-planner";
import type { FenceRegion, GeoPoint2d, GeoPoint3d } from "../../lib/mavkit-types";
import type { MissionIssue } from "../../mission";
import type { TypedDraftItem, FenceRegionType } from "../../lib/mission-draft-typed";
import type { SurveyOverlayData } from "./SurveyMapOverlay";
import type { SurveyRegion } from "../../lib/survey-region";
import { computeCorridorPolygon } from "../../lib/corridor-scan";
import { useState, useCallback, useEffect, useMemo } from "react";
import { Navigation, Home } from "lucide-react";
import { toast } from "sonner";
import { findNearestWaypoint } from "./mission-helpers";
import { useSettings } from "../../hooks/use-settings";

type MissionWorkspaceProps = {
  vehicle: ReturnType<typeof useSession>;
  mission: ReturnType<typeof useMission>;
  deviceLocation: ReturnType<typeof useDeviceLocation>;
};

type ContextMenuState = {
  x: number;
  y: number;
  lat: number;
  lng: number;
  nearestSeq: number | null;
} | null;

function buildSurveyOverlay(region: SurveyRegion | null): SurveyOverlayData | null {
  if (!region) {
    return null;
  }

  if (region.patternType === "corridor") {
    if (region.polyline.length < 2 || region.corridorPolygon.length < 3) {
      return null;
    }

    return {
      patternType: "corridor",
      polygon: region.polygon,
      centerline: region.polyline,
      corridorPolygon: region.corridorPolygon,
      transects: region.generatedTransects,
      crosshatchTransects: region.generatedCrosshatch,
      laneSpacing_m: region.generatedStats?.laneSpacing_m ?? 0,
    };
  }

  if (region.polygon.length < 3) {
    return null;
  }

  return {
    patternType: "grid",
    polygon: region.polygon,
    transects: region.generatedTransects,
    crosshatchTransects: region.generatedCrosshatch,
    laneSpacing_m: region.generatedStats?.laneSpacing_m ?? 0,
  };
}

function buildCorridorPreview(
  isDrawing: boolean,
  patternType: "grid" | "corridor",
  drawingVertices: GeoPoint2d[],
  leftWidth_m: number,
  rightWidth_m: number,
): GeoPoint2d[] | undefined {
  if (!isDrawing || patternType !== "corridor" || drawingVertices.length < 2) {
    return undefined;
  }

  const polygon = computeCorridorPolygon(drawingVertices, leftWidth_m, rightWidth_m);
  return polygon.length >= 3 ? polygon : undefined;
}

export function MissionWorkspace({ vehicle, mission, deviceLocation }: MissionWorkspaceProps) {
  const current = mission.current;
  const { settings, updateSettings } = useSettings();
  const [terrainRetryKey, setTerrainRetryKey] = useState(0);
  const terrain = useMissionTerrain(current.draftItems, current.homePosition, current.tab, settings.terrainSafetyMarginM, terrainRetryKey);
  const terrainWarnings = terrain.warningsByIndex ?? undefined;
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [flyToKey, setFlyToKey] = useState(0);
  const [centerOnVehicleKey, setCenterOnVehicleKey] = useState(0);
  const [centerOnHomeKey, setCenterOnHomeKey] = useState(0);
  const [chainModeActive, setChainModeActive] = useState(false);
  const survey = useSurveyPlanner({
    homePosition: mission.mission.homePosition,
    missionMutators: {
      selectedIndex: mission.mission.selectedIndex,
      displayTotal: mission.mission.displayTotal,
      insertGeneratedAfter: mission.mission.insertGeneratedAfter,
    },
    cruiseSpeed_mps: mission.mission.importedSpeeds?.cruiseSpeedMps ?? settings.cruiseSpeedMps,
  });
  const chainModeEnabled = current.tab === "mission" && chainModeActive && !survey.isDrawing;

  const drawingMode = survey.isDrawing
    ? survey.patternType === "corridor"
      ? "polyline"
      : "polygon"
    : undefined;

  const corridorPreview = useMemo(
    () => buildCorridorPreview(
      survey.isDrawing,
      survey.patternType,
      survey.drawingVertices,
      survey.params.leftWidth_m,
      survey.params.rightWidth_m,
    ),
    [survey.drawingVertices, survey.isDrawing, survey.params.leftWidth_m, survey.params.rightWidth_m, survey.patternType],
  );

  const surveyOverlay = useMemo(() => {
    if (current.tab !== "mission" || survey.isDrawing) {
      return null;
    }

    return buildSurveyOverlay(survey.activeRegion);
  }, [current.tab, survey.activeRegion, survey.isDrawing]);

  const terrainIssues = useMemo<MissionIssue[]>(() => {
    if (!terrainWarnings) return [];
    const issues: MissionIssue[] = [];
    for (const [index, warning] of terrainWarnings) {
      if (warning === "below_terrain") {
        issues.push({
          severity: "error",
          code: "terrain_below",
          seq: index,
          message: `Waypoint ${index + 1} is below terrain`,
        });
      } else if (warning === "near_terrain") {
        issues.push({
          severity: "warning",
          code: "terrain_near",
          seq: index,
          message: `Waypoint ${index + 1} is near terrain`,
        });
      }
    }
    return issues;
  }, [terrainWarnings]);

  const allIssues = useMemo<MissionIssue[]>(
    () => [...current.issues, ...terrainIssues],
    [current.issues, terrainIssues],
  );

  const handleTerrainRetry = useCallback(() => {
    setTerrainRetryKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (current.tab !== "mission") {
      setChainModeActive(false);
      if (survey.surveyMode) {
        survey.exitSurveyMode();
      }
    }
  }, [current.tab, survey]);

  useEffect(() => {
    if (!chainModeActive) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setChainModeActive(false);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [chainModeActive]);

  const handleMapSelect = useCallback(
    (seq: number | null) => {
      if (survey.isDrawing) return;
      current.select(seq);
      if (seq !== null) {
        requestAnimationFrame(() => {
          const el = document.querySelector(`[data-mission-waypoint-card][data-seq="${seq}"]`);
          el?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
      }
    },
    [current, survey.isDrawing],
  );

  const handleCardSelect = useCallback(
    (_seq: number) => {
      setFlyToKey((k) => k + 1);
    },
    [],
  );

  const handleContextMenu = useCallback(
    (lat: number, lng: number, x: number, y: number) => {
      if (survey.isDrawing) return;
      const nearestSeq = findNearestWaypoint(current.draftItems, lat, lng);
      setContextMenu({ x, y, lat, lng, nearestSeq });
    },
    [current.draftItems, survey.isDrawing]
  );

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const handleEnterSurveyMode = useCallback(() => {
    survey.enterSurveyMode();
    setContextMenu(null);
  }, [survey]);

  const handleToggleChainMode = useCallback(() => {
    setChainModeActive((active) => !active);
    setContextMenu(null);
  }, []);

  const handleAddFenceRegion = useCallback(
    (lat: number, lng: number, type: FenceRegionType) => {
      mission.fence.addRegionAt(lat, lng, type);
      closeContextMenu();
    },
    [mission.fence, closeContextMenu],
  );

  const handleSetFenceReturnPoint = useCallback(
    (lat: number, lng: number) => {
      mission.fence.setReturnPoint(lat, lng);
      closeContextMenu();
    },
    [mission.fence, closeContextMenu],
  );

  const handleSelectSurveyRegion = useCallback((regionId: string) => {
    survey.selectRegion(regionId);
  }, [survey]);

  const handleDeleteSurveyRegion = useCallback((regionId: string) => {
    survey.deleteRegion(regionId);
  }, [survey]);

  const handleDissolveSurveyRegion = useCallback((regionId: string) => {
    const dissolvedItems = survey.dissolveRegion(regionId);
    if (dissolvedItems.length > 0) {
      toast.success("Survey region dissolved", {
        description: `${dissolvedItems.length} waypoint${dissolvedItems.length === 1 ? "" : "s"} inserted into the mission`,
      });
    }
  }, [survey]);

  const surveyPanel = useMemo(() => (
    <SurveyPlannerPanel planner={survey} />
  ), [survey]);

  const handleToggleSelect = useCallback(
    (index: number) => {
      current.toggleSelect(index);
    },
    [current],
  );

  const handleRectangleSelect = useCallback(
    (indices: number[]) => {
      if (indices.length === 0) return;
      current.select(indices[0]);
      for (let i = 1; i < indices.length; i++) {
        current.toggleSelect(indices[i]);
      }
    },
    [current],
  );

  const handleBlankMapClick = useCallback(
    (lat: number, lng: number, modifiers?: { altKey: boolean }) => {
      if (!chainModeEnabled && !modifiers?.altKey) return;
      current.addWaypointAt(lat, lng);
      setContextMenu(null);
    },
    [chainModeEnabled, current],
  );

  return (
    <div data-mission-workspace className="flex h-full flex-col gap-2">
      <MissionWorkspaceHeader
        mission={mission}
        connected={vehicle.connected}
        onEnterSurveyMode={handleEnterSurveyMode}
        surveyModeActive={survey.surveyMode}
        chainModeActive={current.tab === "mission" && chainModeActive}
        chainModeSuppressed={current.tab === "mission" && chainModeActive && survey.isDrawing}
        onToggleChainMode={handleToggleChainMode}
      />

      <Group orientation="horizontal" className="flex-1 overflow-hidden">
        <Panel defaultSize="65" minSize="40">
          <div className="flex h-full min-h-0 flex-col gap-2">
            <div
              data-mission-map-region
              className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-border"
            >
              <MissionMap
                missionItems={current.draftItems as TypedDraftItem[]}
                homePosition={current.homePosition}
                selectedIndex={current.selectedIndex}
                selectedUiIds={current.selectedUiIds}
                onSelectIndex={handleMapSelect}
                onToggleSelect={handleToggleSelect}
                onRectangleSelect={handleRectangleSelect}
                onMoveWaypoint={current.moveWaypointOnMap}
                onBlankMapClick={handleBlankMapClick}
                onContextMenu={handleContextMenu}
                readOnly={current.readOnly}
                deviceLocation={deviceLocation.location}
                vehiclePosition={vehicle.vehiclePosition}
                currentMissionSeq={current.tab === "mission" ? mission.vehicle.missionState?.current_index ?? null : null}
                flyToSelectedKey={flyToKey}
                centerOnVehicleKey={centerOnVehicleKey}
                centerOnHomeKey={centerOnHomeKey}
                polygonVertices={survey.isDrawing ? survey.drawingVertices : undefined}
                isDrawingPolygon={survey.isDrawing}
                drawingMode={drawingMode}
                corridorPreview={corridorPreview}
                onPolygonClick={survey.addVertex}
                onPolygonComplete={survey.patternType === "corridor" ? survey.completeLine : survey.completePolygon}
                onPolygonVertexMove={survey.moveVertex}
                surveyOverlay={surveyOverlay}
                fenceRegions={current.tab === "fence" ? current.draftItems.map(d => d.document as FenceRegion) : undefined}
                selectedFenceIndex={current.tab === "fence" ? current.selectedIndex : null}
                fenceReturnPoint={current.tab === "fence" ? mission.fence.returnPoint : null}
                rallyPoints={current.tab === "rally"
                  ? current.draftItems.map(d => ({ index: d.index, point: d.document as GeoPoint3d }))
                  : undefined}
                selectedRallyIndex={current.tab === "rally" ? current.selectedIndex : null}
              />
              <div className="absolute bottom-3 right-3 z-10 flex flex-col gap-1.5">
                {vehicle.vehiclePosition && (
                  <button
                    className="rounded-lg bg-bg-secondary/80 p-2 text-text-secondary shadow backdrop-blur hover:bg-bg-tertiary hover:text-text-primary"
                    title="Center on vehicle"
                    onClick={() => setCenterOnVehicleKey((k) => k + 1)}
                  >
                    <Navigation className="h-4 w-4" />
                  </button>
                )}
                {current.homePosition && (
                  <button
                    className="rounded-lg bg-bg-secondary/80 p-2 text-text-secondary shadow backdrop-blur hover:bg-bg-tertiary hover:text-text-primary"
                    title="Center on home"
                    onClick={() => setCenterOnHomeKey((k) => k + 1)}
                  >
                    <Home className="h-4 w-4" />
                  </button>
                )}
              </div>
              {contextMenu && (
                <MapContextMenu
                  x={contextMenu.x}
                  y={contextMenu.y}
                  lat={contextMenu.lat}
                  lng={contextMenu.lng}
                  nearestSeq={contextMenu.nearestSeq}
                  mode="planner"
                  missionType={mission.selectedTab}
                  onAddWaypoint={(lat, lng) => { current.addWaypointAt(lat, lng); closeContextMenu(); }}
                  onSetHome={(lat, lng) => { current.setHomeFromMap(lat, lng); closeContextMenu(); }}
                  onDeleteWaypoint={(seq) => { current.deleteAt(seq); closeContextMenu(); }}
                  onAddFenceRegion={mission.selectedTab === "fence" ? handleAddFenceRegion : undefined}
                  onSetFenceReturnPoint={mission.selectedTab === "fence" ? handleSetFenceReturnPoint : undefined}
                  onClose={closeContextMenu}
                />
              )}
            </div>

            {current.tab === "mission" && (
              <MissionTerrainProfile
                profile={terrain.profile}
                status={terrain.status}
                selectedIndex={current.selectedIndex}
                onSelectIndex={current.select}
                height={120}
                safetyMarginM={settings.terrainSafetyMarginM}
                onSafetyMarginChange={(value) => updateSettings({ terrainSafetyMarginM: value })}
                onRetry={handleTerrainRetry}
              />
            )}
          </div>
        </Panel>

        <Separator className="mx-1 flex w-1.5 items-center justify-center rounded-full transition-colors hover:bg-border-light data-[separator-active]:bg-accent/40">
          <div className="h-8 w-0.5 rounded-full bg-border" />
        </Separator>

        <Panel defaultSize="35" minSize="25" maxSize="50">
          <MissionDesktopShell
            mission={mission}
            connected={vehicle.connected}
            terrainWarnings={terrainWarnings}
            surveyMode={survey.surveyMode}
            surveyPanel={surveyPanel}
            surveyRegions={survey.regions.surveyRegions}
            surveyRegionOrder={survey.regions.surveyRegionOrder}
            activeSurveyRegionId={survey.activeRegionId}
            onSelectSurveyRegion={handleSelectSurveyRegion}
            onDissolveSurveyRegion={handleDissolveSurveyRegion}
            onDeleteSurveyRegion={handleDeleteSurveyRegion}
            onCardSelect={handleCardSelect}
          />
        </Panel>
      </Group>
      {allIssues.length > 0 && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
          <h4 className="mb-1 font-semibold text-warning">
            Validation Issues ({allIssues.length})
          </h4>
          <ul className="list-inside list-disc space-y-0.5 text-xs text-text-secondary">
            {allIssues.map((issue, i) => (
              <li key={`${issue.code}-${i}`}>
                <span className={issue.severity === "error" ? "text-danger" : "text-warning"}>
                  [{issue.severity}]
                </span>{" "}
                {issue.code}
                {typeof issue.seq === "number" ? ` @seq ${issue.seq}` : ""}: {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {mission.importError && (
        <ImportErrorDialog
          title={mission.importError.title}
          details={mission.importError.details}
          onClose={mission.clearImportError}
        />
      )}
      {mission.pendingImport && (
        <ImportChoiceDialog onChoice={mission.confirmImport} />
      )}
      {mission.pendingExport && (
        <ExportDomainDialog
          hasFence={mission.pendingExport.fence.regions.length > 0}
          hasRally={mission.pendingExport.rally.points.length > 0}
          onConfirm={mission.confirmExport}
          onCancel={mission.cancelExport}
        />
      )}
    </div>
  );
}

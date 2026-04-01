import { useState, useCallback, useEffect, useMemo } from "react";
import { ChevronUp, X, MapPin } from "lucide-react";
import { MissionMap } from "../MissionMap";
import { MapContextMenu } from "../MapContextMenu";
import { MissionWorkspaceHeader } from "./MissionWorkspaceHeader";
import { MissionPlannerSummary } from "./MissionPlannerSummary";
import { MissionItemList } from "./MissionItemList";
import { MissionInspector } from "./MissionInspector";
import { FenceInspector } from "./FenceInspector";
import { RallyInspector } from "./RallyInspector";
import { BulkEditPanel } from "./BulkEditPanel";
import { MissionTerrainProfile } from "./MissionTerrainProfile";
import { SurveyPlannerPanel } from "./SurveyPlannerPanel";
import { cn } from "../../lib/utils";
import type { useSession } from "../../hooks/use-session";
import type { useMission } from "../../hooks/use-mission";
import type { useDeviceLocation } from "../../hooks/use-device-location";
import { useMissionTerrain } from "../../hooks/use-mission-terrain";
import { useSurveyPlanner } from "../../hooks/use-survey-planner";
import type { FenceRegion, GeoPoint2d, GeoPoint3d } from "../../lib/mavkit-types";
import type { TypedDraftItem } from "../../lib/mission-draft-typed";
import type { SurveyOverlayData } from "./SurveyMapOverlay";
import type { SurveyRegion } from "../../lib/survey-region";
import { computeCorridorPolygon } from "../../lib/corridor-scan";
import { toast } from "sonner";
import { findNearestWaypoint } from "./mission-helpers";
import { useSettings } from "../../hooks/use-settings";

type MissionMobileDrawerProps = {
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

  if (region.patternType === "structure") {
    const orbitRings = region.generatedLayers
      .map((layer) => layer.orbitPoints)
      .filter((ring) => ring.length >= 2);
    const layerSpacing_m = region.generatedStats && "layerSpacing_m" in region.generatedStats
      ? region.generatedStats.layerSpacing_m
      : 0;

    return {
      patternType: "structure",
      polygon: region.polygon,
      transects: orbitRings,
      crosshatchTransects: [],
      laneSpacing_m: 0,
      layerSpacing_m,
      orbitRings,
      orbitLabels: region.generatedLayers.flatMap((layer) => {
        const point = layer.orbitPoints[0];
        if (!point) {
          return [];
        }

        return [{ point, altitude_m: layer.altitude_m }];
      }),
    };
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
  patternType: SurveyRegion["patternType"],
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

export function MissionMobileDrawer({ vehicle, mission, deviceLocation }: MissionMobileDrawerProps) {
  const current = mission.current;
  const { settings, updateSettings } = useSettings();
  const terrain = useMissionTerrain(current.draftItems, current.homePosition, current.tab, settings.terrainSafetyMarginM);
  const terrainWarnings = terrain.warningsByIndex ?? undefined;
  const showBulkEditor = current.selectedCount > 1;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [flyToKey, setFlyToKey] = useState(0);
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

  useEffect(() => {
    if (current.tab !== "mission") {
      setChainModeActive(false);
      if (survey.surveyMode) {
        survey.exitSurveyMode();
      }
    }
  }, [current.tab, survey]);

  useEffect(() => {
    if (survey.surveyMode) {
      setDrawerOpen(true);
    }
  }, [survey.surveyMode]);

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
    setDrawerOpen(true);
  }, [survey]);

  const handleToggleChainMode = useCallback(() => {
    setChainModeActive((active) => !active);
    setContextMenu(null);
  }, []);

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

  const handleBlankMapClick = useCallback((lat: number, lng: number) => {
    if (!chainModeEnabled) {
      return;
    }
    current.addWaypointAt(lat, lng);
    setContextMenu(null);
  }, [chainModeEnabled, current]);

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

      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div
          data-mission-map-region
          className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-border"
        >
          <MissionMap
            missionItems={current.draftItems as TypedDraftItem[]}
            homePosition={current.homePosition}
            selectedIndex={current.selectedIndex}
            onSelectIndex={handleMapSelect}
            onMoveWaypoint={current.moveWaypointOnMap}
            onBlankMapClick={handleBlankMapClick}
            onContextMenu={handleContextMenu}
            readOnly={current.readOnly}
            deviceLocation={deviceLocation.location}
            vehiclePosition={vehicle.vehiclePosition}
            currentMissionSeq={current.tab === "mission" ? mission.vehicle.missionState?.current_index ?? null : null}
            flyToSelectedKey={flyToKey}
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
            height={80}
            safetyMarginM={settings.terrainSafetyMarginM}
            onSafetyMarginChange={(value) => updateSettings({ terrainSafetyMarginM: value })}
          />
        )}

        <button
          data-mission-mobile-panel-toggle
          aria-expanded={drawerOpen}
          aria-controls="mission-mobile-drawer"
          onClick={() => setDrawerOpen(true)}
          className="flex items-center justify-center gap-1.5 rounded-full border border-border bg-bg-secondary/90 px-3 py-1.5 text-xs font-medium text-text-secondary shadow-lg backdrop-blur-sm transition-colors hover:bg-bg-tertiary hover:text-text-primary"
        >
          <ChevronUp className="h-3.5 w-3.5" />
          {current.displayTotal} item{current.displayTotal !== 1 ? "s" : ""}
        </button>
      </div>

      <div
        data-mission-mobile-backdrop
        data-state={drawerOpen ? "open" : "closed"}
        className={cn(
          "fixed inset-0 z-40 bg-black/50 transition-opacity duration-200",
          drawerOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={() => setDrawerOpen(false)}
      />

      <aside
        id="mission-mobile-drawer"
        data-mission-mobile-drawer
        data-state={drawerOpen ? "open" : "closed"}
        data-survey-mode={survey.surveyMode ? "open" : "closed"}
        aria-hidden={!drawerOpen}
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 flex max-h-[70vh] flex-col rounded-t-xl border-t border-border bg-bg-secondary shadow-xl transition-transform duration-200",
          drawerOpen ? "translate-y-0" : "translate-y-full"
        )}
        style={{ paddingBottom: "calc(var(--safe-area-bottom, 0px) + 0.5rem)" }}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5 text-accent" />
            <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              {survey.surveyMode
                ? "Survey"
                : current.tab === "mission"
                  ? "Waypoints"
                  : current.tab === "fence"
                    ? "Fence"
                    : "Rally"}
            </span>
            {!survey.surveyMode ? (
              <span className="text-xs tabular-nums text-text-muted">
                ({current.displayTotal})
              </span>
            ) : null}
          </div>
          <button
            data-mission-mobile-drawer-close
            onClick={() => setDrawerOpen(false)}
            className="rounded p-1 text-text-muted hover:text-text-primary"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mx-auto -mt-1 mb-2 h-1 w-10 rounded-full bg-border" />

        {survey.surveyMode ? (
          <div className="flex-1 overflow-hidden px-4 pb-2">{surveyPanel}</div>
        ) : (
          <div className="flex-1 overflow-y-auto px-4 pb-2">
            <div className="mb-3">
              <MissionPlannerSummary mission={mission} connected={vehicle.connected} />
            </div>

            <MissionItemList
              mission={mission}
              terrainWarnings={terrainWarnings}
              surveyRegions={survey.regions.surveyRegions}
              surveyRegionOrder={survey.regions.surveyRegionOrder}
              activeSurveyRegionId={survey.activeRegionId}
              onSelectSurveyRegion={handleSelectSurveyRegion}
              onDissolveSurveyRegion={handleDissolveSurveyRegion}
              onDeleteSurveyRegion={handleDeleteSurveyRegion}
              onCardSelect={handleCardSelect}
            />

            {showBulkEditor ? (
              <div className="mt-3">
                <BulkEditPanel mission={mission} />
              </div>
            ) : current.selectedItem && current.selectedIndex !== null ? (
              <div className="mt-3">
                {current.tab === "fence" ? (
                  <FenceInspector
                    draftItem={current.selectedItem}
                    index={current.selectedIndex}
                    readOnly={current.readOnly}
                    onUpdateRegion={mission.fence.updateRegion}
                  />
                ) : current.tab === "rally" ? (
                  <RallyInspector
                    draftItem={current.selectedItem}
                    index={current.selectedIndex}
                    previousItem={current.previousItem}
                    homePosition={current.homePosition}
                    readOnly={current.readOnly}
                    onUpdateAltitude={current.updateAltitude}
                    onUpdateCoordinate={current.updateCoordinate}
                    onUpdateAltitudeFrame={mission.rally.updateAltitudeFrame}
                  />
                ) : (
                  <MissionInspector
                    missionType={current.tab}
                    draftItem={current.selectedItem}
                    index={current.selectedIndex}
                    previousItem={current.previousItem}
                    homePosition={current.homePosition}
                    readOnly={current.readOnly}
                    isSelected={true}
                    onUpdateCommand={current.tab === "mission" ? mission.mission.updateCommand : undefined}
                    onUpdateAltitude={current.updateAltitude}
                    onUpdateCoordinate={current.updateCoordinate}
                    onSetWaypointFromVehicle={mission.mission.setWaypointFromVehicle}
                    onSelect={current.select}
                  />
                )}
              </div>
            ) : null}
          </div>
        )}
      </aside>

      {current.issues.length > 0 && !drawerOpen && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 p-2 text-xs">
          <span className="font-semibold text-warning">
            {current.issues.length} validation issue{current.issues.length !== 1 ? "s" : ""}
          </span>
        </div>
      )}
    </div>
  );
}

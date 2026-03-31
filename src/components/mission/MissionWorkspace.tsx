import { Group, Panel, Separator } from "react-resizable-panels";
import { MissionMap } from "../MissionMap";
import { MapContextMenu } from "../MapContextMenu";
import { MissionWorkspaceHeader } from "./MissionWorkspaceHeader";
import { MissionDesktopShell } from "./MissionDesktopShell";
import { MissionAutoGridDialog } from "./MissionAutoGridDialog";
import { ImportChoiceDialog } from "./ImportChoiceDialog";
import { ExportDomainDialog } from "./ExportDomainDialog";
import { MissionTerrainProfile } from "./MissionTerrainProfile";
import type { useSession } from "../../hooks/use-session";
import type { useMission } from "../../hooks/use-mission";
import type { useDeviceLocation } from "../../hooks/use-device-location";
import { useMissionTerrain } from "../../hooks/use-mission-terrain";
import type { MissionItem, FenceRegion, GeoPoint3d } from "../../lib/mavkit-types";
import type { MissionIssue } from "../../mission";
import type { TypedDraftItem, FenceRegionType } from "../../lib/mission-draft-typed";
import type { PolygonVertex } from "../../lib/mission-grid";
import { useState, useCallback, useEffect, useMemo } from "react";
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

export function MissionWorkspace({ vehicle, mission, deviceLocation }: MissionWorkspaceProps) {
  const current = mission.current;
  const { settings, updateSettings } = useSettings();
  const [terrainRetryKey, setTerrainRetryKey] = useState(0);
  const terrain = useMissionTerrain(current.draftItems, current.homePosition, current.tab, settings.terrainSafetyMarginM, terrainRetryKey);
  const terrainWarnings = terrain.warningsByIndex ?? undefined;
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [flyToKey, setFlyToKey] = useState(0);
  const [autoGridOpen, setAutoGridOpen] = useState(false);
  const [chainModeActive, setChainModeActive] = useState(false);
  const [isDrawingPolygon, setIsDrawingPolygon] = useState(false);
  const [polygonVertices, setPolygonVertices] = useState<PolygonVertex[]>([]);
  const chainModeEnabled = current.tab === "mission" && chainModeActive && !isDrawingPolygon;

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
    }
  }, [current.tab]);

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
      if (isDrawingPolygon) return;
      current.select(seq);
      if (seq !== null) {
        requestAnimationFrame(() => {
          const el = document.querySelector(`[data-mission-waypoint-card][data-seq="${seq}"]`);
          el?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
      }
    },
    [current, isDrawingPolygon],
  );

  const handleCardSelect = useCallback(
    (_seq: number) => {
      setFlyToKey((k) => k + 1);
    },
    [],
  );

  const handleContextMenu = useCallback(
    (lat: number, lng: number, x: number, y: number) => {
      if (isDrawingPolygon) return;
      const nearestSeq = findNearestWaypoint(current.draftItems, lat, lng);
      setContextMenu({ x, y, lat, lng, nearestSeq });
    },
    [current.draftItems, isDrawingPolygon]
  );

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const handleAutoGridOpen = useCallback(() => {
    setAutoGridOpen(true);
    setContextMenu(null);
  }, []);

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

  const handleAutoGridClose = useCallback(() => {
    setAutoGridOpen(false);
    setIsDrawingPolygon(false);
  }, []);

  const handleStartDraw = useCallback(() => {
    setPolygonVertices([]);
    setIsDrawingPolygon(true);
  }, []);

  const handleStopDraw = useCallback(() => {
    setIsDrawingPolygon(false);
  }, []);

  const handleClearPolygon = useCallback(() => {
    setPolygonVertices([]);
  }, []);

  const handlePolygonClick = useCallback((lat: number, lng: number) => {
    setPolygonVertices((prev) => [...prev, { latitude_deg: lat, longitude_deg: lng }]);
  }, []);

  const handlePolygonComplete = useCallback(() => {
    setIsDrawingPolygon(false);
  }, []);

  const handlePolygonVertexMove = useCallback((index: number, lat: number, lng: number) => {
    setPolygonVertices(prev => prev.map((v, i) =>
      i === index ? { latitude_deg: lat, longitude_deg: lng } : v
    ));
  }, []);

  const handleBlankMapClick = useCallback(
    (lat: number, lng: number, modifiers?: { altKey: boolean }) => {
      if (!chainModeEnabled && !modifiers?.altKey) return;
      current.addWaypointAt(lat, lng);
      setContextMenu(null);
    },
    [chainModeEnabled, current],
  );

  const handleGridGenerate = useCallback(
    (items: MissionItem[], mode: "after_selected" | "replace_all") => {
      const m = mission.mission;
      if (mode === "replace_all") {
        m.replaceAll(items);
        toast.success("Grid generated", { description: `${items.length} waypoints (replaced)` });
      } else {
        const insertAfter = m.selectedIndex ?? m.displayTotal - 1;
        m.insertGeneratedAfter(insertAfter, items);
        toast.success("Grid generated", { description: `${items.length} waypoints inserted` });
      }
      setAutoGridOpen(false);
      setIsDrawingPolygon(false);
      setPolygonVertices([]);
    },
    [mission.mission],
  );

  return (
    <div data-mission-workspace className="flex h-full flex-col gap-2">
      <MissionWorkspaceHeader
        mission={mission}
        connected={vehicle.connected}
        onAutoGrid={handleAutoGridOpen}
        chainModeActive={current.tab === "mission" && chainModeActive}
        chainModeSuppressed={current.tab === "mission" && chainModeActive && isDrawingPolygon}
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
                onSelectIndex={handleMapSelect}
                onMoveWaypoint={current.moveWaypointOnMap}
                onBlankMapClick={handleBlankMapClick}
                onContextMenu={handleContextMenu}
                readOnly={current.readOnly}
                deviceLocation={deviceLocation.location}
                vehiclePosition={vehicle.vehiclePosition}
                currentMissionSeq={current.tab === "mission" ? mission.vehicle.missionState?.current_index ?? null : null}
                flyToSelectedKey={flyToKey}
                polygonVertices={autoGridOpen ? polygonVertices : undefined}
                isDrawingPolygon={isDrawingPolygon}
                onPolygonClick={handlePolygonClick}
                onPolygonComplete={handlePolygonComplete}
                onPolygonVertexMove={handlePolygonVertexMove}
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
                  onAddFenceRegion={mission.selectedTab === "fence" ? handleAddFenceRegion : undefined}
                  onSetFenceReturnPoint={mission.selectedTab === "fence" ? handleSetFenceReturnPoint : undefined}
                  onClose={closeContextMenu}
                />
              )}
              {autoGridOpen && (
                <MissionAutoGridDialog
                  polygon={polygonVertices}
                  isDrawing={isDrawingPolygon}
                  onStartDraw={handleStartDraw}
                  onStopDraw={handleStopDraw}
                  onClearPolygon={handleClearPolygon}
                  onGenerate={handleGridGenerate}
                  onClose={handleAutoGridClose}
                  selectedSeq={current.selectedIndex}
                  homePosition={current.homePosition}
                  anchorX={12}
                  anchorY={48}
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

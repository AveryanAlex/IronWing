import { useState, useCallback, useEffect } from "react";
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
import { MissionAutoGridDialog } from "./MissionAutoGridDialog";
import { cn } from "../../lib/utils";
import type { useSession } from "../../hooks/use-session";
import type { useMission } from "../../hooks/use-mission";
import type { useDeviceLocation } from "../../hooks/use-device-location";
import type { MissionItem } from "../../lib/mavkit-types";
import type { TypedDraftItem } from "../../lib/mission-draft-typed";
import type { PolygonVertex } from "../../lib/mission-grid";
import { toast } from "sonner";
import { findNearestWaypoint } from "./mission-helpers";

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

export function MissionMobileDrawer({ vehicle, mission, deviceLocation }: MissionMobileDrawerProps) {
  const current = mission.current;
  const showBulkEditor = current.selectedCount > 1;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [flyToKey, setFlyToKey] = useState(0);
  const [autoGridOpen, setAutoGridOpen] = useState(false);
  const [chainModeActive, setChainModeActive] = useState(false);
  const [isDrawingPolygon, setIsDrawingPolygon] = useState(false);
  const [polygonVertices, setPolygonVertices] = useState<PolygonVertex[]>([]);
  const chainModeEnabled = current.tab === "mission" && chainModeActive && !isDrawingPolygon;

  useEffect(() => {
    if (current.tab !== "mission") {
      setChainModeActive(false);
    }
  }, [current.tab]);

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
    setDrawerOpen(false);
  }, []);

  const handleToggleChainMode = useCallback(() => {
    setChainModeActive((active) => !active);
    setContextMenu(null);
  }, []);

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

  const handleBlankMapClick = useCallback((lat: number, lng: number) => {
    if (!chainModeEnabled) {
      return;
    }
    current.addWaypointAt(lat, lng);
    setContextMenu(null);
  }, [chainModeEnabled, current]);

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

      <div
        data-mission-map-region
        className="relative flex-1 overflow-hidden rounded-lg border border-border"
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
            anchorY={12}
          />
        )}

        <button
          data-mission-mobile-panel-toggle
          onClick={() => setDrawerOpen(true)}
          className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-border bg-bg-secondary/90 px-3 py-1.5 text-xs font-medium text-text-secondary shadow-lg backdrop-blur-sm transition-colors hover:bg-bg-tertiary hover:text-text-primary"
        >
          <ChevronUp className="h-3.5 w-3.5" />
          {current.displayTotal} item{current.displayTotal !== 1 ? "s" : ""}
        </button>
      </div>

      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/50 transition-opacity duration-200",
          drawerOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={() => setDrawerOpen(false)}
      />

      <aside
        data-mission-mobile-drawer
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
              {current.tab === "mission" ? "Waypoints" : current.tab === "fence" ? "Fence" : "Rally"}
            </span>
            <span className="text-xs tabular-nums text-text-muted">
              ({current.displayTotal})
            </span>
          </div>
          <button
            onClick={() => setDrawerOpen(false)}
            className="rounded p-1 text-text-muted hover:text-text-primary"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mx-auto -mt-1 mb-2 h-1 w-10 rounded-full bg-border" />

        <div className="flex-1 overflow-y-auto px-4 pb-2">
          <div className="mb-3">
            <MissionPlannerSummary mission={mission} connected={vehicle.connected} />
          </div>

          <MissionItemList
            mission={mission}
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

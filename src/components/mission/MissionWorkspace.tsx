import { Group, Panel, Separator } from "react-resizable-panels";
import { MissionMap } from "../MissionMap";
import { MapContextMenu } from "../MapContextMenu";
import { MissionWorkspaceHeader } from "./MissionWorkspaceHeader";
import { MissionDesktopShell } from "./MissionDesktopShell";
import { MissionAutoGridDialog } from "./MissionAutoGridDialog";
import type { useVehicle } from "../../hooks/use-vehicle";
import type { useMission } from "../../hooks/use-mission";
import type { useDeviceLocation } from "../../hooks/use-device-location";
import type { MissionItem } from "../../mission";
import type { PolygonVertex } from "../../lib/mission-grid";
import { useState, useCallback } from "react";
import { toast } from "sonner";

type MissionWorkspaceProps = {
  vehicle: ReturnType<typeof useVehicle>;
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

function findNearestWaypoint(items: MissionItem[], lat: number, lng: number): number | null {
  let nearest: number | null = null;
  let minDist = Infinity;
  for (const item of items) {
    const d = Math.hypot(item.x / 1e7 - lat, item.y / 1e7 - lng);
    if (d < minDist && d < 0.001) {
      minDist = d;
      nearest = item.seq;
    }
  }
  return nearest;
}

export function MissionWorkspace({ vehicle, mission, deviceLocation }: MissionWorkspaceProps) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [flyToKey, setFlyToKey] = useState(0);
  const [autoGridOpen, setAutoGridOpen] = useState(false);
  const [isDrawingPolygon, setIsDrawingPolygon] = useState(false);
  const [polygonVertices, setPolygonVertices] = useState<PolygonVertex[]>([]);

  const handleMapSelect = useCallback(
    (seq: number | null) => {
      if (isDrawingPolygon) return;
      mission.setSelectedSeq(seq);
      if (seq !== null) {
        requestAnimationFrame(() => {
          const el = document.querySelector(`[data-mission-waypoint-card][data-seq="${seq}"]`);
          el?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
      }
    },
    [mission, isDrawingPolygon],
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
      const nearestSeq = findNearestWaypoint(mission.items, lat, lng);
      setContextMenu({ x, y, lat, lng, nearestSeq });
    },
    [mission.items, isDrawingPolygon]
  );

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const handleAutoGridOpen = useCallback(() => {
    setAutoGridOpen(true);
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

  const handleGridGenerate = useCallback(
    (items: MissionItem[], mode: "after_selected" | "replace_all") => {
      if (mode === "replace_all") {
        mission.bulkReplace(items);
        toast.success("Grid generated", { description: `${items.length} waypoints (replaced)` });
      } else {
        const insertAfter = mission.selectedSeq ?? mission.items.length - 1;
        mission.bulkInsertAfter(insertAfter, items);
        toast.success("Grid generated", { description: `${items.length} waypoints inserted` });
      }
      setAutoGridOpen(false);
      setIsDrawingPolygon(false);
      setPolygonVertices([]);
    },
    [mission],
  );

  return (
    <div data-mission-workspace className="flex h-full flex-col gap-2">
      <MissionWorkspaceHeader mission={mission} connected={vehicle.connected} onAutoGrid={handleAutoGridOpen} />

      <Group orientation="horizontal" className="flex-1 overflow-hidden">
        <Panel defaultSize="65" minSize="40">
          <div
            data-mission-map-region
            className="relative h-full overflow-hidden rounded-lg border border-border"
          >
            <MissionMap
              missionItems={mission.items}
              homePosition={mission.missionType === "mission" ? mission.homePosition : null}
              selectedSeq={mission.selectedSeq}
              onSelectSeq={handleMapSelect}
              onMoveWaypoint={mission.moveWaypointOnMap}
              onContextMenu={handleContextMenu}
              deviceLocation={deviceLocation.location}
              vehiclePosition={vehicle.vehiclePosition}
              currentMissionSeq={mission.missionState?.current_seq ?? null}
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
                missionType={mission.missionType}
                onAddWaypoint={(lat, lng) => { mission.addWaypointAt(lat, lng); closeContextMenu(); }}
                onSetHome={(lat, lng) => { mission.setHomeFromMap(lat, lng); closeContextMenu(); }}
                onDeleteWaypoint={(seq) => { mission.deleteAt(seq); closeContextMenu(); }}
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
                selectedSeq={mission.selectedSeq}
                homePosition={mission.homePosition}
                anchorX={12}
                anchorY={48}
              />
            )}
          </div>
        </Panel>

        <Separator className="mx-1 flex w-1.5 items-center justify-center rounded-full transition-colors hover:bg-border-light data-[separator-active]:bg-accent/40">
          <div className="h-8 w-0.5 rounded-full bg-border" />
        </Separator>

        <Panel defaultSize="35" minSize="25" maxSize="50">
          <MissionDesktopShell mission={mission} connected={vehicle.connected} onCardSelect={handleCardSelect} />
        </Panel>
      </Group>
      {mission.issues.length > 0 && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
          <h4 className="mb-1 font-semibold text-warning">
            Validation Issues ({mission.issues.length})
          </h4>
          <ul className="list-inside list-disc space-y-0.5 text-xs text-text-secondary">
            {mission.issues.map((issue, i) => (
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
    </div>
  );
}

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MapPin, Home, Trash2, Navigation } from "lucide-react";
import type { MissionType } from "../mission";

type MapContextMenuProps = {
  x: number;
  y: number;
  lat: number;
  lng: number;
  nearestSeq: number | null;
  mode: "flight" | "planner";
  missionType: MissionType;
  onAddWaypoint?: (lat: number, lng: number) => void;
  onSetHome?: (lat: number, lng: number) => void;
  onDeleteWaypoint?: (seq: number) => void;
  onFlyTo?: (lat: number, lng: number) => void;
  onClose: () => void;
};

export function MapContextMenu({
  x, y, lat, lng, nearestSeq, mode, missionType,
  onAddWaypoint, onSetHome, onDeleteWaypoint, onFlyTo, onClose,
}: MapContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  // Measure after render and clamp to parent bounds (runs before paint)
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const parent = el.offsetParent as HTMLElement | null;
    if (!parent) { setPos({ left: x, top: y }); return; }
    const pw = parent.clientWidth;
    const ph = parent.clientHeight;
    const ew = el.offsetWidth;
    const eh = el.offsetHeight;
    setPos({
      left: Math.max(0, Math.min(x, pw - ew)),
      top: Math.max(0, Math.min(y, ph - eh)),
    });
  }, [x, y]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute z-50 min-w-[180px] overflow-hidden rounded-lg border border-border-light bg-bg-secondary p-1 shadow-lg shadow-black/30"
      style={{ left: pos.left, top: pos.top }}
    >
      {mode === "planner" ? (
        <>
          <MenuItem icon={<MapPin className="h-3.5 w-3.5" />} label="Add Waypoint Here"
            onClick={() => onAddWaypoint?.(lat, lng)} />
          {missionType === "mission" && (
            <MenuItem icon={<Home className="h-3.5 w-3.5" />} label="Set Home Here"
              onClick={() => onSetHome?.(lat, lng)} />
          )}
          {nearestSeq !== null && (
            <>
              <div className="-mx-1 my-1 h-px bg-border" />
              <MenuItem icon={<Trash2 className="h-3.5 w-3.5" />} label={`Delete Waypoint #${nearestSeq + 1}`}
                onClick={() => onDeleteWaypoint?.(nearestSeq)} destructive />
            </>
          )}
        </>
      ) : (
        <>
          <MenuItem icon={<Navigation className="h-3.5 w-3.5" />} label="Fly To Here"
            onClick={() => onFlyTo?.(lat, lng)} />
          {missionType === "mission" && (
            <MenuItem icon={<Home className="h-3.5 w-3.5" />} label="Set Home Here"
              onClick={() => onSetHome?.(lat, lng)} />
          )}
        </>
      )}

      <div className="mt-1 border-t border-border px-2.5 py-1 text-[10px] text-text-muted">
        {lat.toFixed(6)}, {lng.toFixed(6)}
      </div>
    </div>
  );
}

function MenuItem({ icon, label, onClick, destructive }: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors ${
        destructive
          ? "text-danger hover:bg-danger/10"
          : "text-text-primary hover:bg-bg-tertiary"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

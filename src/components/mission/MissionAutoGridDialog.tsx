import { useState, useCallback, useEffect, useRef, useLayoutEffect, useMemo } from "react";
import { X, Pencil, Trash2, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "../ui/button";
import { toast } from "sonner";
import {
  generateGrid,
  validateGridParams,
  resolveStartCorner,
  estimateGridWaypointCount,
  type PolygonVertex,
  type StartCorner,
  type TurnDirection,
  type GridParams,
} from "../../lib/mission-grid";
import type { MissionItem, HomePosition } from "../../mission";

type InsertMode = "after_selected" | "replace_all";

type MissionAutoGridDialogProps = {
  polygon: PolygonVertex[];
  isDrawing: boolean;
  onStartDraw: () => void;
  onStopDraw: () => void;
  onClearPolygon: () => void;
  onGenerate: (items: MissionItem[], mode: InsertMode) => void;
  onClose: () => void;
  selectedSeq: number | null;
  homePosition: HomePosition | null;
  anchorX: number;
  anchorY: number;
};

const CORNER_LABELS: Record<StartCorner, string> = {
  top_left: "Top Left",
  top_right: "Top Right",
  bottom_left: "Bottom Left",
  bottom_right: "Bottom Right",
};

const TURN_LABELS: Record<TurnDirection, string> = {
  clockwise: "Clockwise",
  counterclockwise: "Counter-CW",
};

export function MissionAutoGridDialog({
  polygon,
  isDrawing,
  onStartDraw,
  onStopDraw,
  onClearPolygon,
  onGenerate,
  onClose,
  selectedSeq,
  homePosition,
  anchorX,
  anchorY,
}: MissionAutoGridDialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: anchorX, top: anchorY });

  const [altitude, setAltitude] = useState("50");
  const [spacing, setSpacing] = useState("20");
  const [angle, setAngle] = useState("0");
  const [startCorner, setStartCorner] = useState<StartCorner>("bottom_left");
  const [turnDirection, setTurnDirection] = useState<TurnDirection>("clockwise");
  const [insertMode, setInsertMode] = useState<InsertMode>("after_selected");
  const [autoCorner, setAutoCorner] = useState(true);
  const [paramsVisible, setParamsVisible] = useState(true);

  const hasValidPolygon = polygon.length >= 3;
  const validationErrors = hasValidPolygon
    ? validateGridParams({
        polygon,
        altitude_m: Number(altitude),
        lane_spacing_m: Number(spacing),
        track_angle_deg: Number(angle),
        start_corner: startCorner,
        turn_direction: turnDirection,
      })
    : [];

  const canGenerate =
    hasValidPolygon &&
    validationErrors.length === 0 &&
    Number.isFinite(Number(altitude)) &&
    Number.isFinite(Number(spacing)) &&
    Number(spacing) > 0 &&
    !isDrawing;

  const estimatedCount = useMemo(() => {
    if (!canGenerate) return null;
    return estimateGridWaypointCount({
      polygon,
      altitude_m: Number(altitude),
      lane_spacing_m: Number(spacing),
      track_angle_deg: Number(angle),
      start_corner: startCorner,
      turn_direction: turnDirection,
    });
  }, [canGenerate, polygon, altitude, spacing, angle, startCorner, turnDirection]);

  useEffect(() => {
    if (isDrawing) setParamsVisible(false);
    else if (hasValidPolygon) setParamsVisible(true);
  }, [isDrawing, hasValidPolygon]);

  useEffect(() => {
    if (!autoCorner || !hasValidPolygon || !homePosition) return;
    const resolved = resolveStartCorner(polygon, {
      latitude_deg: homePosition.latitude_deg,
      longitude_deg: homePosition.longitude_deg,
    }, Number(angle) || 0);
    setStartCorner(resolved);
  }, [polygon, homePosition, angle, autoCorner, hasValidPolygon]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const parent = el.offsetParent as HTMLElement | null;
    if (!parent) { setPos({ left: anchorX, top: anchorY }); return; }
    const pw = parent.clientWidth;
    const ph = parent.clientHeight;
    const ew = el.offsetWidth;
    const eh = el.offsetHeight;
    setPos({
      left: Math.max(0, Math.min(anchorX, pw - ew)),
      top: Math.max(0, Math.min(anchorY, ph - eh)),
    });
  }, [anchorX, anchorY]);

  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (isDrawing) onStopDraw();
        else onClose();
      }
    }
    function handleClickOutside(e: MouseEvent | TouchEvent) {
      if (isDrawing) return;
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("keydown", handleEscape);
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [isDrawing, onStopDraw, onClose]);

  const handleGenerate = useCallback(() => {
    const params: GridParams = {
      polygon,
      altitude_m: Number(altitude),
      lane_spacing_m: Number(spacing),
      track_angle_deg: Number(angle),
      start_corner: startCorner,
      turn_direction: turnDirection,
    };
    const result = generateGrid(params);
    if (!result.ok) {
      toast.error("Grid generation failed", {
        description: result.errors.map((e) => e.message).join("; "),
      });
      return;
    }
    onGenerate(result.items, insertMode);
  }, [polygon, altitude, spacing, angle, startCorner, turnDirection, insertMode, onGenerate]);

  return (
    <div
      ref={ref}
      data-mission-auto-grid-dialog
      className="absolute z-50 w-64 overflow-hidden rounded-lg border border-border-light bg-bg-secondary shadow-lg shadow-black/30"
      style={{ left: pos.left, top: pos.top }}
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          Auto Grid
        </span>
        <button
          onClick={onClose}
          className="rounded p-0.5 text-text-muted hover:text-text-primary"
        >
          <X size={14} />
        </button>
      </div>

      <div className="space-y-3 p-3">
        {/* Draw controls */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Button
              data-mission-grid-draw-toggle
              size="sm"
              variant={isDrawing ? "destructive" : "default"}
              onClick={isDrawing ? onStopDraw : onStartDraw}
              className="flex-1"
            >
              <Pencil className="h-3.5 w-3.5" />
              {isDrawing ? "Stop Drawing" : "Draw Area"}
            </Button>
            {polygon.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={onClearPolygon}
                disabled={isDrawing}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <div className="text-[10px] text-text-muted">
            {isDrawing
              ? polygon.length >= 3
                ? `${polygon.length} vertices — click first vertex to close`
                : "Click map to place vertices"
              : polygon.length === 0
                ? "Draw a polygon on the map first"
                : polygon.length < 3
                  ? `${polygon.length} ${polygon.length === 1 ? "vertex" : "vertices"} — need at least 3`
                  : `${polygon.length} vertices`}
          </div>
        </div>

        {paramsVisible ? (
          <>
            <fieldset disabled={!hasValidPolygon || isDrawing} className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-0.5">
                  <span className="text-[10px] font-medium text-text-muted">Altitude (m)</span>
                  <input
                    type="number"
                    value={altitude}
                    onChange={(e) => setAltitude(e.target.value)}
                    min={1}
                    step={5}
                    className="w-full rounded-md border border-border bg-bg-input px-2 py-1 text-sm tabular-nums text-text-primary disabled:opacity-40"
                  />
                </label>
                <label className="space-y-0.5">
                  <span className="text-[10px] font-medium text-text-muted">Spacing (m)</span>
                  <input
                    type="number"
                    value={spacing}
                    onChange={(e) => setSpacing(e.target.value)}
                    min={1}
                    step={1}
                    className="w-full rounded-md border border-border bg-bg-input px-2 py-1 text-sm tabular-nums text-text-primary disabled:opacity-40"
                  />
                </label>
              </div>

              <label className="block space-y-0.5">
                <span className="text-[10px] font-medium text-text-muted">Track Angle (°)</span>
                <input
                  type="number"
                  value={angle}
                  onChange={(e) => setAngle(e.target.value)}
                  min={0}
                  max={359}
                  step={5}
                  className="w-full rounded-md border border-border bg-bg-input px-2 py-1 text-sm tabular-nums text-text-primary disabled:opacity-40"
                />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-0.5">
                  <span className="text-[10px] font-medium text-text-muted">Start Corner</span>
                  <select
                    value={startCorner}
                    onChange={(e) => {
                      setStartCorner(e.target.value as StartCorner);
                      setAutoCorner(false);
                    }}
                    className="w-full rounded-md border border-border bg-bg-input px-2 py-1 text-sm text-text-primary disabled:opacity-40"
                  >
                    {(Object.keys(CORNER_LABELS) as StartCorner[]).map((c) => (
                      <option key={c} value={c}>{CORNER_LABELS[c]}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-0.5">
                  <span className="text-[10px] font-medium text-text-muted">Turn</span>
                  <select
                    value={turnDirection}
                    onChange={(e) => setTurnDirection(e.target.value as TurnDirection)}
                    className="w-full rounded-md border border-border bg-bg-input px-2 py-1 text-sm text-text-primary disabled:opacity-40"
                  >
                    {(Object.keys(TURN_LABELS) as TurnDirection[]).map((t) => (
                      <option key={t} value={t}>{TURN_LABELS[t]}</option>
                    ))}
                  </select>
                </label>
              </div>

              {autoCorner && homePosition && hasValidPolygon && (
                <div className="flex items-center gap-1 text-[10px] text-text-muted">
                  <RotateCcw className="h-2.5 w-2.5" />
                  Auto: closest to home
                </div>
              )}
            </fieldset>

            <div className="space-y-1">
              <span className="text-[10px] font-medium text-text-muted">Insert Mode</span>
              <div className="flex gap-1">
                <button
                  onClick={() => setInsertMode("after_selected")}
                  className={`flex-1 rounded-md border px-2 py-1 text-[11px] transition-colors ${
                    insertMode === "after_selected"
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border text-text-muted hover:text-text-primary"
                  }`}
                >
                  After #{selectedSeq !== null ? selectedSeq + 1 : "—"}
                </button>
                <button
                  onClick={() => setInsertMode("replace_all")}
                  className={`flex-1 rounded-md border px-2 py-1 text-[11px] transition-colors ${
                    insertMode === "replace_all"
                      ? "border-danger bg-danger/10 text-danger"
                      : "border-border text-text-muted hover:text-text-primary"
                  }`}
                >
                  Replace All
                </button>
              </div>
            </div>

            <button
              onClick={() => setParamsVisible(false)}
              className="flex w-full items-center justify-center gap-1 text-[10px] text-text-muted hover:text-text-secondary"
            >
              <ChevronUp className="h-3 w-3" />
              Hide Parameters
            </button>
          </>
        ) : (
          <button
            onClick={() => setParamsVisible(true)}
            className="flex w-full items-center justify-center gap-1 rounded-md border border-border py-1 text-[10px] text-text-muted hover:text-text-secondary"
          >
            <ChevronDown className="h-3 w-3" />
            Parameters
          </button>
        )}

        {validationErrors.length > 0 && hasValidPolygon && paramsVisible && (
          <div className="rounded-md border border-warning/30 bg-warning/5 px-2 py-1.5 text-[10px] text-warning">
            {validationErrors.map((e, i) => (
              <div key={i}>{e.message}</div>
            ))}
          </div>
        )}

        <Button
          data-mission-grid-generate
          size="sm"
          onClick={handleGenerate}
          disabled={!canGenerate}
          className="w-full"
        >
          {estimatedCount != null
            ? `Add ${estimatedCount.toLocaleString()} Waypoints`
            : "Generate Grid"}
        </Button>
      </div>
    </div>
  );
}

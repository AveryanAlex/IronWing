import { useState, useEffect, useRef, useCallback } from "react";
import { Shield, Plus, Trash2 } from "lucide-react";
import type { FenceRegion, GeoPoint2d } from "../../lib/mavkit-types";
import type { TypedDraftItem } from "../../lib/mission-draft-typed";
import { formatDeg, parseLatitude, parseLongitude } from "../../lib/mission-coordinates";
import { cn } from "../../lib/utils";

type FenceInspectorProps = {
  draftItem: TypedDraftItem;
  index: number;
  readOnly?: boolean;
  onUpdateRegion: (index: number, region: FenceRegion) => void;
};

// ---------------------------------------------------------------------------
// Region type helpers
// ---------------------------------------------------------------------------

type RegionKind = "inclusion_polygon" | "exclusion_polygon" | "inclusion_circle" | "exclusion_circle";

function regionKind(region: FenceRegion): RegionKind {
  if ("inclusion_polygon" in region) return "inclusion_polygon";
  if ("exclusion_polygon" in region) return "exclusion_polygon";
  if ("inclusion_circle" in region) return "inclusion_circle";
  return "exclusion_circle";
}

function isInclusion(kind: RegionKind): boolean {
  return kind === "inclusion_polygon" || kind === "inclusion_circle";
}

function isPolygon(kind: RegionKind): boolean {
  return kind === "inclusion_polygon" || kind === "exclusion_polygon";
}

function regionLabel(kind: RegionKind): string {
  if (kind === "inclusion_polygon") return "Inclusion Polygon";
  if (kind === "exclusion_polygon") return "Exclusion Polygon";
  if (kind === "inclusion_circle") return "Inclusion Circle";
  return "Exclusion Circle";
}

function regionBadgeLabel(kind: RegionKind): string {
  return isInclusion(kind) ? "INCL" : "EXCL";
}

function polygonVertices(region: FenceRegion): GeoPoint2d[] {
  if ("inclusion_polygon" in region) return region.inclusion_polygon.vertices;
  if ("exclusion_polygon" in region) return region.exclusion_polygon.vertices;
  return [];
}

function circleCenter(region: FenceRegion): GeoPoint2d | null {
  if ("inclusion_circle" in region) return region.inclusion_circle.center;
  if ("exclusion_circle" in region) return region.exclusion_circle.center;
  return null;
}

function circleRadius(region: FenceRegion): number | null {
  if ("inclusion_circle" in region) return region.inclusion_circle.radius_m;
  if ("exclusion_circle" in region) return region.exclusion_circle.radius_m;
  return null;
}

function inclusionGroup(region: FenceRegion): number | null {
  if ("inclusion_polygon" in region) return region.inclusion_polygon.inclusion_group;
  if ("inclusion_circle" in region) return region.inclusion_circle.inclusion_group;
  return null;
}

// ---------------------------------------------------------------------------
// Rebuild helpers — construct a new FenceRegion from edited parts
// ---------------------------------------------------------------------------

function withPolygonVertices(region: FenceRegion, vertices: GeoPoint2d[]): FenceRegion {
  if ("inclusion_polygon" in region) {
    return { inclusion_polygon: { ...region.inclusion_polygon, vertices } };
  }
  if ("exclusion_polygon" in region) {
    return { exclusion_polygon: { ...region.exclusion_polygon, vertices } };
  }
  return region;
}

function withCircleCenter(region: FenceRegion, center: GeoPoint2d): FenceRegion {
  if ("inclusion_circle" in region) {
    return { inclusion_circle: { ...region.inclusion_circle, center } };
  }
  if ("exclusion_circle" in region) {
    return { exclusion_circle: { ...region.exclusion_circle, center } };
  }
  return region;
}

function withCircleRadius(region: FenceRegion, radius_m: number): FenceRegion {
  if ("inclusion_circle" in region) {
    return { inclusion_circle: { ...region.inclusion_circle, radius_m } };
  }
  if ("exclusion_circle" in region) {
    return { exclusion_circle: { ...region.exclusion_circle, radius_m } };
  }
  return region;
}

function withInclusionGroup(region: FenceRegion, group: number): FenceRegion {
  if ("inclusion_polygon" in region) {
    return { inclusion_polygon: { ...region.inclusion_polygon, inclusion_group: group } };
  }
  if ("inclusion_circle" in region) {
    return { inclusion_circle: { ...region.inclusion_circle, inclusion_group: group } };
  }
  return region;
}

// ---------------------------------------------------------------------------
// Editable coordinate input (local state + commit on blur)
// ---------------------------------------------------------------------------

function CoordInput({
  value,
  onCommit,
  disabled,
  label,
}: {
  value: number;
  onCommit: (v: number) => void;
  disabled: boolean;
  label: "latitude" | "longitude";
}) {
  const [local, setLocal] = useState(formatDeg(value));
  const prevRef = useRef(value);

  useEffect(() => {
    if (prevRef.current !== value) {
      setLocal(formatDeg(value));
      prevRef.current = value;
    }
  }, [value]);

  const commit = () => {
    const result = label === "latitude" ? parseLatitude(local) : parseLongitude(local);
    if (result.ok) {
      onCommit(result.value);
    } else {
      setLocal(formatDeg(value));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      className="w-full rounded border border-border bg-bg-input px-1.5 py-1 text-xs tabular-nums text-text-primary"
    />
  );
}

// ---------------------------------------------------------------------------
// Numeric input (radius, inclusion group)
// ---------------------------------------------------------------------------

function NumericInput({
  value,
  onCommit,
  disabled,
  min,
  step,
}: {
  value: number;
  onCommit: (v: number) => void;
  disabled: boolean;
  min?: number;
  step?: string;
}) {
  const [local, setLocal] = useState(String(value));
  const prevRef = useRef(value);

  useEffect(() => {
    if (prevRef.current !== value) {
      setLocal(String(value));
      prevRef.current = value;
    }
  }, [value]);

  const commit = () => {
    const n = Number(local);
    if (Number.isFinite(n) && (min === undefined || n >= min)) {
      onCommit(n);
    } else {
      setLocal(String(value));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
  };

  return (
    <input
      type="number"
      step={step ?? "any"}
      min={min}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      className="w-full rounded border border-border bg-bg-input px-1.5 py-1 text-xs tabular-nums text-text-primary"
    />
  );
}

// ---------------------------------------------------------------------------
// Polygon vertex editor
// ---------------------------------------------------------------------------

function VertexRow({
  vertexIndex,
  vertex,
  disabled,
  canRemove,
  onUpdateVertex,
  onRemoveVertex,
}: {
  vertexIndex: number;
  vertex: GeoPoint2d;
  disabled: boolean;
  canRemove: boolean;
  onUpdateVertex: (vi: number, v: GeoPoint2d) => void;
  onRemoveVertex: (vi: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="w-4 shrink-0 text-[10px] tabular-nums text-text-muted">
        {vertexIndex}
      </span>
      <div className="min-w-0 flex-1">
        <CoordInput
          value={vertex.latitude_deg}
          label="latitude"
          disabled={disabled}
          onCommit={(lat) =>
            onUpdateVertex(vertexIndex, { ...vertex, latitude_deg: lat })
          }
        />
      </div>
      <div className="min-w-0 flex-1">
        <CoordInput
          value={vertex.longitude_deg}
          label="longitude"
          disabled={disabled}
          onCommit={(lon) =>
            onUpdateVertex(vertexIndex, { ...vertex, longitude_deg: lon })
          }
        />
      </div>
      <button
        type="button"
        disabled={disabled || !canRemove}
        onClick={() => onRemoveVertex(vertexIndex)}
        className="shrink-0 rounded p-0.5 text-text-muted hover:text-danger disabled:opacity-30"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function FenceInspector({
  draftItem,
  index,
  readOnly = false,
  onUpdateRegion,
}: FenceInspectorProps) {
  const region = draftItem.document as FenceRegion;
  const kind = regionKind(region);
  const incl = isInclusion(kind);
  const poly = isPolygon(kind);
  const disabled = readOnly || draftItem.readOnly;

  const commit = useCallback(
    (next: FenceRegion) => onUpdateRegion(index, next),
    [index, onUpdateRegion],
  );

  // --- Polygon handlers ---

  const handleUpdateVertex = useCallback(
    (vi: number, v: GeoPoint2d) => {
      const verts = [...polygonVertices(region)];
      verts[vi] = v;
      commit(withPolygonVertices(region, verts));
    },
    [commit, region],
  );

  const handleRemoveVertex = useCallback(
    (vi: number) => {
      const verts = polygonVertices(region).filter((_, i) => i !== vi);
      commit(withPolygonVertices(region, verts));
    },
    [commit, region],
  );

  const handleAddVertex = useCallback(() => {
    const verts = polygonVertices(region);
    const last = verts[verts.length - 1];
    if (!last) return;
    const newVertex: GeoPoint2d = {
      latitude_deg: last.latitude_deg + 0.0002,
      longitude_deg: last.longitude_deg + 0.0002,
    };
    commit(withPolygonVertices(region, [...verts, newVertex]));
  }, [commit, region]);

  // --- Circle handlers ---

  const handleUpdateCenter = useCallback(
    (field: "latitude_deg" | "longitude_deg", value: number) => {
      const center = circleCenter(region);
      if (!center) return;
      commit(withCircleCenter(region, { ...center, [field]: value }));
    },
    [commit, region],
  );

  const handleUpdateRadius = useCallback(
    (radius: number) => commit(withCircleRadius(region, radius)),
    [commit, region],
  );

  // --- Inclusion group handler ---

  const handleUpdateInclusionGroup = useCallback(
    (group: number) => commit(withInclusionGroup(region, Math.round(group))),
    [commit, region],
  );

  const vertices = poly ? polygonVertices(region) : [];
  const center = !poly ? circleCenter(region) : null;
  const radius = !poly ? circleRadius(region) : null;
  const group = inclusionGroup(region);

  return (
    <div
      data-fence-inspector
      className="space-y-2.5 rounded-lg border border-border bg-bg-secondary p-3"
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <Shield className="h-3.5 w-3.5 text-accent" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          Fence Inspector
        </span>
        <span className="ml-auto text-[10px] tabular-nums text-text-muted">
          #{index + 1}
        </span>
      </div>

      {/* Region type + badge */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-text-muted">{regionLabel(kind)}</span>
        <span
          className={cn(
            "ml-auto rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase",
            incl ? "bg-accent/15 text-accent" : "bg-danger/15 text-danger",
          )}
        >
          {regionBadgeLabel(kind)}
        </span>
      </div>

      {/* Polygon vertex list */}
      {poly && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-medium text-text-muted">Vertices</span>
            <span className="ml-auto text-[10px] tabular-nums text-text-muted">
              {vertices.length} vertices
            </span>
          </div>

          {/* Column headers */}
          <div className="flex items-center gap-1 text-[9px] text-text-muted/60">
            <span className="w-4 shrink-0">#</span>
            <span className="min-w-0 flex-1">Lat (deg)</span>
            <span className="min-w-0 flex-1">Lon (deg)</span>
            <span className="w-5 shrink-0" />
          </div>

          {vertices.map((v, vi) => (
            <VertexRow
              key={vi}
              vertexIndex={vi}
              vertex={v}
              disabled={disabled}
              canRemove={vertices.length > 3}
              onUpdateVertex={handleUpdateVertex}
              onRemoveVertex={handleRemoveVertex}
            />
          ))}

          <button
            type="button"
            disabled={disabled}
            onClick={handleAddVertex}
            className="flex w-full items-center justify-center gap-1 rounded border border-dashed border-border py-1 text-[10px] text-text-muted hover:border-accent hover:text-accent disabled:opacity-40"
          >
            <Plus className="h-3 w-3" />
            Add Vertex
          </button>
        </div>
      )}

      {/* Circle center + radius */}
      {!poly && center !== null && radius !== null && (
        <div className="space-y-2">
          <span className="text-[10px] font-medium text-text-muted">Center</span>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-0.5">
              <label className="text-[10px] text-text-muted">
                Latitude <span className="text-text-muted/50">(deg)</span>
              </label>
              <CoordInput
                value={center.latitude_deg}
                label="latitude"
                disabled={disabled}
                onCommit={(lat) => handleUpdateCenter("latitude_deg", lat)}
              />
            </div>
            <div className="space-y-0.5">
              <label className="text-[10px] text-text-muted">
                Longitude <span className="text-text-muted/50">(deg)</span>
              </label>
              <CoordInput
                value={center.longitude_deg}
                label="longitude"
                disabled={disabled}
                onCommit={(lon) => handleUpdateCenter("longitude_deg", lon)}
              />
            </div>
          </div>

          <div className="space-y-0.5">
            <label className="flex items-center gap-1 text-[10px] text-text-muted">
              Radius
              <span className="text-text-muted/50">(m)</span>
            </label>
            <NumericInput
              value={radius}
              min={0}
              step="1"
              disabled={disabled}
              onCommit={handleUpdateRadius}
            />
          </div>
        </div>
      )}

      {/* Inclusion group (only for inclusion regions) */}
      {group !== null && (
        <div className="space-y-0.5">
          <label className="text-[10px] text-text-muted">Inclusion Group</label>
          <NumericInput
            value={group}
            min={0}
            step="1"
            disabled={disabled}
            onCommit={handleUpdateInclusionGroup}
          />
        </div>
      )}
    </div>
  );
}

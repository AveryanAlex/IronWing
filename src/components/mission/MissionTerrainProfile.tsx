import { useMemo } from "react";
import type uPlot from "uplot";
import { Mountain, TriangleAlert } from "lucide-react";
import { UPlotChart } from "../charts/UPlotChart";
import { cn } from "../../lib/utils";
import type { MissionTerrainStatus } from "../../hooks/use-mission-terrain";
import type { ProfilePoint, ProfileResult, TerrainWarning } from "../../lib/mission-terrain-profile";

type MissionTerrainProfileProps = {
  profile: ProfileResult | null;
  status: MissionTerrainStatus;
  selectedIndex: number | null;
  onSelectIndex?: (index: number | null) => void;
  height?: number;
  safetyMarginM?: number;
  onSafetyMarginChange?: (value: number) => void;
  onRetry?: () => void;
};

type MarkerDescriptor = {
  key: string;
  index: number | null;
  distance_m: number;
  flightMsl: number | null;
  warning: TerrainWarning;
  isHome: boolean;
};

const CHART_PADDING = [10, 10, 18, 42] as const;
const TERRAIN_STROKE = "#947455";
const TERRAIN_FILL = "rgba(148, 116, 85, 0.24)";
const FLIGHT_STROKE = "#7bd5fb";
const FLIGHT_STRAIGHT_STROKE = "rgba(123, 213, 251, 0.35)";
const GRID_COLOR = "rgba(226, 232, 240, 0.08)";
const AXIS_COLOR = "rgba(148, 163, 184, 0.55)";

export function MissionTerrainProfile({
  profile,
  status,
  selectedIndex,
  onSelectIndex,
  height = 120,
  safetyMarginM = 10,
  onSafetyMarginChange,
  onRetry,
}: MissionTerrainProfileProps) {
  const hasRenderableProfile = status === "ready" && profile !== null && profile.points.length > 0;
  const compact = height <= 88;

  const markers = useMemo<MarkerDescriptor[]>(() => {
    if (!profile) return [];

    return profile.points
      .filter((point) => point.isWaypoint)
      .map((point, markerIndex) => ({
        key: `${point.index ?? "home"}-${point.distance_m}-${markerIndex}`,
        index: point.index,
        distance_m: point.distance_m,
        flightMsl: point.flightMsl,
        warning: point.warning,
        isHome: point.isHome,
      }));
  }, [profile]);

  const chartModel = useMemo(() => {
    const points = profile?.points ?? [];
    const distances = points.map((point) => point.distance_m);
    const terrain = points.map((point) => point.terrainMsl);
    const flight = points.map((point) => point.flightMsl);
    const margin = points.map((point) =>
      point.terrainMsl !== null ? point.terrainMsl + safetyMarginM : null,
    );
    const interpolatedFlight = points.map((point) => point.interpolatedFlightMsl);

    // Show the dual-path view only when the interpolated path actually differs
    // from the straight-line path (i.e. the mission has spline or arc segments).
    const hasCurvedSegments = points.some(
      (point) => point.interpolatedFlightMsl !== null && point.flightMsl !== null
        && point.interpolatedFlightMsl !== point.flightMsl,
    );

    const numericValues = [...terrain, ...flight, ...interpolatedFlight].filter(
      (value): value is number => value !== null && Number.isFinite(value),
    );
    const totalDistance = distances.length > 0 ? distances[distances.length - 1] ?? 0 : 0;
    const distanceUnit: "m" | "km" = totalDistance >= 1000 ? "km" : "m";
    const warningCount = markers.filter((marker) => marker.warning === "below_terrain").length;

    let minY = numericValues.length > 0 ? Math.min(...numericValues) : 0;
    let maxY = numericValues.length > 0 ? Math.max(...numericValues) : 100;
    if (minY === maxY) {
      minY -= 20;
      maxY += 20;
    }
    const pad = Math.max(12, (maxY - minY) * 0.12);
    minY -= pad;
    maxY += pad;

    const options: Omit<uPlot.Options, "width" | "height"> = {
      padding: [...CHART_PADDING],
      legend: { show: false },
      cursor: {
        show: false,
        drag: { x: false, y: false },
      },
      scales: {
        x: {
          time: false,
          range: () => [0, Math.max(totalDistance, 1)],
        },
        y: {
          range: () => [minY, maxY],
        },
      },
      axes: [
        {
          stroke: AXIS_COLOR,
          grid: { stroke: GRID_COLOR },
          values: (_u, values) => values.map((value) => formatDistanceAxis(Number(value), distanceUnit)),
        },
        {
          stroke: AXIS_COLOR,
          grid: { stroke: GRID_COLOR },
          values: (_u, values) => values.map((value) => `${Math.round(Number(value))}m`),
        },
      ],
      series: [
        {},
        {
          label: "Terrain",
          stroke: TERRAIN_STROKE,
          fill: TERRAIN_FILL,
          width: 2,
        },
        {
          // Straight-line DEM sample path — demoted to thin dashed when curved
          // segments are present, otherwise primary visual.
          label: hasCurvedSegments ? "Straight path" : "Flight altitude",
          stroke: hasCurvedSegments ? FLIGHT_STRAIGHT_STROKE : FLIGHT_STROKE,
          width: hasCurvedSegments ? 1 : 2,
          dash: hasCurvedSegments ? [4, 4] : undefined,
        },
        {
          label: "Safety margin",
          stroke: "rgba(234, 179, 8, 0.5)",
          fill: "rgba(234, 179, 8, 0.08)",
          width: 1,
          dash: [4, 4],
        },
        {
          // Interpolated (spline/arc) flight altitude — primary visual when present.
          label: "Flight altitude",
          stroke: FLIGHT_STROKE,
          width: 2,
          show: hasCurvedSegments,
        },
      ],
    };

    return {
      data: [distances, terrain, flight, margin, interpolatedFlight] as uPlot.AlignedData,
      options,
      totalDistance,
      distanceUnit,
      minY,
      maxY,
      warningCount,
      hasCurvedSegments,
    };
  }, [markers, profile, safetyMarginM]);

  if (status === "loading") {
    return (
      <section
        data-mission-terrain-profile
        data-status="loading"
        className="rounded-lg border border-border bg-bg-secondary/90 px-3 py-2"
      >
        <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-text-muted">
          <span>Terrain profile</span>
          <span>Sampling DEM</span>
        </div>
        <div className="overflow-hidden rounded-full border border-border/60 bg-bg-primary/80">
          <div
            data-terrain-profile-loading
            data-testid="terrain-profile-loading"
            className="h-1.5 w-2/5 animate-pulse rounded-full bg-accent/70"
          />
        </div>
      </section>
    );
  }

  if (!hasRenderableProfile) {
    return (
      <section
        data-mission-terrain-profile
        data-status={status}
        className="flex items-center justify-between rounded-lg border border-border bg-bg-secondary/90 px-3 py-2"
      >
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border/70 bg-bg-primary/80 text-text-muted">
            <Mountain className="h-4 w-4" />
          </div>
          <div>
            <p className="text-xs font-semibold text-text-primary">No elevation data</p>
            <p className="text-[10px] text-text-muted">
              {status === "error"
                ? "Terrain tiles could not be decoded."
                : "Add positioned mission items to render the profile."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {status === "error" && onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="rounded bg-bg-tertiary px-3 py-1 text-xs font-medium text-text-secondary hover:bg-bg-quaternary"
            >
              Retry
            </button>
          )}
          <span className="rounded-full border border-border/60 bg-bg-primary/80 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-text-muted">
            {status === "error" ? "Offline" : "Idle"}
          </span>
        </div>
      </section>
    );
  }

  const plotHeight = Math.max(1, height - CHART_PADDING[0] - CHART_PADDING[2]);
  const totalDistance = Math.max(chartModel.totalDistance, 1);
  const range = Math.max(chartModel.maxY - chartModel.minY, 1);

  return (
    <section
      data-mission-terrain-profile
      data-status="ready"
      className="rounded-lg border border-border bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(15,23,42,0.78))] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">
              Terrain profile
            </span>
            {chartModel.warningCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-danger/25 bg-danger/10 px-2 py-0.5 text-[10px] font-semibold text-danger">
                <TriangleAlert className="h-3 w-3" />
                {chartModel.warningCount} below terrain
              </span>
            )}
          </div>
          <p className="truncate text-[11px] text-text-muted">
            Ground versus commanded altitude · {formatDistanceSummary(chartModel.totalDistance, chartModel.distanceUnit)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-[10px] text-text-muted">
          {!compact && onSafetyMarginChange && (
            <label className="flex items-center gap-1">
              <span>Margin</span>
              <input
                type="number"
                aria-label="Safety margin in metres"
                min={1}
                max={500}
                step={1}
                value={safetyMarginM}
                onChange={(e) => {
                  const parsed = Number(e.target.value);
                  if (Number.isFinite(parsed) && parsed >= 1) {
                    onSafetyMarginChange(parsed);
                  }
                }}
                className="w-12 rounded border border-border/60 bg-bg-primary/80 px-1 py-0.5 text-[10px] tabular-nums text-text-primary focus:outline-none focus:ring-1 focus:ring-accent/50"
              />
              <span>m</span>
            </label>
          )}
          <LegendSwatch label="Terrain" color={TERRAIN_STROKE} fill={TERRAIN_FILL} />
          <LegendSwatch label="Flight" color={FLIGHT_STROKE} />
          {chartModel.hasCurvedSegments && (
            <LegendSwatch label="Straight" color={FLIGHT_STRAIGHT_STROKE} dashed />
          )}
        </div>
      </div>

      <div className="relative" style={{ height }}>
        <UPlotChart
          height={height}
          options={chartModel.options}
          data={chartModel.data}
        />

        <div
          className="pointer-events-none absolute inset-0"
          style={{
            top: CHART_PADDING[0],
            right: CHART_PADDING[1],
            bottom: CHART_PADDING[2],
            left: CHART_PADDING[3],
          }}
        >
          <div className="relative h-full w-full">
            {markers.map((marker) => {
              const left = `${(marker.distance_m / totalDistance) * 100}%`;
              const hasFlightValue = marker.flightMsl !== null && Number.isFinite(marker.flightMsl);
              const top = hasFlightValue
                ? `${((chartModel.maxY - (marker.flightMsl ?? chartModel.maxY)) / range) * 100}%`
                : "100%";
              const isBelowTerrain = marker.warning === "below_terrain";
              const isNearTerrain = marker.warning === "near_terrain";
              const isSelected = marker.index !== null && marker.index === selectedIndex;
              const label = marker.isHome
                ? "Home point"
                : marker.warning === "below_terrain"
                  ? `Waypoint ${marker.index! + 1} below terrain`
                  : marker.warning === "near_terrain"
                    ? `Waypoint ${marker.index! + 1} near terrain`
                    : `Waypoint ${marker.index! + 1}`;

              return (
                <div
                  key={marker.key}
                  className="absolute inset-y-0"
                  style={{ left }}
                >
                  {isBelowTerrain && (
                    <span
                      data-terrain-warning-marker
                      data-testid="terrain-warning-marker"
                      className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-danger/65"
                    />
                  )}

                  <button
                    type="button"
                    data-terrain-waypoint-marker
                    data-testid="terrain-waypoint-marker"
                    data-terrain-warning={marker.warning}
                    data-selected={isSelected ? "true" : "false"}
                    aria-label={label}
                    aria-pressed={isSelected}
                    title={label}
                    onClick={() => onSelectIndex?.(isSelected ? null : marker.index)}
                    className={cn(
                      "pointer-events-auto absolute left-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
                      marker.isHome
                        ? "border-bg-primary bg-text-muted"
                        : isBelowTerrain
                          ? "border-danger/90 bg-danger shadow-[0_0_0_2px_rgba(239,68,68,0.16)]"
                          : isNearTerrain
                            ? "border-warning/90 bg-warning shadow-[0_0_0_2px_rgba(245,158,11,0.16)]"
                            : "border-bg-primary bg-accent",
                      isSelected && "h-4 w-4 ring-2 ring-accent/60 ring-offset-1 ring-offset-bg-secondary",
                      compact && "h-2.5 w-2.5",
                    )}
                    style={{
                      top,
                      minHeight: compact ? 10 : 12,
                      minWidth: compact ? 10 : 12,
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-1 flex items-center justify-between text-[10px] text-text-muted">
        <span>{markers.length} path point{markers.length === 1 ? "" : "s"}</span>
        <span>{plotHeight}px strip</span>
      </div>
    </section>
  );
}

function formatDistanceAxis(distance_m: number, unit: "m" | "km"): string {
  if (unit === "km") {
    return `${(distance_m / 1000).toFixed(distance_m >= 10000 ? 0 : 1)}`;
  }
  return `${Math.round(distance_m)}`;
}

function formatDistanceSummary(distance_m: number, unit: "m" | "km"): string {
  if (unit === "km") {
    return `${(distance_m / 1000).toFixed(distance_m >= 10000 ? 0 : 1)} km`;
  }
  return `${Math.round(distance_m)} m`;
}

function LegendSwatch({ label, color, fill, dashed }: { label: string; color: string; fill?: string; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="h-2.5 w-5 rounded-full border"
        style={{
          borderColor: color,
          background: fill ?? color,
          borderStyle: dashed ? "dashed" : "solid",
        }}
      />
      <span>{label}</span>
    </span>
  );
}

export function terrainWaypointMarkers(points: ProfilePoint[]): ProfilePoint[] {
  return points.filter((point) => point.isWaypoint);
}

import { useEffect, useState } from "react";
import {
  BatteryCharging,
  CheckCircle2,
  CircleDot,
  Gauge,
  Map,
  MoveVertical,
  Route,
  Scaling,
  ShieldCheck,
  TimerReset,
} from "lucide-react";
import { SetupSectionIntro } from "../setup/shared/SetupSectionIntro";
import { cn } from "../../lib/utils";
import {
  DEFAULT_MISSION_PLANNING_PROFILE,
  computeMissionStatistics,
} from "../../lib/mission-statistics";
import { computeFenceStats } from "../../lib/fence-statistics";
import { computeRallyStats } from "../../lib/rally-statistics";
import type { FencePlan } from "../../fence";
import type { RallyPlan } from "../../rally";
import { MissionHomeCard } from "./MissionHomeCard";
import { MissionVehicleCard } from "./MissionVehicleCard";
import { MissionTransferStatus } from "./MissionTransferStatus";
import type { useMission } from "../../hooks/use-mission";
import type { MissionType } from "../../mission";
import { useSettings } from "../../hooks/use-settings";

type MissionPlannerSummaryProps = {
  mission: ReturnType<typeof useMission>;
  connected: boolean;
};

type StatTone = "default" | "success" | "warning" | "danger";

type StatTileProps = {
  icon: typeof Route;
  label: string;
  value: string;
  hint: string;
  tone?: StatTone;
  testId: string;
};

const MISSION_DESCRIPTIONS: Record<MissionType, string> = {
  mission: "Waypoint sequence with home position, navigation commands, and DO actions.",
  fence: "Geofence inclusion/exclusion zones. Vehicle triggers RTL or LAND when breaching a fence boundary. Upload requires at least 4 points for a closed polygon.",
  rally: "Alternate return-to-launch locations. On RTL, the vehicle flies to the nearest rally point instead of home. Useful for directing landings away from crowds or obstacles.",
};

const MISSION_DOCS: Record<MissionType, string> = {
  mission: "https://ardupilot.org/copter/docs/common-planning-a-mission-with-waypoints-and-events.html",
  fence: "https://ardupilot.org/copter/docs/common-ac2_simple_geofence.html",
  rally: "https://ardupilot.org/copter/docs/common-rally-points.html",
};

function SyncBadge({ isDirty }: { isDirty: boolean }) {
  if (isDirty) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-1.5 py-0.5 text-[10px] font-semibold text-warning">
        <CircleDot className="h-2.5 w-2.5" />
        Unsaved
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-1.5 py-0.5 text-[10px] font-semibold text-success">
      <CheckCircle2 className="h-2.5 w-2.5" />
      Synced
    </span>
  );
}

function formatDistance(distanceM: number): string {
  if (distanceM >= 1000) {
    const precision = distanceM >= 10_000 ? 1 : 2;
    return `${(distanceM / 1000).toFixed(precision)} km`;
  }
  return `${Math.round(distanceM)} m`;
}

function formatEstimatedTime(estimatedTimeSec: number | null): string {
  if (estimatedTimeSec === null) {
    return "Indeterminate";
  }

  const roundedSeconds = Math.max(0, Math.round(estimatedTimeSec));
  if (roundedSeconds >= 3600) {
    const hours = Math.floor(roundedSeconds / 3600);
    const minutes = Math.floor((roundedSeconds % 3600) / 60);
    return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  }

  const minutes = Math.floor(roundedSeconds / 60);
  const seconds = roundedSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatAltitude(altitudeM: number): string {
  return `${Math.round(altitudeM)} m`;
}

function formatArea(areaM2: number): string {
  if (areaM2 >= 1_000_000) {
    return `${(areaM2 / 1_000_000).toFixed(3)} km²`;
  }
  return `${Math.round(areaM2)} m²`;
}

function formatEndurance(endurancePct: number | null, isTimeIndeterminate: boolean): string {
  if (isTimeIndeterminate) {
    return "—";
  }
  if (endurancePct === null) {
    return "Set budget";
  }
  return `${Math.round(endurancePct)}%`;
}

function enduranceTone(endurancePct: number | null): StatTone {
  if (endurancePct === null) {
    return "default";
  }
  if (endurancePct > 95) {
    return "danger";
  }
  if (endurancePct >= 80) {
    return "warning";
  }
  return "success";
}

function statToneClasses(tone: StatTone): string {
  switch (tone) {
    case "success":
      return "border-success/25 bg-success/10 text-success";
    case "warning":
      return "border-warning/30 bg-warning/10 text-warning";
    case "danger":
      return "border-danger/30 bg-danger/10 text-danger";
    default:
      return "border-border/70 bg-bg-primary text-text-secondary";
  }
}

function StatTile({ icon: Icon, label, value, hint, tone = "default", testId }: StatTileProps) {
  return (
    <div
      data-testid={testId}
      className={cn(
        "rounded-lg border px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]",
        statToneClasses(tone),
      )}
    >
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-text-muted">
        <Icon className="h-3.5 w-3.5 text-accent" />
        <span>{label}</span>
      </div>
      <div className="mt-2 text-sm font-semibold tabular-nums text-current">{value}</div>
      <div className="mt-1 text-[10px] leading-relaxed text-text-muted">{hint}</div>
    </div>
  );
}

function PlanningNumberInput({
  label,
  unit,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  unit: string;
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
}) {
  return (
    <label className="space-y-1">
      <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-text-muted">
        {label} <span className="normal-case tracking-normal text-text-muted/70">({unit})</span>
      </span>
      <input
        aria-label={label}
        type="number"
        step="any"
        inputMode="decimal"
        value={value ?? ""}
        onChange={(event) => {
          const nextValue = event.target.value;
          if (nextValue === "") {
            onChange(null);
            return;
          }

          const parsed = Number(nextValue);
          if (Number.isFinite(parsed)) {
            onChange(parsed);
          }
        }}
        placeholder={placeholder}
        className="w-full rounded-md border border-border/70 bg-bg-input px-2 py-1.5 text-xs tabular-nums text-text-primary transition-colors focus:border-accent focus:outline-none"
      />
    </label>
  );
}

export function MissionPlannerSummary({ mission, connected }: MissionPlannerSummaryProps) {
  const current = mission.current;
  const missionType = mission.selectedTab;
  const missionDomain = mission.mission;
  const { settings, updateSettings } = useSettings();

  const [cruiseSpeedMps, setCruiseSpeedMps] = useState(
    () => missionDomain.importedSpeeds?.cruiseSpeedMps ?? settings.cruiseSpeedMps,
  );
  const [hoverSpeedMps, setHoverSpeedMps] = useState(
    () => missionDomain.importedSpeeds?.hoverSpeedMps ?? settings.hoverSpeedMps,
  );
  const [enduranceBudgetMin, setEnduranceBudgetMin] = useState<number | null>(
    DEFAULT_MISSION_PLANNING_PROFILE.enduranceBudgetMin,
  );

  useEffect(() => {
    setCruiseSpeedMps(
      missionDomain.importedSpeeds?.cruiseSpeedMps ?? settings.cruiseSpeedMps,
    );
    setHoverSpeedMps(
      missionDomain.importedSpeeds?.hoverSpeedMps ?? settings.hoverSpeedMps,
    );
  }, [
    missionDomain.importedSpeeds?.cruiseSpeedMps,
    missionDomain.importedSpeeds?.hoverSpeedMps,
    settings.cruiseSpeedMps,
    settings.hoverSpeedMps,
  ]);

  useEffect(() => {
    missionDomain.setExportSpeeds({ cruiseSpeedMps, hoverSpeedMps });
  }, [cruiseSpeedMps, hoverSpeedMps, missionDomain]);

  // Persist speed changes back to settings
  useEffect(() => {
    updateSettings({ cruiseSpeedMps, hoverSpeedMps });
  }, [cruiseSpeedMps, hoverSpeedMps, updateSettings]);

  const statistics = computeMissionStatistics(missionDomain.homePosition, missionDomain.draftItems, {
    cruiseSpeedMps,
    hoverSpeedMps,
    enduranceBudgetMin,
  });
  const blockingItems = statistics.indeterminateItemIndexes.map((index) => `#${index + 1}`).join(", ");

  const fenceStats = computeFenceStats(
    missionType === "fence" ? (current.plan as FencePlan).regions : [],
  );

  const rallyStats = computeRallyStats(
    missionType === "rally" ? (current.plan as RallyPlan).points : [],
    current.homePosition,
  );

  return (
    <div className="space-y-2">
      <SetupSectionIntro
        icon={Map}
        title={missionType}
        description={MISSION_DESCRIPTIONS[missionType]}
        docsUrl={MISSION_DOCS[missionType]}
        docsLabel="ArduPilot Docs"
        actionSlot={
          <div className="flex items-center gap-2">
            <SyncBadge isDirty={current.isDirty} />
            <span className="text-[10px] tabular-nums text-text-muted">
              {current.displayTotal} item{current.displayTotal !== 1 ? "s" : ""}
            </span>
          </div>
        }
      />

      {current.recoverableAvailable && (
        <div className="flex items-center justify-between rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
          <span>Recoverable local draft available after the last session reset.</span>
          <button
            type="button"
            onClick={current.recoverDraft}
            className="rounded border border-warning/30 px-2 py-1 font-semibold text-warning transition-colors hover:bg-warning/10"
          >
            Recover draft
          </button>
        </div>
      )}

      <MissionHomeCard
        homePosition={current.homePosition}
        homeSource={current.homeSource}
        missionType={missionType}
      />

      <MissionVehicleCard
        connected={connected}
        activeSeq={mission.vehicle.activeSeq}
        missionState={mission.vehicle.missionState}
        missionType={missionType}
      />

      <MissionTransferStatus
        transferUi={current.transferUi}
        roundtripStatus={current.roundtripStatus}
        onCancel={current.cancel}
      />

      {missionType === "mission" && (
        <div
          data-testid="mission-planning-stats"
          className="overflow-hidden rounded-lg border border-border-light bg-[linear-gradient(180deg,rgba(83,180,255,0.09),rgba(83,180,255,0.03))] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">
                Planning envelope
              </div>
              <div className="text-sm font-semibold text-text-primary">Mission estimates</div>
              <p className="max-w-xl text-[10px] leading-relaxed text-text-muted">
                Distance and time come from the live draft. Cruise and hover edits stay local to this panel and do not participate in mission undo history.
              </p>
            </div>

            <div
              data-testid="mission-stats-state"
              className={cn(
                "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]",
                statistics.isTimeIndeterminate
                  ? "border-warning/30 bg-warning/10 text-warning"
                  : "border-success/25 bg-success/10 text-success",
              )}
            >
              {statistics.isTimeIndeterminate ? "Indeterminate" : "Finite estimate"}
            </div>
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-3">
            <StatTile
              testId="mission-stats-distance"
              icon={Route}
              label="Total distance"
              value={formatDistance(statistics.totalDistanceM)}
              hint={`${Math.round(statistics.travelDistanceM)} m cruise path${statistics.orbitDistanceM > 0 ? ` • ${Math.round(statistics.orbitDistanceM)} m orbit` : ""}`}
            />
            <StatTile
              testId="mission-stats-time"
              icon={TimerReset}
              label="Estimated time"
              value={formatEstimatedTime(statistics.estimatedTimeSec)}
              hint={statistics.isTimeIndeterminate
                ? "Manual review required for unbounded mission commands."
                : `${Math.round(statistics.nonTravelTimeSec)} s non-travel overhead`}
              tone={statistics.isTimeIndeterminate ? "warning" : "default"}
            />
            <StatTile
              testId="mission-stats-endurance"
              icon={BatteryCharging}
              label="Endurance"
              value={formatEndurance(statistics.endurancePct, statistics.isTimeIndeterminate)}
              hint={enduranceBudgetMin === null
                ? "Optional endurance budget in minutes"
                : `Against ${Math.round(enduranceBudgetMin)} min budget`}
              tone={statistics.isTimeIndeterminate ? "warning" : enduranceTone(statistics.endurancePct)}
            />
          </div>

          {statistics.maxAltitudeM !== null && statistics.avgAltitudeM !== null && (
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              <StatTile
                testId="mission-stats-max-altitude"
                icon={MoveVertical}
                label="Max altitude"
                value={formatAltitude(statistics.maxAltitudeM)}
                hint="Highest waypoint altitude in the mission"
              />
              <StatTile
                testId="mission-stats-avg-altitude"
                icon={MoveVertical}
                label="Avg altitude"
                value={formatAltitude(statistics.avgAltitudeM)}
                hint="Mean altitude across all positional waypoints"
              />
            </div>
          )}

          {statistics.isTimeIndeterminate && (
            <div
              data-testid="mission-stats-indeterminate"
              className="mt-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning"
            >
              Estimate is indeterminate for blocking command{statistics.indeterminateItemIndexes.length === 1 ? "" : "s"}
              {blockingItems ? ` ${blockingItems}` : ""}.
            </div>
          )}

          <div className="mt-3 grid gap-2 border-t border-border/60 pt-3 md:grid-cols-3">
            <PlanningNumberInput
              label="Cruise speed"
              unit="m/s"
              value={cruiseSpeedMps}
              onChange={(value) => {
                if (value !== null) {
                  setCruiseSpeedMps(value);
                }
              }}
            />
            <PlanningNumberInput
              label="Hover speed"
              unit="m/s"
              value={hoverSpeedMps}
              onChange={(value) => {
                if (value !== null) {
                  setHoverSpeedMps(value);
                }
              }}
            />
            <PlanningNumberInput
              label="Endurance budget"
              unit="min"
              value={enduranceBudgetMin}
              onChange={setEnduranceBudgetMin}
              placeholder="Optional"
            />
          </div>

          <div className="mt-2 flex items-center gap-1.5 text-[10px] text-text-muted">
            <Gauge className="h-3.5 w-3.5 text-accent" />
            Export uses the current cruise and hover inputs shown here.
          </div>
        </div>
      )}

      {missionType === "fence" && (
        <div
          data-testid="fence-planning-stats"
          className="overflow-hidden rounded-lg border border-border-light bg-[linear-gradient(180deg,rgba(83,180,255,0.09),rgba(83,180,255,0.03))] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
        >
          <div className="mb-3 space-y-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">
              Planning envelope
            </div>
            <div className="text-sm font-semibold text-text-primary">Fence estimates</div>
            <p className="max-w-xl text-[10px] leading-relaxed text-text-muted">
              Region count, perimeter, and area are computed from the live draft.
            </p>
          </div>

          <div className="grid gap-2 md:grid-cols-3">
            <StatTile
              testId="fence-stats-regions"
              icon={ShieldCheck}
              label="Regions"
              value={String(fenceStats.regionCount)}
              hint="Inclusion and exclusion zones in the fence"
            />
            <StatTile
              testId="fence-stats-perimeter"
              icon={Route}
              label="Total perimeter"
              value={formatDistance(fenceStats.totalPerimeterM)}
              hint="Sum of boundary lengths across all regions"
            />
            <StatTile
              testId="fence-stats-area"
              icon={Scaling}
              label="Total area"
              value={formatArea(fenceStats.totalAreaM2)}
              hint="Sum of enclosed areas across all regions"
            />
          </div>
        </div>
      )}

      {missionType === "rally" && (
        <div
          data-testid="rally-planning-stats"
          className="overflow-hidden rounded-lg border border-border-light bg-[linear-gradient(180deg,rgba(83,180,255,0.09),rgba(83,180,255,0.03))] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
        >
          <div className="mb-3 space-y-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">
              Planning envelope
            </div>
            <div className="text-sm font-semibold text-text-primary">Rally estimates</div>
            <p className="max-w-xl text-[10px] leading-relaxed text-text-muted">
              Point count and furthest distance from home are computed from the live draft.
            </p>
          </div>

          <div className="grid gap-2 md:grid-cols-2">
            <StatTile
              testId="rally-stats-count"
              icon={CircleDot}
              label="Rally points"
              value={String(rallyStats.pointCount)}
              hint="Number of alternate return-to-launch locations"
            />
            <StatTile
              testId="rally-stats-max-distance"
              icon={Route}
              label="Max distance from home"
              value={rallyStats.maxDistanceFromHomeM !== null
                ? formatDistance(rallyStats.maxDistanceFromHomeM)
                : "—"}
              hint={rallyStats.maxDistanceFromHomeM !== null
                ? "Furthest rally point from the home position"
                : "Home position not yet available"}
            />
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useCallback, useEffect, useRef } from "react";
import {
  LayoutDashboard,
  Box,
  Compass,
  Radio,
  Satellite,
  Battery,
  Cog,
  SlidersHorizontal,
  Cable,
  Plane,
  ShieldAlert,
  Home,
  Fence,
  Lock,
  Calculator,
  Activity,
  Puzzle,
  Sliders,
  ChevronDown,
  ChevronRight,
  Circle,
  Menu,
  X,
  Upload,
  Trash2,
  RotateCw,
  Wrench,
  Unplug,
  type LucideIcon,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useBreakpoint } from "../../hooks/use-breakpoint";
import type { UseSetupReturn } from "../../hooks/use-setup";
import { type SectionStatus, type SetupSectionId } from "../../hooks/use-setup-sections";
import type { ParamsState } from "../../hooks/use-params";
import { paramProgressPhase, paramProgressCounts } from "../../params";
import { SectionStatusIcon } from "./shared/SectionStatusIcon";
import { formatStagedValue, displayParamValue } from "./shared/param-format-helpers";
import type { VehicleState, Telemetry, LinkState, HomePosition, FlightModeEntry } from "../../telemetry";
import type { SensorHealth } from "../../sensor-health";
import type { SupportDomain } from "../../support";

// Section components
import { OverviewSection } from "./sections/OverviewSection";
import { FrameOrientationSection } from "./sections/FrameOrientationSection";
import { CalibrationSection } from "./sections/CalibrationSection";
import { RcReceiverSection } from "./sections/RcReceiverSection";
import { GpsSection } from "./sections/GpsSection";
import { BatteryMonitorSection } from "./sections/BatteryMonitorSection";
import { MotorsEscSection } from "./sections/MotorsEscSection";
import { ServoOutputsSection } from "./sections/ServoOutputsSection";
import { SerialPortsSection } from "./sections/SerialPortsSection";
import { FlightModesSection } from "./sections/FlightModesSection";
import { FailsafeSection } from "./sections/FailsafeSection";
import { RtlReturnSection } from "./sections/RtlReturnSection";
import { GeofenceSection } from "./sections/GeofenceSection";
import { ArmingSection } from "./sections/ArmingSection";
import { InitialParamsSection } from "./sections/InitialParamsSection";
import { PidTuningSection } from "./sections/PidTuningSection";
import { PeripheralsSection } from "./sections/PeripheralsSection";
import { FullParametersSection } from "./sections/FullParametersSection";

// ---------------------------------------------------------------------------
// Section metadata
// ---------------------------------------------------------------------------

export type SetupSection = {
  id: SetupSectionId;
  label: string;
  icon: LucideIcon;
  group: SetupGroupId;
};

export type SetupGroupId =
  | "essential"
  | "hardware"
  | "safety"
  | "tuning"
  | "peripherals_advanced";

export type SetupGroup = {
  id: SetupGroupId;
  label: string;
  sections: SetupSectionId[];
};

export const SETUP_SECTIONS: SetupSection[] = [
  // Essential Setup
  { id: "overview", label: "Overview", icon: LayoutDashboard, group: "essential" },
  { id: "frame_orientation", label: "Frame & Orientation", icon: Box, group: "essential" },
  { id: "calibration", label: "Calibration", icon: Compass, group: "essential" },
  { id: "rc_receiver", label: "RC / Receiver", icon: Radio, group: "essential" },
  { id: "flight_modes", label: "Flight Modes", icon: Plane, group: "essential" },
  // Hardware
  { id: "gps", label: "GPS", icon: Satellite, group: "hardware" },
  { id: "battery_monitor", label: "Battery Monitor", icon: Battery, group: "hardware" },
  { id: "motors_esc", label: "Motors & ESC", icon: Cog, group: "hardware" },
  { id: "servo_outputs", label: "Servo Outputs", icon: SlidersHorizontal, group: "hardware" },
  { id: "serial_ports", label: "Serial Ports", icon: Cable, group: "hardware" },
  // Safety
  { id: "failsafe", label: "Failsafe", icon: ShieldAlert, group: "safety" },
  { id: "rtl_return", label: "RTL / Return", icon: Home, group: "safety" },
  { id: "geofence", label: "Geofence", icon: Fence, group: "safety" },
  { id: "arming", label: "Arming", icon: Lock, group: "safety" },
  // Tuning
  { id: "initial_params", label: "Initial Parameters", icon: Calculator, group: "tuning" },
  { id: "pid_tuning", label: "PID Tuning", icon: Activity, group: "tuning" },
  // Peripherals
  { id: "peripherals", label: "Peripherals", icon: Puzzle, group: "peripherals_advanced" },
  { id: "full_parameters", label: "Full Parameters", icon: Sliders, group: "peripherals_advanced" },
];

export const SECTION_GROUPS: SetupGroup[] = [
  {
    id: "essential",
    label: "Essential Setup",
    sections: ["overview", "frame_orientation", "calibration", "rc_receiver", "flight_modes"],
  },
  {
    id: "hardware",
    label: "Hardware",
    sections: ["gps", "battery_monitor", "motors_esc", "servo_outputs", "serial_ports"],
  },
  {
    id: "safety",
    label: "Safety",
    sections: ["failsafe", "rtl_return", "geofence", "arming"],
  },
  {
    id: "tuning",
    label: "Tuning",
    sections: ["initial_params", "pid_tuning"],
  },
  {
    id: "peripherals_advanced",
    label: "Peripherals",
    sections: ["peripherals", "full_parameters"],
  },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type SetupSectionPanelProps = {
  connected: boolean;
  vehicleState: VehicleState | null;
  telemetry: Telemetry | null;
  linkState: LinkState | null;
  setup: UseSetupReturn;
  support: SupportDomain;
  sensorHealth: SensorHealth | null;
  homePosition: HomePosition | null;
  availableModes: FlightModeEntry[];
};

// ---------------------------------------------------------------------------
// Disconnected / unsupported gates
// ---------------------------------------------------------------------------

function DisconnectedGate() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-text-muted">
      <Unplug size={32} className="opacity-40" />
      <span className="text-sm">Connect to a vehicle to access setup</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Staged params tray (shell-owned, used by all sections including Full Params)
// ---------------------------------------------------------------------------

function StagedParamsBar({ params, onApplySuccess }: { params: ParamsState; onApplySuccess?: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [applying, setApplying] = useState(false);

  const handleApply = useCallback(async () => {
    setApplying(true);
    try {
      const allSucceeded = await params.applyStaged();
      if (allSucceeded) onApplySuccess?.();
    } finally {
      setApplying(false);
    }
  }, [params, onApplySuccess]);

  const handleDiscardAll = useCallback(() => {
    params.unstageAll();
  }, [params]);

  const writePhase = params.progress ? paramProgressPhase(params.progress) : null;
  const isWriting = writePhase === "writing";
  const writeCounts = isWriting && params.progress ? paramProgressCounts(params.progress) : null;

  const staged = params.staged;
  const store = params.store;

  if (staged.size === 0) return null;

  const hasRebootRequired = Array.from(staged.keys()).some((name) => {
    const meta = params.metadata?.get(name);
    return meta?.rebootRequired;
  });

  return (
    <div className="border-t border-warning/30 bg-warning/5">
      <button
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs text-warning hover:bg-warning/10 transition-colors"
      >
        <ChevronDown
          size={12}
          className={cn(
            "shrink-0 transition-transform duration-200",
            expanded && "rotate-180",
          )}
        />
        <span className="font-medium">
          {staged.size} parameter{staged.size !== 1 ? "s" : ""} staged
        </span>
        {hasRebootRequired && (
          <RotateCw size={10} className="shrink-0 text-warning/70" />
        )}
        <span className="ml-auto text-[11px] text-text-muted">
          {expanded ? "Collapse" : "Review & Apply"}
        </span>
      </button>

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
        aria-hidden={!expanded}
      >
        <div className="overflow-hidden min-h-0">
          <div className="px-3 pt-1 pb-2">
            {hasRebootRequired && (
              <div className="mb-2 flex items-center gap-1.5 rounded bg-warning/10 px-2 py-1 text-[10px] text-warning">
                <RotateCw size={10} className="shrink-0" />
                Some changes require a vehicle reboot to take effect
              </div>
            )}
            <div className="flex flex-col gap-0.5 max-h-40 overflow-y-auto mb-2">
              {Array.from(staged.entries())
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([name, newValue]) => {
                  const current = store?.params[name];
                  return (
                    <div key={name} className="flex items-center gap-2 text-[11px] font-mono">
                      <span className="w-40 truncate text-text-primary sm:w-48" title={name}>
                        {name}
                      </span>
                      <span className="text-text-muted">
                        {current ? displayParamValue(current) : "?"}
                      </span>
                      <span className="text-text-muted">&rarr;</span>
                      <span className="text-warning">
                        {formatStagedValue(newValue, current?.param_type)}
                      </span>
                      {params.metadata?.get(name)?.rebootRequired && (
                        <RotateCw size={8} className="text-warning" />
                      )}
                      <button
                        onClick={() => params.unstage(name)}
                        className="ml-auto p-0.5 text-text-muted hover:text-danger"
                        title="Unstage"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  );
                })}
            </div>
            <div className="flex items-center gap-2">
              {isWriting ? (
                <div className="flex flex-1 flex-col gap-1">
                  <div className="h-1.5 overflow-hidden rounded-full bg-bg-tertiary">
                    <div
                      className="h-full rounded-full bg-warning transition-all duration-300"
                      style={{
                        width: writeCounts && writeCounts.expected
                          ? `${Math.round((writeCounts.received / writeCounts.expected) * 100)}%`
                          : "0%",
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-text-muted">
                    {writeCounts
                      ? `Writing ${writeCounts.received} / ${writeCounts.expected ?? "?"} parameters`
                      : "Writing…"}
                  </span>
                </div>
              ) : (
                <>
                  <button
                    onClick={handleApply}
                    disabled={applying}
                    className="flex items-center gap-1.5 rounded-md bg-success px-3 py-1.5 text-xs font-medium text-white transition-opacity disabled:opacity-40"
                  >
                    <Upload size={12} className={applying ? "animate-pulse" : ""} />
                    {applying ? "Applying..." : "Apply All"}
                  </button>
                  <button
                    onClick={handleDiscardAll}
                    disabled={applying}
                    className="flex items-center gap-1.5 rounded-md border border-border bg-bg-secondary px-3 py-1.5 text-xs font-medium text-text-primary transition-opacity disabled:opacity-40"
                  >
                    <Trash2 size={12} />
                    Discard All
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Nav item
// ---------------------------------------------------------------------------

function SectionNavItem({
  section,
  isActive,
  status,
  locked,
  onClick,
}: {
  section: SetupSection;
  isActive: boolean;
  status: SectionStatus;
  locked?: boolean;
  onClick: () => void;
}) {
  const Icon = section.icon;
  return (
    <button
      onClick={locked ? undefined : onClick}
      disabled={locked}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-xs transition-colors",
        locked
          ? "opacity-40 pointer-events-none text-text-muted"
          : isActive
            ? "bg-accent/10 text-text-primary"
            : "text-text-secondary hover:bg-bg-tertiary/50",
      )}
    >
      <Icon size={14} className="shrink-0" />
      <span className="truncate font-medium">{section.label}</span>
      {locked ? (
        <Lock size={10} className="ml-auto shrink-0 text-text-muted/50" />
      ) : (
        <SectionStatusIcon status={status} />
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Grouped sidebar nav (shared between desktop rail and mobile drawer)
// ---------------------------------------------------------------------------

function SectionNav({
  activeSection,
  onSelect,
  collapsedGroups,
  onToggleGroup,
  sectionStatuses,
  setupReady,
}: {
  activeSection: SetupSectionId;
  onSelect: (id: SetupSectionId) => void;
  collapsedGroups: Set<SetupGroupId>;
  onToggleGroup: (id: SetupGroupId) => void;
  sectionStatuses: Map<SetupSectionId, SectionStatus>;
  setupReady: boolean;
}) {
  const sectionMap = new Map(SETUP_SECTIONS.map((s) => [s.id, s]));

  return (
    <nav className="flex flex-col gap-1">
      {SECTION_GROUPS.map((group) => {
        const isCollapsed = collapsedGroups.has(group.id);
        return (
          <div key={group.id}>
            <button
              onClick={() => onToggleGroup(group.id)}
              className="flex w-full items-center gap-1.5 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted hover:text-text-secondary transition-colors"
            >
              {isCollapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
              {group.label}
            </button>

            {!isCollapsed && (
              <div className="flex flex-col gap-0.5 px-0.5">
                {group.sections.map((sectionId) => {
                  const section = sectionMap.get(sectionId);
                  if (!section) return null;
                  const isLocked = !setupReady && sectionId !== "overview";
                  return (
                    <SectionNavItem
                      key={sectionId}
                      section={section}
                      isActive={sectionId === activeSection}
                      status={sectionStatuses.get(sectionId) ?? "unknown"}
                      locked={isLocked}
                      onClick={() => onSelect(sectionId)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function SetupSectionPanel({
  connected,
  vehicleState,
  telemetry,
  linkState,
  setup,
  support,
  sensorHealth,
  homePosition,
  availableModes,
}: SetupSectionPanelProps) {
  const { isMobile } = useBreakpoint();
  const {
    activeSection,
    setActiveSection,
    sectionStatuses,
    overallProgress,
    confirmSection,
    params,
    setupReady,
    effectiveSection,
    pendingHighlightParam,
    navigateToParam,
    handleHighlightHandled,
  } = setup;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<SetupGroupId>>(new Set());

  useEffect(() => {
    if (contentScrollRef.current) {
      contentScrollRef.current.scrollTop = 0;
    }
  }, [activeSection]);

  const handleSelectSection = useCallback(
    (id: SetupSectionId) => {
      setActiveSection(id);
      if (isMobile) setDrawerOpen(false);
    },
    [setActiveSection, isMobile],
  );

  const handleStagedApplySuccess = useCallback(() => {
    if (
      activeSection === "flight_modes" ||
      activeSection === "failsafe" ||
      activeSection === "rtl_return" ||
      activeSection === "geofence" ||
      activeSection === "initial_params" ||
      activeSection === "serial_ports"
    ) {
      confirmSection(activeSection);
    }
  }, [activeSection, confirmSection]);

  const contentScrollRef = useRef<HTMLDivElement>(null);

  const handleToggleGroup = (id: SetupGroupId) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const activeSectionMeta = SETUP_SECTIONS.find((s) => s.id === effectiveSection);
  const ActiveIcon = activeSectionMeta?.icon ?? Circle;

  const sectionContent = (() => {
    if (!connected) return <DisconnectedGate />;
    switch (effectiveSection) {
      case "overview":
        return (
          <OverviewSection
            connected={connected}
            vehicleState={vehicleState}
            telemetry={telemetry}
            linkState={linkState}
            support={support}
            sensorHealth={sensorHealth}
            homePosition={homePosition}
            params={params}
            sectionStatuses={sectionStatuses}
            overallProgress={overallProgress}
            onNavigateSection={handleSelectSection}
          />
        );
      case "frame_orientation":
        return <FrameOrientationSection params={params} vehicleState={vehicleState} />;
      case "calibration":
        return <CalibrationSection params={params} connected={connected} />;
      case "rc_receiver":
        return <RcReceiverSection params={params} connected={connected} telemetry={telemetry} />;
      case "gps":
        return <GpsSection params={params} telemetry={telemetry} />;
      case "battery_monitor":
        return <BatteryMonitorSection params={params} telemetry={telemetry} />;
      case "motors_esc":
        return <MotorsEscSection params={params} vehicleState={vehicleState} connected={connected} />;
      case "servo_outputs":
        return <ServoOutputsSection params={params} vehicleState={vehicleState} telemetry={telemetry} />;
      case "serial_ports":
        return <SerialPortsSection params={params} />;
      case "flight_modes":
        return (
          <FlightModesSection
            params={params}
            vehicleState={vehicleState}
            telemetry={telemetry}
            availableModes={availableModes}
            navigateToParam={navigateToParam}
          />
        );
      case "failsafe":
        return <FailsafeSection params={params} vehicleState={vehicleState} navigateToParam={navigateToParam} />;
      case "rtl_return":
        return <RtlReturnSection params={params} vehicleState={vehicleState} />;
      case "geofence":
        return <GeofenceSection params={params} vehicleState={vehicleState} />;
      case "arming":
        return (
          <ArmingSection
            params={params}
            connected={connected}
            vehicleState={vehicleState}
            support={support}
            sensorHealth={sensorHealth}
          />
        );
      case "initial_params":
        return <InitialParamsSection params={params} vehicleState={vehicleState} navigateToParam={navigateToParam} />;
      case "pid_tuning":
        return <PidTuningSection params={params} vehicleState={vehicleState} />;
      case "peripherals":
        return <PeripheralsSection params={params} />;
      case "full_parameters":
        return (
          <FullParametersSection
            params={params}
            connected={connected}
            highlightParam={pendingHighlightParam}
            onHighlightHandled={handleHighlightHandled}
          />
        );
    }
  })();

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {isMobile && (
        <div className="flex items-center gap-3 border-b border-border px-3 py-2">
          <button
            onClick={() => setDrawerOpen(true)}
            className="rounded p-1 text-text-muted hover:text-text-primary transition-colors"
          >
            <Menu size={16} />
          </button>
          <Wrench size={16} className="text-accent shrink-0" />
          <h2 className="text-sm font-semibold text-text-primary">Setup</h2>
          <span className="ml-auto flex items-center gap-1.5 text-[11px] text-text-muted">
            <ActiveIcon size={12} />
            {activeSectionMeta?.label}
          </span>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {isMobile ? (
          <>
            <div
              className={cn(
                "fixed inset-0 z-40 bg-black/50 transition-opacity duration-200",
                drawerOpen ? "opacity-100" : "pointer-events-none opacity-0",
              )}
              onClick={() => setDrawerOpen(false)}
            />

            <aside
              className={cn(
                "fixed inset-y-0 left-0 z-50 flex w-64 flex-col overflow-y-auto bg-bg-secondary shadow-xl transition-transform duration-200",
                drawerOpen ? "translate-x-0" : "-translate-x-full",
              )}
              style={{ paddingTop: "calc(var(--safe-area-top, 0px) + 0.25rem)" }}
            >
              <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                <span className="text-sm font-bold text-text-primary">Sections</span>
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="rounded p-1 text-text-muted hover:text-text-primary"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto py-2 px-1.5">
                <SectionNav
                  activeSection={effectiveSection}
                  onSelect={handleSelectSection}
                  collapsedGroups={collapsedGroups}
                  onToggleGroup={handleToggleGroup}
                  sectionStatuses={sectionStatuses}
                  setupReady={setupReady}
                />
              </div>
            </aside>

            <div ref={contentScrollRef} className="flex-1 overflow-y-auto">{sectionContent}</div>
          </>
        ) : (
          <>
            <div className="flex w-56 shrink-0 flex-col overflow-y-auto border-r border-border py-2 px-1.5">
              <SectionNav
                activeSection={effectiveSection}
                onSelect={handleSelectSection}
                collapsedGroups={collapsedGroups}
                onToggleGroup={handleToggleGroup}
                sectionStatuses={sectionStatuses}
                setupReady={setupReady}
              />
            </div>

            <div ref={contentScrollRef} className="flex-1 overflow-y-auto">{sectionContent}</div>
          </>
        )}
      </div>

      <StagedParamsBar params={params} onApplySuccess={handleStagedApplySuccess} />
    </div>
  );
}

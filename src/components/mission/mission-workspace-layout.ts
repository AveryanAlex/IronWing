import {
  createShellChromeState,
  deriveShellTier,
  resolveShellTier,
  shellBreakpoints,
  type ShellChromeState,
  type ShellTier,
} from "../../app/shell/chrome-state";
import type { MissionPlannerMode } from "../../lib/stores/mission-planner";

export type MissionWorkspaceLayoutMode = "wide" | "compact-wide" | "desktop" | "phone-segmented" | "phone-stack";
export type MissionWorkspaceSupportPlacement = "sidebar" | "below";
export type MissionWorkspacePhoneSegment = "map" | "plan";

export type MissionWorkspaceLayout = {
  mode: MissionWorkspaceLayoutMode;
  tier: ShellTier;
  width: number;
  height: number;
  tierMismatch: boolean;
  detailColumns: "split" | "stacked";
  supportPlacement: MissionWorkspaceSupportPlacement;
  showPhoneSegments: boolean;
  phoneSegmentDefault: MissionWorkspacePhoneSegment | null;
};

export type MissionWorkspaceChromeInput = Partial<Omit<ShellChromeState, "tier">> & {
  tier?: string | null;
};

const COMPACT_WIDE_HEIGHT_PX = 760;

export const missionWorkspaceFallbackChromeState = createShellChromeState(
  { sm: true, md: true, lg: true, xl: true },
  { width: 1440, height: 900 },
  "wide",
);

function normalizeDimension(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function deriveBreakpointFlags(width: number) {
  return {
    sm: width >= shellBreakpoints.sm,
    md: width >= shellBreakpoints.md,
    lg: width >= shellBreakpoints.lg,
    xl: width >= shellBreakpoints.xl,
  };
}

export function normalizeMissionWorkspaceChromeState(
  chrome: MissionWorkspaceChromeInput | null | undefined,
): ShellChromeState & { tierMismatch: boolean } {
  const width = normalizeDimension(chrome?.width, missionWorkspaceFallbackChromeState.width);
  const height = normalizeDimension(chrome?.height, missionWorkspaceFallbackChromeState.height);
  const flags = deriveBreakpointFlags(width);
  const derivedTier = deriveShellTier(flags);
  const reportedTier = resolveShellTier(chrome?.tier ?? null, derivedTier);

  return {
    ...flags,
    width,
    height,
    tier: derivedTier,
    vehiclePanelMode: derivedTier === "phone" ? "drawer" : "docked",
    tierMismatch: reportedTier !== derivedTier,
  };
}

export function resolveMissionWorkspaceLayout(
  chrome: MissionWorkspaceChromeInput | null | undefined,
  plannerMode: MissionPlannerMode,
): MissionWorkspaceLayout {
  const state = normalizeMissionWorkspaceChromeState(chrome);

  if (state.tier === "phone") {
    return {
      mode: plannerMode === "mission" ? "phone-segmented" : "phone-stack",
      tier: state.tier,
      width: state.width,
      height: state.height,
      tierMismatch: state.tierMismatch,
      detailColumns: "stacked",
      supportPlacement: "below",
      showPhoneSegments: plannerMode === "mission",
      phoneSegmentDefault: plannerMode === "mission" ? "plan" : null,
    };
  }

  if (state.tier === "wide" && state.height < COMPACT_WIDE_HEIGHT_PX) {
    return {
      mode: "compact-wide",
      tier: state.tier,
      width: state.width,
      height: state.height,
      tierMismatch: state.tierMismatch,
      detailColumns: "stacked",
      supportPlacement: "below",
      showPhoneSegments: false,
      phoneSegmentDefault: null,
    };
  }

  if (state.tier === "wide") {
    return {
      mode: "wide",
      tier: state.tier,
      width: state.width,
      height: state.height,
      tierMismatch: state.tierMismatch,
      detailColumns: "split",
      supportPlacement: "sidebar",
      showPhoneSegments: false,
      phoneSegmentDefault: null,
    };
  }

  return {
    mode: "desktop",
    tier: state.tier,
    width: state.width,
    height: state.height,
    tierMismatch: state.tierMismatch,
    detailColumns: "stacked",
    supportPlacement: "below",
    showPhoneSegments: false,
    phoneSegmentDefault: null,
  };
}

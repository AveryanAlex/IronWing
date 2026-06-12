import {
  createShellChromeState,
  type ShellTier,
} from "../../app/shell/chrome-state";
import {
  normalizeWorkspaceChromeState,
  type NormalizedWorkspaceChromeState,
  type WorkspaceChromeInput,
} from "../../app/shell/workspace-chrome";
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

export type MissionWorkspaceChromeInput = WorkspaceChromeInput;

const COMPACT_WIDE_HEIGHT_PX = 760;

export const missionWorkspaceFallbackChromeState = createShellChromeState(
  { sm: true, md: true, lg: true, xl: true },
  { width: 1440, height: 900 },
  "wide",
);

export function normalizeMissionWorkspaceChromeState(
  chrome: MissionWorkspaceChromeInput | null | undefined,
): NormalizedWorkspaceChromeState {
  return normalizeWorkspaceChromeState(chrome, missionWorkspaceFallbackChromeState);
}

export function resolveMissionWorkspaceLayout(
  chrome: MissionWorkspaceChromeInput | null | undefined,
  plannerMode: MissionPlannerMode,
): MissionWorkspaceLayout {
  const state = normalizeMissionWorkspaceChromeState(chrome);

  if (state.tier === "phone" || state.tier === "tablet") {
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

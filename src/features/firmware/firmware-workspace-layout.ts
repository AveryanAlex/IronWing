import {
  createShellChromeState,
  shellBreakpoints,
  type ShellTier,
} from "../../app/shell/chrome-state";
import {
  normalizeWorkspaceChromeState,
  type NormalizedWorkspaceChromeState,
  type WorkspaceChromeInput,
} from "../../app/shell/workspace-chrome";

export type FirmwareWorkspaceLayoutMode =
  | "desktop-wide"
  | "desktop"
  | "browse-radiomaster"
  | "browse-phone";

export type FirmwareWorkspaceBlockedReason =
  | "viewport_unsettled"
  | "radiomaster_viewport"
  | "phone_viewport";

export type FirmwareWorkspaceChromeInput = WorkspaceChromeInput;

export type FirmwareWorkspaceLayout = {
  mode: FirmwareWorkspaceLayoutMode;
  tier: ShellTier;
  width: number;
  height: number;
  tierMismatch: boolean;
  panelColumns: "split" | "stacked";
  actionsEnabled: boolean;
  blockedReason: FirmwareWorkspaceBlockedReason | null;
  blockedTitle: string | null;
  blockedDetail: string | null;
};

const DESKTOP_MIN_WIDTH_PX = shellBreakpoints.lg;
const DESKTOP_MIN_HEIGHT_PX = 760;

export const firmwareWorkspaceFallbackChromeState = createShellChromeState(
  { sm: true, md: true, lg: true, xl: true },
  { width: 1440, height: 900 },
  "wide",
);

function blockedCopy(reason: FirmwareWorkspaceBlockedReason) {
  switch (reason) {
    case "viewport_unsettled":
      return {
        title: "Browse-only until the viewport settles",
        detail: "Shell tier and viewport dimensions disagree, so firmware install/update stays blocked until desktop-sized layout is confirmed.",
      };
    case "phone_viewport":
      return {
        title: "Browse-only on phone widths",
        detail: "You can search targets, inspect catalog entries, and review outcomes here, but firmware and bootloader write actions stay desktop-only.",
      };
    case "radiomaster_viewport":
      return {
        title: "Browse-only on constrained widths",
        detail: "Radiomaster-sized and other short desktop layouts keep catalog and outcome surfaces visible, but firmware start remains desktop-only.",
      };
  }
}

export function normalizeFirmwareWorkspaceChromeState(
  chrome: FirmwareWorkspaceChromeInput | null | undefined,
): NormalizedWorkspaceChromeState {
  return normalizeWorkspaceChromeState(chrome, firmwareWorkspaceFallbackChromeState);
}

export function resolveFirmwareWorkspaceLayout(
  chrome: FirmwareWorkspaceChromeInput | null | undefined,
): FirmwareWorkspaceLayout {
  const state = normalizeFirmwareWorkspaceChromeState(chrome);

  const phoneViewport = state.width < shellBreakpoints.md;
  const constrainedViewport = state.width < DESKTOP_MIN_WIDTH_PX || state.height < DESKTOP_MIN_HEIGHT_PX;
  const blockedReason = state.tierMismatch
    ? "viewport_unsettled"
    : phoneViewport
      ? "phone_viewport"
      : constrainedViewport
        ? "radiomaster_viewport"
        : null;

  const copy = blockedReason ? blockedCopy(blockedReason) : null;
  const actionsEnabled = blockedReason === null;
  const panelColumns = actionsEnabled && state.width >= shellBreakpoints.xl ? "split" : "stacked";

  return {
    mode: blockedReason === "phone_viewport"
      ? "browse-phone"
      : blockedReason === null
        ? panelColumns === "split"
          ? "desktop-wide"
          : "desktop"
        : "browse-radiomaster",
    tier: state.tier,
    width: state.width,
    height: state.height,
    tierMismatch: state.tierMismatch,
    panelColumns,
    actionsEnabled,
    blockedReason,
    blockedTitle: copy?.title ?? null,
    blockedDetail: copy?.detail ?? null,
  };
}

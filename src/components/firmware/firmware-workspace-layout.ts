import {
  createShellChromeState,
  deriveShellTier,
  resolveShellTier,
  shellBreakpoints,
  type ShellChromeState,
  type ShellTier,
} from "../../app/shell/chrome-state";

export type FirmwareWorkspaceLayoutMode =
  | "desktop-wide"
  | "desktop"
  | "browse-radiomaster"
  | "browse-phone";

export type FirmwareWorkspaceBlockedReason =
  | "viewport_unsettled"
  | "radiomaster_viewport"
  | "phone_viewport";

export type FirmwareWorkspaceChromeInput = Partial<Omit<ShellChromeState, "tier">> & {
  tier?: string | null;
};

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

function blockedCopy(reason: FirmwareWorkspaceBlockedReason) {
  switch (reason) {
    case "viewport_unsettled":
      return {
        title: "Browse-only until the viewport settles",
        detail: "Shell tier and viewport dimensions disagree, so Install / Update stays blocked until desktop-sized layout is confirmed.",
      };
    case "phone_viewport":
      return {
        title: "Browse-only on phone widths",
        detail: "You can search targets, inspect catalog entries, and review outcomes here, but actual flash actions stay desktop-only.",
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
): ShellChromeState & { tierMismatch: boolean } {
  const width = normalizeDimension(chrome?.width, firmwareWorkspaceFallbackChromeState.width);
  const height = normalizeDimension(chrome?.height, firmwareWorkspaceFallbackChromeState.height);
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

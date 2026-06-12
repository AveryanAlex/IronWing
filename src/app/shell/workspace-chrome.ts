import {
  deriveShellTier,
  resolveShellTier,
  shellBreakpoints,
  type ShellChromeState,
} from "./chrome-state";

export type WorkspaceChromeInput = Partial<Omit<ShellChromeState, "tier">> & {
  tier?: string | null;
};

export type NormalizedWorkspaceChromeState = ShellChromeState & { tierMismatch: boolean };

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

export function normalizeWorkspaceChromeState(
  chrome: WorkspaceChromeInput | null | undefined,
  fallback: ShellChromeState,
): NormalizedWorkspaceChromeState {
  const width = normalizeDimension(chrome?.width, fallback.width);
  const height = normalizeDimension(chrome?.height, fallback.height);
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

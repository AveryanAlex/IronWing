import { readable, type Readable } from "svelte/store";

export const shellBreakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
} as const;

export const appShellTestIds = {
  tier: "app-shell-tier",
  drawerState: "app-shell-drawer-state",
  vehiclePanelButton: "app-shell-vehicle-panel-btn",
  vehiclePanelDrawer: "app-shell-vehicle-panel-drawer",
  vehiclePanelBackdrop: "app-shell-vehicle-panel-backdrop",
  vehiclePanelClose: "app-shell-vehicle-panel-close",
  sessionPhase: "app-shell-session-phase",
  sessionSource: "app-shell-session-source",
  sessionEnvelope: "app-shell-session-envelope",
} as const;

export type ShellTier = "phone" | "tablet" | "desktop" | "wide";
export type VehiclePanelMode = "drawer" | "docked";

type BreakpointFlags = {
  sm: boolean;
  md: boolean;
  lg: boolean;
  xl: boolean;
};

export type ShellChromeState = BreakpointFlags & {
  width: number;
  height: number;
  tier: ShellTier;
  vehiclePanelMode: VehiclePanelMode;
};

type WindowLike = Pick<Window, "innerHeight" | "innerWidth" | "addEventListener" | "removeEventListener"> & {
  matchMedia?: typeof window.matchMedia;
};

type MediaQueryListLike = {
  addEventListener?: (type: "change", listener: () => void) => void;
  removeEventListener?: (type: "change", listener: () => void) => void;
  addListener?: (listener: () => void) => void;
  removeListener?: (listener: () => void) => void;
};

const desktopSafeDimensions = {
  width: shellBreakpoints.xl,
  height: 720,
} as const;

function resolveBreakpointFlagsFromWidth(width: number): BreakpointFlags {
  return {
    sm: width >= shellBreakpoints.sm,
    md: width >= shellBreakpoints.md,
    lg: width >= shellBreakpoints.lg,
    xl: width >= shellBreakpoints.xl,
  };
}

export function resolveShellTier(tier: string | null | undefined, fallback: ShellTier): ShellTier {
  switch (tier) {
    case "phone":
    case "tablet":
    case "desktop":
    case "wide":
      return tier;
    default:
      return fallback;
  }
}

export function deriveShellTier(flags: BreakpointFlags): ShellTier {
  if (flags.xl) {
    return "wide";
  }

  if (flags.lg) {
    return "desktop";
  }

  if (flags.md) {
    return "tablet";
  }

  return "phone";
}

export function createShellChromeState(
  flags: Partial<BreakpointFlags>,
  dimensions: { width?: number; height?: number } = {},
  tierOverride?: string | null,
): ShellChromeState {
  const width = Number.isFinite(dimensions.width) ? Number(dimensions.width) : desktopSafeDimensions.width;
  const height = Number.isFinite(dimensions.height) ? Number(dimensions.height) : desktopSafeDimensions.height;
  const canonicalFlags: BreakpointFlags = {
    sm: Boolean(flags.sm),
    md: Boolean(flags.md),
    lg: Boolean(flags.lg),
    xl: Boolean(flags.xl),
  };
  const tier = resolveShellTier(tierOverride, deriveShellTier(canonicalFlags));

  return {
    ...canonicalFlags,
    width,
    height,
    tier,
    vehiclePanelMode: tier === "phone" ? "drawer" : "docked",
  };
}

function readShellChromeState(target: WindowLike | undefined) {
  if (!target) {
    return createShellChromeState(resolveBreakpointFlagsFromWidth(desktopSafeDimensions.width), desktopSafeDimensions);
  }

  const width = Number.isFinite(target.innerWidth) ? target.innerWidth : desktopSafeDimensions.width;
  const height = Number.isFinite(target.innerHeight) ? target.innerHeight : desktopSafeDimensions.height;

  if (typeof target.matchMedia !== "function") {
    return createShellChromeState(resolveBreakpointFlagsFromWidth(width), { width, height });
  }

  return createShellChromeState(
    {
      sm: target.matchMedia(`(min-width: ${shellBreakpoints.sm}px)`).matches,
      md: target.matchMedia(`(min-width: ${shellBreakpoints.md}px)`).matches,
      lg: target.matchMedia(`(min-width: ${shellBreakpoints.lg}px)`).matches,
      xl: target.matchMedia(`(min-width: ${shellBreakpoints.xl}px)`).matches,
    },
    { width, height },
  );
}

function listenToQuery(query: MediaQueryListLike, notify: () => void) {
  if (typeof query.addEventListener === "function" && typeof query.removeEventListener === "function") {
    query.addEventListener("change", notify);
    return () => query.removeEventListener?.("change", notify);
  }

  if (typeof query.addListener === "function" && typeof query.removeListener === "function") {
    query.addListener(notify);
    return () => query.removeListener?.(notify);
  }

  return () => {};
}

export function createShellChromeStore(target: WindowLike | undefined = typeof window === "undefined" ? undefined : window): Readable<ShellChromeState> {
  return readable(readShellChromeState(target), (set) => {
    if (!target) {
      return () => {};
    }

    const sync = () => {
      set(readShellChromeState(target));
    };

    if (typeof target.matchMedia !== "function") {
      target.addEventListener("resize", sync);
      sync();
      return () => {
        target.removeEventListener("resize", sync);
      };
    }

    const queries = [
      target.matchMedia(`(min-width: ${shellBreakpoints.sm}px)`),
      target.matchMedia(`(min-width: ${shellBreakpoints.md}px)`),
      target.matchMedia(`(min-width: ${shellBreakpoints.lg}px)`),
      target.matchMedia(`(min-width: ${shellBreakpoints.xl}px)`),
    ];
    const detach = queries.map((query) => listenToQuery(query, sync));

    target.addEventListener("resize", sync);
    sync();

    return () => {
      for (const stop of detach) {
        stop();
      }
      target.removeEventListener("resize", sync);
    };
  });
}

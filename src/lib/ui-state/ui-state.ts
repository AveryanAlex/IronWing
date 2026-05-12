import { readIronwingJson, writeIronwingJson } from "./ironwing-storage";
import type { LocalStorageLike } from "../local-storage";
import type { AppShellWorkspace } from "../../app/shell/app-shell-controller";

// Workspaces are inlined here (rather than imported from app-shell-controller)
// to keep ui-state free of cycles: app-shell-controller imports createUiStateStore
// during AppShell bootstrap, so any import edge back from ui-state would create
// a circular module graph that triggers undefined-at-init failures.
const VALID_WORKSPACES: ReadonlySet<AppShellWorkspace> = new Set<AppShellWorkspace>([
  "overview",
  "telemetry",
  "hud",
  "mission",
  "logs",
  "firmware",
  "setup",
  "settings",
]);

export type MissionMode = "mission" | "fence" | "rally";
export type MissionSegment = "map" | "plan";
export type OverviewFollow = "vehicle" | "home" | "device" | null;

export type UiStateStore = ReturnType<typeof createUiStateStore>;

export function createUiStateStore(opts: { storage?: LocalStorageLike | null } = {}) {
  const storage = opts.storage;

  function isWorkspace(value: unknown): value is AppShellWorkspace {
    return typeof value === "string" && VALID_WORKSPACES.has(value as AppShellWorkspace);
  }

  return {
    getActiveWorkspace(): AppShellWorkspace {
      const stored = readIronwingJson("ui.workspace", storage);
      return isWorkspace(stored) ? stored : "overview";
    },
    setActiveWorkspace(workspace: AppShellWorkspace): void {
      writeIronwingJson("ui.workspace", workspace, storage);
    },
    getOverviewFollow(): OverviewFollow {
      const stored = readIronwingJson("ui.overview.follow", storage);
      if (stored === "vehicle" || stored === "home" || stored === "device") return stored;
      return null;
    },
    setOverviewFollow(value: OverviewFollow): void {
      writeIronwingJson("ui.overview.follow", value, storage);
    },
    getSetupSection(familyKey: string): string | null {
      if (!familyKey) return null;
      const stored = readIronwingJson(`ui.setup.section.${familyKey}`, storage);
      return typeof stored === "string" ? stored : null;
    },
    setSetupSection(familyKey: string, section: string): void {
      if (!familyKey) return;
      writeIronwingJson(`ui.setup.section.${familyKey}`, section, storage);
    },
    getMissionMode(): MissionMode {
      const stored = readIronwingJson("ui.mission.mode", storage);
      if (stored === "fence" || stored === "rally" || stored === "mission") return stored;
      return "mission";
    },
    setMissionMode(mode: MissionMode): void {
      writeIronwingJson("ui.mission.mode", mode, storage);
    },
    getMissionSegment(): MissionSegment {
      const stored = readIronwingJson("ui.mission.segment", storage);
      if (stored === "plan" || stored === "map") return stored;
      return "map";
    },
    setMissionSegment(segment: MissionSegment): void {
      writeIronwingJson("ui.mission.segment", segment, storage);
    },
  };
}

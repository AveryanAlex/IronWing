import { readIronwingJson, writeIronwingJson } from "./ironwing-storage";
import type { LocalStorageLike } from "../local-storage";

export type MissionMode = "mission" | "fence" | "rally";
export type MissionSegment = "map" | "plan";
export type OverviewFollow = "vehicle" | "home" | "device" | null;

export type UiStateStore = ReturnType<typeof createUiStateStore>;

export function createUiStateStore(opts: { storage?: LocalStorageLike | null } = {}) {
  const storage = opts.storage;

  return {
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

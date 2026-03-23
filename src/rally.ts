import { invoke } from "@platform/core";

export type { RallyPlan } from "./lib/mavkit-types";

import type { RallyPlan } from "./lib/mavkit-types";

export async function uploadRally(plan: RallyPlan): Promise<void> {
  await invoke("rally_upload", { plan });
}

export async function downloadRally(): Promise<RallyPlan> {
  return invoke<RallyPlan>("rally_download");
}

export async function clearRally(): Promise<void> {
  await invoke("rally_clear");
}

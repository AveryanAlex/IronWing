import { typedInvoke } from "./lib/ipc/client";

export type { RallyPlan } from "./lib/mavkit-types";

import type { RallyPlan } from "./lib/mavkit-types";

export async function uploadRally(plan: RallyPlan): Promise<void> {
  await typedInvoke("rally_upload", { plan });
}

export async function downloadRally(): Promise<RallyPlan> {
  return typedInvoke("rally_download");
}

export async function clearRally(): Promise<void> {
  await typedInvoke("rally_clear");
}

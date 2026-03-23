import { invoke } from "@platform/core";

export type {
  FencePlan,
  FenceRegion,
  FenceInclusionPolygon,
  FenceExclusionPolygon,
  FenceInclusionCircle,
  FenceExclusionCircle,
} from "./lib/mavkit-types";

import type { FencePlan } from "./lib/mavkit-types";

export async function uploadFence(plan: FencePlan): Promise<void> {
  await invoke("fence_upload", { plan });
}

export async function downloadFence(): Promise<FencePlan> {
  return invoke<FencePlan>("fence_download");
}

export async function clearFence(): Promise<void> {
  await invoke("fence_clear");
}

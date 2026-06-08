import { typedInvoke } from "./lib/ipc/client";

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
  await typedInvoke("fence_upload", { plan });
}

export async function downloadFence(): Promise<FencePlan> {
  return typedInvoke("fence_download");
}

export async function clearFence(): Promise<void> {
  await typedInvoke("fence_clear");
}

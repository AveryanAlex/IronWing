import type { TypedDraftItem } from "../../lib/mission-draft-typed";

export function findNearestWaypoint(
  items: TypedDraftItem[],
  lat: number,
  lng: number,
): number | null {
  let nearest: number | null = null;
  let minDist = Infinity;
  for (const item of items) {
    if (item.preview.latitude_deg === null || item.preview.longitude_deg === null) continue;
    const d = Math.hypot(item.preview.latitude_deg - lat, item.preview.longitude_deg - lng);
    if (d < minDist && d < 0.001) {
      minDist = d;
      nearest = item.index;
    }
  }
  return nearest;
}

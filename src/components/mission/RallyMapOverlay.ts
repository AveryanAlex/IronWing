import maplibregl, { type Map as MapLibreMap, type Marker } from "maplibre-gl";
import type { GeoPoint3d } from "../../lib/mavkit-types";
import { geoPoint3dLatLon } from "../../lib/mavkit-types";

export function syncRallyMarkers(
  map: MapLibreMap,
  markersRef: Map<number, Marker>,
  points: Array<{ index: number; point: GeoPoint3d }>,
  selectedIndex: number | null,
  readOnly: boolean,
  onSelect: (index: number) => void,
  onMove: (index: number, lat: number, lon: number) => void,
): void {
  const nextIndexes = new Set(points.map((p) => p.index));

  // Remove stale markers
  for (const [index, marker] of markersRef.entries()) {
    if (!nextIndexes.has(index)) {
      marker.remove();
      markersRef.delete(index);
    }
  }

  for (const { index, point } of points) {
    const { latitude_deg, longitude_deg } = geoPoint3dLatLon(point);
    const lngLat: [number, number] = [longitude_deg, latitude_deg];
    const isDraggable = !readOnly;

    const existing = markersRef.get(index);

    // Recreate if draggable state changed
    if (existing && existing.isDraggable() !== isDraggable) {
      existing.remove();
      markersRef.delete(index);
    }

    const reusable = markersRef.get(index);

    if (reusable) {
      reusable.setLngLat(lngLat);
      reusable.setDraggable(isDraggable);
    } else {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "rally-pin";

      el.addEventListener("click", (e) => {
        e.stopPropagation();
        onSelect(index);
      });

      const marker = new maplibregl.Marker({
        element: el,
        anchor: "center",
        draggable: isDraggable,
      })
        .setLngLat(lngLat)
        .addTo(map);

      if (isDraggable) {
        marker.on("dragend", () => {
          const pos = marker.getLngLat();
          onMove(index, pos.lat, pos.lng);
        });
      }

      markersRef.set(index, marker);
    }

    // Update element content and selection state
    const markerEl = markersRef.get(index)?.getElement();
    if (markerEl) {
      markerEl.textContent = String(index + 1);
      markerEl.classList.toggle("is-selected", selectedIndex === index);
    }
  }
}

export function clearRallyMarkers(markersRef: Map<number, Marker>): void {
  for (const marker of markersRef.values()) {
    marker.remove();
  }
  markersRef.clear();
}

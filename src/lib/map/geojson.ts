export type LineStringPoint =
  | readonly [longitude: number, latitude: number]
  | { lat: number; lon: number }
  | { latitude_deg: number; longitude_deg: number };

export function buildLineStringFeature<P extends GeoJSON.GeoJsonProperties = GeoJSON.GeoJsonProperties>(
  points: readonly LineStringPoint[],
  properties = {} as P,
): GeoJSON.Feature<GeoJSON.LineString, P> {
  return {
    type: "Feature",
    properties,
    geometry: {
      type: "LineString",
      coordinates: points.map(pointToLngLat),
    },
  };
}

function pointToLngLat(point: LineStringPoint): [number, number] {
  if (Array.isArray(point)) {
    return [point[0], point[1]];
  }

  if ("longitude_deg" in point) {
    return [point.longitude_deg, point.latitude_deg];
  }

  if ("lon" in point) {
    return [point.lon, point.lat];
  }

  return [point[0], point[1]];
}

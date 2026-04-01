import { bearingDistance, latLonToLocalXY, localXYToLatLon } from "./mission-coordinates";
import {
  commandPosition,
  geoPoint3dLatLon,
  type GeoPoint2d,
  type MissionItem,
} from "./mavkit-types";
import type { ImageFootprint } from "./survey-camera";
import type { SurveyStats, SurveyTransect } from "./survey-grid";

export type FormattedSurveyStats = {
  gsd: string;
  photoCount: string;
  area: string;
  triggerDistance: string;
  laneSpacing: string;
  laneCount: string;
  crosshatchLaneCount: string;
  flightTime: string;
};

export type SurveyTransectFeatureProperties = {
  kind: "primary" | "crosshatch";
  index: number;
};

export const FOOTPRINT_LOD_THRESHOLD = 500;

const PHOTO_COUNT_EPSILON_M = 1e-9;
const COUNT_FORMATTER = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});
const DISTANCE_FORMATTER = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const GSD_CM_FORMATTER = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const AREA_KM2_FORMATTER = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

type LocalPoint = { x: number; y: number };

type LocalSegment = {
  start: LocalPoint;
  end: LocalPoint;
  length_m: number;
};

export function surveyPhotocenters(
  transects: SurveyTransect[],
  triggerDistance_m: number,
): GeoPoint2d[][] {
  if (!Number.isFinite(triggerDistance_m) || triggerDistance_m <= 0 || transects.length === 0) {
    return [];
  }

  return transects.map((transect) => sampleTransectPhotocenters(transect, triggerDistance_m));
}

export function surveyFootprints(
  photocenters: GeoPoint2d[][],
  footprint: ImageFootprint,
  trackAngle_deg: number,
): GeoJSON.Feature<GeoJSON.Polygon>[] {
  if (!isFinitePositive(footprint.width_m) || !isFinitePositive(footprint.height_m)) {
    return [];
  }

  const halfWidth_m = footprint.width_m / 2;
  const halfHeight_m = footprint.height_m / 2;

  return photocenters.flatMap((transectCenters, transectIndex) =>
    transectCenters.map((center, photoIndex) => ({
      type: "Feature",
      properties: {
        transectIndex,
        photoIndex,
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            offsetCoordinate(center, -halfWidth_m, -halfHeight_m, trackAngle_deg),
            offsetCoordinate(center, halfWidth_m, -halfHeight_m, trackAngle_deg),
            offsetCoordinate(center, halfWidth_m, halfHeight_m, trackAngle_deg),
            offsetCoordinate(center, -halfWidth_m, halfHeight_m, trackAngle_deg),
            offsetCoordinate(center, -halfWidth_m, -halfHeight_m, trackAngle_deg),
          ],
        ],
      },
    })),
  );
}

export function surveySwathBands(
  transects: SurveyTransect[],
  laneSpacing_m: number,
  trackAngle_deg: number,
): GeoJSON.Feature<GeoJSON.Polygon>[] {
  if (!isFinitePositive(laneSpacing_m)) {
    return [];
  }

  const halfWidth_m = laneSpacing_m / 2;
  const acrossUnit = acrossTrackUnit(trackAngle_deg);

  return transects.flatMap((transect, index) => {
    if (transect.length < 2) {
      return [];
    }

    const start = transect[0];
    const end = transect[transect.length - 1];
    const ref = midpoint(start, end);
    const startLocal = latLonToLocalXY(ref, start.latitude_deg, start.longitude_deg);
    const endLocal = latLonToLocalXY(ref, end.latitude_deg, end.longitude_deg);

    const leftStart = localXYToLatLon(
      ref,
      startLocal.x_m - acrossUnit.x * halfWidth_m,
      startLocal.y_m - acrossUnit.y * halfWidth_m,
    );
    const rightStart = localXYToLatLon(
      ref,
      startLocal.x_m + acrossUnit.x * halfWidth_m,
      startLocal.y_m + acrossUnit.y * halfWidth_m,
    );
    const rightEnd = localXYToLatLon(
      ref,
      endLocal.x_m + acrossUnit.x * halfWidth_m,
      endLocal.y_m + acrossUnit.y * halfWidth_m,
    );
    const leftEnd = localXYToLatLon(
      ref,
      endLocal.x_m - acrossUnit.x * halfWidth_m,
      endLocal.y_m - acrossUnit.y * halfWidth_m,
    );

    return [{
      type: "Feature",
      properties: {
        kind: "swath_band",
        index,
      },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [leftStart.lon, leftStart.lat],
          [rightStart.lon, rightStart.lat],
          [rightEnd.lon, rightEnd.lat],
          [leftEnd.lon, leftEnd.lat],
          [leftStart.lon, leftStart.lat],
        ]],
      },
    }];
  });
}

export function surveyTransectsToGeoJson(
  transects: SurveyTransect[],
  crosshatchTransects: SurveyTransect[],
): GeoJSON.FeatureCollection<GeoJSON.LineString, SurveyTransectFeatureProperties> {
  const features: GeoJSON.Feature<GeoJSON.LineString, SurveyTransectFeatureProperties>[] = [
    ...transects.map((transect, index) => transectToFeature(transect, "primary", index)),
    ...crosshatchTransects.map((transect, index) => transectToFeature(transect, "crosshatch", index)),
  ];

  return {
    type: "FeatureCollection",
    features,
  };
}

export function formatSurveyStats(
  stats: SurveyStats,
  flightTime_s: number | null,
): FormattedSurveyStats {
  return {
    gsd: Number.isFinite(stats.gsd_m)
      ? `${GSD_CM_FORMATTER.format(stats.gsd_m * 100)} cm/px`
      : "—",
    photoCount: formatCount(stats.photoCount),
    area: formatArea(stats.area_m2),
    triggerDistance: formatDistanceMeters(stats.triggerDistance_m),
    laneSpacing: formatDistanceMeters(stats.laneSpacing_m),
    laneCount: formatCount(stats.laneCount),
    crosshatchLaneCount: formatCount(stats.crosshatchLaneCount),
    flightTime: formatDurationMinSec(flightTime_s),
  };
}

export function estimateSurveyFlightTime(
  items: MissionItem[],
  cruiseSpeed_mps: number,
): number {
  if (!Number.isFinite(cruiseSpeed_mps) || cruiseSpeed_mps <= 0) {
    return 0;
  }

  const positions = items
    .map((item) => commandPosition(item.command))
    .filter((position): position is NonNullable<ReturnType<typeof commandPosition>> => position !== null)
    .map((position) => geoPoint3dLatLon(position));

  if (positions.length < 2) {
    return 0;
  }

  let totalDistance_m = 0;
  for (let index = 1; index < positions.length; index += 1) {
    totalDistance_m += bearingDistance(
      positions[index - 1],
      positions[index].latitude_deg,
      positions[index].longitude_deg,
    ).distance_m;
  }

  return totalDistance_m / cruiseSpeed_mps;
}

export function shouldUseSwathLod(photoCount: number): boolean {
  return Number.isFinite(photoCount) && photoCount >= FOOTPRINT_LOD_THRESHOLD;
}

function sampleTransectPhotocenters(
  transect: SurveyTransect,
  triggerDistance_m: number,
): GeoPoint2d[] {
  if (transect.length < 2) {
    return [];
  }

  const ref = transect[0];
  const localPoints = transect.map((point) => {
    const { x_m, y_m } = latLonToLocalXY(ref, point.latitude_deg, point.longitude_deg);
    return { x: x_m, y: y_m };
  });
  const segments = buildSegments(localPoints);
  const totalLength_m = segments.reduce((sum, segment) => sum + segment.length_m, 0);
  if (totalLength_m <= 0) {
    return [];
  }

  const photoCount = Math.max(
    1,
    Math.floor((totalLength_m + PHOTO_COUNT_EPSILON_M) / triggerDistance_m) + 1,
  );

  return Array.from({ length: photoCount }, (_, index) => {
    const targetDistance_m = Math.min(index * triggerDistance_m, totalLength_m);
    const point = pointAlongSegments(segments, targetDistance_m);
    const { lat, lon } = localXYToLatLon(ref, point.x, point.y);
    return {
      latitude_deg: lat,
      longitude_deg: lon,
    };
  });
}

function buildSegments(points: LocalPoint[]): LocalSegment[] {
  const segments: LocalSegment[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const length_m = Math.hypot(end.x - start.x, end.y - start.y);
    if (length_m <= 0) {
      continue;
    }
    segments.push({ start, end, length_m });
  }
  return segments;
}

function pointAlongSegments(segments: LocalSegment[], targetDistance_m: number): LocalPoint {
  if (segments.length === 0) {
    return { x: 0, y: 0 };
  }

  let traversed_m = 0;
  for (const segment of segments) {
    const nextTraversed_m = traversed_m + segment.length_m;
    if (targetDistance_m <= nextTraversed_m) {
      const distanceIntoSegment_m = targetDistance_m - traversed_m;
      const ratio = segment.length_m === 0 ? 0 : distanceIntoSegment_m / segment.length_m;
      return {
        x: segment.start.x + (segment.end.x - segment.start.x) * ratio,
        y: segment.start.y + (segment.end.y - segment.start.y) * ratio,
      };
    }
    traversed_m = nextTraversed_m;
  }

  const lastSegment = segments[segments.length - 1];
  return lastSegment.end;
}

function transectToFeature(
  transect: SurveyTransect,
  kind: SurveyTransectFeatureProperties["kind"],
  index: number,
): GeoJSON.Feature<GeoJSON.LineString, SurveyTransectFeatureProperties> {
  return {
    type: "Feature",
    properties: { kind, index },
    geometry: {
      type: "LineString",
      coordinates: transect.map((point) => [point.longitude_deg, point.latitude_deg]),
    },
  };
}

function offsetCoordinate(
  center: GeoPoint2d,
  acrossOffset_m: number,
  alongOffset_m: number,
  trackAngle_deg: number,
): [number, number] {
  const { x, y } = localOffset(acrossOffset_m, alongOffset_m, trackAngle_deg);
  const { lat, lon } = localXYToLatLon(center, x, y);
  return [lon, lat];
}

function localOffset(
  acrossOffset_m: number,
  alongOffset_m: number,
  trackAngle_deg: number,
): LocalPoint {
  const angle_rad = (trackAngle_deg * Math.PI) / 180;
  const along = { x: Math.sin(angle_rad), y: Math.cos(angle_rad) };
  const across = acrossTrackUnit(trackAngle_deg);
  return {
    x: along.x * alongOffset_m + across.x * acrossOffset_m,
    y: along.y * alongOffset_m + across.y * acrossOffset_m,
  };
}

function acrossTrackUnit(trackAngle_deg: number): LocalPoint {
  const angle_rad = (trackAngle_deg * Math.PI) / 180;
  return {
    x: Math.cos(angle_rad),
    y: -Math.sin(angle_rad),
  };
}

function midpoint(a: GeoPoint2d, b: GeoPoint2d): GeoPoint2d {
  return {
    latitude_deg: (a.latitude_deg + b.latitude_deg) / 2,
    longitude_deg: (a.longitude_deg + b.longitude_deg) / 2,
  };
}

function formatCount(value: number): string {
  return Number.isFinite(value) ? COUNT_FORMATTER.format(Math.round(value)) : "—";
}

function formatDistanceMeters(value: number): string {
  return Number.isFinite(value) ? `${DISTANCE_FORMATTER.format(value)} m` : "—";
}

function formatArea(area_m2: number): string {
  if (!Number.isFinite(area_m2)) {
    return "—";
  }
  if (area_m2 >= 1_000_000) {
    return `${AREA_KM2_FORMATTER.format(area_m2 / 1_000_000)} km²`;
  }
  return `${COUNT_FORMATTER.format(Math.round(area_m2))} m²`;
}

function formatDurationMinSec(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) {
    return "—";
  }

  const roundedSeconds = Math.round(seconds);
  const minutes = Math.floor(roundedSeconds / 60);
  const remainderSeconds = roundedSeconds % 60;
  return `${minutes}:${String(remainderSeconds).padStart(2, "0")}`;
}

function isFinitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

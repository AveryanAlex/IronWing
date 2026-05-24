import type { LightSpecification, Map as MapLibreMap, SkySpecification } from "maplibre-gl";

export type SvsAtmosphereInput = {
  latitudeDeg: number;
  longitudeDeg: number;
  time?: Date;
};

export type SvsSolarPosition = {
  azimuthDeg: number;
  elevationDeg: number;
};

export type SvsAtmosphereState = {
  light: LightSpecification;
  night: boolean;
  sky: SkySpecification;
  sun: SvsSolarPosition;
};

const NIGHT_ELEVATION_DEG = -6;

export function applySvsAtmosphere(
  map: MapLibreMap,
  input: SvsAtmosphereInput,
): SvsAtmosphereState {
  const state = resolveSvsAtmosphere(input);
  map.setLight(state.light);
  map.setSky(state.sky);
  return state;
}

export function resolveSvsAtmosphere(input: SvsAtmosphereInput): SvsAtmosphereState {
  const sun = computeSvsSunPosition(input);
  const night = sun.elevationDeg <= NIGHT_ELEVATION_DEG;
  const dawnAmount = smoothstep(-8, 4, sun.elevationDeg);
  const dayAmount = smoothstep(4, 24, sun.elevationDeg);
  const daylightAmount = smoothstep(NIGHT_ELEVATION_DEG, 20, sun.elevationDeg);

  const sky: SkySpecification = {
    "sky-color": mixHex(mixHex("#050917", "#294c8f", dawnAmount), "#199ef3", dayAmount),
    "sky-horizon-blend": lerp(0.35, 0.72, daylightAmount),
    "horizon-color": mixHex(mixHex("#111827", "#f3a45f", dawnAmount), "#f0f8ff", dayAmount),
    "fog-color": mixHex(mixHex("#07111f", "#6c86ad", dawnAmount), "#9ec7e8", dayAmount),
    "fog-ground-blend": lerp(0.25, 0.6, daylightAmount),
    "horizon-fog-blend": lerp(0.45, 0.8, daylightAmount),
    "atmosphere-blend": lerp(0.18, 0.82, daylightAmount),
  };

  const light: LightSpecification = {
    anchor: "map",
    color: mixHex(mixHex("#a9b7da", "#ffc078", dawnAmount), "#fff6e5", dayAmount),
    intensity: night ? 0.12 : lerp(0.2, 0.85, smoothstep(-4, 30, sun.elevationDeg)),
    position: night
      ? [1.15, 0, 0]
      : [1.15, sun.azimuthDeg, clamp(90 - sun.elevationDeg, 0, 180)],
  };

  return { light, night, sky, sun };
}

export function computeSvsSunPosition(input: SvsAtmosphereInput): SvsSolarPosition {
  const latitudeDeg = clamp(input.latitudeDeg, -89.8, 89.8);
  const longitudeDeg = normalizeLongitude(input.longitudeDeg);
  const time = Number.isFinite(input.time?.getTime()) ? input.time! : new Date();
  const julianCentury = (time.getTime() / 86_400_000 + 2_440_587.5 - 2_451_545) / 36_525;

  const geomMeanLongSun = normalizeDegrees(
    280.46646 + julianCentury * (36_000.76983 + julianCentury * 0.0003032),
  );
  const geomMeanAnomalySun = 357.52911 + julianCentury * (35_999.05029 - 0.0001537 * julianCentury);
  const eccentricity = 0.016708634 - julianCentury * (0.000042037 + 0.0000001267 * julianCentury);
  const anomalyRad = degToRad(geomMeanAnomalySun);
  const sunEquationOfCenter = Math.sin(anomalyRad) * (1.914602 - julianCentury * (0.004817 + 0.000014 * julianCentury))
    + Math.sin(2 * anomalyRad) * (0.019993 - 0.000101 * julianCentury)
    + Math.sin(3 * anomalyRad) * 0.000289;
  const sunTrueLong = geomMeanLongSun + sunEquationOfCenter;
  const omega = 125.04 - 1934.136 * julianCentury;
  const sunAppLong = sunTrueLong - 0.00569 - 0.00478 * Math.sin(degToRad(omega));
  const meanObliquity = 23 + (26 + (21.448 - julianCentury * (46.815 + julianCentury * (0.00059 - julianCentury * 0.001813))) / 60) / 60;
  const obliquityCorrection = meanObliquity + 0.00256 * Math.cos(degToRad(omega));
  const obliquityRad = degToRad(obliquityCorrection);
  const sunDeclinationRad = Math.asin(Math.sin(obliquityRad) * Math.sin(degToRad(sunAppLong)));
  const y = Math.tan(obliquityRad / 2) ** 2;
  const geomLongRad = degToRad(geomMeanLongSun);
  const equationOfTimeMin = 4 * radToDeg(
    y * Math.sin(2 * geomLongRad)
      - 2 * eccentricity * Math.sin(anomalyRad)
      + 4 * eccentricity * y * Math.sin(anomalyRad) * Math.cos(2 * geomLongRad)
      - 0.5 * y * y * Math.sin(4 * geomLongRad)
      - 1.25 * eccentricity * eccentricity * Math.sin(2 * anomalyRad),
  );
  const utcMinutes = time.getUTCHours() * 60 + time.getUTCMinutes() + time.getUTCSeconds() / 60 + time.getUTCMilliseconds() / 60_000;
  const trueSolarTimeMin = positiveModulo(utcMinutes + equationOfTimeMin + 4 * longitudeDeg, 1440);
  const hourAngleDeg = trueSolarTimeMin / 4 - 180;
  const hourAngleRad = degToRad(hourAngleDeg);
  const latitudeRad = degToRad(latitudeDeg);
  const cosZenith = clamp(
    Math.sin(latitudeRad) * Math.sin(sunDeclinationRad)
      + Math.cos(latitudeRad) * Math.cos(sunDeclinationRad) * Math.cos(hourAngleRad),
    -1,
    1,
  );
  const zenithRad = Math.acos(cosZenith);
  const elevationDeg = 90 - radToDeg(zenithRad);
  const correctedElevationDeg = elevationDeg + atmosphericRefractionDeg(elevationDeg);

  return {
    azimuthDeg: solarAzimuthDeg(latitudeRad, sunDeclinationRad, zenithRad, hourAngleDeg),
    elevationDeg: correctedElevationDeg,
  };
}

function solarAzimuthDeg(
  latitudeRad: number,
  declinationRad: number,
  zenithRad: number,
  hourAngleDeg: number,
): number {
  const denominator = Math.cos(latitudeRad) * Math.sin(zenithRad);
  if (Math.abs(denominator) < 1e-6) return 180;

  const azimuthRad = Math.acos(clamp(
    (Math.sin(latitudeRad) * Math.cos(zenithRad) - Math.sin(declinationRad)) / denominator,
    -1,
    1,
  ));
  const azimuthDeg = radToDeg(azimuthRad);
  return hourAngleDeg > 0 ? normalizeDegrees(azimuthDeg + 180) : normalizeDegrees(540 - azimuthDeg);
}

function atmosphericRefractionDeg(elevationDeg: number): number {
  if (elevationDeg > 85) return 0;

  const tangent = Math.tan(degToRad(elevationDeg));
  if (elevationDeg > 5) {
    return (58.1 / tangent - 0.07 / tangent ** 3 + 0.000086 / tangent ** 5) / 3600;
  }

  if (elevationDeg > -0.575) {
    return (1735 + elevationDeg * (-518.2 + elevationDeg * (103.4 + elevationDeg * (-12.79 + elevationDeg * 0.711)))) / 3600;
  }

  return (-20.774 / tangent) / 3600;
}

function mixHex(from: string, to: string, amount: number): string {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  const t = clamp(amount, 0, 1);
  return rgbToHex([
    Math.round(lerp(a[0], b[0], t)),
    Math.round(lerp(a[1], b[1], t)),
    Math.round(lerp(a[2], b[2], t)),
  ]);
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

function rgbToHex(rgb: [number, number, number]): string {
  return `#${rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function normalizeDegrees(value: number): number {
  return positiveModulo(value, 360);
}

function normalizeLongitude(value: number): number {
  return positiveModulo(Number.isFinite(value) ? value + 180 : 180, 360) - 180;
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function degToRad(degrees: number): number {
  return degrees * Math.PI / 180;
}

function radToDeg(radians: number): number {
  return radians * 180 / Math.PI;
}

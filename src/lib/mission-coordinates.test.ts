import { describe, it, expect } from "vitest";
import type { MissionItem, HomePosition } from "../mission";
import {
  degToDegE7,
  degE7ToDeg,
  itemLatDeg,
  itemLonDeg,
  itemLatLon,
  metersPerDegLon,
  latLonToLocalXY,
  localXYToLatLon,
  bearingDistance,
  latLonFromBearingDistance,
  itemOffsetFromHome,
  applyOffsetFromHome,
  itemOffsetFromPrevious,
  applyOffsetFromPrevious,
  itemBearingDistanceFromHome,
  itemBearingDistanceFromPrevious,
  parseLatitude,
  parseLongitude,
  parseDistance,
  parseBearing,
  parseOffset,
  formatDeg,
  formatDistance,
  formatBearing,
  isHomeValid,
  isItemCoordinateValid,
} from "./mission-coordinates";

function makeItem(latDeg: number, lonDeg: number, altM = 25): MissionItem {
  return {
    seq: 0,
    command: 16,
    frame: "global_relative_alt_int",
    current: false,
    autocontinue: true,
    param1: 0,
    param2: 0,
    param3: 0,
    param4: 0,
    x: Math.round(latDeg * 1e7),
    y: Math.round(lonDeg * 1e7),
    z: altM,
  };
}

function makeHome(lat: number, lon: number, alt = 0): HomePosition {
  return { latitude_deg: lat, longitude_deg: lon, altitude_m: alt };
}

// ---------------------------------------------------------------------------
// degE7 <-> decimal degree conversion
// ---------------------------------------------------------------------------

describe("degToDegE7 / degE7ToDeg", () => {
  it("round-trips Zurich coordinates", () => {
    const lat = 47.3769;
    const e7 = degToDegE7(lat);
    expect(e7).toBe(473769000);
    expect(degE7ToDeg(e7)).toBeCloseTo(lat, 6);
  });

  it("handles negative coordinates (southern hemisphere)", () => {
    const lat = -33.8688;
    const e7 = degToDegE7(lat);
    expect(e7).toBe(-338688000);
    expect(degE7ToDeg(e7)).toBeCloseTo(lat, 6);
  });

  it("handles zero", () => {
    expect(degToDegE7(0)).toBe(0);
    expect(degE7ToDeg(0)).toBe(0);
  });

  it("handles boundary values", () => {
    expect(degToDegE7(90)).toBe(900000000);
    expect(degToDegE7(-180)).toBe(-1800000000);
  });
});

// ---------------------------------------------------------------------------
// Mission item lat/lon extraction
// ---------------------------------------------------------------------------

describe("itemLatDeg / itemLonDeg / itemLatLon", () => {
  const item = makeItem(47.3769, 8.5417);

  it("extracts latitude", () => {
    expect(itemLatDeg(item)).toBeCloseTo(47.3769, 5);
  });

  it("extracts longitude", () => {
    expect(itemLonDeg(item)).toBeCloseTo(8.5417, 5);
  });

  it("extracts both as object", () => {
    const { lat, lon } = itemLatLon(item);
    expect(lat).toBeCloseTo(47.3769, 5);
    expect(lon).toBeCloseTo(8.5417, 5);
  });
});

// ---------------------------------------------------------------------------
// Flat-earth local tangent plane helpers
// ---------------------------------------------------------------------------

describe("metersPerDegLon", () => {
  it("at equator ≈ 111_320", () => {
    expect(metersPerDegLon(0)).toBeCloseTo(111_320, 0);
  });

  it("at 47° (Zurich) ≈ 75_900", () => {
    expect(metersPerDegLon(47)).toBeCloseTo(75_900, -2);
  });

  it("at 90° (pole) ≈ 0", () => {
    expect(metersPerDegLon(90)).toBeCloseTo(0, 0);
  });
});

describe("latLonToLocalXY", () => {
  const zurich = { latitude_deg: 47.3769, longitude_deg: 8.5417 };

  it("same point gives zero offset", () => {
    const { x_m, y_m } = latLonToLocalXY(zurich, 47.3769, 8.5417);
    expect(x_m).toBeCloseTo(0, 1);
    expect(y_m).toBeCloseTo(0, 1);
  });

  it("1 degree north ≈ 111_320 m in Y", () => {
    const { x_m, y_m } = latLonToLocalXY(zurich, 48.3769, 8.5417);
    expect(y_m).toBeCloseTo(111_320, -1);
    expect(x_m).toBeCloseTo(0, 1);
  });

  it("~100m east offset is consistent", () => {
    const dLon = 100 / metersPerDegLon(47.3769);
    const { x_m, y_m } = latLonToLocalXY(zurich, 47.3769, 8.5417 + dLon);
    expect(x_m).toBeCloseTo(100, 0);
    expect(y_m).toBeCloseTo(0, 1);
  });
});

describe("localXYToLatLon", () => {
  const zurich = { latitude_deg: 47.3769, longitude_deg: 8.5417 };

  it("zero offset returns reference point", () => {
    const { lat, lon } = localXYToLatLon(zurich, 0, 0);
    expect(lat).toBeCloseTo(47.3769, 6);
    expect(lon).toBeCloseTo(8.5417, 6);
  });

  it("round-trips with latLonToLocalXY for 500m NE offset", () => {
    const { lat, lon } = localXYToLatLon(zurich, 500, 500);
    const { x_m, y_m } = latLonToLocalXY(zurich, lat, lon);
    expect(x_m).toBeCloseTo(500, 0);
    expect(y_m).toBeCloseTo(500, 0);
  });

  it("handles near-pole latitude correctly", () => {
    const nearPole = { latitude_deg: 89.999, longitude_deg: 0 };
    const { lat } = localXYToLatLon(nearPole, 0, 100);
    expect(lat).toBeCloseTo(89.999 + 100 / 111_320, 6);
  });
});

// ---------------------------------------------------------------------------
// Bearing and distance
// ---------------------------------------------------------------------------

describe("bearingDistance", () => {
  const ref = { latitude_deg: 47.0, longitude_deg: 8.0 };

  it("due north gives bearing ≈ 0°", () => {
    const { bearing_deg, distance_m } = bearingDistance(ref, 47.001, 8.0);
    expect(bearing_deg).toBeCloseTo(0, 0);
    expect(distance_m).toBeCloseTo(111.32, 0);
  });

  it("due east gives bearing ≈ 90°", () => {
    const { bearing_deg } = bearingDistance(ref, 47.0, 8.001);
    expect(bearing_deg).toBeCloseTo(90, 0);
  });

  it("due south gives bearing ≈ 180°", () => {
    const { bearing_deg } = bearingDistance(ref, 46.999, 8.0);
    expect(bearing_deg).toBeCloseTo(180, 0);
  });

  it("due west gives bearing ≈ 270°", () => {
    const { bearing_deg } = bearingDistance(ref, 47.0, 7.999);
    expect(bearing_deg).toBeCloseTo(270, 0);
  });

  it("same point gives distance 0", () => {
    const { distance_m } = bearingDistance(ref, 47.0, 8.0);
    expect(distance_m).toBeCloseTo(0, 1);
  });
});

describe("latLonFromBearingDistance", () => {
  const ref = { latitude_deg: 47.0, longitude_deg: 8.0 };

  it("1000m north round-trips through bearingDistance", () => {
    const { lat, lon } = latLonFromBearingDistance(ref, 0, 1000);
    const { bearing_deg, distance_m } = bearingDistance(ref, lat, lon);
    expect(bearing_deg).toBeCloseTo(0, 0);
    expect(distance_m).toBeCloseTo(1000, 0);
  });

  it("500m at 45° NE round-trips", () => {
    const { lat, lon } = latLonFromBearingDistance(ref, 45, 500);
    const { bearing_deg, distance_m } = bearingDistance(ref, lat, lon);
    expect(bearing_deg).toBeCloseTo(45, 0);
    expect(distance_m).toBeCloseTo(500, 0);
  });

  it("2000m at 225° (SW) round-trips", () => {
    const { lat, lon } = latLonFromBearingDistance(ref, 225, 2000);
    const { bearing_deg, distance_m } = bearingDistance(ref, lat, lon);
    expect(bearing_deg).toBeCloseTo(225, 0);
    expect(distance_m).toBeCloseTo(2000, 0);
  });
});

// ---------------------------------------------------------------------------
// Offset-from-home helpers
// ---------------------------------------------------------------------------

describe("itemOffsetFromHome / applyOffsetFromHome", () => {
  const home = makeHome(47.0, 8.0);

  it("returns null when home is null", () => {
    const item = makeItem(47.001, 8.001);
    expect(itemOffsetFromHome(item, null)).toBeNull();
    expect(applyOffsetFromHome(null, 100, 100)).toBeNull();
  });

  it("item at home gives zero offset", () => {
    const item = makeItem(47.0, 8.0);
    const offset = itemOffsetFromHome(item, home);
    expect(offset).not.toBeNull();
    expect(offset!.x_m).toBeCloseTo(0, 0);
    expect(offset!.y_m).toBeCloseTo(0, 0);
  });

  it("round-trips: offset → apply → extract ≈ original", () => {
    const item = makeItem(47.005, 8.003);
    const offset = itemOffsetFromHome(item, home)!;
    const applied = applyOffsetFromHome(home, offset.x_m, offset.y_m)!;
    expect(applied.x).toBeCloseTo(item.x, -1);
    expect(applied.y).toBeCloseTo(item.y, -1);
  });

  it("500m east offset produces correct degE7", () => {
    const applied = applyOffsetFromHome(home, 500, 0)!;
    const resultLon = applied.y / 1e7;
    const expectedDLon = 500 / metersPerDegLon(47.0);
    expect(resultLon - 8.0).toBeCloseTo(expectedDLon, 5);
  });
});

// ---------------------------------------------------------------------------
// Offset-from-previous-waypoint helpers
// ---------------------------------------------------------------------------

describe("itemOffsetFromPrevious / applyOffsetFromPrevious", () => {
  it("returns null when previousItem is null or undefined", () => {
    const item = makeItem(47.001, 8.001);
    expect(itemOffsetFromPrevious(item, null)).toBeNull();
    expect(itemOffsetFromPrevious(item, undefined)).toBeNull();
    expect(applyOffsetFromPrevious(null, 100, 100)).toBeNull();
    expect(applyOffsetFromPrevious(undefined, 100, 100)).toBeNull();
  });

  it("same position gives zero offset", () => {
    const prev = makeItem(47.0, 8.0);
    const curr = makeItem(47.0, 8.0);
    const offset = itemOffsetFromPrevious(curr, prev);
    expect(offset).not.toBeNull();
    expect(offset!.x_m).toBeCloseTo(0, 0);
    expect(offset!.y_m).toBeCloseTo(0, 0);
  });

  it("round-trips: offset → apply → extract ≈ original", () => {
    const prev = makeItem(47.0, 8.0);
    const curr = makeItem(47.002, 8.004);
    const offset = itemOffsetFromPrevious(curr, prev)!;
    const applied = applyOffsetFromPrevious(prev, offset.x_m, offset.y_m)!;
    expect(applied.x).toBeCloseTo(curr.x, -1);
    expect(applied.y).toBeCloseTo(curr.y, -1);
  });
});

// ---------------------------------------------------------------------------
// Bearing/distance from home and previous
// ---------------------------------------------------------------------------

describe("itemBearingDistanceFromHome", () => {
  const home = makeHome(47.0, 8.0);

  it("returns null when home is null", () => {
    expect(itemBearingDistanceFromHome(makeItem(47.001, 8.0), null)).toBeNull();
  });

  it("item due north of home gives bearing ≈ 0°", () => {
    const item = makeItem(47.01, 8.0);
    const result = itemBearingDistanceFromHome(item, home)!;
    expect(result.bearing_deg).toBeCloseTo(0, 0);
    expect(result.distance_m).toBeGreaterThan(1000);
  });
});

describe("itemBearingDistanceFromPrevious", () => {
  it("returns null when previousItem is null", () => {
    expect(itemBearingDistanceFromPrevious(makeItem(47.0, 8.0), null)).toBeNull();
  });

  it("item due east of previous gives bearing ≈ 90°", () => {
    const prev = makeItem(47.0, 8.0);
    const curr = makeItem(47.0, 8.01);
    const result = itemBearingDistanceFromPrevious(curr, prev)!;
    expect(result.bearing_deg).toBeCloseTo(90, 0);
    expect(result.distance_m).toBeGreaterThan(500);
  });
});

// ---------------------------------------------------------------------------
// Parsing guards
// ---------------------------------------------------------------------------

describe("parseLatitude", () => {
  it("accepts valid latitude", () => {
    const r = parseLatitude(47.3769);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(47.3769);
  });

  it("accepts string input", () => {
    const r = parseLatitude("47.3769");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBeCloseTo(47.3769, 4);
  });

  it("accepts boundary values -90 and 90", () => {
    expect(parseLatitude(-90).ok).toBe(true);
    expect(parseLatitude(90).ok).toBe(true);
  });

  it("rejects out-of-range", () => {
    expect(parseLatitude(91).ok).toBe(false);
    expect(parseLatitude(-91).ok).toBe(false);
  });

  it("rejects NaN", () => {
    expect(parseLatitude(NaN).ok).toBe(false);
  });

  it("rejects Infinity", () => {
    expect(parseLatitude(Infinity).ok).toBe(false);
    expect(parseLatitude(-Infinity).ok).toBe(false);
  });

  it("rejects non-numeric string", () => {
    expect(parseLatitude("abc").ok).toBe(false);
  });

  it("rejects empty string", () => {
    expect(parseLatitude("").ok).toBe(false);
  });
});

describe("parseLongitude", () => {
  it("accepts valid longitude", () => {
    const r = parseLongitude(8.5417);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(8.5417);
  });

  it("accepts boundary values -180 and 180", () => {
    expect(parseLongitude(-180).ok).toBe(true);
    expect(parseLongitude(180).ok).toBe(true);
  });

  it("rejects out-of-range", () => {
    expect(parseLongitude(181).ok).toBe(false);
    expect(parseLongitude(-181).ok).toBe(false);
  });

  it("rejects NaN", () => {
    expect(parseLongitude(NaN).ok).toBe(false);
  });
});

describe("parseDistance", () => {
  it("accepts zero", () => {
    const r = parseDistance(0);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(0);
  });

  it("accepts positive", () => {
    expect(parseDistance(1000).ok).toBe(true);
  });

  it("rejects negative", () => {
    expect(parseDistance(-1).ok).toBe(false);
  });

  it("rejects NaN", () => {
    expect(parseDistance(NaN).ok).toBe(false);
  });
});

describe("parseBearing", () => {
  it("normalizes 0 to 0", () => {
    const r = parseBearing(0);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(0);
  });

  it("normalizes 360 to 0", () => {
    const r = parseBearing(360);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBeCloseTo(0, 5);
  });

  it("normalizes -90 to 270", () => {
    const r = parseBearing(-90);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBeCloseTo(270, 5);
  });

  it("normalizes 720 to 0", () => {
    const r = parseBearing(720);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBeCloseTo(0, 5);
  });

  it("rejects NaN", () => {
    expect(parseBearing(NaN).ok).toBe(false);
  });
});

describe("parseOffset", () => {
  it("accepts negative values", () => {
    const r = parseOffset(-500);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(-500);
  });

  it("accepts string input", () => {
    const r = parseOffset("-123.45");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBeCloseTo(-123.45, 2);
  });

  it("rejects NaN", () => {
    expect(parseOffset(NaN).ok).toBe(false);
  });

  it("rejects Infinity", () => {
    expect(parseOffset(Infinity).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

describe("formatDeg / formatDistance / formatBearing", () => {
  it("formatDeg defaults to 7 decimals", () => {
    expect(formatDeg(47.3769)).toBe("47.3769000");
  });

  it("formatDeg with custom decimals", () => {
    expect(formatDeg(47.3769, 2)).toBe("47.38");
  });

  it("formatDistance defaults to 1 decimal", () => {
    expect(formatDistance(1234.56)).toBe("1234.6");
  });

  it("formatBearing defaults to 1 decimal", () => {
    expect(formatBearing(45.678)).toBe("45.7");
  });
});

// ---------------------------------------------------------------------------
// Validation guards
// ---------------------------------------------------------------------------

describe("isHomeValid", () => {
  it("returns false for null", () => {
    expect(isHomeValid(null)).toBe(false);
  });

  it("returns true for valid home", () => {
    expect(isHomeValid(makeHome(47.0, 8.0))).toBe(true);
  });

  it("returns false for NaN latitude", () => {
    expect(isHomeValid(makeHome(NaN, 8.0))).toBe(false);
  });

  it("returns false for NaN longitude", () => {
    expect(isHomeValid(makeHome(47.0, NaN))).toBe(false);
  });

  it("returns false for Infinity", () => {
    expect(isHomeValid(makeHome(Infinity, 8.0))).toBe(false);
  });
});

describe("isItemCoordinateValid", () => {
  it("returns true for valid item", () => {
    expect(isItemCoordinateValid(makeItem(47.0, 8.0))).toBe(true);
  });

  it("returns false for NaN x", () => {
    const item = makeItem(47.0, 8.0);
    item.x = NaN;
    expect(isItemCoordinateValid(item)).toBe(false);
  });

  it("returns false for Infinity y", () => {
    const item = makeItem(47.0, 8.0);
    item.y = Infinity;
    expect(isItemCoordinateValid(item)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Mission-scale integration: realistic waypoint distances
// ---------------------------------------------------------------------------

describe("mission-scale integration", () => {
  const home = makeHome(47.3769, 8.5417);

  it("waypoint 100m north of home: offset and bearing consistent", () => {
    const dLat = 100 / 111_320;
    const item = makeItem(47.3769 + dLat, 8.5417);
    const offset = itemOffsetFromHome(item, home)!;
    expect(offset.y_m).toBeCloseTo(100, 0);
    expect(offset.x_m).toBeCloseTo(0, 0);

    const bd = itemBearingDistanceFromHome(item, home)!;
    expect(bd.bearing_deg).toBeCloseTo(0, 0);
    expect(bd.distance_m).toBeCloseTo(100, 0);
  });

  it("waypoint 200m east of home: offset and bearing consistent", () => {
    const dLon = 200 / metersPerDegLon(47.3769);
    const item = makeItem(47.3769, 8.5417 + dLon);
    const offset = itemOffsetFromHome(item, home)!;
    expect(offset.x_m).toBeCloseTo(200, 0);
    expect(offset.y_m).toBeCloseTo(0, 0);

    const bd = itemBearingDistanceFromHome(item, home)!;
    expect(bd.bearing_deg).toBeCloseTo(90, 0);
    expect(bd.distance_m).toBeCloseTo(200, 0);
  });

  it("chain of 3 waypoints: previous-offset accumulates correctly", () => {
    const wp1 = makeItem(47.3769, 8.5417);
    const wp2Lat = 47.3769 + 100 / 111_320;
    const wp2 = makeItem(wp2Lat, 8.5417);
    const wp3Lat = wp2Lat + 100 / 111_320;
    const wp3 = makeItem(wp3Lat, 8.5417);

    const offset12 = itemOffsetFromPrevious(wp2, wp1)!;
    expect(offset12.y_m).toBeCloseTo(100, 0);

    const offset23 = itemOffsetFromPrevious(wp3, wp2)!;
    expect(offset23.y_m).toBeCloseTo(100, 0);

    const totalFromHome = itemOffsetFromHome(wp3, home)!;
    expect(totalFromHome.y_m).toBeCloseTo(200, 0);
  });

  it("bearing/distance round-trip at mission scale (1km)", () => {
    const { lat, lon } = latLonFromBearingDistance(home, 135, 1000);
    const item = makeItem(lat, lon);
    const bd = itemBearingDistanceFromHome(item, home)!;
    expect(bd.bearing_deg).toBeCloseTo(135, 0);
    expect(bd.distance_m).toBeCloseTo(1000, 0);
  });
});

import { describe, expect, it, vi } from "vitest";

import {
  applySvsAircraftCamera,
  createSvsAircraftCameraOptions,
  resolveSvsCameraAltitudeMsl,
} from "./svs-camera";

describe("resolveSvsCameraAltitudeMsl", () => {
  it("prefers explicit MSL altitude", () => {
    expect(resolveSvsCameraAltitudeMsl({
      altitudeMslM: 510,
      terrainMslM: 450,
      heightAboveTerrainM: 25,
      relativeHomeAltitudeM: 40,
      homeTerrainMslM: 480,
    })).toEqual({ altitudeMslM: 510, source: "msl" });
  });

  it("uses terrain-relative altitude when MSL is missing", () => {
    expect(resolveSvsCameraAltitudeMsl({
      terrainMslM: 430,
      heightAboveTerrainM: 75,
      relativeHomeAltitudeM: 40,
      homeTerrainMslM: 480,
    })).toEqual({ altitudeMslM: 505, source: "terrain_relative" });
  });

  it("uses home-relative altitude from sampled home terrain", () => {
    expect(resolveSvsCameraAltitudeMsl({
      relativeHomeAltitudeM: 120,
      homeTerrainMslM: 470,
      homeAltitudeMslM: 500,
    })).toEqual({ altitudeMslM: 590, source: "home_relative" });
  });

  it("falls back to 100 m above current terrain", () => {
    expect(resolveSvsCameraAltitudeMsl({ terrainMslM: 440 })).toEqual({
      altitudeMslM: 540,
      source: "terrain_fallback",
    });
  });
});

describe("SVS aircraft camera options", () => {
  it("uses the aircraft location as camera origin and applies mount offsets", () => {
    const map = createMockMap();

    const options = createSvsAircraftCameraOptions(
      map,
      {
        latitudeDeg: 47.4,
        longitudeDeg: 8.54,
        headingDeg: 350,
        pitchDeg: 5,
        rollDeg: -12,
        altitudeMslM: 600,
        heightAboveTerrainM: 40,
      },
      { pitchDeg: 0, yawDeg: 20, rollDeg: 2, upM: 1.5 },
    );

    const [from, altitudeFrom, to, altitudeTo] = map.calculateCameraOptionsFromTo.mock.calls[0];
    expect(from).toMatchObject({ lng: 8.54, lat: 47.4 });
    expect(altitudeFrom).toBe(601.5);
    expect(to.lng).toBeGreaterThan(8.54);
    expect(to.lat).toBeGreaterThan(47.4);
    expect(altitudeTo).toBeCloseTo(689, 0);
    expect(options).toMatchObject({ bearing: 10, pitch: 95, roll: -10 });
  });

  it("jumps to calculated camera options", () => {
    const map = createMockMap();

    expect(applySvsAircraftCamera(map, {
      latitudeDeg: 47.4,
      longitudeDeg: 8.54,
      headingDeg: 90,
      pitchDeg: 0,
      rollDeg: 0,
      altitudeMslM: 600,
    })).toBe(true);

    expect(map.jumpTo).toHaveBeenCalledWith(expect.objectContaining({ elevation: 600, roll: 0 }));
  });

  it("keeps position and yaw but overrides pitch and roll for ground-stabilized mode", () => {
    const map = createMockMap();

    const options = createSvsAircraftCameraOptions(
      map,
      {
        latitudeDeg: 47.4,
        longitudeDeg: 8.54,
        headingDeg: 270,
        pitchDeg: -12,
        rollDeg: 35,
        altitudeMslM: 620,
        terrainMslM: 515,
      },
      { yawDeg: 4, rollDeg: 10, pitchDeg: 0 },
      "ground_stabilized",
    );

    const [from, altitudeFrom, to, altitudeTo] = map.calculateCameraOptionsFromTo.mock.calls[0];
    expect(from).toMatchObject({ lng: 8.54, lat: 47.4 });
    expect(altitudeFrom).toBe(620);
    expect(to).toMatchObject({ lng: 8.54, lat: 47.4 });
    expect(altitudeTo).toBe(515);
    expect(options).toMatchObject({ bearing: 274, pitch: 0, roll: 0 });
  });
});

function createMockMap() {
  return {
    calculateCameraOptionsFromTo: vi.fn(
      (_from, altitudeMslM, _to, _targetAltitudeMsl) => ({
        center: [8.55, 47.41] as [number, number],
        elevation: altitudeMslM,
        zoom: 14,
        bearing: 10,
        pitch: 95,
      }),
    ),
    jumpTo: vi.fn(),
  };
}

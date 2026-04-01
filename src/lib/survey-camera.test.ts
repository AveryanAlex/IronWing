import { describe, expect, it } from "vitest";

import {
  altitudeForGsd,
  effectiveSensorDimensions,
  groundSampleDistance,
  imageFootprint,
  laneSpacing,
  triggerDistance,
  type CameraSpec,
} from "./survey-camera";

const SONY_A7R_IV: CameraSpec = {
  sensorWidth_mm: 35.7,
  sensorHeight_mm: 23.8,
  imageWidth_px: 9504,
  imageHeight_px: 6336,
  focalLength_mm: 35,
};

const DJI_MAVIC_3E: CameraSpec = {
  sensorWidth_mm: 17.3,
  sensorHeight_mm: 13,
  imageWidth_px: 5280,
  imageHeight_px: 3956,
  focalLength_mm: 12.29,
  minTriggerInterval_s: 0.7,
};

describe("effectiveSensorDimensions", () => {
  it("uses the short edge across-track in landscape and swaps in portrait", () => {
    expect(effectiveSensorDimensions(DJI_MAVIC_3E, "landscape")).toEqual({
      acrossTrack_mm: 13,
      alongTrack_mm: 17.3,
      acrossTrack_px: 3956,
      alongTrack_px: 5280,
    });

    expect(effectiveSensorDimensions(DJI_MAVIC_3E, "portrait")).toEqual({
      acrossTrack_mm: 17.3,
      alongTrack_mm: 13,
      acrossTrack_px: 5280,
      alongTrack_px: 3956,
    });
  });
});

describe("groundSampleDistance", () => {
  it("matches the Sony A7R IV golden GSD at 100m in landscape", () => {
    expect(groundSampleDistance(SONY_A7R_IV, 100, "landscape")).toBeCloseTo(
      0.010732323232323232,
      12,
    );
  });

  it("matches the Sony A7R IV golden GSD at 100m in portrait", () => {
    expect(groundSampleDistance(SONY_A7R_IV, 100, "portrait")).toBeCloseTo(
      0.010732323232323232,
      12,
    );
  });

  it("matches the DJI Mavic 3E golden GSD values at 100m", () => {
    expect(groundSampleDistance(DJI_MAVIC_3E, 100, "landscape")).toBeCloseTo(
      0.02673838587357598,
      12,
    );
    expect(groundSampleDistance(DJI_MAVIC_3E, 100, "portrait")).toBeCloseTo(
      0.026660009369529305,
      12,
    );
  });
});

describe("imageFootprint", () => {
  it("matches the DJI Mavic 3E landscape footprint at 100m", () => {
    expect(imageFootprint(DJI_MAVIC_3E, 100, "landscape")).toEqual({
      width_m: expect.closeTo(105.77705451586657, 12),
      height_m: expect.closeTo(140.76484947111473, 12),
    });
  });

  it("swaps footprint axes when orientation changes", () => {
    expect(imageFootprint(DJI_MAVIC_3E, 100, "portrait")).toEqual({
      width_m: expect.closeTo(140.76484947111473, 12),
      height_m: expect.closeTo(105.77705451586657, 12),
    });
  });
});

describe("overlap-derived spacing", () => {
  it("matches the DJI Mavic 3E lane spacing and trigger distance at 70%/80% overlap", () => {
    expect(laneSpacing(DJI_MAVIC_3E, 100, 70, "landscape")).toBeCloseTo(
      31.733116354759975,
      12,
    );
    expect(triggerDistance(DJI_MAVIC_3E, 100, 80, "landscape")).toBeCloseTo(
      28.152969894222938,
      12,
    );
  });

  it("accepts normalized overlap ratios as well as percentages", () => {
    expect(laneSpacing(DJI_MAVIC_3E, 100, 0.7, "landscape")).toBeCloseTo(
      laneSpacing(DJI_MAVIC_3E, 100, 70, "landscape"),
      12,
    );
    expect(triggerDistance(DJI_MAVIC_3E, 100, 0.8, "landscape")).toBeCloseTo(
      triggerDistance(DJI_MAVIC_3E, 100, 80, "landscape"),
      12,
    );
  });

  it("returns the full footprint at 0% overlap and nearly zero at 100% overlap", () => {
    const footprint = imageFootprint(DJI_MAVIC_3E, 100, "landscape");

    expect(laneSpacing(DJI_MAVIC_3E, 100, 0, "landscape")).toBeCloseTo(
      footprint.width_m,
      12,
    );
    expect(triggerDistance(DJI_MAVIC_3E, 100, 0, "landscape")).toBeCloseTo(
      footprint.height_m,
      12,
    );
    expect(laneSpacing(DJI_MAVIC_3E, 100, 100, "landscape")).toBeCloseTo(0, 12);
    expect(triggerDistance(DJI_MAVIC_3E, 100, 100, "landscape")).toBeCloseTo(0, 12);
  });
});

describe("altitudeForGsd", () => {
  it.each([
    [SONY_A7R_IV, 100, "landscape"],
    [SONY_A7R_IV, 100, "portrait"],
    [DJI_MAVIC_3E, 85, "landscape"],
    [DJI_MAVIC_3E, 85, "portrait"],
  ] as const)("round-trips altitude for %s at %dm in %s", (spec, altitude_m, orientation) => {
    const gsd = groundSampleDistance(spec, altitude_m, orientation);
    expect(altitudeForGsd(spec, gsd, orientation)).toBeCloseTo(altitude_m, 12);
  });
});

describe("invalid camera parameters", () => {
  it("throws for zero focal length instead of returning silent nonsense", () => {
    expect(() =>
      groundSampleDistance(
        {
          ...DJI_MAVIC_3E,
          focalLength_mm: 0,
        },
        100,
        "landscape",
      ),
    ).toThrow(/focalLength_mm/i);
  });

  it("throws for overlap values above 100%", () => {
    expect(() => laneSpacing(DJI_MAVIC_3E, 100, 120, "landscape")).toThrow(
      /overlap_pct/i,
    );
  });
});

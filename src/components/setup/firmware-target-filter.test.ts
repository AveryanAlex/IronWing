import { describe, expect, it } from "vitest";
import {
  ALL_TARGET_VEHICLE_TYPES,
  catalogTargetKey,
  filterCatalogTargets,
  listCatalogTargetVehicleTypes,
  sanitizeCatalogTargetSummary,
} from "./firmware-target-filter";

const TARGETS = [
  {
    board_id: 140,
    platform: "CubeOrange",
    brand_name: "Cube Orange",
    manufacturer: "Hex",
    vehicle_types: ["Copter", "Plane"],
    latest_version: "4.5.0",
  },
  {
    board_id: 9,
    platform: "fmuv2",
    brand_name: null,
    manufacturer: null,
    vehicle_types: ["Plane"],
    latest_version: "4.4.0",
  },
  {
    board_id: 201,
    platform: "MatekH743",
    brand_name: "Matek H743",
    manufacturer: "Matek",
    vehicle_types: ["Copter"],
    latest_version: "4.5.1",
  },
] as const;

describe("sanitizeCatalogTargetSummary", () => {
  it("normalizes optional text fields and rejects malformed entries", () => {
    expect(sanitizeCatalogTargetSummary({
      board_id: 140,
      platform: "  CubeOrange  ",
      brand_name: "   ",
      manufacturer: " Hex ",
      vehicle_types: [" Copter ", "Copter", 42, ""],
      latest_version: " 4.5.0 ",
    })).toEqual({
      board_id: 140,
      platform: "CubeOrange",
      brand_name: null,
      manufacturer: "Hex",
      vehicle_types: ["Copter"],
      latest_version: "4.5.0",
    });

    expect(sanitizeCatalogTargetSummary({ board_id: 0, platform: "CubeOrange", vehicle_types: [] })).toBeNull();
    expect(sanitizeCatalogTargetSummary({ board_id: 140, platform: "", vehicle_types: [] })).toBeNull();
    expect(sanitizeCatalogTargetSummary({ board_id: 140, vehicle_types: [] })).toBeNull();
  });
});

describe("listCatalogTargetVehicleTypes", () => {
  it("collects unique vehicle types from valid targets only", () => {
    expect(listCatalogTargetVehicleTypes([
      ...TARGETS,
      { board_id: 0, platform: "Broken", vehicle_types: ["Sub"] },
    ])).toEqual(["Copter", "Plane"]);
  });
});

describe("filterCatalogTargets", () => {
  it("returns sanitized matches for blank search text and ignores malformed targets", () => {
    const matches = filterCatalogTargets([
      ...TARGETS,
      { board_id: 0, platform: "Broken", manufacturer: "Nope", vehicle_types: ["Copter"] },
    ], {
      searchText: "   ",
      vehicleType: ALL_TARGET_VEHICLE_TYPES,
    });

    expect(matches.map((match) => match.key)).toEqual([
      catalogTargetKey(TARGETS[0]),
      catalogTargetKey(TARGETS[1]),
      catalogTargetKey(TARGETS[2]),
    ]);
  });

  it("matches platform, brand, manufacturer, board id, and vehicle-type filter", () => {
    expect(filterCatalogTargets(TARGETS, { searchText: "cube orange" }).map((match) => match.target.platform)).toEqual([
      "CubeOrange",
    ]);
    expect(filterCatalogTargets(TARGETS, { searchText: "hex" }).map((match) => match.target.platform)).toEqual([
      "CubeOrange",
    ]);
    expect(filterCatalogTargets(TARGETS, { searchText: "201" }).map((match) => match.target.platform)).toEqual([
      "MatekH743",
    ]);
    expect(filterCatalogTargets(TARGETS, { searchText: "4.4", vehicleType: "Plane" }).map((match) => match.target.platform)).toEqual([
      "fmuv2",
    ]);
  });

  it("returns no matches for an unmatched vehicle-type filter or query", () => {
    expect(filterCatalogTargets(TARGETS, { vehicleType: "Rover" })).toEqual([]);
    expect(filterCatalogTargets(TARGETS, { searchText: "does not exist" })).toEqual([]);
  });

  it("keeps targets with missing brand/manufacturer searchable by platform and vehicle type", () => {
    const matches = filterCatalogTargets(TARGETS, { searchText: "fmuv2", vehicleType: "Plane" });

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      label: "fmuv2",
      metadata: ["v4.4.0", "Board ID 9"],
      vehicleTypesLabel: "Plane",
    });
  });
});

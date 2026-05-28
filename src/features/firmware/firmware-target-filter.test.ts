import { describe, expect, it } from "vitest";

import {
  ALL_TARGET_VEHICLE_TYPES,
  filterCatalogTargets,
  listCatalogTargetVehicleTypes,
  sanitizeCatalogTargetSummaries,
} from "./firmware-target-filter";

describe("firmware-target-filter", () => {
  it("drops malformed and duplicate catalog targets before manual selection uses them", () => {
    const sanitized = sanitizeCatalogTargetSummaries([
      {
        board_id: 140,
        platform: "CubeOrange",
        brand_name: "Cube Orange",
        manufacturer: "Hex",
        vehicle_types: ["Copter", "Plane", "Copter"],
        latest_version: "4.5.0",
      },
      {
        board_id: 140,
        platform: "CubeOrange",
        brand_name: "Cube Orange duplicate",
        manufacturer: "Hex",
        vehicle_types: ["Plane"],
        latest_version: "4.5.1",
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
        board_id: 0,
        platform: "BrokenBoard",
        vehicle_types: ["Rover"],
      },
      {
        board_id: 88,
        platform: "",
        vehicle_types: ["Sub"],
      },
      null,
    ]);

    expect(sanitized).toEqual([
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
    ]);
  });

  it("ranks exact brand and platform matches ahead of looser search hits", () => {
    const matches = filterCatalogTargets(
      [
        {
          board_id: 140,
          platform: "CubeOrange",
          brand_name: "Cube Orange",
          manufacturer: "Hex",
          vehicle_types: ["Copter"],
          latest_version: "4.5.0",
        },
        {
          board_id: 201,
          platform: "MatekH743",
          brand_name: "Matek H743",
          manufacturer: "Matek",
          vehicle_types: ["Copter"],
          latest_version: "4.5.1",
        },
        {
          board_id: 9,
          platform: "fmuv2",
          brand_name: null,
          manufacturer: null,
          vehicle_types: ["Plane"],
          latest_version: "4.4.0",
        },
      ],
      { searchText: "cube" },
    );

    expect(matches.map((match) => match.target.platform)).toEqual(["CubeOrange"]);
    expect(matches[0]).toMatchObject({
      label: "Cube Orange",
      vehicleTypesLabel: "Copter",
    });
  });

  it("keeps vehicle-type filters explicit while preserving all-types browsing", () => {
    const targets = [
      {
        board_id: 140,
        platform: "CubeOrange",
        brand_name: "Cube Orange",
        manufacturer: "Hex",
        vehicle_types: ["Copter", "Plane"],
        latest_version: "4.5.0",
      },
      {
        board_id: 33,
        platform: "Navigator",
        brand_name: "Navigator",
        manufacturer: "Blue Robotics",
        vehicle_types: ["Sub"],
        latest_version: "4.5.2",
      },
    ];

    expect(listCatalogTargetVehicleTypes(targets)).toEqual(["Copter", "Plane", "Sub"]);
    expect(
      filterCatalogTargets(targets, {
        searchText: "",
        vehicleType: "Sub",
      }).map((match) => match.target.platform),
    ).toEqual(["Navigator"]);
    expect(
      filterCatalogTargets(targets, {
        searchText: "",
        vehicleType: ALL_TARGET_VEHICLE_TYPES,
      }).map((match) => match.target.platform),
    ).toEqual(["CubeOrange", "Navigator"]);
  });
});

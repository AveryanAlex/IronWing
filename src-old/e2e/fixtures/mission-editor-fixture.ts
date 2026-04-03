import type { FencePlan } from "../../../src/fence";
import type {
  GeoPoint2d,
  HomePosition,
  MissionCommand,
  MissionItem,
  MissionPlan,
  RallyPlan,
} from "../../../src/lib/mavkit-types";
import { defaultGeoPoint3d } from "../../../src/lib/mavkit-types";
import { latLonFromBearingDistance } from "../../../src/lib/mission-coordinates";
import { exportPlanFile } from "../../../src/lib/mission-plan-io";

export type MissionEditorFixture = {
  missionDownload: {
    plan: MissionPlan;
    home: HomePosition;
  };
  fenceDownload: FencePlan;
  rallyDownload: RallyPlan;
  planningSpeeds: {
    cruiseSpeedMps: number;
    hoverSpeedMps: number;
  };
  autoGridPentagon: GeoPoint2d[];
  qgcPlanJson: ReturnType<typeof exportPlanFile>["json"];
};

type MissionEditorFixtureInput = {
  missionPlan: MissionPlan;
  home: HomePosition | null;
  fencePlan: FencePlan;
  rallyPlan: RallyPlan;
  planningSpeeds: {
    cruiseSpeedMps: number;
    hoverSpeedMps: number;
  };
  autoGridPentagon: GeoPoint2d[];
};

const REQUIRED_COMMAND_VARIANTS = [
  "Waypoint",
  "SplineWaypoint",
  "ArcWaypoint",
  "LoiterTurns",
  "LandStart",
  "VtolLand",
] as const;

export const MISSION_EDITOR_HOME: HomePosition = {
  latitude_deg: 47.397742,
  longitude_deg: 8.545594,
  altitude_m: 488,
};

export const MISSION_EDITOR_PLANNING_SPEEDS = {
  cruiseSpeedMps: 21,
  hoverSpeedMps: 7,
};

export const MISSION_EDITOR_AUTOGRID_PENTAGON: GeoPoint2d[] = [0, 72, 144, 216, 288].map(
  (bearing_deg) => {
    const { lat, lon } = latLonFromBearingDistance(MISSION_EDITOR_HOME, bearing_deg, 220);
    return {
      latitude_deg: lat,
      longitude_deg: lon,
    };
  },
);

const MISSION_EDITOR_MISSION_PLAN: MissionPlan = {
  items: [
    missionItem({
      Nav: {
        Waypoint: {
          position: pointAt(85, 120, 35),
          hold_time_s: 2,
          acceptance_radius_m: 2,
          pass_radius_m: 0,
          yaw_deg: 0,
        },
      },
    }),
    missionItem({
      Nav: {
        SplineWaypoint: {
          position: pointAt(40, 250, 42),
          hold_time_s: 6,
        },
      },
    }),
    missionItem({
      Nav: {
        ArcWaypoint: {
          position: pointAt(12, 390, 46),
          arc_angle_deg: 70,
          direction: "CounterClockwise",
        },
      },
    }),
    missionItem({
      Nav: {
        LoiterTurns: {
          position: pointAt(96, 530, 48),
          turns: 1,
          radius_m: 85,
          direction: "Clockwise",
          exit_xtrack: false,
        },
      },
    }),
    missionItem({
      Do: {
        LandStart: {
          position: pointAt(132, 690, 35),
        },
      },
    }),
    missionItem({
      Nav: {
        VtolLand: {
          position: pointAt(156, 840, 12),
          options: 0,
        },
      },
    }),
  ],
};

const MISSION_EDITOR_FENCE_PLAN: FencePlan = {
  return_point: {
    latitude_deg: MISSION_EDITOR_HOME.latitude_deg,
    longitude_deg: MISSION_EDITOR_HOME.longitude_deg,
  },
  regions: [
    {
      inclusion_polygon: {
        vertices: structuredClone(MISSION_EDITOR_AUTOGRID_PENTAGON),
        inclusion_group: 0,
      },
    },
  ],
};

const MISSION_EDITOR_RALLY_PLAN: RallyPlan = {
  points: [
    pointAt(320, 180, 24),
    pointAt(28, 320, 30),
  ],
};

export function createMissionEditorFixture(
  input: MissionEditorFixtureInput = {
    missionPlan: MISSION_EDITOR_MISSION_PLAN,
    home: MISSION_EDITOR_HOME,
    fencePlan: MISSION_EDITOR_FENCE_PLAN,
    rallyPlan: MISSION_EDITOR_RALLY_PLAN,
    planningSpeeds: MISSION_EDITOR_PLANNING_SPEEDS,
    autoGridPentagon: MISSION_EDITOR_AUTOGRID_PENTAGON,
  },
): MissionEditorFixture {
  const home = input.home;
  if (!home) {
    throw new Error("Mission editor fixture requires a planned home position.");
  }

  const seenVariants = new Set(input.missionPlan.items.map((item) => missionCommandVariant(item.command)));
  for (const requiredVariant of REQUIRED_COMMAND_VARIANTS) {
    if (!seenVariants.has(requiredVariant)) {
      throw new Error(`Mission editor fixture is missing the required ${requiredVariant} command.`);
    }
  }

  const polygon = input.autoGridPentagon;
  if (polygon.length !== 5) {
    throw new Error(`Mission editor fixture expects a pentagon polygon, received ${polygon.length} vertices.`);
  }

  const firstFencePolygon = input.fencePlan.regions.find(
    (region): region is Extract<FencePlan["regions"][number], { inclusion_polygon: { vertices: GeoPoint2d[] } }> =>
      "inclusion_polygon" in region,
  );
  if (!firstFencePolygon || firstFencePolygon.inclusion_polygon.vertices.length !== 5) {
    throw new Error("Mission editor fixture requires a five-vertex inclusion polygon for auto-grid coverage.");
  }

  if (
    !Number.isFinite(input.planningSpeeds.cruiseSpeedMps)
    || input.planningSpeeds.cruiseSpeedMps <= 0
    || !Number.isFinite(input.planningSpeeds.hoverSpeedMps)
    || input.planningSpeeds.hoverSpeedMps <= 0
  ) {
    throw new Error("Mission editor fixture planning speeds must be finite positive numbers.");
  }

  const qgcPlanJson = exportPlanFile({
    mission: input.missionPlan,
    home,
    fence: input.fencePlan,
    rally: input.rallyPlan,
    cruiseSpeed: input.planningSpeeds.cruiseSpeedMps,
    hoverSpeed: input.planningSpeeds.hoverSpeedMps,
  }).json;

  return {
    missionDownload: {
      plan: structuredClone(input.missionPlan),
      home: structuredClone(home),
    },
    fenceDownload: structuredClone(input.fencePlan),
    rallyDownload: structuredClone(input.rallyPlan),
    planningSpeeds: structuredClone(input.planningSpeeds),
    autoGridPentagon: structuredClone(input.autoGridPentagon),
    qgcPlanJson,
  };
}

export const MISSION_EDITOR_FIXTURE = createMissionEditorFixture();

function missionItem(command: MissionCommand): MissionItem {
  return {
    command,
    current: false,
    autocontinue: true,
  };
}

function pointAt(bearing_deg: number, distance_m: number, altitude_m: number) {
  const { lat, lon } = latLonFromBearingDistance(MISSION_EDITOR_HOME, bearing_deg, distance_m);
  return defaultGeoPoint3d(lat, lon, altitude_m);
}

function missionCommandVariant(command: MissionCommand): string {
  if ("Nav" in command) {
    return typeof command.Nav === "string" ? command.Nav : Object.keys(command.Nav)[0] ?? "unknown";
  }
  if ("Do" in command) {
    return typeof command.Do === "string" ? command.Do : Object.keys(command.Do)[0] ?? "unknown";
  }
  if ("Condition" in command) {
    return Object.keys(command.Condition)[0] ?? "unknown";
  }
  return "Other";
}

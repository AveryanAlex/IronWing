export type MissionCommand = "Nav:Waypoint" | "Nav:SplineWaypoint" | "Nav:LoiterTime" | "Nav:Land";

export type MissionItemDraft = {
  label: string;
  command: MissionCommand;
  latitude: number;
  longitude: number;
  altitude?: number;
  fields?: Record<string, string>;
};

export type MissionPlanDraft = {
  name: string;
  items: MissionItemDraft[];
};

export const mixedDemoMissionPlan: MissionPlanDraft = {
  name: "mixed waypoint/spline/landing plan",
  items: [
    {
      label: "climb and hold at the first waypoint",
      command: "Nav:Waypoint",
      latitude: 47.397742,
      longitude: 8.545594,
      altitude: 35,
      fields: { hold_time_s: "2", acceptance_radius_m: "8" },
    },
    {
      label: "continue through a spline waypoint",
      command: "Nav:SplineWaypoint",
      latitude: 47.39795,
      longitude: 8.54608,
      altitude: 45,
      fields: { hold_time_s: "1" },
    },
    {
      label: "loiter briefly near the final approach",
      command: "Nav:LoiterTime",
      latitude: 47.39818,
      longitude: 8.54642,
      altitude: 55,
      fields: { time_s: "12" },
    },
    {
      label: "finish with an explicit landing point",
      command: "Nav:Land",
      latitude: 47.39832,
      longitude: 8.54676,
    },
  ],
};

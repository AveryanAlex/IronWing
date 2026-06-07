import type { MissionDownload, MissionPlan } from "../../mission";

const UI_TO_WIRE_ENUMS: Record<string, string> = {
  Clockwise: "clockwise",
  CounterClockwise: "counter_clockwise",
};

const WIRE_TO_UI_ENUMS: Record<string, string> = Object.fromEntries(
  Object.entries(UI_TO_WIRE_ENUMS).map(([ui, wire]) => [wire, ui]),
);

export function toMissionWirePlan(plan: MissionPlan): unknown {
  return mapMissionEnumStrings(plan, UI_TO_WIRE_ENUMS);
}

export function fromMissionWireDownload(download: MissionDownload): MissionDownload {
  return {
    ...download,
    plan: fromMissionWirePlan(download.plan),
  };
}

export function fromMissionWirePlan(plan: MissionPlan): MissionPlan {
  return mapMissionEnumStrings(plan, WIRE_TO_UI_ENUMS) as MissionPlan;
}

function mapMissionEnumStrings(value: unknown, replacements: Record<string, string>): unknown {
  if (typeof value === "string") {
    return replacements[value] ?? value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => mapMissionEnumStrings(item, replacements));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, mapMissionEnumStrings(nested, replacements)]),
    );
  }

  return value;
}

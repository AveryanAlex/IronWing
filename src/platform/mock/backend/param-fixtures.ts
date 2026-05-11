import copterDefaults from "./fixtures/params/copter-defaults.json";
import planeDefaults from "./fixtures/params/plane-defaults.json";
import quadplaneDefaults from "./fixtures/params/quadplane-defaults.json";

import type { ParamStore, ParamType } from "../../../params";
import type { DemoVehiclePreset } from "../../../transport";

export type DemoParamFixture = {
  schema_version: number;
  vehicle_family: string;
  vehicle_preset: DemoVehiclePreset;
  source: {
    kind: "sitl_param_download";
    autopilot: string;
    sitl_image: string;
    defaults: string;
    generated_at: string;
  };
  params: Array<{
    name: string;
    value: number;
    param_type: ParamType;
  }>;
};

const FIXTURES: Record<DemoVehiclePreset, DemoParamFixture> = {
  quadcopter: copterDefaults as unknown as DemoParamFixture,
  airplane: planeDefaults as unknown as DemoParamFixture,
  quadplane: quadplaneDefaults as unknown as DemoParamFixture,
};

function withLegacyPlaneRtlAlias(preset: DemoVehiclePreset, fixture: DemoParamFixture): DemoParamFixture {
  if (preset !== "airplane" && preset !== "quadplane") {
    return fixture;
  }

  if (fixture.params.some((param) => param.name === "ALT_HOLD_RTL")) {
    return fixture;
  }

  const rtlAltitude = fixture.params.find((param) => param.name === "RTL_ALTITUDE");
  if (!rtlAltitude) {
    return fixture;
  }

  return {
    ...fixture,
    params: [
      ...fixture.params,
      {
        // Synthetic compatibility alias for current plane/quadplane demo setup flows,
        // which still look for ALT_HOLD_RTL while SITL exports RTL_ALTITUDE.
        ...rtlAltitude,
        name: "ALT_HOLD_RTL",
      },
    ],
  };
}

export function paramFixtureForDemoPreset(preset: DemoVehiclePreset): DemoParamFixture {
  return structuredClone(withLegacyPlaneRtlAlias(preset, FIXTURES[preset]));
}

export function paramStoreForDemoPreset(preset: DemoVehiclePreset): ParamStore {
  const fixture = paramFixtureForDemoPreset(preset);
  return {
    expected_count: fixture.params.length,
    params: Object.fromEntries(
      fixture.params.map((param, index) => [param.name, { ...param, index }]),
    ),
  };
}

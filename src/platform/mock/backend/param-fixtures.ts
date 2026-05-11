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

const SUPPORTED_SCHEMA_VERSION = 1;
const ALLOWED_PARAM_TYPES: ParamType[] = ["uint8", "int8", "uint16", "int16", "uint32", "int32", "real32"];

const RAW_FIXTURES: Record<DemoVehiclePreset, unknown> = {
  quadcopter: copterDefaults,
  airplane: planeDefaults,
  quadplane: quadplaneDefaults,
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function expectNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid demo param fixture: ${field} must be a non-empty string`);
  }

  return value;
}

function expectFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid demo param fixture: ${field} must be a finite number`);
  }

  return value;
}

export function validateDemoParamFixture(preset: DemoVehiclePreset, fixture: unknown): DemoParamFixture {
  if (!isObject(fixture)) {
    throw new Error("Invalid demo param fixture: top-level value must be an object");
  }

  if (fixture.schema_version !== SUPPORTED_SCHEMA_VERSION) {
    throw new Error(
      `Invalid demo param fixture: schema_version must be ${SUPPORTED_SCHEMA_VERSION} for ${preset}`,
    );
  }

  const vehicle_family = expectNonEmptyString(fixture.vehicle_family, "vehicle_family");

  if (fixture.vehicle_preset !== preset) {
    throw new Error(`Invalid demo param fixture: vehicle_preset must match ${preset}`);
  }
  const vehicle_preset = fixture.vehicle_preset as DemoVehiclePreset;

  if (!isObject(fixture.source)) {
    throw new Error("Invalid demo param fixture: source must be an object");
  }

  if (fixture.source.kind !== "sitl_param_download") {
    throw new Error("Invalid demo param fixture: source.kind must be sitl_param_download");
  }

  const autopilot = expectNonEmptyString(fixture.source.autopilot, "source.autopilot");
  const sitl_image = expectNonEmptyString(fixture.source.sitl_image, "source.sitl_image");
  const defaults = expectNonEmptyString(fixture.source.defaults, "source.defaults");
  const generated_at = expectNonEmptyString(fixture.source.generated_at, "source.generated_at");

  if (!Array.isArray(fixture.params)) {
    throw new Error("Invalid demo param fixture: params must be an array");
  }

  const params = fixture.params.map((param, index) => {
    if (!isObject(param)) {
      throw new Error(`Invalid demo param fixture: params[${index}] must be an object`);
    }

    const name = expectNonEmptyString(param.name, `params[${index}].name`);
    const value = expectFiniteNumber(param.value, `params[${index}].value`);
    const param_type = expectNonEmptyString(param.param_type, `params[${index}].param_type`);

    if (!ALLOWED_PARAM_TYPES.includes(param_type as ParamType)) {
      throw new Error(
        `Invalid demo param fixture: params[${index}].param_type must be one of ${ALLOWED_PARAM_TYPES.join(", ")}`,
      );
    }

    return {
      name,
      value,
      param_type: param_type as ParamType,
    };
  });

  return {
    schema_version: fixture.schema_version,
    vehicle_family,
    vehicle_preset,
    source: {
      kind: fixture.source.kind,
      autopilot,
      sitl_image,
      defaults,
      generated_at,
    },
    params,
  };
}

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
  return structuredClone(withLegacyPlaneRtlAlias(preset, validateDemoParamFixture(preset, RAW_FIXTURES[preset])));
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

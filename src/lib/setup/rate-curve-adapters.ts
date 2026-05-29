import type { ParameterItemModel } from "../params/parameter-item-model";
import type { RcInputRole, RcNormalizationMode } from "./rc-input-normalization";
import {
  ardupilotRateCurve,
  clampNumber,
  cubicRateCurve,
  formatRateValue,
  linearRateCurve,
  roundToIncrement,
  sampleRateCurve,
  type RateCurvePoint,
} from "./rate-curves";

export type RateCurveAdapterId = "copter-acro" | "plane-acro" | "quadplane-qacro" | "rover-turn-rate" | "sub-acro";
export type RateCurveAxisId = "roll-pitch" | "roll" | "pitch" | "yaw" | "steering";
export type RateCurveParameterRole = "rate" | "expo" | "smoothing" | "gain";
export type RateCurveNoticeTone = "info" | "warning";

export type RateCurveParameterControl = {
  name: string;
  label: string;
  description: string;
  role: RateCurveParameterRole;
  unit: string | null;
  currentValue: number;
  draftValue: number;
  min: number;
  max: number;
  step: number;
  readOnly: boolean;
  changed: boolean;
  detail: string;
  item: ParameterItemModel;
};

export type RateCurveAxisModel = {
  id: RateCurveAxisId;
  label: string;
  description: string;
  unit: "deg/s";
  rcInput: {
    role: RcInputRole;
    mode: RcNormalizationMode;
  } | null;
  currentPoints: RateCurvePoint[];
  draftPoints: RateCurvePoint[];
  controls: RateCurveParameterControl[];
  summary: string;
};

export type RateCurveNotice = {
  id: string;
  tone: RateCurveNoticeTone;
  text: string;
};

export type RateCurveModel = {
  id: RateCurveAdapterId;
  label: string;
  shortLabel: string;
  description: string;
  axes: RateCurveAxisModel[];
  notices: RateCurveNotice[];
};

export type RateCurveBuildContext = {
  itemIndex: ReadonlyMap<string, ParameterItemModel>;
  getDraftValue: (name: string, item: ParameterItemModel) => number;
};

export type RateCurveAdapter = {
  id: RateCurveAdapterId;
  label: string;
  shortLabel: string;
  matches: (ctx: Pick<RateCurveBuildContext, "itemIndex">) => boolean;
  buildModel: (ctx: RateCurveBuildContext) => RateCurveModel;
};

const SAMPLES = 101;

export const rateCurveAdapters: RateCurveAdapter[] = [
  createCopterAcroAdapter(),
  createPlaneAcroAdapter(),
  createQuadPlaneQacroAdapter(),
  createRoverTurnRateAdapter(),
  createSubAcroAdapter(),
];

export function discoverRateCurveModels(ctx: RateCurveBuildContext): RateCurveModel[] {
  return rateCurveAdapters
    .filter((adapter) => adapter.matches(ctx))
    .map((adapter) => adapter.buildModel(ctx));
}

export function clampParameterDraft(item: ParameterItemModel, value: number): number {
  const min = item.range?.min ?? -Number.MAX_SAFE_INTEGER;
  const max = item.range?.max ?? Number.MAX_SAFE_INTEGER;
  return roundToIncrement(clampNumber(value, min, max), item.increment);
}

function hasAll(itemIndex: ReadonlyMap<string, ParameterItemModel>, names: readonly string[]): boolean {
  return names.every((name) => itemIndex.has(name));
}

function control(
  ctx: RateCurveBuildContext,
  name: string,
  input: {
    label: string;
    description: string;
    role: RateCurveParameterRole;
    fallbackMin: number;
    fallbackMax: number;
    fallbackStep: number;
    unit?: string | null;
    detail?: (value: number) => string;
  },
): RateCurveParameterControl {
  const item = ctx.itemIndex.get(name);
  if (!item) {
    throw new Error(`Rate curve adapter requested missing parameter ${name}`);
  }

  const min = item.range?.min ?? input.fallbackMin;
  const max = item.range?.max ?? input.fallbackMax;
  const step = item.increment ?? input.fallbackStep;
  const draftValue = clampNumber(roundToIncrement(ctx.getDraftValue(name, item), step), min, max);

  return {
    name,
    label: input.label,
    description: input.description,
    role: input.role,
    unit: input.unit ?? item.units,
    currentValue: item.value,
    draftValue,
    min,
    max,
    step,
    readOnly: item.readOnly,
    changed: Math.abs(draftValue - item.value) > Math.max(1e-6, step * 0.001),
    detail: input.detail?.(draftValue) ?? `${formatParamValue(draftValue)}${input.unit || item.units ? ` ${input.unit ?? item.units}` : ""}`,
    item,
  };
}

function optionalControl(
  ctx: RateCurveBuildContext,
  name: string,
  input: Parameters<typeof control>[2],
): RateCurveParameterControl | null {
  return ctx.itemIndex.has(name) ? control(ctx, name, input) : null;
}

function formatParamValue(value: number): string {
  if (!Number.isFinite(value)) {
    return "--";
  }

  return value.toFixed(3).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function createCopterAcroAdapter(): RateCurveAdapter {
  return {
    id: "copter-acro",
    label: "ArduCopter Acro",
    shortLabel: "Copter",
    matches: ({ itemIndex }) => hasAll(itemIndex, ["ACRO_RP_RATE", "ACRO_RP_EXPO", "ACRO_Y_RATE", "ACRO_Y_EXPO"]),
    buildModel(ctx) {
      const rpRate = control(ctx, "ACRO_RP_RATE", {
        label: "Roll/Pitch max rate",
        description: "Maximum body-frame roll and pitch rate at full stick.",
        role: "rate",
        fallbackMin: 1,
        fallbackMax: 1080,
        fallbackStep: 0.1,
        unit: "deg/s",
      });
      const rpExpo = control(ctx, "ACRO_RP_EXPO", {
        label: "Roll/Pitch expo",
        description: "ArduPilot Acro input expo for the linked roll and pitch axes.",
        role: "expo",
        fallbackMin: -0.5,
        fallbackMax: 0.95,
        fallbackStep: 0.01,
      });
      const rpTc = optionalControl(ctx, "ACRO_RP_RATE_TC", {
        label: "Roll/Pitch response smoothing",
        description: "Time constant used to shape rate-command changes. It does not change the static curve.",
        role: "smoothing",
        fallbackMin: 0,
        fallbackMax: 1,
        fallbackStep: 0.01,
        unit: "s",
      });
      const yawRate = control(ctx, "ACRO_Y_RATE", {
        label: "Yaw max rate",
        description: "Maximum body-frame yaw rate at full stick.",
        role: "rate",
        fallbackMin: 1,
        fallbackMax: 360,
        fallbackStep: 0.1,
        unit: "deg/s",
      });
      const yawExpo = control(ctx, "ACRO_Y_EXPO", {
        label: "Yaw expo",
        description: "ArduPilot Acro input expo for yaw.",
        role: "expo",
        fallbackMin: -1,
        fallbackMax: 0.95,
        fallbackStep: 0.01,
      });
      const yawTc = optionalControl(ctx, "ACRO_Y_RATE_TC", {
        label: "Yaw response smoothing",
        description: "Time constant used to shape yaw-rate command changes. It does not change the static curve.",
        role: "smoothing",
        fallbackMin: 0,
        fallbackMax: 1,
        fallbackStep: 0.01,
        unit: "s",
      });

      return {
        id: "copter-acro",
        label: "ArduCopter Acro",
        shortLabel: "Copter",
        description: "Native Copter Acro command model. Roll and pitch share one rate/expo pair; yaw is independent.",
        notices: [
          {
            id: "copter-linked-rp",
            tone: "info",
            text: "Roll and pitch are linked by ArduPilot's ACRO_RP_* parameters.",
          },
        ],
        axes: [
          {
            id: "roll-pitch",
            label: "Roll / Pitch",
            description: "Linked roll and pitch body-rate request.",
            unit: "deg/s",
            rcInput: { role: "roll", mode: "norm_input_dz" },
            currentPoints: sampleRateCurve((stick) => ardupilotRateCurve(stick, rpRate.currentValue, rpExpo.currentValue), SAMPLES),
            draftPoints: sampleRateCurve((stick) => ardupilotRateCurve(stick, rpRate.draftValue, rpExpo.draftValue), SAMPLES),
            controls: [rpRate, rpExpo, rpTc].filter((entry): entry is RateCurveParameterControl => entry != null),
            summary: `Full stick ${formatRateValue(rpRate.draftValue)} with expo ${formatParamValue(rpExpo.draftValue)}.`,
          },
          {
            id: "yaw",
            label: "Yaw",
            description: "Independent yaw body-rate request.",
            unit: "deg/s",
            rcInput: { role: "yaw", mode: "norm_input_dz" },
            currentPoints: sampleRateCurve((stick) => ardupilotRateCurve(stick, yawRate.currentValue, yawExpo.currentValue), SAMPLES),
            draftPoints: sampleRateCurve((stick) => ardupilotRateCurve(stick, yawRate.draftValue, yawExpo.draftValue), SAMPLES),
            controls: [yawRate, yawExpo, yawTc].filter((entry): entry is RateCurveParameterControl => entry != null),
            summary: `Full stick ${formatRateValue(yawRate.draftValue)} with expo ${formatParamValue(yawExpo.draftValue)}.`,
          },
        ],
      };
    },
  };
}

function createPlaneAcroAdapter(): RateCurveAdapter {
  return {
    id: "plane-acro",
    label: "Fixed-wing Acro",
    shortLabel: "Fixed-wing",
    matches: ({ itemIndex }) => hasAll(itemIndex, ["ACRO_ROLL_RATE", "ACRO_PITCH_RATE"]),
    buildModel(ctx) {
      const rollRate = control(ctx, "ACRO_ROLL_RATE", rateControlInput("Roll max rate", "Maximum fixed-wing roll rate at full stick.", 10, 500));
      const pitchRate = control(ctx, "ACRO_PITCH_RATE", rateControlInput("Pitch max rate", "Maximum fixed-wing pitch rate at full stick.", 10, 500));
      const yawRate = optionalControl(ctx, "ACRO_YAW_RATE", rateControlInput("Yaw / rudder max rate", "Optional fixed-wing yaw-rate controller target at full rudder.", 0, 500));
      const rollExpo = optionalControl(ctx, "MAN_EXPO_ROLL", expoPercentInput("Roll expo", "Manual/Acro/Training roll stick expo."));
      const pitchExpo = optionalControl(ctx, "MAN_EXPO_PITCH", expoPercentInput("Pitch expo", "Manual/Acro/Training pitch stick expo."));
      const rudderExpo = optionalControl(ctx, "MAN_EXPO_RUDDER", expoPercentInput("Rudder expo", "Manual/Acro/Training rudder stick expo."));
      const notices: RateCurveNotice[] = [
        {
          id: "plane-man-expo-scope",
          tone: "warning",
          text: "Plane expo is stored in MAN_EXPO_* parameters and also affects Manual and Training, not only Acro.",
        },
      ];
      if (yawRate && yawRate.draftValue <= 0) {
        notices.push({
          id: "plane-yaw-disabled",
          tone: "warning",
          text: "ACRO_YAW_RATE is zero, so fixed-wing yaw rate control is effectively disabled when the firmware allows rudder pass-through.",
        });
      }

      return {
        id: "plane-acro",
        label: "Fixed-wing Acro",
        shortLabel: "Fixed-wing",
        description: "Native Plane Acro rate model using per-axis max rates and the shared MAN_EXPO_* stick expo parameters.",
        notices,
        axes: [
          planeAxis("roll", "Roll", "Fixed-wing roll rate request.", "roll", rollRate, rollExpo),
          planeAxis("pitch", "Pitch", "Fixed-wing pitch rate request.", "pitch", pitchRate, pitchExpo),
          yawRate ? planeAxis("yaw", "Rudder / Yaw", "Fixed-wing rudder/yaw rate request when yaw rate control is available.", "yaw", yawRate, rudderExpo) : null,
        ].filter((entry): entry is RateCurveAxisModel => entry != null),
      };
    },
  };
}

function createQuadPlaneQacroAdapter(): RateCurveAdapter {
  return {
    id: "quadplane-qacro",
    label: "QuadPlane VTOL QACRO",
    shortLabel: "VTOL QACRO",
    matches: ({ itemIndex }) => hasAll(itemIndex, ["Q_ACRO_RLL_RATE", "Q_ACRO_PIT_RATE", "Q_ACRO_YAW_RATE"]),
    buildModel(ctx) {
      const rollRate = control(ctx, "Q_ACRO_RLL_RATE", rateControlInput("VTOL roll max rate", "Maximum QACRO roll rate at full stick.", 10, 500));
      const pitchRate = control(ctx, "Q_ACRO_PIT_RATE", rateControlInput("VTOL pitch max rate", "Maximum QACRO pitch rate at full stick.", 10, 500));
      const yawRate = control(ctx, "Q_ACRO_YAW_RATE", rateControlInput("VTOL yaw max rate", "Maximum QACRO yaw rate at full stick.", 10, 500));

      return {
        id: "quadplane-qacro",
        label: "QuadPlane VTOL QACRO",
        shortLabel: "VTOL QACRO",
        description: "Native QuadPlane QACRO model. It is linear stick-to-rate with separate max rates and no native QACRO expo.",
        notices: [
          {
            id: "qacro-linear",
            tone: "info",
            text: "QACRO has no native expo; the preview is a linear stick-to-rate curve.",
          },
        ],
        axes: [
          linearAxis("roll", "VTOL Roll", "QACRO roll body-rate request.", "roll", "norm_input", rollRate),
          linearAxis("pitch", "VTOL Pitch", "QACRO pitch body-rate request.", "pitch", "norm_input", pitchRate),
          linearAxis("yaw", "VTOL Yaw", "QACRO yaw body-rate request.", "yaw", "norm_input", yawRate),
        ],
      };
    },
  };
}

function createRoverTurnRateAdapter(): RateCurveAdapter {
  return {
    id: "rover-turn-rate",
    label: "Rover steering turn rate",
    shortLabel: "Rover",
    matches: ({ itemIndex }) => itemIndex.has("ACRO_TURN_RATE"),
    buildModel(ctx) {
      const turnRate = control(ctx, "ACRO_TURN_RATE", rateControlInput("Steering turn rate", "Maximum Rover Acro turn rate at full steering input.", 0, 360));
      return {
        id: "rover-turn-rate",
        label: "Rover steering turn rate",
        shortLabel: "Rover",
        description: "Native Rover Acro steering model. This is a ground turn-rate target, not aircraft roll/pitch/yaw body rates.",
        notices: [
          {
            id: "rover-steering-only",
            tone: "info",
            text: "Rover Acro edits steering-to-turn-rate behavior. It is not a multirotor Acro body-rate curve.",
          },
        ],
        axes: [linearAxis("steering", "Steering", "Steering input to turn-rate target.", "steering", "control_in", turnRate)],
      };
    },
  };
}

function createSubAcroAdapter(): RateCurveAdapter {
  return {
    id: "sub-acro",
    label: "Sub Acro",
    shortLabel: "Sub",
    matches: ({ itemIndex }) => hasAll(itemIndex, ["ACRO_RP_P", "ACRO_YAW_P", "ACRO_EXPO"]) && !itemIndex.has("ACRO_RP_RATE"),
    buildModel(ctx) {
      const rpGain = control(ctx, "ACRO_RP_P", {
        label: "Roll/Pitch gain",
        description: "Legacy gain that converts roll and pitch stick input to desired Sub Acro rate.",
        role: "gain",
        fallbackMin: 1,
        fallbackMax: 10,
        fallbackStep: 0.001,
        detail: (value) => `≈ ${formatRateValue(value * 45)} full-stick`,
      });
      const yawGain = control(ctx, "ACRO_YAW_P", {
        label: "Yaw gain",
        description: "Legacy gain that converts yaw stick input to desired Sub Acro rate.",
        role: "gain",
        fallbackMin: 1,
        fallbackMax: 10,
        fallbackStep: 0.001,
        detail: (value) => `≈ ${formatRateValue(value * 45)} full-stick`,
      });
      const expo = control(ctx, "ACRO_EXPO", {
        label: "Roll/Pitch expo",
        description: "Sub applies this expo to roll and pitch only; yaw stays linear.",
        role: "expo",
        fallbackMin: -0.5,
        fallbackMax: 0.95,
        fallbackStep: 0.01,
      });

      return {
        id: "sub-acro",
        label: "Sub Acro",
        shortLabel: "Sub",
        description: "Native Sub Acro model using legacy gain parameters. The UI displays the approximate full-stick rate they imply.",
        notices: [
          {
            id: "sub-derived-rate",
            tone: "info",
            text: "Sub stores ACRO_*_P gains, not max-rate degrees/second parameters. Full-stick rates are derived as gain × 45 deg/s.",
          },
        ],
        axes: [
          {
            id: "roll-pitch",
            label: "Roll / Pitch",
            description: "Linked roll and pitch Sub Acro request.",
            unit: "deg/s",
            rcInput: { role: "roll", mode: "control_in" },
            currentPoints: sampleRateCurve((stick) => cubicRateCurve(stick, rpGain.currentValue * 45, Math.max(0, expo.currentValue * 100)), SAMPLES),
            draftPoints: sampleRateCurve((stick) => cubicRateCurve(stick, rpGain.draftValue * 45, Math.max(0, expo.draftValue * 100)), SAMPLES),
            controls: [rpGain, expo],
            summary: `Full stick ≈ ${formatRateValue(rpGain.draftValue * 45)}.`,
          },
          {
            id: "yaw",
            label: "Yaw",
            description: "Linear yaw Sub Acro request.",
            unit: "deg/s",
            rcInput: { role: "yaw", mode: "control_in" },
            currentPoints: sampleRateCurve((stick) => linearRateCurve(stick, yawGain.currentValue * 45), SAMPLES),
            draftPoints: sampleRateCurve((stick) => linearRateCurve(stick, yawGain.draftValue * 45), SAMPLES),
            controls: [yawGain],
            summary: `Full stick ≈ ${formatRateValue(yawGain.draftValue * 45)}.`,
          },
        ],
      };
    },
  };
}

function rateControlInput(label: string, description: string, fallbackMin: number, fallbackMax: number): Parameters<typeof control>[2] {
  return {
    label,
    description,
    role: "rate",
    fallbackMin,
    fallbackMax,
    fallbackStep: 1,
    unit: "deg/s",
  };
}

function expoPercentInput(label: string, description: string): Parameters<typeof control>[2] {
  return {
    label,
    description,
    role: "expo",
    fallbackMin: 0,
    fallbackMax: 100,
    fallbackStep: 1,
    unit: "%",
  };
}

function planeAxis(
  id: RateCurveAxisId,
  label: string,
  description: string,
  role: RcInputRole,
  rate: RateCurveParameterControl,
  expo: RateCurveParameterControl | null,
): RateCurveAxisModel {
  const currentExpo = expo?.currentValue ?? 0;
  const draftExpo = expo?.draftValue ?? 0;
  return {
    id,
    label,
    description,
    unit: "deg/s",
    rcInput: { role, mode: "control_in" },
    currentPoints: sampleRateCurve((stick) => cubicRateCurve(stick, rate.currentValue, currentExpo), SAMPLES),
    draftPoints: sampleRateCurve((stick) => cubicRateCurve(stick, rate.draftValue, draftExpo), SAMPLES),
    controls: [rate, expo].filter((entry): entry is RateCurveParameterControl => entry != null),
    summary: `Full stick ${formatRateValue(rate.draftValue)}${expo ? ` with ${formatParamValue(expo.draftValue)}% expo` : ""}.`,
  };
}

function linearAxis(
  id: RateCurveAxisId,
  label: string,
  description: string,
  role: RcInputRole,
  mode: RcNormalizationMode,
  rate: RateCurveParameterControl,
): RateCurveAxisModel {
  return {
    id,
    label,
    description,
    unit: "deg/s",
    rcInput: { role, mode },
    currentPoints: sampleRateCurve((stick) => linearRateCurve(stick, rate.currentValue), SAMPLES),
    draftPoints: sampleRateCurve((stick) => linearRateCurve(stick, rate.draftValue), SAMPLES),
    controls: [rate],
    summary: `Full stick ${formatRateValue(rate.draftValue)}.`,
  };
}

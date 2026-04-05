import { describe, expect, it } from "vitest";

import {
    BATTERY_CHEMISTRIES,
    calcAccelPRMax,
    calcAccelYMax,
    calcBattArmVolt,
    calcBattCrtVolt,
    calcBattLowVolt,
    calcBattVoltMax,
    calcBattVoltMin,
    calcGyroFilter,
    calcMotThrustExpo,
} from "../../data/battery-presets";
import type { ParamMetadataMap } from "../../param-metadata";
import type { ParamStore } from "../../params";
import type { StagedParameterEdit } from "../stores/params-staged-edits";
import {
    buildParameterWorkflowSections,
    validateBatteryWorkflowInputs,
    validateFlightWorkflowInputs,
} from "./parameter-workflows";

function createParamStore(overrides: Partial<ParamStore["params"]> = {}): ParamStore {
    return {
        expected_count: 13,
        params: {
            ARMING_CHECK: { name: "ARMING_CHECK", value: 0, param_type: "uint8", index: 0 },
            FS_THR_ENABLE: { name: "FS_THR_ENABLE", value: 0, param_type: "uint8", index: 1 },
            BATT_FS_LOW_ACT: { name: "BATT_FS_LOW_ACT", value: 0, param_type: "uint8", index: 2 },
            BATT_FS_CRT_ACT: { name: "BATT_FS_CRT_ACT", value: 0, param_type: "uint8", index: 3 },
            BATT_ARM_VOLT: { name: "BATT_ARM_VOLT", value: 12.6, param_type: "real32", index: 4 },
            BATT_LOW_VOLT: { name: "BATT_LOW_VOLT", value: 12.1, param_type: "real32", index: 5 },
            BATT_CRT_VOLT: { name: "BATT_CRT_VOLT", value: 11.7, param_type: "real32", index: 6 },
            MOT_BAT_VOLT_MAX: { name: "MOT_BAT_VOLT_MAX", value: 12.6, param_type: "real32", index: 7 },
            MOT_BAT_VOLT_MIN: { name: "MOT_BAT_VOLT_MIN", value: 11.1, param_type: "real32", index: 8 },
            MOT_THST_EXPO: { name: "MOT_THST_EXPO", value: 0.35, param_type: "real32", index: 9 },
            INS_GYRO_FILTER: { name: "INS_GYRO_FILTER", value: 20, param_type: "uint16", index: 10 },
            ATC_ACCEL_P_MAX: { name: "ATC_ACCEL_P_MAX", value: 10000, param_type: "uint32", index: 11 },
            ATC_ACCEL_R_MAX: { name: "ATC_ACCEL_R_MAX", value: 10000, param_type: "uint32", index: 12 },
            ATC_ACCEL_Y_MAX: { name: "ATC_ACCEL_Y_MAX", value: 8000, param_type: "uint32", index: 13 },
            ...overrides,
        },
    };
}

function createMetadata(): ParamMetadataMap {
    return new Map([
        [
            "ARMING_CHECK",
            {
                humanName: "Arming checks",
                description: "Controls pre-arm validation.",
                values: [
                    { code: 0, label: "Disabled" },
                    { code: 1, label: "All checks" },
                ],
            },
        ],
        [
            "FS_THR_ENABLE",
            {
                humanName: "Throttle failsafe",
                description: "Select the throttle failsafe behavior.",
                values: [
                    { code: 0, label: "Disabled" },
                    { code: 1, label: "Enabled always" },
                ],
            },
        ],
        [
            "BATT_FS_LOW_ACT",
            {
                humanName: "Low battery action",
                description: "Action taken on low battery.",
                values: [
                    { code: 0, label: "None" },
                    { code: 2, label: "RTL" },
                ],
            },
        ],
        [
            "BATT_FS_CRT_ACT",
            {
                humanName: "Critical battery action",
                description: "Action taken on critical battery.",
                values: [
                    { code: 0, label: "None" },
                    { code: 1, label: "Land" },
                ],
            },
        ],
        [
            "BATT_ARM_VOLT",
            {
                humanName: "Arm voltage",
                description: "Minimum voltage required to arm.",
                unitText: "V",
            },
        ],
        [
            "BATT_LOW_VOLT",
            {
                humanName: "Low voltage",
                description: "Battery warning threshold.",
                unitText: "V",
            },
        ],
        [
            "BATT_CRT_VOLT",
            {
                humanName: "Critical voltage",
                description: "Battery critical threshold.",
                unitText: "V",
            },
        ],
        [
            "MOT_BAT_VOLT_MAX",
            {
                humanName: "Motor battery max",
                description: "Maximum battery voltage used by motor compensation.",
                unitText: "V",
            },
        ],
        [
            "MOT_BAT_VOLT_MIN",
            {
                humanName: "Motor battery min",
                description: "Minimum battery voltage used by motor compensation.",
                unitText: "V",
            },
        ],
        [
            "MOT_THST_EXPO",
            {
                humanName: "Thrust expo",
                description: "Throttle curve exponent.",
            },
        ],
        [
            "INS_GYRO_FILTER",
            {
                humanName: "Gyro filter",
                description: "Primary gyro filter.",
                unitText: "Hz",
            },
        ],
        [
            "ATC_ACCEL_P_MAX",
            {
                humanName: "Pitch accel max",
                description: "Pitch acceleration limit.",
            },
        ],
        [
            "ATC_ACCEL_R_MAX",
            {
                humanName: "Roll accel max",
                description: "Roll acceleration limit.",
            },
        ],
        [
            "ATC_ACCEL_Y_MAX",
            {
                humanName: "Yaw accel max",
                description: "Yaw acceleration limit.",
            },
        ],
    ]);
}

function findCard(cardId: string) {
    const sections = buildParameterWorkflowSections({
        paramStore: createParamStore(),
        metadata: createMetadata(),
        metadataState: "ready",
        stagedEdits: {},
        batteryInputs: { cellCount: 4, chemistryIndex: 0 },
        flightInputs: { propInches: 9 },
    });

    return sections.flatMap((section) => section.cards).find((card) => card.id === cardId)!;
}

describe("parameter workflows", () => {
    it("reuses the shared battery and flight formulas for guided recommendations", () => {
        const batteryCard = findCard("battery");
        const flightCard = findCard("flight");
        const chemistry = BATTERY_CHEMISTRIES[0];

        expect(batteryCard.recommendations.find((row) => row.name === "BATT_ARM_VOLT")?.proposedValue).toBeCloseTo(
            calcBattArmVolt(4, chemistry.cellVoltMin),
            2,
        );
        expect(batteryCard.recommendations.find((row) => row.name === "BATT_LOW_VOLT")?.proposedValue).toBeCloseTo(
            calcBattLowVolt(4, chemistry.cellVoltMin),
            2,
        );
        expect(batteryCard.recommendations.find((row) => row.name === "BATT_CRT_VOLT")?.proposedValue).toBeCloseTo(
            calcBattCrtVolt(4, chemistry.cellVoltMin),
            2,
        );
        expect(batteryCard.recommendations.find((row) => row.name === "MOT_BAT_VOLT_MAX")?.proposedValue).toBeCloseTo(
            calcBattVoltMax(4, chemistry.cellVoltMax),
            2,
        );
        expect(batteryCard.recommendations.find((row) => row.name === "MOT_BAT_VOLT_MIN")?.proposedValue).toBeCloseTo(
            calcBattVoltMin(4, chemistry.cellVoltMin),
            2,
        );

        expect(flightCard.recommendations.find((row) => row.name === "MOT_THST_EXPO")?.proposedValue).toBe(
            calcMotThrustExpo(9),
        );
        expect(flightCard.recommendations.find((row) => row.name === "INS_GYRO_FILTER")?.proposedValue).toBe(
            calcGyroFilter(9),
        );
        expect(flightCard.recommendations.find((row) => row.name === "ATC_ACCEL_P_MAX")?.proposedValue).toBe(
            calcAccelPRMax(9),
        );
        expect(flightCard.recommendations.find((row) => row.name === "ATC_ACCEL_R_MAX")?.proposedValue).toBe(
            calcAccelPRMax(9),
        );
        expect(flightCard.recommendations.find((row) => row.name === "ATC_ACCEL_Y_MAX")?.proposedValue).toBe(
            calcAccelYMax(9),
        );
    });

    it("disables guided cards while metadata is loading or unavailable", () => {
        for (const metadataState of ["loading", "unavailable"] as const) {
            const sections = buildParameterWorkflowSections({
                paramStore: createParamStore(),
                metadata: metadataState === "unavailable" ? null : createMetadata(),
                metadataState,
                stagedEdits: {},
                batteryInputs: { cellCount: 4, chemistryIndex: 0 },
                flightInputs: { propInches: 9 },
            });

            for (const card of sections.flatMap((section) => section.cards)) {
                expect(card.status).toBe("disabled");
                expect(card.recommendations).toHaveLength(0);
                expect(card.disabledMessage).toBeTruthy();
            }
        }
    });

    it("keeps partially available workflows by dropping rows with missing params or metadata", () => {
        const metadata = createMetadata();
        metadata.delete("FS_THR_ENABLE");
        const sections = buildParameterWorkflowSections({
            paramStore: createParamStore({ BATT_FS_CRT_ACT: undefined as never }),
            metadata,
            metadataState: "ready",
            stagedEdits: {},
            batteryInputs: { cellCount: 4, chemistryIndex: 0 },
            flightInputs: { propInches: 9 },
        });

        const safetyCard = sections.flatMap((section) => section.cards).find((card) => card.id === "safety")!;

        expect(safetyCard.status).toBe("ready");
        expect(safetyCard.recommendations.map((row) => row.name)).toEqual(["ARMING_CHECK", "BATT_FS_LOW_ACT"]);
        expect(safetyCard.unavailableCount).toBe(2);
        expect(safetyCard.detail).toContain("2 recommendations are unavailable");
    });

    it("tracks when a recommendation is already queued in the shared staging model", () => {
        const stagedEdits: Record<string, StagedParameterEdit> = {
            FS_THR_ENABLE: {
                name: "FS_THR_ENABLE",
                label: "Throttle failsafe",
                rawName: "FS_THR_ENABLE",
                description: "Select the throttle failsafe behavior.",
                currentValue: 0,
                currentValueText: "0",
                nextValue: 1,
                nextValueText: "1",
                units: null,
                rebootRequired: false,
                order: 1,
            },
        };

        const sections = buildParameterWorkflowSections({
            paramStore: createParamStore(),
            metadata: createMetadata(),
            metadataState: "ready",
            stagedEdits,
            batteryInputs: { cellCount: 4, chemistryIndex: 0 },
            flightInputs: { propInches: 9 },
        });

        const safetyCard = sections.flatMap((section) => section.cards).find((card) => card.id === "safety")!;
        const failsafeRow = safetyCard.recommendations.find((row) => row.name === "FS_THR_ENABLE");

        expect(safetyCard.queuedCount).toBe(1);
        expect(failsafeRow?.isQueued).toBe(true);
        expect(failsafeRow?.queuedValue).toBe(1);
    });
});

describe("workflow input validation", () => {
    it("rejects malformed battery workflow inputs", () => {
        expect(validateBatteryWorkflowInputs({ cellCount: 0, chemistryIndex: 0 })).toMatchObject({
            valid: false,
            message: "Enter a valid battery cell count before queuing recommendations.",
        });
        expect(validateBatteryWorkflowInputs({ cellCount: 4, chemistryIndex: 99 })).toMatchObject({
            valid: false,
            message: "Choose a supported battery chemistry before queuing recommendations.",
        });
    });

    it("rejects malformed flight workflow inputs", () => {
        expect(validateFlightWorkflowInputs({ propInches: null })).toMatchObject({
            valid: false,
            message: "Enter a valid prop size before queuing recommendations.",
        });
        expect(validateFlightWorkflowInputs({ propInches: Number.NaN })).toMatchObject({
            valid: false,
            message: "Enter a valid prop size before queuing recommendations.",
        });
    });
});

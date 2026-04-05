// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { writable } from "svelte/store";
import { afterEach, describe, expect, it } from "vitest";

import type { ParamMetadataMap } from "../../param-metadata";
import type { ParameterItemModel } from "../../lib/params/parameter-item-model";
import {
    type ParamsStore,
    type ParamsStoreState,
} from "../../lib/stores/params";
import { withParameterWorkspaceContext } from "../../test/context-harnesses";
import ParameterWorkspace from "./ParameterWorkspace.svelte";
import { parameterWorkspaceTestIds } from "./parameter-workspace-test-ids";

function createMetadata(): ParamMetadataMap {
    return new Map([
        [
            "ARMING_CHECK",
            {
                humanName: "Arming checks",
                description: "Controls pre-arm validation.",
                rebootRequired: true,
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

function createState(overrides: Partial<ParamsStoreState> = {}): ParamsStoreState {
    return {
        hydrated: true,
        phase: "ready",
        streamReady: true,
        streamError: null,
        sessionHydrated: true,
        sessionPhase: "ready",
        activeEnvelope: {
            session_id: "session-1",
            source_kind: "live",
            seek_epoch: 0,
            reset_revision: 0,
        },
        activeSource: "live",
        vehicleType: "quadrotor",
        paramStore: {
            expected_count: 14,
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
            },
        },
        paramProgress: "completed",
        metadata: createMetadata(),
        metadataState: "ready",
        metadataError: null,
        stagedEdits: {},
        retainedFailures: {},
        applyPhase: "idle",
        applyError: null,
        applyProgress: null,
        scopeClearWarning: null,
        lastNotice: null,
        ...overrides,
    };
}

function createHarnessStore(initialState: ParamsStoreState): ParamsStore {
    const backing = writable(initialState);

    return {
        subscribe: backing.subscribe,
        initialize: async () => undefined,
        reset: () => undefined,
        clearStagedEdits: () => {
            backing.update((state) => ({
                ...state,
                stagedEdits: {},
                retainedFailures: {},
                applyPhase: "idle",
                applyError: null,
                applyProgress: null,
            }));
        },
        discardStagedEdit: (name: string) => {
            backing.update((state) => {
                const stagedEdits = { ...state.stagedEdits };
                const retainedFailures = { ...state.retainedFailures };
                delete stagedEdits[name];
                delete retainedFailures[name];
                return { ...state, stagedEdits, retainedFailures };
            });
        },
        stageParameterEdit: (item: ParameterItemModel, nextValue: number) => {
            backing.update((state) => {
                const stagedEdits = { ...state.stagedEdits };
                const retainedFailures = { ...state.retainedFailures };
                const currentValue = state.paramStore?.params[item.name]?.value ?? item.value;
                if (nextValue === currentValue) {
                    delete stagedEdits[item.name];
                    delete retainedFailures[item.name];
                    return { ...state, stagedEdits, retainedFailures };
                }

                stagedEdits[item.name] = {
                    name: item.name,
                    label: item.label,
                    rawName: item.rawName,
                    description: item.description,
                    currentValue,
                    currentValueText: String(currentValue),
                    nextValue,
                    nextValueText: String(nextValue),
                    units: item.units,
                    rebootRequired: item.rebootRequired,
                    order: item.order,
                };
                delete retainedFailures[item.name];

                return { ...state, stagedEdits, retainedFailures, scopeClearWarning: null };
            });
        },
        applyStagedEdits: async () => undefined,
    } as ParamsStore;
}

afterEach(() => {
    cleanup();
});

describe("ParameterWorkspace", () => {
    it("renders the workflow-first default surface and keeps raw editors out of the default mode", () => {
        render(withParameterWorkspaceContext(createHarnessStore(createState()), ParameterWorkspace));

        expect(screen.getByTestId(parameterWorkspaceTestIds.root)).toBeTruthy();
        expect(screen.getByTestId(parameterWorkspaceTestIds.state).textContent?.trim()).toBe("Settings ready");
        expect(screen.getByTestId(`${parameterWorkspaceTestIds.workflowCardPrefix}-battery`)).toBeTruthy();
        expect(screen.getByTestId(`${parameterWorkspaceTestIds.workflowCardPrefix}-safety`)).toBeTruthy();
        expect(screen.getByTestId(`${parameterWorkspaceTestIds.workflowCardPrefix}-flight`)).toBeTruthy();
        expect(screen.getByTestId(parameterWorkspaceTestIds.advancedEntry)).toBeTruthy();
        expect(screen.queryByTestId(`${parameterWorkspaceTestIds.itemPrefix}-ARMING_CHECK`)).toBeNull();

        expect(
            screen.getByTestId(`${parameterWorkspaceTestIds.workflowCurrentPrefix}-battery-BATT_LOW_VOLT`).textContent,
        ).toContain("12.1 V");
        expect(
            screen.getByTestId(`${parameterWorkspaceTestIds.workflowProposedPrefix}-battery-BATT_LOW_VOLT`).textContent,
        ).toContain("14.4 V");
    });

    it("queues a workflow card through the shared staged count and marks queued recommendations", async () => {
        render(withParameterWorkspaceContext(createHarnessStore(createState()), ParameterWorkspace));

        await fireEvent.click(screen.getByTestId(`${parameterWorkspaceTestIds.workflowStageButtonPrefix}-safety`));

        expect(screen.getByTestId(parameterWorkspaceTestIds.pendingCount).textContent).toContain("4 pending");
        expect(
            screen.getByTestId(`${parameterWorkspaceTestIds.workflowRowStatePrefix}-safety-ARMING_CHECK`).textContent,
        ).toContain("Queued");
        expect(
            screen.getByTestId(`${parameterWorkspaceTestIds.workflowRowStatePrefix}-safety-FS_THR_ENABLE`).textContent,
        ).toContain("Queued");
    });

    it("keeps workflow cards visible but disabled when metadata is unavailable and routes recovery through Advanced parameters", async () => {
        render(withParameterWorkspaceContext(createHarnessStore(createState({
            metadata: null,
            metadataState: "unavailable",
            metadataError: "Parameter metadata is unavailable for this vehicle type.",
        })), ParameterWorkspace));

        expect(screen.getByTestId(`${parameterWorkspaceTestIds.workflowDisabledPrefix}-battery`).textContent).toContain(
            "Parameter info is unavailable",
        );
        expect(screen.getByTestId(`${parameterWorkspaceTestIds.workflowDisabledPrefix}-safety`).textContent).toContain(
            "Open Advanced parameters",
        );

        await fireEvent.click(screen.getByTestId(parameterWorkspaceTestIds.advancedButton));

        expect(screen.getByTestId(parameterWorkspaceTestIds.advancedPanel)).toBeTruthy();
        expect(screen.getByTestId(`${parameterWorkspaceTestIds.itemPrefix}-ARMING_CHECK`).textContent).toContain("ARMING_CHECK");

        await fireEvent.input(screen.getByTestId(`${parameterWorkspaceTestIds.inputPrefix}-ARMING_CHECK`), {
            target: { value: "1" },
        });
        await fireEvent.click(screen.getByTestId(`${parameterWorkspaceTestIds.stageButtonPrefix}-ARMING_CHECK`));

        expect(screen.getByTestId(parameterWorkspaceTestIds.pendingCount).textContent).toContain("1 pending");
    });

    it("preserves the last valid flight recommendations while invalid prop input disables queueing", async () => {
        render(withParameterWorkspaceContext(createHarnessStore(createState()), ParameterWorkspace));

        const propInput = screen.getByTestId(`${parameterWorkspaceTestIds.workflowInputPrefix}-flight-prop`);
        const stageButton = screen.getByTestId(`${parameterWorkspaceTestIds.workflowStageButtonPrefix}-flight`);
        const proposed = screen.getByTestId(`${parameterWorkspaceTestIds.workflowProposedPrefix}-flight-MOT_THST_EXPO`);

        expect(proposed.textContent).toContain("0.58");
        expect((stageButton as HTMLButtonElement).disabled).toBe(false);

        await fireEvent.input(propInput, { target: { value: "0" } });

        expect(screen.getByText("Enter a valid prop size before queuing recommendations.")).toBeTruthy();
        expect(proposed.textContent).toContain("0.58");
        expect((stageButton as HTMLButtonElement).disabled).toBe(true);

        await fireEvent.input(propInput, { target: { value: "10" } });

        await waitFor(() => {
            expect(screen.getByTestId(`${parameterWorkspaceTestIds.workflowProposedPrefix}-flight-MOT_THST_EXPO`).textContent).toContain(
                "0.6",
            );
        });
        expect((stageButton as HTMLButtonElement).disabled).toBe(false);
    });

    it("shows already-aligned guided starters without queueing a no-op card", () => {
        render(withParameterWorkspaceContext(createHarnessStore(createState({
            paramStore: {
                expected_count: 14,
                params: {
                    ...createState().paramStore!.params,
                    ARMING_CHECK: { name: "ARMING_CHECK", value: 1, param_type: "uint8", index: 0 },
                    FS_THR_ENABLE: { name: "FS_THR_ENABLE", value: 1, param_type: "uint8", index: 1 },
                    BATT_FS_LOW_ACT: { name: "BATT_FS_LOW_ACT", value: 2, param_type: "uint8", index: 2 },
                    BATT_FS_CRT_ACT: { name: "BATT_FS_CRT_ACT", value: 1, param_type: "uint8", index: 3 },
                },
            },
        })), ParameterWorkspace));

        expect(screen.getByTestId(`${parameterWorkspaceTestIds.workflowSummaryPrefix}-safety`).textContent).toContain(
            "already match the current vehicle",
        );
        expect(screen.getByTestId(`${parameterWorkspaceTestIds.workflowStageButtonPrefix}-safety`) instanceof HTMLButtonElement).toBe(true);
        expect(
            (screen.getByTestId(`${parameterWorkspaceTestIds.workflowStageButtonPrefix}-safety`) as HTMLButtonElement)
                .disabled,
        ).toBe(true);
    });
});

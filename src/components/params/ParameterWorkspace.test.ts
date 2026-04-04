// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { writable } from "svelte/store";
import { afterEach, describe, expect, it } from "vitest";

import ParameterWorkspace from "./ParameterWorkspace.svelte";
import {
  parameterWorkspaceTestIds,
} from "./parameter-workspace-test-ids";
import type { ParamMetadataMap } from "../../param-metadata";
import type { ParameterWorkspaceItem } from "../../lib/params/workspace-sections";
import {
  type ParamsStore,
  type ParamsStoreState,
} from "../../lib/stores/params";
import { withParameterWorkspaceContext } from "../../test/context-harnesses";

function createState(overrides: Partial<ParamsStoreState> = {}): ParamsStoreState {
  const metadata = new Map<string, {
    humanName: string;
    description: string;
    rebootRequired?: boolean;
  }>([
    [
      "ARMING_CHECK",
      {
        humanName: "Arming checks",
        description: "Controls pre-arm validation.",
        rebootRequired: true,
      },
    ],
    [
      "FS_THR_ENABLE",
      {
        humanName: "Throttle failsafe",
        description: "Select the throttle failsafe behavior.",
      },
    ],
  ]) as ParamMetadataMap;

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
      expected_count: 2,
      params: {
        ARMING_CHECK: { name: "ARMING_CHECK", value: 1, param_type: "uint8", index: 0 },
        FS_THR_ENABLE: { name: "FS_THR_ENABLE", value: 2, param_type: "uint8", index: 1 },
      },
    },
    paramProgress: "completed",
    metadata,
    metadataState: "ready",
    metadataError: null,
    stagedEdits: {},
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
      backing.update((state) => ({ ...state, stagedEdits: {} }));
    },
    discardStagedEdit: (name: string) => {
      backing.update((state) => {
        const stagedEdits = { ...state.stagedEdits };
        delete stagedEdits[name];
        return { ...state, stagedEdits };
      });
    },
    stageParameterEdit: (item: ParameterWorkspaceItem, nextValue: number) => {
      backing.update((state) => {
        const stagedEdits = { ...state.stagedEdits };
        const currentValue = state.paramStore?.params[item.name]?.value ?? item.value;
        if (nextValue === currentValue) {
          delete stagedEdits[item.name];
          return { ...state, stagedEdits };
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

        return { ...state, stagedEdits };
      });
    },
  } as ParamsStore;
}

function createMutableHarnessStore(initialState: ParamsStoreState) {
  const backing = writable(initialState);

  return {
    store: {
      subscribe: backing.subscribe,
      initialize: async () => undefined,
      reset: () => undefined,
      clearStagedEdits: () => {
        backing.update((state) => ({ ...state, stagedEdits: {} }));
      },
      discardStagedEdit: (name: string) => {
        backing.update((state) => {
          const stagedEdits = { ...state.stagedEdits };
          delete stagedEdits[name];
          return { ...state, stagedEdits };
        });
      },
      stageParameterEdit: (item: ParameterWorkspaceItem, nextValue: number) => {
        backing.update((state) => {
          const stagedEdits = { ...state.stagedEdits };
          const currentValue = state.paramStore?.params[item.name]?.value ?? item.value;
          if (nextValue === currentValue) {
            delete stagedEdits[item.name];
            return { ...state, stagedEdits };
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

          return { ...state, stagedEdits };
        });
      },
    } as ParamsStore,
    updateState(next: (state: ParamsStoreState) => ParamsStoreState) {
      backing.update(next);
    },
  };
}

afterEach(() => {
  cleanup();
});

describe("ParameterWorkspace", () => {
  it("renders an explicit bootstrapping state while the scoped parameter snapshot is still pending", () => {
    const store = createHarnessStore(createState({
      hydrated: false,
      phase: "bootstrapping",
      sessionHydrated: false,
      sessionPhase: "bootstrapping",
      activeEnvelope: null,
      activeSource: null,
      paramStore: null,
      paramProgress: { downloading: { received: 1, expected: 3 } },
      metadataState: "idle",
      metadata: null,
    }));

    render(withParameterWorkspaceContext(store, ParameterWorkspace));

    expect(screen.getByTestId(parameterWorkspaceTestIds.state).textContent?.trim()).toBe("Loading settings");
    expect(screen.getByTestId(parameterWorkspaceTestIds.empty).textContent).toContain("Loading parameter data");
  });

  it("stages multiple curated edits, shows reboot markers, and unstages when an edit returns to the current value", async () => {
    render(withParameterWorkspaceContext(createHarnessStore(createState()), ParameterWorkspace));

    const armingInput = screen.getByTestId(`${parameterWorkspaceTestIds.inputPrefix}-ARMING_CHECK`);
    const failsafeInput = screen.getByTestId(`${parameterWorkspaceTestIds.inputPrefix}-FS_THR_ENABLE`);

    await fireEvent.input(armingInput, { target: { value: "3" } });
    await fireEvent.click(screen.getByTestId(`${parameterWorkspaceTestIds.stageButtonPrefix}-ARMING_CHECK`));
    await fireEvent.input(failsafeInput, { target: { value: "4" } });
    await fireEvent.click(screen.getByTestId(`${parameterWorkspaceTestIds.stageButtonPrefix}-FS_THR_ENABLE`));

    expect(screen.getByTestId(parameterWorkspaceTestIds.pendingCount).textContent).toContain("2 pending");
    expect(screen.getByTestId(`${parameterWorkspaceTestIds.diffPrefix}-ARMING_CHECK`).textContent).toContain("1");
    expect(screen.getByTestId(`${parameterWorkspaceTestIds.diffPrefix}-ARMING_CHECK`).textContent).toContain("3");
    expect(screen.getByTestId(`${parameterWorkspaceTestIds.diffPrefix}-FS_THR_ENABLE`).textContent).toContain("2");
    expect(screen.getByTestId(`${parameterWorkspaceTestIds.diffPrefix}-FS_THR_ENABLE`).textContent).toContain("4");
    expect(screen.getByTestId(`${parameterWorkspaceTestIds.rebootBadgePrefix}-ARMING_CHECK`).textContent).toContain("Reboot required");

    await fireEvent.input(armingInput, { target: { value: "1" } });
    await fireEvent.click(screen.getByTestId(`${parameterWorkspaceTestIds.stageButtonPrefix}-ARMING_CHECK`));

    expect(screen.queryByTestId(`${parameterWorkspaceTestIds.diffPrefix}-ARMING_CHECK`)).toBeNull();
    expect(screen.getByTestId(parameterWorkspaceTestIds.pendingCount).textContent).toContain("1 pending");
  });

  it("keeps raw parameter visibility and editable staging when reboot metadata is unavailable", async () => {
    const store = createHarnessStore(createState({
      metadata: null,
      metadataState: "unavailable",
      metadataError: "Parameter metadata is unavailable for this vehicle type.",
    }));

    render(withParameterWorkspaceContext(store, ParameterWorkspace));

    expect(screen.getByTestId(`${parameterWorkspaceTestIds.itemPrefix}-ARMING_CHECK`).textContent).toContain("ARMING_CHECK");
    expect(screen.queryByTestId(`${parameterWorkspaceTestIds.rebootBadgePrefix}-ARMING_CHECK`)).toBeNull();

    const input = screen.getByTestId(`${parameterWorkspaceTestIds.inputPrefix}-ARMING_CHECK`);
    await fireEvent.input(input, { target: { value: "5" } });
    await fireEvent.click(screen.getByTestId(`${parameterWorkspaceTestIds.stageButtonPrefix}-ARMING_CHECK`));

    expect(screen.getByTestId(parameterWorkspaceTestIds.pendingCount).textContent).toContain("1 pending");
    expect(screen.getByTestId(`${parameterWorkspaceTestIds.diffPrefix}-ARMING_CHECK`).textContent).toContain("5");
  });

  it("resets staged draft input on scope changes so values do not leak across envelopes", async () => {
    render(withParameterWorkspaceContext(createHarnessStore(createState()), ParameterWorkspace));

    const input = screen.getByTestId(`${parameterWorkspaceTestIds.inputPrefix}-ARMING_CHECK`) as HTMLInputElement;
    await fireEvent.input(input, { target: { value: "9" } });
    await fireEvent.click(screen.getByTestId(`${parameterWorkspaceTestIds.stageButtonPrefix}-ARMING_CHECK`));
    expect(input.value).toBe("9");

    cleanup();

    render(withParameterWorkspaceContext(createHarnessStore(createState({
      activeEnvelope: {
        session_id: "session-2",
        source_kind: "live",
        seek_epoch: 0,
        reset_revision: 1,
      },
      paramStore: {
        expected_count: 2,
        params: {
          ARMING_CHECK: { name: "ARMING_CHECK", value: 4, param_type: "uint8", index: 0 },
          FS_THR_ENABLE: { name: "FS_THR_ENABLE", value: 2, param_type: "uint8", index: 1 },
        },
      },
      stagedEdits: {},
    })), ParameterWorkspace));

    const nextInput = screen.getByTestId(`${parameterWorkspaceTestIds.inputPrefix}-ARMING_CHECK`) as HTMLInputElement;
    expect(nextInput.value).toBe("4");
    expect(nextInput.value).not.toBe("9");
  });

  it("resets local draft inputs when the active envelope changes without remounting the workspace", async () => {
    const harness = createMutableHarnessStore(createState());
    render(withParameterWorkspaceContext(harness.store, ParameterWorkspace));

    const input = screen.getByTestId(`${parameterWorkspaceTestIds.inputPrefix}-ARMING_CHECK`) as HTMLInputElement;
    await fireEvent.input(input, { target: { value: "8" } });
    expect(input.value).toBe("8");

    harness.updateState((state) => ({
      ...state,
      activeEnvelope: {
        session_id: "session-2",
        source_kind: "live",
        seek_epoch: 0,
        reset_revision: 1,
      },
      paramStore: {
        expected_count: 2,
        params: {
          ...state.paramStore!.params,
          ARMING_CHECK: { name: "ARMING_CHECK", value: 6, param_type: "uint8", index: 0 },
        },
      },
      stagedEdits: {},
    }));

    await waitFor(() => {
      expect((screen.getByTestId(`${parameterWorkspaceTestIds.inputPrefix}-ARMING_CHECK`) as HTMLInputElement).value).toBe("6");
    });
  });
});

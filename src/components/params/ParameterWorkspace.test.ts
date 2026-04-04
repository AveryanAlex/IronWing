// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { writable } from "svelte/store";
import { afterEach, describe, expect, it } from "vitest";

import ParameterWorkspace from "./ParameterWorkspace.svelte";
import {
  parameterWorkspaceTestIds,
  type ParameterWorkspaceItem,
} from "./parameter-workspace-sections";
import type { ParamMetadataMap } from "../../param-metadata";
import type { ParamsStore, ParamsStoreState } from "../../lib/stores/params";

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

afterEach(() => {
  cleanup();
});

describe("ParameterWorkspace", () => {
  it("renders an explicit bootstrapping state while the scoped parameter snapshot is still pending", () => {
    render(ParameterWorkspace, {
      props: {
        store: createHarnessStore(createState({
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
        })),
      },
    });

    expect(screen.getByTestId(parameterWorkspaceTestIds.state).textContent?.trim()).toBe("bootstrapping");
    expect(screen.getByTestId(parameterWorkspaceTestIds.empty).textContent).toContain("Waiting for scoped parameter data");
  });

  it("stages multiple curated edits, shows reboot markers, and unstages when an edit returns to the current value", async () => {
    render(ParameterWorkspace, {
      props: {
        store: createHarnessStore(createState()),
      },
    });

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
    render(ParameterWorkspace, {
      props: {
        store: createHarnessStore(createState({
          metadata: null,
          metadataState: "unavailable",
          metadataError: "Parameter metadata is unavailable for this vehicle type.",
        })),
      },
    });

    expect(screen.getByTestId(`${parameterWorkspaceTestIds.itemPrefix}-ARMING_CHECK`).textContent).toContain("ARMING_CHECK");
    expect(screen.queryByTestId(`${parameterWorkspaceTestIds.rebootBadgePrefix}-ARMING_CHECK`)).toBeNull();

    const input = screen.getByTestId(`${parameterWorkspaceTestIds.inputPrefix}-ARMING_CHECK`);
    await fireEvent.input(input, { target: { value: "5" } });
    await fireEvent.click(screen.getByTestId(`${parameterWorkspaceTestIds.stageButtonPrefix}-ARMING_CHECK`));

    expect(screen.getByTestId(parameterWorkspaceTestIds.pendingCount).textContent).toContain("1 pending");
    expect(screen.getByTestId(`${parameterWorkspaceTestIds.diffPrefix}-ARMING_CHECK`).textContent).toContain("5");
  });
});

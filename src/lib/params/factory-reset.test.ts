import { get, writable } from "svelte/store";
import { describe, expect, it, vi } from "vitest";

import type { ParamStore } from "../../params";
import type { ParamsStoreState } from "../stores/params";
import { factoryResetParameters } from "./factory-reset";

function createState(): ParamsStoreState {
  const paramStore: ParamStore = {
    expected_count: 1,
    params: {
      FORMAT_VERSION: {
        name: "FORMAT_VERSION",
        value: 13,
        param_type: "int16",
        index: 0,
      },
    },
  };

  return {
    hydrated: true,
    phase: "ready",
    streamReady: true,
    streamError: null,
    sessionHydrated: true,
    sessionPhase: "ready",
    activeEnvelope: { session_id: "vehicle-1", source_kind: "live", reset_revision: 0 },
    activeSource: "live",
    liveSessionConnected: true,
    vehicleType: "fixed_wing",
    firmwareVersion: "4.6.0",
    paramStore,
    paramProgress: null,
    metadata: null,
    metadataState: "unavailable",
    metadataError: null,
    stagedEdits: {},
    retainedFailures: {},
    applyPhase: "idle",
    applyError: null,
    applyProgress: null,
    scopeClearWarning: null,
    lastNotice: null,
  };
}

describe("factoryResetParameters", () => {
  it("stages FORMAT_VERSION, confirms the write, then reboots", async () => {
    const state = writable(createState());
    const stageParameterEdit = vi.fn();
    const applyStagedEdits = vi.fn(async () => {
      state.update((current) => ({
        ...current,
        paramStore: {
          ...current.paramStore!,
          params: {
            ...current.paramStore!.params,
            FORMAT_VERSION: { ...current.paramStore!.params.FORMAT_VERSION!, value: 0 },
          },
        },
      }));
    });
    const reboot = vi.fn(async () => undefined);

    await factoryResetParameters(
      { subscribe: state.subscribe, stageParameterEdit, applyStagedEdits },
      reboot,
    );

    expect(stageParameterEdit).toHaveBeenCalledWith(expect.objectContaining({ name: "FORMAT_VERSION" }), 0);
    expect(applyStagedEdits).toHaveBeenCalledWith(["FORMAT_VERSION"]);
    expect(reboot).toHaveBeenCalledTimes(1);
  });

  it("does not reboot when the vehicle rejects the reset parameter", async () => {
    const state = writable(createState());
    const applyStagedEdits = vi.fn(async () => {
      state.update((current) => ({
        ...current,
        retainedFailures: {
          FORMAT_VERSION: {
            name: "FORMAT_VERSION",
            requestedValue: 0,
            confirmedValue: 13,
            message: "Vehicle kept the old value.",
          },
        },
      }));
    });
    const reboot = vi.fn(async () => undefined);

    await expect(factoryResetParameters(
      { subscribe: state.subscribe, stageParameterEdit: vi.fn(), applyStagedEdits },
      reboot,
    )).rejects.toThrow("Vehicle kept the old value.");

    expect(get(state).paramStore?.params.FORMAT_VERSION?.value).toBe(13);
    expect(reboot).not.toHaveBeenCalled();
  });

  it("explains that a power cycle completes a confirmed reset when automatic reboot fails", async () => {
    const state = writable(createState());
    const applyStagedEdits = vi.fn(async () => {
      state.update((current) => ({
        ...current,
        paramStore: {
          ...current.paramStore!,
          params: {
            ...current.paramStore!.params,
            FORMAT_VERSION: { ...current.paramStore!.params.FORMAT_VERSION!, value: 0 },
          },
        },
      }));
    });

    await expect(
      factoryResetParameters(
        { subscribe: state.subscribe, stageParameterEdit: vi.fn(), applyStagedEdits },
        vi.fn(async () => {
          throw new Error("reboot command timed out");
        }),
      ),
    ).rejects.toThrow(/Power-cycle the flight controller to complete the reset/);
  });
});

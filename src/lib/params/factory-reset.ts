import { get } from "svelte/store";

import { buildParameterItemIndex } from "./parameter-item-model";
import type { ParamsStore } from "../stores/params";

export const FACTORY_RESET_PARAMETER_NAME = "FORMAT_VERSION";
export const FACTORY_RESET_PARAMETER_VALUE = 0;

type FactoryResetParamsStore = Pick<ParamsStore, "subscribe" | "stageParameterEdit" | "applyStagedEdits">;

export async function factoryResetParameters(
  store: FactoryResetParamsStore,
  reboot: () => Promise<void>,
): Promise<void> {
  const initialState = get(store);
  if (!initialState.liveSessionConnected) {
    throw new Error("Connect to a live vehicle before resetting parameters.");
  }

  const formatVersion = buildParameterItemIndex(initialState.paramStore, initialState.metadata).get(
    FACTORY_RESET_PARAMETER_NAME,
  );
  if (!formatVersion) {
    throw new Error("FORMAT_VERSION is unavailable. Refresh parameters and try again.");
  }

  store.stageParameterEdit(formatVersion, FACTORY_RESET_PARAMETER_VALUE);
  await store.applyStagedEdits([formatVersion.name]);

  const appliedState = get(store);
  const failure = appliedState.retainedFailures[formatVersion.name];
  const confirmedValue = appliedState.paramStore?.params[formatVersion.name]?.value;
  if (failure || confirmedValue !== FACTORY_RESET_PARAMETER_VALUE) {
    throw new Error(failure?.message ?? "The vehicle did not confirm FORMAT_VERSION = 0.");
  }

  try {
    await reboot();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `FORMAT_VERSION was set to 0, but the automatic reboot failed. Power-cycle the flight controller to complete the reset. ${detail}`,
    );
  }
}

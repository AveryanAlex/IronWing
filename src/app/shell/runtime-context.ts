import { createContext } from "svelte";
import type { Readable } from "svelte/store";

import type {
  ParamsStore,
  ParameterWorkspaceViewStore,
} from "../../lib/stores/params";
import type { RuntimeState } from "../../lib/stores/runtime";
import type { SessionStore, SessionViewStore } from "../../lib/stores/session";
import type { OperatorWorkspaceViewStore } from "../../lib/stores/operator-workspace-view";
import type { LiveSettingsStore } from "../../lib/stores/live-settings";
import type {
  MissionPlannerStore,
  MissionPlannerViewStore,
} from "../../lib/stores/mission-planner";
import type {
  SetupWorkspaceStore,
  SetupWorkspaceViewStore,
} from "../../lib/stores/setup-workspace";
import type { ShellChromeState } from "./chrome-state";

export type RuntimeStore = Readable<RuntimeState>;
export type ShellChromeStore = Readable<ShellChromeState>;
export type TelemetrySettingsDialogLauncher = {
  open(): void;
};

export const [getSessionStoreContext, setSessionStoreContext] = createContext<SessionStore>();
export const [getSessionViewStoreContext, setSessionViewStoreContext] = createContext<SessionViewStore>();
export const [getOperatorWorkspaceViewStoreContext, setOperatorWorkspaceViewStoreContext] = createContext<OperatorWorkspaceViewStore>();
export const [getParamsStoreContext, setParamsStoreContext] = createContext<ParamsStore>();
export const [getParameterWorkspaceViewStoreContext, setParameterWorkspaceViewStoreContext] = createContext<ParameterWorkspaceViewStore>();
export const [getSetupWorkspaceStoreContext, setSetupWorkspaceStoreContext] = createContext<SetupWorkspaceStore>();
export const [getSetupWorkspaceViewStoreContext, setSetupWorkspaceViewStoreContext] = createContext<SetupWorkspaceViewStore>();
export const [getMissionPlannerStoreContext, setMissionPlannerStoreContext] = createContext<MissionPlannerStore>();
export const [getMissionPlannerViewStoreContext, setMissionPlannerViewStoreContext] = createContext<MissionPlannerViewStore>();
export const [getRuntimeStoreContext, setRuntimeStoreContext] = createContext<RuntimeStore>();
export const [getShellChromeStoreContext, setShellChromeStoreContext] = createContext<ShellChromeStore>();
export const [getLiveSettingsStoreContext, setLiveSettingsStoreContext] = createContext<LiveSettingsStore>();
export const [getTelemetrySettingsDialogLauncherContext, setTelemetrySettingsDialogLauncherContext] = createContext<TelemetrySettingsDialogLauncher>();

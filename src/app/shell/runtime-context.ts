import { createContext } from "svelte";
import type { Readable } from "svelte/store";

import type { ParamsStore, ParameterWorkspaceViewStore } from "../../lib/stores/params";
import type { RuntimeState } from "../../lib/stores/runtime";
import type { SessionStore, SessionViewStore } from "../../lib/stores/session";
import type { OperatorWorkspaceViewStore } from "../../lib/stores/operator-workspace-view";
import type { ShellChromeState } from "./chrome-state";

export type RuntimeStore = Readable<RuntimeState>;
export type ShellChromeStore = Readable<ShellChromeState>;

export const [getSessionStoreContext, setSessionStoreContext] = createContext<SessionStore>();
export const [getSessionViewStoreContext, setSessionViewStoreContext] = createContext<SessionViewStore>();
export const [getOperatorWorkspaceViewStoreContext, setOperatorWorkspaceViewStoreContext] = createContext<OperatorWorkspaceViewStore>();
export const [getParamsStoreContext, setParamsStoreContext] = createContext<ParamsStore>();
export const [getParameterWorkspaceViewStoreContext, setParameterWorkspaceViewStoreContext] = createContext<ParameterWorkspaceViewStore>();
export const [getRuntimeStoreContext, setRuntimeStoreContext] = createContext<RuntimeStore>();
export const [getShellChromeStoreContext, setShellChromeStoreContext] = createContext<ShellChromeStore>();

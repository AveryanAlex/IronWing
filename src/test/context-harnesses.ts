import { readable } from "svelte/store";

import { createOperatorWorkspaceViewStore } from "../lib/stores/operator-workspace-view";
import {
  createParameterWorkspaceViewStore,
  type ParamsStore,
} from "../lib/stores/params";
import {
  createSetupWorkspaceStore,
  createSetupWorkspaceViewStore,
  type SetupWorkspaceStore,
  type SetupWorkspaceViewStore,
} from "../lib/stores/setup-workspace";
import { runtime } from "../lib/stores/runtime";
import {
  createSessionViewStore,
  type SessionStore,
} from "../lib/stores/session";
import {
  createLiveSettingsStore,
  type LiveSettingsStore,
} from "../lib/stores/live-settings";
import {
  createMissionPlannerStore,
  createMissionPlannerViewStore,
  type MissionPlannerStore,
  type MissionPlannerViewStore,
} from "../lib/stores/mission-planner";
import type { MissionPlannerService } from "../lib/platform/mission-planner";
import type { MissionPlanFileIo } from "../lib/mission-plan-file-io";
import type { LiveSettingsService } from "../lib/platform/live-settings";
import {
  createShellChromeState,
  createShellChromeStore,
  type ShellTier,
} from "../app/shell/chrome-state";
import {
  setLiveSettingsStoreContext,
  setMissionPlannerStoreContext,
  setMissionPlannerViewStoreContext,
  setOperatorWorkspaceViewStoreContext,
  setParamsStoreContext,
  setParameterWorkspaceViewStoreContext,
  setRuntimeStoreContext,
  setSessionStoreContext,
  setSessionViewStoreContext,
  setSetupWorkspaceStoreContext,
  setSetupWorkspaceViewStoreContext,
  setShellChromeStoreContext,
  type ShellChromeStore,
} from "../app/shell/runtime-context";

type RenderableComponent = (...args: any[]) => unknown;

function asRenderable(component: unknown): RenderableComponent {
  return component as RenderableComponent;
}

function createHarnessLiveSettingsService(): LiveSettingsService {
  return {
    loadMessageRateCatalog: async () => [
      { id: 33, name: "Global Position", default_rate_hz: 4 },
      { id: 30, name: "Attitude", default_rate_hz: 4 },
    ],
    applyTelemetryRate: async () => undefined,
    applyMessageRate: async () => undefined,
    formatError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
  } satisfies LiveSettingsService;
}

function createHarnessLiveSettingsStore(sessionStore: SessionStore): LiveSettingsStore {
  return createLiveSettingsStore(sessionStore, createHarnessLiveSettingsService(), null);
}

function createHarnessMissionPlannerService(): MissionPlannerService {
  return {
    subscribeAll: async () => () => {},
    downloadWorkspace: async () => ({
      mission: { items: [] },
      fence: { return_point: null, regions: [] },
      rally: { points: [] },
      home: null,
    }),
    uploadWorkspace: async () => undefined,
    clearWorkspace: async () => undefined,
    validateMission: async () => [],
    cancelTransfer: async () => undefined,
    formatError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
  } satisfies MissionPlannerService;
}

function createHarnessMissionPlanFileIo(): MissionPlanFileIo {
  return {
    importFromPicker: async () => ({ status: "cancelled" }),
    exportToPicker: async () => ({ status: "cancelled" }),
  } satisfies MissionPlanFileIo;
}

function createHarnessMissionPlannerStore(sessionStore: SessionStore): MissionPlannerStore {
  return createMissionPlannerStore(
    sessionStore,
    createHarnessMissionPlannerService(),
    createHarnessMissionPlanFileIo(),
  );
}

export function createStaticShellChromeStore(tier: ShellTier): ShellChromeStore {
  switch (tier) {
    case "phone":
      return readable(createShellChromeState({}, { width: 390, height: 844 }, tier));
    case "tablet":
      return readable(createShellChromeState({ sm: true, md: true }, { width: 834, height: 720 }, tier));
    case "desktop":
      return readable(
        createShellChromeState(
          { sm: true, md: true, lg: true },
          { width: 1180, height: 720 },
          tier,
        ),
      );
    default:
      return readable(
        createShellChromeState(
          { sm: true, md: true, lg: true, xl: true },
          { width: 1440, height: 900 },
          "wide",
        ),
      );
  }
}

export function withSessionContext(store: SessionStore, component: unknown) {
  const renderable = asRenderable(component);

  return function SessionHarness(...args: any[]) {
    const sessionView = createSessionViewStore(store);

    setSessionStoreContext(store);
    setSessionViewStoreContext(sessionView);

    return renderable(...args);
  };
}

export function withParameterWorkspaceContext(store: ParamsStore, component: unknown) {
  const renderable = asRenderable(component);

  return function ParameterWorkspaceHarness(...args: any[]) {
    const parameterView = createParameterWorkspaceViewStore(store);

    setParamsStoreContext(store);
    setParameterWorkspaceViewStoreContext(parameterView);

    return renderable(...args);
  };
}

export function withSetupWorkspaceContext(
  sessionStore: SessionStore,
  parameterStore: ParamsStore,
  component: unknown,
) {
  const renderable = asRenderable(component);

  return function SetupWorkspaceHarness(...args: any[]) {
    const parameterWorkspaceView = createParameterWorkspaceViewStore(parameterStore);
    const setupWorkspaceStore = createSetupWorkspaceStore(sessionStore, parameterStore);
    const setupWorkspaceViewStore = createSetupWorkspaceViewStore(setupWorkspaceStore);

    setSessionStoreContext(sessionStore);
    setParamsStoreContext(parameterStore);
    setParameterWorkspaceViewStoreContext(parameterWorkspaceView);
    setSetupWorkspaceStoreContext(setupWorkspaceStore);
    setSetupWorkspaceViewStoreContext(setupWorkspaceViewStore);

    return renderable(...args);
  };
}

export function withShellContexts(
  store: SessionStore,
  parameterStore: ParamsStore,
  component: unknown,
  options: {
    liveSettingsStore?: LiveSettingsStore;
    missionPlannerStore?: MissionPlannerStore;
    missionPlannerViewStore?: MissionPlannerViewStore;
    setupWorkspaceStore?: SetupWorkspaceStore;
    setupWorkspaceViewStore?: SetupWorkspaceViewStore;
  } = {},
) {
  const renderable = asRenderable(component);

  return function AppShellHarness(...args: any[]) {
    const chrome = createShellChromeStore();
    const sessionView = createSessionViewStore(store);
    const operatorWorkspaceView = createOperatorWorkspaceViewStore(store);
    const parameterWorkspaceView = createParameterWorkspaceViewStore(parameterStore);
    const setupWorkspaceStore = options.setupWorkspaceStore ?? createSetupWorkspaceStore(store, parameterStore);
    const setupWorkspaceViewStore = options.setupWorkspaceViewStore ?? createSetupWorkspaceViewStore(setupWorkspaceStore);
    const liveSettingsStore = options.liveSettingsStore ?? createHarnessLiveSettingsStore(store);
    const missionPlannerStore = options.missionPlannerStore ?? createHarnessMissionPlannerStore(store);
    const missionPlannerViewStore = options.missionPlannerViewStore ?? createMissionPlannerViewStore(missionPlannerStore);

    setSessionStoreContext(store);
    setSessionViewStoreContext(sessionView);
    setOperatorWorkspaceViewStoreContext(operatorWorkspaceView);
    setParamsStoreContext(parameterStore);
    setParameterWorkspaceViewStoreContext(parameterWorkspaceView);
    setSetupWorkspaceStoreContext(setupWorkspaceStore);
    setSetupWorkspaceViewStoreContext(setupWorkspaceViewStore);
    setMissionPlannerStoreContext(missionPlannerStore);
    setMissionPlannerViewStoreContext(missionPlannerViewStore);
    setRuntimeStoreContext(runtime);
    setShellChromeStoreContext(chrome);
    setLiveSettingsStoreContext(liveSettingsStore);

    return renderable(...args);
  };
}

export function withLiveSettingsContext(
  store: LiveSettingsStore,
  component: unknown,
  options: {
    chromeStore?: ShellChromeStore;
    tier?: ShellTier;
  } = {},
) {
  const renderable = asRenderable(component);

  return function LiveSettingsHarness(...args: any[]) {
    const chromeStore = options.chromeStore ?? createStaticShellChromeStore(options.tier ?? "wide");

    setShellChromeStoreContext(chromeStore);
    setLiveSettingsStoreContext(store);

    return renderable(...args);
  };
}

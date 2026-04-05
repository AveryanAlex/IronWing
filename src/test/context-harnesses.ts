import { readable } from "svelte/store";

import { createOperatorWorkspaceViewStore } from "../lib/stores/operator-workspace-view";
import {
  createParameterWorkspaceViewStore,
  type ParamsStore,
} from "../lib/stores/params";
import { runtime } from "../lib/stores/runtime";
import {
  createSessionViewStore,
  type SessionStore,
} from "../lib/stores/session";
import {
  createLiveSettingsStore,
  type LiveSettingsStore,
} from "../lib/stores/live-settings";
import type { LiveSettingsService } from "../lib/platform/live-settings";
import {
  createShellChromeState,
  createShellChromeStore,
  type ShellTier,
} from "../app/shell/chrome-state";
import {
  setLiveSettingsStoreContext,
  setOperatorWorkspaceViewStoreContext,
  setParamsStoreContext,
  setParameterWorkspaceViewStoreContext,
  setRuntimeStoreContext,
  setSessionStoreContext,
  setSessionViewStoreContext,
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

function createStaticShellChromeStore(tier: ShellTier): ShellChromeStore {
  switch (tier) {
    case "phone":
      return readable(createShellChromeState({}, { width: 390, height: 720 }, tier));
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

export function withShellContexts(
  store: SessionStore,
  parameterStore: ParamsStore,
  component: unknown,
  options: { liveSettingsStore?: LiveSettingsStore } = {},
) {
  const renderable = asRenderable(component);

  return function AppShellHarness(...args: any[]) {
    const chrome = createShellChromeStore();
    const sessionView = createSessionViewStore(store);
    const operatorWorkspaceView = createOperatorWorkspaceViewStore(store);
    const parameterWorkspaceView = createParameterWorkspaceViewStore(parameterStore);
    const liveSettingsStore = options.liveSettingsStore ?? createHarnessLiveSettingsStore(store);

    setSessionStoreContext(store);
    setSessionViewStoreContext(sessionView);
    setOperatorWorkspaceViewStoreContext(operatorWorkspaceView);
    setParamsStoreContext(parameterStore);
    setParameterWorkspaceViewStoreContext(parameterWorkspaceView);
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

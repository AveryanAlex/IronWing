import { runtime } from "../lib/stores/runtime";
import {
  createParameterWorkspaceViewStore,
  type ParamsStore,
} from "../lib/stores/params";
import {
  createSessionViewStore,
  type SessionStore,
} from "../lib/stores/session";
import { createShellChromeStore } from "../app/shell/chrome-state";
import {
  setParamsStoreContext,
  setParameterWorkspaceViewStoreContext,
  setRuntimeStoreContext,
  setSessionStoreContext,
  setSessionViewStoreContext,
  setShellChromeStoreContext,
} from "../app/shell/runtime-context";

type RenderableComponent = (...args: any[]) => unknown;

function asRenderable(component: unknown): RenderableComponent {
  return component as RenderableComponent;
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
) {
  const renderable = asRenderable(component);

  return function AppShellHarness(...args: any[]) {
    const chrome = createShellChromeStore();
    const sessionView = createSessionViewStore(store);
    const parameterWorkspaceView = createParameterWorkspaceViewStore(parameterStore);

    setSessionStoreContext(store);
    setSessionViewStoreContext(sessionView);
    setParamsStoreContext(parameterStore);
    setParameterWorkspaceViewStoreContext(parameterWorkspaceView);
    setRuntimeStoreContext(runtime);
    setShellChromeStoreContext(chrome);

    return renderable(...args);
  };
}

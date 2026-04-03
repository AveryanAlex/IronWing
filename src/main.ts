import { mount } from "svelte";
import App from "./App.svelte";
import "./app.css";
import { markRuntimeFailure, markRuntimeReady, renderBootstrapFailureMarkup } from "./lib/stores/runtime";

const rootTargetId = "root";
const target = document.getElementById(rootTargetId);

try {
  if (!target) {
    throw new Error(`IronWing could not find the #${rootTargetId} mount target.`);
  }

  mount(App, { target });
  markRuntimeReady();
} catch (error) {
  console.error("[ironwing/bootstrap] active runtime bootstrap failed", error);
  markRuntimeFailure(error);
  renderBootstrapFailureSurface(target, error);
}

function renderBootstrapFailureSurface(target: HTMLElement | null, error: unknown) {
  const fallbackTarget = target ?? document.body ?? document.documentElement;
  if (!fallbackTarget) {
    return;
  }

  fallbackTarget.innerHTML = renderBootstrapFailureMarkup(error);
}

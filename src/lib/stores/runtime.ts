import { writable } from "svelte/store";

export const runtimeTestIds = {
  shell: "app-shell",
  heading: "app-shell-heading",
  runtimeMarker: "app-runtime-marker",
  framework: "app-runtime-framework",
  bootstrapState: "app-bootstrap-state",
  bootedAt: "app-runtime-booted-at",
  entrypoint: "app-runtime-entrypoint",
  bootstrapFailure: "app-bootstrap-failure",
  bootstrapFailureMessage: "app-bootstrap-failure-message",
} as const;

export type RuntimeBootstrapState = "booting" | "ready" | "failed";

export type RuntimeState = {
  appName: "IronWing";
  framework: "Svelte 5";
  bootstrapState: RuntimeBootstrapState;
  mountTarget: "#root";
  entrypoint: "src/app/App.svelte";
  bootedAt: string | null;
  failureMessage: string | null;
};

const initialRuntimeState: RuntimeState = {
  appName: "IronWing",
  framework: "Svelte 5",
  bootstrapState: "booting",
  mountTarget: "#root",
  entrypoint: "src/app/App.svelte",
  bootedAt: null,
  failureMessage: null,
};

const runtimeStore = writable<RuntimeState>({ ...initialRuntimeState });

export const runtime = {
  subscribe: runtimeStore.subscribe,
};

export function resetRuntimeState() {
  runtimeStore.set({ ...initialRuntimeState });
}

export function markRuntimeReady(bootedAt = new Date().toISOString()) {
  runtimeStore.update((state) => ({
    ...state,
    bootstrapState: "ready",
    bootedAt,
    failureMessage: null,
  }));
}

export function markRuntimeFailure(error: unknown) {
  runtimeStore.update((state) => ({
    ...state,
    bootstrapState: "failed",
    failureMessage: formatBootstrapError(error),
  }));
}

export function formatBootstrapError(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown bootstrap error.";
  }
}

export function renderBootstrapFailureMarkup(error: unknown) {
  const message = escapeHtml(formatBootstrapError(error));

  return `
    <section
      class="bootstrap-failure-surface"
      data-runtime-phase="failed"
      data-app-entrypoint="${initialRuntimeState.entrypoint}"
      data-mount-target="${initialRuntimeState.mountTarget}"
      data-testid="${runtimeTestIds.bootstrapFailure}"
    >
      <p class="runtime-eyebrow">IronWing couldn't start</p>
      <h1 class="runtime-title">Something went wrong while opening IronWing.</h1>
      <p class="runtime-copy">Try restarting the app. If this keeps happening, share the message below with support.</p>
      <p
        class="runtime-copy"
        data-testid="${runtimeTestIds.bootstrapFailureMessage}"
      >
        ${message}
      </p>
    </section>
  `;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

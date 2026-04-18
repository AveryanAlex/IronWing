<script lang="ts">
import { runtimeTestIds } from "../../lib/stores/runtime";
import { appShellTestIds, type ShellTier } from "./chrome-state";
import type { AppShellWorkspace } from "./app-shell-controller";

type ConnectionTone = "neutral" | "positive" | "caution" | "critical";

type Props = {
  workspaces?: ReadonlyArray<{ key: AppShellWorkspace; label: string }>;
  activeWorkspace?: AppShellWorkspace;
  stagedCount?: number;
  onSelectWorkspace?: (workspace: AppShellWorkspace) => void;
  framework?: string;
  bootstrapState?: "booting" | "ready" | "failed";
  bootedAt?: string | null;
  entrypoint?: string;
  legacyBoundary?: string;
  tier?: ShellTier;
  drawerState?: "open" | "closed" | "docked";
  showVehiclePanelButton?: boolean;
  vehiclePanelOpen?: boolean;
  lastPhase?: string;
  activeSource?: string | null;
  activeEnvelopeText?: string;
  connectionTone?: ConnectionTone;
  handleVehiclePanelToggle?: () => void;
};

let {
  workspaces = [],
  activeWorkspace = "overview",
  stagedCount = 0,
  onSelectWorkspace = () => {},
  framework = "Svelte 5",
  bootstrapState = "booting",
  bootedAt = null,
  entrypoint = "src/app/App.svelte",
  legacyBoundary = "src-old/runtime",
  tier = "wide",
  drawerState = "docked",
  showVehiclePanelButton = false,
  vehiclePanelOpen = false,
  lastPhase = "idle",
  activeSource = null,
  activeEnvelopeText = "no active session",
  connectionTone = "neutral",
  handleVehiclePanelToggle = () => {},
}: Props = $props();

const tierLabels: Record<ShellTier, string> = {
  phone: "phone",
  tablet: "tablet",
  desktop: "desktop",
  wide: "wide",
};

function connectionIndicatorClass(tone: ConnectionTone): string {
  switch (tone) {
    case "positive":
      return "is-positive";
    case "caution":
      return "is-caution";
    case "critical":
      return "is-critical";
    default:
      return "is-neutral";
  }
}
</script>

<header class="app-shell-header">
  <div class="app-shell-header__top">
    <div class="app-shell-header__brand">
      <h1 class="app-shell-header__title" data-testid={runtimeTestIds.heading}>IronWing</h1>
      <span
        aria-hidden="true"
        class={`app-shell-header__connection-indicator ${connectionIndicatorClass(connectionTone)}`}
        data-testid={appShellTestIds.connectionIndicator}
      ></span>
    </div>

    {#if showVehiclePanelButton}
      <button
        aria-controls="vehicle-panel-drawer"
        aria-expanded={vehiclePanelOpen}
        class="app-shell-mobile-toggle"
        data-testid={appShellTestIds.vehiclePanelButton}
        onclick={handleVehiclePanelToggle}
        type="button"
      >
        Vehicle panel
      </button>
    {/if}
  </div>

  <nav aria-label="Primary" class="app-shell-tabs">
    {#each workspaces as workspace (workspace.key)}
      <button
        aria-pressed={activeWorkspace === workspace.key}
        class={`app-shell-tab ${activeWorkspace === workspace.key ? "is-active" : ""}`}
        data-testid={
          workspace.key === "overview"
            ? appShellTestIds.overviewWorkspaceButton
            : workspace.key === "setup"
              ? appShellTestIds.parameterWorkspaceButton
              : undefined
        }
        onclick={() => onSelectWorkspace(workspace.key)}
        type="button"
      >
        {#if workspace.key === "setup" || workspace.key === "settings"}
          {#if workspace.key === "setup"}
            <svg aria-hidden="true" focusable="false" height="14" viewBox="0 0 16 16" width="14">
              <path
                d="M7.36 1.1a.75.75 0 0 1 1.28 0l.56.96a5.99 5.99 0 0 1 1.13.47l1.03-.3a.75.75 0 0 1 .85.36l.64 1.1a.75.75 0 0 1-.12.91l-.75.77c.08.38.12.76.12 1.14s-.04.76-.12 1.14l.75.77a.75.75 0 0 1 .12.91l-.64 1.1a.75.75 0 0 1-.85.36l-1.03-.3a5.99 5.99 0 0 1-1.13.47l-.56.96a.75.75 0 0 1-1.28 0l-.56-.96a5.99 5.99 0 0 1-1.13-.47l-1.03.3a.75.75 0 0 1-.85-.36l-.64-1.1a.75.75 0 0 1 .12-.91l.75-.77A5.5 5.5 0 0 1 3.8 7.5c0-.38.04-.76.12-1.14l-.75-.77a.75.75 0 0 1-.12-.91l.64-1.1a.75.75 0 0 1 .85-.36l1.03.3a5.99 5.99 0 0 1 1.13-.47l.56-.96ZM8 5.2A2.3 2.3 0 1 0 8 9.8 2.3 2.3 0 0 0 8 5.2Z"
                fill="currentColor"
              />
            </svg>
          {:else}
            <svg aria-hidden="true" focusable="false" height="14" viewBox="0 0 16 16" width="14">
              <path
                d="M8 2.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm-4.5 1A1.5 1.5 0 1 0 3.5 6a1.5 1.5 0 0 0 0-2.5Zm9 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm-9 6A1.5 1.5 0 1 0 3.5 12a1.5 1.5 0 0 0 0-2.5Zm9 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM6.4 4h3.2v1H6.4V4Zm0 6h3.2v1H6.4v-1Zm-3-3h9.2v1H3.4V7Z"
                fill="currentColor"
              />
            </svg>
          {/if}
        {/if}
        <span>{workspace.label}</span>
        {#if workspace.key === "setup" && stagedCount > 0}
          <span
            class={`app-shell-tab__badge ${activeWorkspace === "setup" ? "is-active" : ""}`}
            data-testid={appShellTestIds.parameterWorkspacePendingCount}
          >
            {stagedCount}
          </span>
        {/if}
      </button>
    {/each}
  </nav>

  <div aria-hidden="true" class="hidden">
    <span data-testid={runtimeTestIds.runtimeMarker}>IronWing runtime marker</span>
    <span data-testid={runtimeTestIds.framework}>{framework}</span>
    <span data-testid={runtimeTestIds.bootstrapState} data-runtime-phase={bootstrapState}>{bootstrapState}</span>
    <span data-testid={runtimeTestIds.bootedAt}>{bootedAt ?? "Starting up"}</span>
    <span data-testid={runtimeTestIds.entrypoint}>{entrypoint}</span>
    <span data-testid={runtimeTestIds.quarantineBoundary}>{legacyBoundary}</span>
    <span data-testid={appShellTestIds.tier}>{tierLabels[tier]}</span>
    <span data-testid={appShellTestIds.drawerState}>{drawerState}</span>
    <span data-testid={appShellTestIds.sessionPhase}>{lastPhase}</span>
    <span data-testid={appShellTestIds.sessionSource}>{activeSource ?? "none"}</span>
    <span data-testid={appShellTestIds.sessionEnvelope}>{activeEnvelopeText}</span>
  </div>
</header>

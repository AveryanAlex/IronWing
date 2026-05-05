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

function workspaceIconPath(key: AppShellWorkspace): string {
  switch (key) {
    case "overview":
      return "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z";
    case "telemetry":
      return "M22 12h-4l-3 9L9 3l-3 9H2";
    case "hud":
      return "M12 2a10 10 0 0 1 0 20 10 10 0 0 1 0-20zm0 2a8 8 0 0 1 0 16M12 6v6l4 2";
    case "mission":
      return "M3 6l9-4 9 4v12l-9 4-9-4zM12 2v20M3 6l9 4 9-4";
    case "logs":
      return "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8M8 9h2";
    case "firmware":
      return "M4 4h16v16H4zM9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3";
    case "setup":
      return "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z";
    case "settings":
      return "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z";
  }
}

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
        aria-label={workspace.label}
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
        <svg aria-hidden="true" focusable="false" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d={workspaceIconPath(workspace.key)} />
        </svg>
        <span class="app-shell-tab__label">{workspace.label}</span>
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

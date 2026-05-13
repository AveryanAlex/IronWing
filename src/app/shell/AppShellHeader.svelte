<script lang="ts">
import type { Snippet } from "svelte";

import { AdaptiveRail, ResponsiveTabs, Tooltip } from "../../components/ui";
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

function workspaceIcon(key: AppShellWorkspace): Snippet | undefined {
  switch (key) {
    case "overview":
      return iconOverview;
    case "telemetry":
      return iconTelemetry;
    case "hud":
      return iconHud;
    case "mission":
      return iconMission;
    case "logs":
      return iconLogs;
    case "firmware":
      return iconFirmware;
    case "setup":
      return iconSetup;
    case "settings":
      return iconSettings;
    default:
      return undefined;
  }
}

let tabItems = $derived(
  workspaces.map((workspace) => {
    const item: {
      key: AppShellWorkspace;
      label: string;
      badge?: string;
      testId?: string;
      badgeTestId?: string;
      icon?: Snippet;
    } = {
      key: workspace.key,
      label: workspace.label,
      icon: workspaceIcon(workspace.key),
    };

    if (workspace.key === "overview") {
      item.testId = appShellTestIds.overviewWorkspaceButton;
    } else if (workspace.key === "setup") {
      item.testId = appShellTestIds.parameterWorkspaceButton;
      if (stagedCount > 0) {
        item.badge = String(stagedCount);
        item.badgeTestId = appShellTestIds.parameterWorkspacePendingCount;
      }
    }

    return item;
  }),
);

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

{#snippet iconOverview()}
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="2" y="2" width="5" height="5" rx="1" />
    <rect x="9" y="2" width="5" height="5" rx="1" />
    <rect x="2" y="9" width="5" height="5" rx="1" />
    <rect x="9" y="9" width="5" height="5" rx="1" />
  </svg>
{/snippet}

{#snippet iconTelemetry()}
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M2 12 L5 8 L8 10 L11 5 L14 9" />
    <path d="M2 14 L14 14" />
  </svg>
{/snippet}

{#snippet iconHud()}
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="8" cy="8" r="6" />
    <path d="M2 8 L14 8" />
    <path d="M8 2 L8 14" />
  </svg>
{/snippet}

{#snippet iconMission()}
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M8 1.5 C5.5 1.5 3.5 3.5 3.5 6 C3.5 9.5 8 14.5 8 14.5 C8 14.5 12.5 9.5 12.5 6 C12.5 3.5 10.5 1.5 8 1.5 Z" />
    <circle cx="8" cy="6" r="1.6" />
  </svg>
{/snippet}

{#snippet iconLogs()}
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M3 2 L11 2 L13 4 L13 14 L3 14 Z" />
    <path d="M5 6 L11 6" />
    <path d="M5 9 L11 9" />
    <path d="M5 12 L9 12" />
  </svg>
{/snippet}

{#snippet iconFirmware()}
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="10" height="10" rx="1.5" />
    <rect x="6" y="6" width="4" height="4" />
    <path d="M1.5 5.5 L3 5.5 M1.5 8 L3 8 M1.5 10.5 L3 10.5" />
    <path d="M13 5.5 L14.5 5.5 M13 8 L14.5 8 M13 10.5 L14.5 10.5" />
  </svg>
{/snippet}

{#snippet iconSetup()}
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="8" cy="8" r="2" />
    <path d="M8 1.5 L8 3.5 M8 12.5 L8 14.5 M1.5 8 L3.5 8 M12.5 8 L14.5 8 M3.5 3.5 L4.9 4.9 M11.1 11.1 L12.5 12.5 M3.5 12.5 L4.9 11.1 M11.1 4.9 L12.5 3.5" />
  </svg>
{/snippet}

{#snippet iconSettings()}
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M3 4 L13 4" />
    <circle cx="6" cy="4" r="1.4" fill="currentColor" stroke="none" />
    <path d="M3 8 L13 8" />
    <circle cx="10" cy="8" r="1.4" fill="currentColor" stroke="none" />
    <path d="M3 12 L13 12" />
    <circle cx="7" cy="12" r="1.4" fill="currentColor" stroke="none" />
  </svg>
{/snippet}

<header class="app-shell-header">
  <AdaptiveRail split>
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
        <Tooltip label={vehiclePanelOpen ? "Close vehicle panel" : "Open vehicle panel"} side="bottom">
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
        </Tooltip>
      {/if}
    </div>

    <nav aria-label="Primary" class="app-shell-tabs">
      <ResponsiveTabs
        active={activeWorkspace}
        ariaLabel="Top-level workspaces"
        onSelect={(key) => onSelectWorkspace(key as AppShellWorkspace)}
        tabs={tabItems}
      />
    </nav>
  </AdaptiveRail>

  <div aria-hidden="true" class="hidden">
    <span data-testid={runtimeTestIds.runtimeMarker}>IronWing runtime marker</span>
    <span data-testid={runtimeTestIds.framework}>{framework}</span>
    <span data-testid={runtimeTestIds.bootstrapState} data-runtime-phase={bootstrapState}>{bootstrapState}</span>
    <span data-testid={runtimeTestIds.bootedAt}>{bootedAt ?? "Starting up"}</span>
    <span data-testid={runtimeTestIds.entrypoint}>{entrypoint}</span>
    <span data-testid={appShellTestIds.tier}>{tierLabels[tier]}</span>
    <span data-testid={appShellTestIds.drawerState}>{drawerState}</span>
    <span data-testid={appShellTestIds.sessionPhase}>{lastPhase}</span>
    <span data-testid={appShellTestIds.sessionSource}>{activeSource ?? "none"}</span>
    <span data-testid={appShellTestIds.sessionEnvelope}>{activeEnvelopeText}</span>
  </div>
</header>

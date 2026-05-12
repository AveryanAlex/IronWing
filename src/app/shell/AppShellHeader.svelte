<script lang="ts">
import { ResponsiveTabs, Tooltip } from "../../components/ui";
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

let tabItems = $derived(
  workspaces.map((workspace) => {
    const item: {
      key: AppShellWorkspace;
      label: string;
      badge?: string;
      testId?: string;
      badgeTestId?: string;
    } = {
      key: workspace.key,
      label: workspace.label,
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

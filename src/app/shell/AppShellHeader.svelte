<script lang="ts">
import {
  Activity,
  Cpu,
  Crosshair,
  FileText,
  LayoutDashboard,
  Route,
  Settings,
  Wrench,
} from "lucide-svelte";
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
  <LayoutDashboard aria-hidden="true" size={16} />
{/snippet}

{#snippet iconTelemetry()}
  <Activity aria-hidden="true" size={16} />
{/snippet}

{#snippet iconHud()}
  <Crosshair aria-hidden="true" size={16} />
{/snippet}

{#snippet iconMission()}
  <Route aria-hidden="true" size={16} />
{/snippet}

{#snippet iconLogs()}
  <FileText aria-hidden="true" size={16} />
{/snippet}

{#snippet iconFirmware()}
  <Cpu aria-hidden="true" size={16} />
{/snippet}

{#snippet iconSetup()}
  <Wrench aria-hidden="true" size={16} />
{/snippet}

{#snippet iconSettings()}
  <Settings aria-hidden="true" size={16} />
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

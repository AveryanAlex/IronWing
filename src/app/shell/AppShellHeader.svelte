<svelte:options runes={false} />

<script lang="ts">
import { runtimeTestIds } from "../../lib/stores/runtime";
import { appShellTestIds, type ShellTier } from "./chrome-state";

export let framework = "Svelte 5";
export let bootstrapState: "booting" | "ready" | "failed" = "booting";
export let bootedAt: string | null = null;
export let entrypoint = "src/app/App.svelte";
export let legacyBoundary = "src-old/runtime";
export let tier: ShellTier = "wide";
export let drawerState: "open" | "closed" | "docked" = "docked";
export let showVehiclePanelButton = false;
export let vehiclePanelOpen = false;
export let lastPhase = "idle";
export let activeSource: string | null = null;
export let activeEnvelopeText = "no active session";
export let handleVehiclePanelToggle: () => void = () => {};

const tierLabels: Record<ShellTier, string> = {
  phone: "phone",
  tablet: "tablet",
  desktop: "desktop",
  wide: "wide",
};
</script>

<header class="app-shell-header">
  <div class="app-shell-header__hero">
    <div class="app-shell-header__copy">
      <p class="runtime-eyebrow" data-testid={runtimeTestIds.runtimeMarker}>IronWing active runtime</p>
      <h1 class="runtime-title" data-testid={runtimeTestIds.heading}>Svelte runtime online</h1>
      <p class="runtime-copy">
        Responsive ground-station chrome now keeps the live connection, vehicle state, and telemetry proof surfaces on
        the shipped Svelte path without reaching back into the quarantined React runtime.
      </p>
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

  <dl class="app-shell-summary-grid">
    <div class="runtime-card">
      <dt class="runtime-card-label">Framework</dt>
      <dd class="runtime-card-value" data-testid={runtimeTestIds.framework}>{framework}</dd>
    </div>

    <div class="runtime-card">
      <dt class="runtime-card-label">Bootstrap state</dt>
      <dd class="runtime-card-value">
        <span
          class="runtime-status-pill"
          data-runtime-phase={bootstrapState}
          data-testid={runtimeTestIds.bootstrapState}
        >
          {bootstrapState}
        </span>
      </dd>
    </div>

    <div class="runtime-card">
      <dt class="runtime-card-label">Shell tier</dt>
      <dd class="runtime-card-value" data-testid={appShellTestIds.tier}>{tierLabels[tier]}</dd>
    </div>

    <div class="runtime-card">
      <dt class="runtime-card-label">Vehicle panel</dt>
      <dd class="runtime-card-value" data-testid={appShellTestIds.drawerState}>{drawerState}</dd>
    </div>

    <div class="runtime-card">
      <dt class="runtime-card-label">Last phase</dt>
      <dd class="runtime-card-value" data-testid={appShellTestIds.sessionPhase}>{lastPhase}</dd>
    </div>

    <div class="runtime-card">
      <dt class="runtime-card-label">Active source</dt>
      <dd class="runtime-card-value" data-testid={appShellTestIds.sessionSource}>{activeSource ?? "none"}</dd>
    </div>

    <div class="runtime-card">
      <dt class="runtime-card-label">Boot time</dt>
      <dd class="runtime-card-value" data-testid={runtimeTestIds.bootedAt}>
        {bootedAt ?? "Awaiting bootstrap completion"}
      </dd>
    </div>

    <div class="runtime-card runtime-card--wide">
      <dt class="runtime-card-label">Active envelope</dt>
      <dd class="runtime-card-value runtime-card-value--mono" data-testid={appShellTestIds.sessionEnvelope}>
        {activeEnvelopeText}
      </dd>
    </div>

    <div class="runtime-card runtime-card--wide">
      <dt class="runtime-card-label">Entrypoint</dt>
      <dd class="runtime-card-value runtime-card-value--mono" data-testid={runtimeTestIds.entrypoint}>
        {entrypoint}
      </dd>
    </div>

    <div class="runtime-card runtime-card--wide">
      <dt class="runtime-card-label">Legacy quarantine boundary</dt>
      <dd class="runtime-card-value runtime-card-value--mono" data-testid={runtimeTestIds.quarantineBoundary}>
        {legacyBoundary}
      </dd>
    </div>
  </dl>
</header>

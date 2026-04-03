<script lang="ts">
import { onMount } from "svelte";
import { Toaster } from "svelte-sonner";

import ConnectionPanel from "../../components/connection/ConnectionPanel.svelte";
import VehicleStatusCard from "../../components/status/VehicleStatusCard.svelte";
import TelemetrySummary from "../../components/telemetry/TelemetrySummary.svelte";
import { runtime, runtimeTestIds } from "../../lib/stores/runtime";
import { session } from "../../lib/stores/session";

onMount(() => {
  void session.initialize();
});
</script>

<Toaster closeButton richColors />

<main
  class="runtime-shell"
  data-runtime-phase={$runtime.bootstrapState}
  data-testid={runtimeTestIds.shell}
>
  <section class="runtime-shell__content">
    <header class="flex flex-col gap-6">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div class="max-w-3xl">
          <p class="runtime-eyebrow" data-testid={runtimeTestIds.runtimeMarker}>IronWing active runtime</p>
          <h1 class="runtime-title" data-testid={runtimeTestIds.heading}>Svelte runtime online</h1>
          <p class="runtime-copy">
            The active frontend boot path now mounts the first rewritten live surface: a Svelte-native session
            panel, vehicle status seed card, and telemetry summary backed by the new singleton store boundary.
          </p>
        </div>

        <dl class="grid gap-3 sm:grid-cols-2 lg:w-[420px] lg:shrink-0">
          <div class="runtime-card">
            <dt class="runtime-card-label">Framework</dt>
            <dd class="runtime-card-value" data-testid={runtimeTestIds.framework}>{$runtime.framework}</dd>
          </div>
          <div class="runtime-card">
            <dt class="runtime-card-label">Bootstrap state</dt>
            <dd class="runtime-card-value">
              <span
                class="runtime-status-pill"
                data-runtime-phase={$runtime.bootstrapState}
                data-testid={runtimeTestIds.bootstrapState}
              >
                {$runtime.bootstrapState}
              </span>
            </dd>
          </div>
          <div class="runtime-card">
            <dt class="runtime-card-label">Boot time</dt>
            <dd class="runtime-card-value" data-testid={runtimeTestIds.bootedAt}>
              {$runtime.bootedAt ?? "Awaiting bootstrap completion"}
            </dd>
          </div>
          <div class="runtime-card">
            <dt class="runtime-card-label">Entrypoint</dt>
            <dd class="runtime-card-value runtime-card-value--mono" data-testid={runtimeTestIds.entrypoint}>
              {$runtime.entrypoint}
            </dd>
          </div>
          <div class="runtime-card sm:col-span-2">
            <dt class="runtime-card-label">Legacy quarantine boundary</dt>
            <dd class="runtime-card-value runtime-card-value--mono" data-testid={runtimeTestIds.quarantineBoundary}>
              {$runtime.legacyRuntimeLocation}
            </dd>
          </div>
        </dl>
      </div>
    </header>

    <div class="mt-8 grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <ConnectionPanel />

      <div class="grid gap-5">
        <VehicleStatusCard />
        <TelemetrySummary />
      </div>
    </div>
  </section>
</main>

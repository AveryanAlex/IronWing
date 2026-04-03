<script lang="ts">
import { runtime, runtimeTestIds } from "../../lib/stores/runtime";
</script>

<main
  class="runtime-shell"
  data-runtime-phase={$runtime.bootstrapState}
  data-testid={runtimeTestIds.shell}
>
  <section class="runtime-shell__content">
    <p class="runtime-eyebrow" data-testid={runtimeTestIds.runtimeMarker}>IronWing active runtime</p>
    <h1 class="runtime-title" data-testid={runtimeTestIds.heading}>Svelte runtime online</h1>
    <p class="runtime-copy">
      The active frontend boot path now mounts a minimal Svelte shell. The quarantined React runtime is no
      longer part of the shipped entrypoint.
    </p>

    <dl class="runtime-diagnostic-grid">
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
      <div class="runtime-card runtime-card--wide">
        <dt class="runtime-card-label">Legacy quarantine boundary</dt>
        <dd class="runtime-card-value runtime-card-value--mono" data-testid={runtimeTestIds.quarantineBoundary}>
          {$runtime.legacyRuntimeLocation}
        </dd>
      </div>
    </dl>
  </section>
</main>

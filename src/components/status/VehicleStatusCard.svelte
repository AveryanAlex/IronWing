<svelte:options runes={false} />

<script lang="ts">
import { createSessionViewStore, session, type SessionStore } from "../../lib/stores/session";

export let store: SessionStore = session;

let view = createSessionViewStore(store);
let armState = "--";
let modeName = "--";
let systemStatus = "--";
let sourceText = "none";

$: view = createSessionViewStore(store);
$: armState = $view.connected ? ($view.vehicleState?.armed ? "ARMED" : "DISARMED") : "--";
$: modeName = $view.connected ? ($view.vehicleState?.mode_name ?? "--") : "--";
$: systemStatus = $view.connected ? ($view.vehicleState?.system_status ?? "--") : "--";
$: sourceText = $store.activeSource ?? "none";
</script>

<section class="rounded-[24px] border border-border bg-bg-secondary/80 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.18)]">
  <div class="flex items-center justify-between gap-3">
    <div>
      <p class="runtime-eyebrow mb-2">Vehicle status</p>
      <h2 class="text-xl font-semibold tracking-[-0.03em] text-text-primary">Connection-owned vehicle state</h2>
    </div>
    <span
      class={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${$view.connected ? "bg-success/10 text-success" : "bg-bg-primary/70 text-text-secondary"}`}
    >
      {$view.connected ? "live session" : "idle session"}
    </span>
  </div>

  <dl class="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <div class="rounded-2xl border border-border bg-bg-primary/70 p-4" data-testid="telemetry-state-value">
      <dt class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Arm state</dt>
      <dd class={`mt-3 text-lg font-semibold ${$view.connected && $view.vehicleState?.armed ? "text-success" : "text-text-primary"}`}>
        {armState}
      </dd>
    </div>

    <div class="rounded-2xl border border-border bg-bg-primary/70 p-4" data-testid="telemetry-mode-value">
      <dt class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Mode</dt>
      <dd class="mt-3 text-lg font-semibold text-text-primary">{modeName}</dd>
    </div>

    <div class="rounded-2xl border border-border bg-bg-primary/70 p-4">
      <dt class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">System</dt>
      <dd class="mt-3 text-lg font-semibold text-text-primary">{systemStatus}</dd>
    </div>

    <div class="rounded-2xl border border-border bg-bg-primary/70 p-4">
      <dt class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Source</dt>
      <dd class="mt-3 text-lg font-semibold text-text-primary">{sourceText}</dd>
    </div>
  </dl>
</section>

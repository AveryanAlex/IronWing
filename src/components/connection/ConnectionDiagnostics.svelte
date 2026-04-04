<script lang="ts">
import type { SessionStoreState } from "../../lib/stores/session";

let { state }: { state: SessionStoreState } = $props();
</script>

<div aria-hidden="true" class="hidden" data-session-diagnostics="true">
  <span data-testid="connection-diagnostics-last-phase">{state.lastPhase}</span>
  <span data-testid="connection-diagnostics-active-source">{state.activeSource ?? "none"}</span>
  <span data-testid="connection-diagnostics-envelope">
    {state.activeEnvelope
      ? `${state.activeEnvelope.session_id} · rev ${state.activeEnvelope.reset_revision}`
      : "no active session"}
  </span>
  <span data-testid="connection-diagnostics-bootstrap">{state.hydrated ? "ready" : "initializing"}</span>
</div>

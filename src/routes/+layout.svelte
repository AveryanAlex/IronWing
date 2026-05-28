<script lang="ts">
import { onMount } from "svelte";
import type { Snippet } from "svelte";
import "../styles/app.css";
import { initializeAnalytics } from "../lib/analytics/client";
import { formatBootstrapError, markRuntimeFailure, markRuntimeReady, runtimeTestIds } from "../lib/stores/runtime";

let { children }: { children: Snippet } = $props();
let bootstrapFailureMessage = $state<string | null>(null);

onMount(() => {
  try {
    markRuntimeReady();
    void initializeAnalytics().catch((error) => {
      console.warn("[ironwing/analytics] initialization failed", error);
    });
  } catch (error) {
    handleBootstrapFailure(error);
  }
});

function handleBootstrapFailure(error: unknown) {
  console.error("[ironwing/bootstrap] active runtime bootstrap failed", error);
  markRuntimeFailure(error);
  bootstrapFailureMessage = formatBootstrapError(error);
}
</script>

{#if bootstrapFailureMessage}
  <section
    class="bootstrap-failure-surface"
    data-app-entrypoint="src/routes/+page.svelte"
    data-mount-target="#app"
    data-runtime-phase="failed"
    data-testid={runtimeTestIds.bootstrapFailure}
  >
    <p class="runtime-eyebrow">IronWing couldn't start</p>
    <h1 class="runtime-title">Something went wrong while opening IronWing.</h1>
    <p class="runtime-copy">Try restarting the app. If this keeps happening, share the message below with support.</p>
    <p class="runtime-copy" data-testid={runtimeTestIds.bootstrapFailureMessage}>{bootstrapFailureMessage}</p>
  </section>
{:else}
  <svelte:boundary onerror={handleBootstrapFailure}>
    {@render children()}
  </svelte:boundary>
{/if}

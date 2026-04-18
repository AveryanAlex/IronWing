<script lang="ts">
import { fromStore } from "svelte/store";

import { getParamsStoreContext } from "../../app/shell/runtime-context";
import ParameterWorkspace from "../params/ParameterWorkspace.svelte";
import { resolveDocsUrl, type VehicleSlug } from "../../data/ardupilot-docs";
import { setupWorkspaceTestIds } from "./setup-workspace-test-ids";

let {
  canOpen,
}: {
  canOpen: boolean;
} = $props();

const paramsStore = getParamsStoreContext();
const paramsState = fromStore(paramsStore);

let params = $derived(paramsState.current);
let docsUrl = $derived(resolveDocsUrl("full_parameter_list", resolveVehicleSlug(params.vehicleType)));

function resolveVehicleSlug(vehicleType: string | null): VehicleSlug | null {
  switch (vehicleType) {
    case "quadrotor":
    case "hexarotor":
    case "octorotor":
    case "tricopter":
    case "helicopter":
    case "coaxial":
      return "copter";
    case "fixed_wing":
    case "vtol":
      return "plane";
    case "ground_rover":
      return "rover";
    default:
      return null;
  }
}
</script>

<section class="space-y-4" data-testid={setupWorkspaceTestIds.fullParameters}>
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Full Parameters</p>
      <h3 class="mt-2 text-lg font-semibold text-text-primary">Recovery stays explicit</h3>
      <p class="mt-2 max-w-3xl text-sm leading-6 text-text-secondary">
        This is the raw recovery surface. It reuses the existing Parameter Workspace so metadata fallback, grouped browsing, and the shared shell review tray continue to behave exactly as the shell already proves.
      </p>
    </div>

    {#if docsUrl}
      <a
        class="rounded-md border border-border bg-bg-primary/80 px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent"
        data-testid={setupWorkspaceTestIds.fullParametersDocsLink}
        href={docsUrl}
        rel="noreferrer"
        target="_blank"
      >
        Full parameter docs
      </a>
    {/if}
  </div>

  <div
    class="rounded-lg border border-border bg-bg-primary/80 px-4 py-4 text-sm leading-6 text-text-secondary"
    data-testid={setupWorkspaceTestIds.fullParametersRecovery}
  >
    Guided setup never forks raw parameter logic. If metadata is degraded or a purpose-built card cannot prove its controls, recover here and keep staging through the same shell-owned review tray.
  </div>

  {#if canOpen}
    <ParameterWorkspace />
  {:else}
    <div class="rounded-lg border border-warning/40 bg-warning/10 px-4 py-4 text-sm leading-6 text-warning">
      Full Parameters recovery is disabled for the current scope.
    </div>
  {/if}
</section>

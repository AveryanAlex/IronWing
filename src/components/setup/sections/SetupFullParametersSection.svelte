<script lang="ts">
import { fromStore } from "svelte/store";

import { getParamsStoreContext } from "../../../app/shell/runtime-context";
import ParameterWorkspace from "../../params/ParameterWorkspace.svelte";
import { resolveDocsUrl, type VehicleSlug } from "../../../data/ardupilot-docs";
import { setupWorkspaceTestIds } from "../setup-workspace-test-ids";
import SetupIntroCard from "../shared/SetupIntroCard.svelte";

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
  <SetupIntroCard
    sectionId="full_parameters"
    title="Full Parameters"
    description="Use this page to inspect, search, and queue raw parameter changes. Open the raw list below to inspect settings or queue changes for review."
    docs={[{ url: docsUrl, label: "ArduPilot Docs", testId: setupWorkspaceTestIds.fullParametersDocsLink }]}
  />

  {#if canOpen}
    <ParameterWorkspace defaultMode="expert" embedded />
  {:else}
    <div
      class="rounded-lg border border-warning/40 bg-warning/10 px-4 py-4 text-sm leading-6 text-warning"
      data-testid={setupWorkspaceTestIds.fullParametersRecovery}
    >
      Full Parameters is blocked for the current scope. Reconnect the vehicle or finish loading parameters, then return here to inspect the raw list.
    </div>
  {/if}
</section>

<script lang="ts">
import { fromStore } from "svelte/store";

import { getParamsStoreContext } from "../../../../app/shell/runtime-context";
import ParameterWorkspace from "../../../../features/params/components/ParameterWorkspace.svelte";
import { resolveDocsUrl, type VehicleSlug } from "../../../../data/ardupilot-docs";
import { setupWorkspaceTestIds } from "../../../../features/setup/setup-workspace-test-ids";
import SetupIntroCard from "../../../../features/setup/shared/SetupIntroCard.svelte";

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
    description="Inspect, search, and edit the complete ArduPilot parameter catalog. Changes remain staged until you review and apply them."
    docs={[{ url: docsUrl, label: "ArduPilot Docs", testId: setupWorkspaceTestIds.fullParametersDocsLink }]}
  />

  <ParameterWorkspace defaultMode="expert" embedded />
</section>

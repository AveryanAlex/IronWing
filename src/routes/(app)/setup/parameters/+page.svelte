<script lang="ts">
import { getVehicleSlug } from "../../../../lib/setup/vehicle-profile";
import { page } from "$app/state";
import { fromStore } from "svelte/store";

import { getParamsStoreContext } from "../../../../app/shell/runtime-context";
import ParameterWorkspace from "../../../../features/params/components/ParameterWorkspace.svelte";
import { resolveDocsUrl } from "../../../../data/ardupilot-docs";
import { setupWorkspaceTestIds } from "../../../../features/setup/setup-workspace-test-ids";
import SetupIntroCard from "../../../../features/setup/shared/SetupIntroCard.svelte";
import type { ParameterCatalogFilter } from "../../../../lib/params/parameter-catalog-view";

const paramsStore = getParamsStoreContext();
const paramsState = fromStore(paramsStore);

let params = $derived(paramsState.current);
let docsUrl = $derived(resolveDocsUrl("full_parameter_list", getVehicleSlug(params.vehicleType)));
let initialSearchText = $derived(page.url.searchParams.get("search") ?? "");
let initialFilter = $derived(resolveInitialFilter(page.url.searchParams.get("filter")));

function resolveInitialFilter(value: string | null): ParameterCatalogFilter {
  switch (value) {
    case "all":
    case "modified":
    case "standard":
      return value;
    default:
      return "all";
  }
}
</script>

<section class="space-y-4" data-testid={setupWorkspaceTestIds.parameters}>
  <SetupIntroCard
    sectionId="parameters"
    title="Parameters"
    description="Search and edit the complete ArduPilot parameter catalog. Metadata selects the appropriate editor, and changes remain staged until you review and apply them."
    docs={[{ url: docsUrl, label: "ArduPilot Docs", testId: setupWorkspaceTestIds.parametersDocsLink }]}
  />

  <ParameterWorkspace
    {initialFilter}
    {initialSearchText}
  />
</section>

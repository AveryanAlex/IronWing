<script lang="ts">
import { page } from "$app/state";
import { fromStore } from "svelte/store";

import { getSetupWorkspaceRouteContext } from "../../../../features/setup/components/setup-workspace-route-context";
import OutputAssignmentsPage from "./OutputAssignmentsPage.svelte";
import ServoOutputTester from "./ServoOutputTester.svelte";

const route = getSetupWorkspaceRouteContext();
const viewStore = fromStore(route.viewStore);

let view = $derived(viewStore.current);
let mode = $derived(page.url.searchParams.get("mode") === "test" ? "test" : "assign");
</script>

{#key `${view.activeScopeKey}:${mode}:${page.url.searchParams.get("output") ?? ""}`}
  {#if mode === "test"}
    <ServoOutputTester />
  {:else}
    <OutputAssignmentsPage />
  {/if}
{/key}

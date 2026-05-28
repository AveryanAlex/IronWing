<script lang="ts">
import { goto } from "$app/navigation";
import { resolve } from "$app/paths";
import { page } from "$app/state";
import type { Snippet } from "svelte";

import SetupWorkspaceShell from "../../../features/setup/components/SetupWorkspaceShell.svelte";
import { setupSectionForPath, setupSectionPath, type SetupSectionId } from "../../../lib/setup-sections";

let { children }: { children: Snippet } = $props();

let requestedSectionId = $derived(setupSectionForPath(page.url.pathname) ?? "overview");

function navigateToSetupSection(sectionId: SetupSectionId) {
  return goto(resolve(setupSectionPath(sectionId)));
}
</script>

<SetupWorkspaceShell {requestedSectionId} {navigateToSetupSection}>
  {@render children()}
</SetupWorkspaceShell>

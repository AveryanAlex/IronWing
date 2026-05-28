<script lang="ts">
import type { Component } from "svelte";

import AppShellContent from "../app/shell/AppShellContent.svelte";
import type { AppShellWorkspace } from "../app/shell/workspace-routes";
import SetupWorkspaceShell from "../features/setup/components/SetupWorkspaceShell.svelte";
import type { SetupSectionId } from "../lib/setup-sections";

type Props = {
  activeWorkspace: AppShellWorkspace;
  navigateToWorkspace: (workspace: AppShellWorkspace) => void | Promise<void>;
  route: Component;
  setupSectionId?: SetupSectionId;
  navigateToSetupSection?: (sectionId: SetupSectionId) => void | Promise<void>;
};

let {
  activeWorkspace,
  navigateToWorkspace,
  route: Route,
  setupSectionId = "overview",
  navigateToSetupSection = () => {},
}: Props = $props();
</script>

<AppShellContent {activeWorkspace} {navigateToWorkspace}>
  {#if activeWorkspace === "setup"}
    <SetupWorkspaceShell requestedSectionId={setupSectionId} {navigateToSetupSection}>
      <Route />
    </SetupWorkspaceShell>
  {:else}
    <Route />
  {/if}
</AppShellContent>

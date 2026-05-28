<script lang="ts">
import type { Component } from "svelte";

import AppShellContent from "../app/shell/AppShellContent.svelte";
import type { AppShellWorkspace } from "../app/shell/workspace-routes";
import SetupWorkspaceShell from "../features/setup/components/SetupWorkspaceShell.svelte";
import type { SetupSectionId } from "../lib/setup-sections";

type Props = {
  activeWorkspace: AppShellWorkspace;
  navigateWorkspace: (workspace: AppShellWorkspace) => void | Promise<void>;
  route: Component;
  setupSectionId?: SetupSectionId;
  navigateToSetupSection?: (sectionId: SetupSectionId) => void | Promise<void>;
};

let {
  activeWorkspace,
  navigateWorkspace,
  route: Route,
  setupSectionId = "overview",
  navigateToSetupSection = () => {},
}: Props = $props();
</script>

<AppShellContent {activeWorkspace} {navigateWorkspace}>
  {#if activeWorkspace === "setup"}
    <SetupWorkspaceShell requestedSectionId={setupSectionId} {navigateToSetupSection}>
      <Route />
    </SetupWorkspaceShell>
  {:else}
    <Route />
  {/if}
</AppShellContent>

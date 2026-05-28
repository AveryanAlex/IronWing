<script lang="ts">
import { goto } from "$app/navigation";
import { resolve } from "$app/paths";
import { page } from "$app/state";
import type { Snippet } from "svelte";

import AppShell from "../../app/shell/AppShell.svelte";
import { workspaceForRouteId, workspacePath, type AppShellWorkspace } from "../../app/shell/workspace-routes";

let { children }: { children: Snippet } = $props();

let activeWorkspace = $derived(workspaceForRouteId(page.route.id));

function navigateWorkspace(workspace: AppShellWorkspace) {
  return goto(resolve(workspacePath(workspace)));
}
</script>

<AppShell {activeWorkspace} {navigateWorkspace}>
  {@render children()}
</AppShell>

<script lang="ts">
import { goto } from "$app/navigation";
import { resolve } from "$app/paths";
import { page } from "$app/state";
import type { Snippet } from "svelte";

import AppShell from "../../app/shell/AppShell.svelte";
import { workspaceForPath, workspacePath, type AppShellWorkspace } from "../../app/shell/workspace-routes";

let { children }: { children: Snippet } = $props();

let activeWorkspace = $derived(workspaceForPath(page.url.pathname));

function navigateWorkspace(workspace: AppShellWorkspace) {
  return goto(resolve(workspacePath(workspace)));
}
</script>

<AppShell {activeWorkspace} {navigateWorkspace}>
  {@render children()}
</AppShell>

<script lang="ts">
import { ChevronDown, ChevronRight } from "lucide-svelte";
import { resolve } from "$app/paths";

import type { SetupWorkspaceSection, SetupWorkspaceSectionGroup } from "../../../lib/stores/setup-workspace";
import { groupSetupSectionNavigation, setupSectionPath } from "../../../lib/setup-sections";
import { Button } from "../../../components/ui";
import { setupWorkspaceTestIds } from "../setup-workspace-test-ids";
import SetupSectionIcon from "./SetupSectionIcon.svelte";

let {
  sectionGroups,
  selectedSectionId,
  onSectionLinkClick = () => {},
}: {
  sectionGroups: SetupWorkspaceSectionGroup[];
  selectedSectionId: SetupWorkspaceSection["id"];
  onSectionLinkClick?: (sectionId: SetupWorkspaceSection["id"], event: MouseEvent) => void;
} = $props();

let collapsedGroups: Record<string, boolean> = $state({});

let navGroups = $derived.by(() => {
  const sections = sectionGroups.flatMap((group) => group.sections).filter((section) => section.implemented);
  return groupSetupSectionNavigation(sections);
});

function toggleGroup(groupId: string) {
  collapsedGroups[groupId] = !collapsedGroups[groupId];
}
</script>

<nav
  aria-label="Setup sections"
  class="flex h-full min-h-0 flex-col gap-1 overflow-y-auto"
  data-testid={setupWorkspaceTestIds.nav}
>
  {#each navGroups as group (group.id)}
    <div data-testid={`${setupWorkspaceTestIds.navGroupPrefix}-${group.id}`}>
      <Button
        variant="ghost"
        class="h-auto w-full justify-start gap-1.5 border-none bg-transparent px-2 py-1.5 text-[10px] uppercase tracking-wider text-text-muted hover:text-text-secondary"
        onclick={() => toggleGroup(group.id)}
      >
        {#if collapsedGroups[group.id]}
          <ChevronRight size={10} aria-hidden="true" />
        {:else}
          <ChevronDown size={10} aria-hidden="true" />
        {/if}
        {group.title}
      </Button>

      {#if !collapsedGroups[group.id]}
        <div class="flex flex-col gap-0.5 px-0.5">
          {#each group.sections as section (section.id)}
          <a
            aria-current={selectedSectionId === section.id ? "page" : undefined}
            class={[
              "inline-flex h-auto w-full items-center justify-start gap-2.5 rounded-md border border-none px-2.5 py-2 text-left text-xs font-medium whitespace-nowrap no-underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
              selectedSectionId === section.id
                ? "bg-accent/20 text-text-primary hover:bg-accent/20"
                : "bg-transparent text-text-secondary hover:bg-bg-tertiary/60",
            ].join(" ")}
            data-implemented={section.implemented ? "true" : "false"}
            data-sveltekit-preload-code="hover"
            data-sveltekit-preload-data="hover"
            data-testid={`${setupWorkspaceTestIds.navPrefix}-${section.id}`}
            href={resolve(setupSectionPath(section.id))}
            onclick={(event) => onSectionLinkClick(section.id, event)}
          >
            <SetupSectionIcon sectionId={section.id} />
            <span class="truncate font-medium">{section.title}</span>
          </a>
          {/each}
        </div>
      {/if}
    </div>
  {/each}
</nav>

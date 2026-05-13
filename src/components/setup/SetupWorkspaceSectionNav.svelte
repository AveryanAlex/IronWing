<script lang="ts">
import { ChevronRight } from "lucide-svelte";

import type { SetupWorkspaceSection, SetupWorkspaceSectionGroup } from "../../lib/stores/setup-workspace";
import { setupWorkspaceTestIds } from "./setup-workspace-test-ids";
import SectionStatusIcon from "./shared/SectionStatusIcon.svelte";
import SetupSectionIcon from "./SetupSectionIcon.svelte";

let {
  sectionGroups,
  selectedSectionId,
  onSelect,
}: {
  sectionGroups: SetupWorkspaceSectionGroup[];
  selectedSectionId: SetupWorkspaceSection["id"];
  onSelect: (sectionId: SetupWorkspaceSection["id"]) => void;
} = $props();

let collapsedGroups: Record<string, boolean> = $state({});

function toggleGroup(groupId: string) {
  collapsedGroups[groupId] = !collapsedGroups[groupId];
}

function isComingLater(section: SetupWorkspaceSection): boolean {
  return section.kind === "guided" && !section.implemented;
}

function isDisabled(section: SetupWorkspaceSection): boolean {
  return isComingLater(section)
    || (section.id === "full_parameters" && section.availability === "blocked");
}

function statusLabel(section: SetupWorkspaceSection): { text: string; className: string } | null {
  if (section.status === "complete") {
    return { text: "Done", className: "text-success" };
  }
  if (section.status === "in_progress") {
    return { text: "In Progress", className: "text-accent" };
  }
  if (section.status === "failed") {
    return { text: "Check", className: "text-warning" };
  }
  return null;
}
</script>

<nav
  aria-label="Setup sections"
  class="flex h-full min-h-0 flex-col gap-[2px] overflow-y-auto px-1 py-2"
  data-testid={setupWorkspaceTestIds.nav}
>
  {#each sectionGroups as group (group.id)}
    <div data-testid={`${setupWorkspaceTestIds.navGroupPrefix}-${group.id}`}>
      <button
        class="flex w-full cursor-pointer items-center gap-2 border-none bg-transparent px-2 py-1.5 text-xs font-bold uppercase tracking-widest text-text-muted"
        onclick={() => toggleGroup(group.id)}
        type="button"
      >
        <ChevronRight
          class={`transition-transform duration-150 ${!collapsedGroups[group.id] ? "rotate-90" : ""}`}
          size={12}
          aria-hidden="true"
        />
        {group.title}
        {#if group.progressText}
          <span
            class="ml-auto text-xs font-medium normal-case tracking-normal text-text-muted"
            data-testid={`${setupWorkspaceTestIds.navGroupProgressPrefix}-${group.id}`}
          >
            {group.progressText}
          </span>
        {/if}
      </button>

      {#if !collapsedGroups[group.id]}
        {#each group.sections as section (section.id)}
          <button
            aria-current={selectedSectionId === section.id ? "page" : undefined}
            class={[
              "flex w-full items-center gap-2 rounded-r-md border-none border-l-2 border-transparent bg-transparent px-2 py-1.5 pl-[26px] text-left text-xs text-text-primary transition-all duration-100 hover:bg-bg-tertiary disabled:cursor-not-allowed disabled:opacity-40",
              selectedSectionId === section.id && "border-l-accent bg-bg-tertiary font-semibold text-accent",
            ]}
            data-availability={section.availability}
            data-implemented={section.implemented ? "true" : "false"}
            data-testid={`${setupWorkspaceTestIds.navPrefix}-${section.id}`}
            disabled={isDisabled(section)}
            onclick={() => onSelect(section.id)}
            type="button"
          >
            <SetupSectionIcon sectionId={section.id} class="text-text-muted" />
            <span>{section.title}</span>

            {#if section.id === "beginner_wizard"}
              <span class="rounded border border-accent px-1 py-px text-xs font-bold uppercase text-accent">Guide</span>
            {/if}

            {#if isComingLater(section)}
              <span class="ml-auto text-xs font-bold uppercase text-text-muted">Coming later</span>
            {:else if statusLabel(section)}
              {@const label = statusLabel(section)!}
              <span
                class={`ml-auto inline-flex items-center gap-1 text-xs font-bold uppercase ${label.className}`}
                data-testid={`${setupWorkspaceTestIds.sectionStatusPrefix}-${section.id}`}
              >
                <SectionStatusIcon status={section.status} />
                {label.text}
              </span>
            {/if}
          </button>
        {/each}
      {/if}
    </div>
  {/each}
</nav>

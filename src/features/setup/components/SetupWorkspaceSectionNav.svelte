<script lang="ts">
import { ChevronDown, ChevronRight } from "lucide-svelte";
import { resolve } from "$app/paths";

import type { SetupWorkspaceSection, SetupWorkspaceSectionGroup } from "../../../lib/stores/setup-workspace";
import { setupSectionPath } from "../../../lib/setup-sections";
import { Button } from "../../../components/ui";
import { setupWorkspaceTestIds } from "../setup-workspace-test-ids";
import SectionStatusIcon from "../shared/SectionStatusIcon.svelte";
import SetupSectionIcon from "./SetupSectionIcon.svelte";

const NAV_SECTION_GROUPS: ReadonlyArray<{
  id: string;
  title: string;
  sectionIds: SetupWorkspaceSection["id"][];
}> = [
  {
    id: "essential",
    title: "Essential Setup",
    sectionIds: ["overview", "beginner_wizard", "frame_orientation", "calibration", "rc_receiver", "flight_modes"],
  },
  {
    id: "hardware",
    title: "Hardware",
    sectionIds: ["navigation", "battery_monitor", "motors_esc", "servo_outputs", "serial_ports"],
  },
  {
    id: "safety",
    title: "Safety",
    sectionIds: ["failsafe", "rtl_return", "geofence", "arming"],
  },
  {
    id: "tuning",
    title: "Tuning",
    sectionIds: ["initial_params", "pid_tuning"],
  },
  {
    id: "peripherals",
    title: "Peripherals",
    sectionIds: ["peripherals", "full_parameters"],
  },
];

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
  const sectionsById = new Map(sectionGroups.flatMap((group) => group.sections).map((section) => [section.id, section]));

  return NAV_SECTION_GROUPS.map((group) => ({
    ...group,
    sections: group.sectionIds.map((sectionId) => sectionsById.get(sectionId)).filter((section) => section !== undefined),
  })).filter((group) => group.sections.length > 0);
});

function toggleGroup(groupId: string) {
  collapsedGroups[groupId] = !collapsedGroups[groupId];
}

function showStatusIcon(section: SetupWorkspaceSection): boolean {
  return section.status === "complete"
    || section.status === "in_progress"
    || section.status === "failed"
    || section.status === "unknown";
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

            {#if showStatusIcon(section)}
              <span
                class="ml-auto inline-flex items-center justify-center"
                data-testid={`${setupWorkspaceTestIds.sectionStatusPrefix}-${section.id}`}
              >
                <SectionStatusIcon status={section.status} />
              </span>
            {/if}
          </a>
          {/each}
        </div>
      {/if}
    </div>
  {/each}
</nav>

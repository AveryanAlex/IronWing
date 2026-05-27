<script lang="ts">
import { ChevronDown, ChevronRight, Lock } from "lucide-svelte";

import type { SetupWorkspaceSection, SetupWorkspaceSectionGroup } from "../../lib/stores/setup-workspace";
import { setupWorkspaceTestIds } from "./setup-workspace-test-ids";
import SectionStatusIcon from "./shared/SectionStatusIcon.svelte";
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
    sectionIds: ["gps", "battery_monitor", "motors_esc", "servo_outputs", "serial_ports"],
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
  onSelect,
}: {
  sectionGroups: SetupWorkspaceSectionGroup[];
  selectedSectionId: SetupWorkspaceSection["id"];
  onSelect: (sectionId: SetupWorkspaceSection["id"]) => void;
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

function isComingLater(section: SetupWorkspaceSection): boolean {
  return section.kind === "guided" && !section.implemented;
}

function isSetupAccessGateText(value: string | null): boolean {
  return value === "Connect to a vehicle to access setup."
    || value === "Download parameters to continue."
    || value === "Loading parameter descriptions."
    || value === "Parameter descriptions are unavailable. Open Full Parameters to continue.";
}

function isDisabled(section: SetupWorkspaceSection): boolean {
  if (isComingLater(section)) {
    return true;
  }

  if (section.availability !== "blocked") {
    return false;
  }

  if (section.id === "full_parameters") {
    return true;
  }

  return isSetupAccessGateText(section.gateText);
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
      <button
        class="flex w-full cursor-pointer items-center gap-1.5 border-none bg-transparent px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted transition-colors hover:text-text-secondary"
        onclick={() => toggleGroup(group.id)}
        type="button"
      >
        {#if collapsedGroups[group.id]}
          <ChevronRight size={10} aria-hidden="true" />
        {:else}
          <ChevronDown size={10} aria-hidden="true" />
        {/if}
        {group.title}
      </button>

      {#if !collapsedGroups[group.id]}
        <div class="flex flex-col gap-0.5 px-0.5">
          {#each group.sections as section (section.id)}
            {@const disabled = isDisabled(section)}
          <button
            aria-current={selectedSectionId === section.id ? "page" : undefined}
            class={[
              "flex w-full items-center gap-2.5 rounded-md border-none px-2.5 py-2 text-left text-xs transition-colors disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40",
              selectedSectionId === section.id
                ? "bg-accent/20 text-text-primary hover:bg-accent/20"
                : "bg-transparent text-text-secondary hover:bg-bg-tertiary/60",
            ]}
            data-availability={section.availability}
            data-implemented={section.implemented ? "true" : "false"}
            data-testid={`${setupWorkspaceTestIds.navPrefix}-${section.id}`}
            disabled={disabled}
            onclick={() => onSelect(section.id)}
            type="button"
          >
            <SetupSectionIcon sectionId={section.id} />
            <span class="truncate font-medium">{section.title}</span>

            {#if disabled}
              <span
                class="ml-auto inline-flex items-center justify-center text-text-muted/50"
                data-testid={`${setupWorkspaceTestIds.sectionStatusPrefix}-${section.id}`}
              >
                <Lock size={10} aria-hidden="true" />
              </span>
            {:else if showStatusIcon(section)}
              <span
                class="ml-auto inline-flex items-center justify-center"
                data-testid={`${setupWorkspaceTestIds.sectionStatusPrefix}-${section.id}`}
              >
                <SectionStatusIcon status={section.status} />
              </span>
            {/if}
          </button>
          {/each}
        </div>
      {/if}
    </div>
  {/each}
</nav>

<script lang="ts">
import type { SetupWorkspaceSection, SetupWorkspaceSectionGroup } from "../../lib/stores/setup-workspace";
import { setupWorkspaceTestIds } from "./setup-workspace-test-ids";

let {
  sectionGroups,
  selectedSectionId,
  onSelect,
}: {
  sectionGroups: SetupWorkspaceSectionGroup[];
  selectedSectionId: SetupWorkspaceSection["id"];
  onSelect: (sectionId: SetupWorkspaceSection["id"]) => void;
} = $props();

function groupTone(group: SetupWorkspaceSectionGroup): string {
  if (group.blockedCount > 0) {
    return "border-warning/30 bg-warning/5";
  }

  if (group.progress.total > 0 && group.progress.completed === group.progress.total) {
    return "border-success/30 bg-success/5";
  }

  return "border-border bg-bg-primary/70";
}

function sectionTone(section: SetupWorkspaceSection): string {
  if (section.availability === "blocked") {
    return "border-warning/40 bg-warning/10";
  }

  switch (section.status) {
    case "complete":
      return "border-success/40 bg-success/10";
    case "in_progress":
      return "border-accent/40 bg-accent/10";
    case "failed":
      return "border-danger/40 bg-danger/10";
    case "not_started":
      return "border-border bg-bg-secondary";
    case "unknown":
    default:
      return "border-border bg-bg-secondary";
  }
}
</script>

<nav
  aria-label="Setup sections"
  class="space-y-3"
  data-testid={setupWorkspaceTestIds.nav}
>
  {#each sectionGroups as group (group.id)}
    <section
      class={`rounded-lg border p-3 ${groupTone(group)}`}
      data-testid={`${setupWorkspaceTestIds.navGroupPrefix}-${group.id}`}
    >
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">{group.title}</p>
          <p class="mt-1 text-xs leading-5 text-text-secondary">{group.description}</p>
        </div>
        <div class="text-right">
          <p
            class="rounded-full border border-border bg-bg-primary/80 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary"
            data-testid={`${setupWorkspaceTestIds.navGroupProgressPrefix}-${group.id}`}
          >
            {group.progressText}
          </p>
          <p class="mt-2 text-[11px] text-text-muted">
            {group.blockedCount} blocked · {group.unconfirmedCount} unconfirmed
          </p>
        </div>
      </div>

      <div class="mt-3 grid gap-2">
        {#each group.sections as section (section.id)}
          <button
            aria-current={selectedSectionId === section.id ? "page" : undefined}
            class={`rounded-lg border px-3 py-3 text-left transition ${sectionTone(section)} ${selectedSectionId === section.id ? "ring-1 ring-accent" : "hover:border-accent hover:text-text-primary"}`}
            data-availability={section.availability}
            data-implemented={section.implemented ? "true" : "false"}
            data-testid={`${setupWorkspaceTestIds.navPrefix}-${section.id}`}
            onclick={() => onSelect(section.id)}
            type="button"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="text-sm font-semibold text-text-primary">{section.title}</p>
                <p class="mt-1 text-xs text-text-secondary">{section.description}</p>
              </div>
              <span
                class="rounded-full border border-border bg-bg-primary/80 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary"
                data-testid={`${setupWorkspaceTestIds.sectionStatusPrefix}-${section.id}`}
              >
                {section.statusText}
              </span>
            </div>

            {#if section.confidenceText}
              <p
                class="mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted"
                data-testid={`${setupWorkspaceTestIds.sectionConfidencePrefix}-${section.id}`}
              >
                {section.confidenceText}
              </p>
            {/if}

            {#if section.gateText}
              <p
                class="mt-3 text-xs leading-5 text-warning"
                data-testid={`${setupWorkspaceTestIds.sectionGatePrefix}-${section.id}`}
              >
                {section.gateText}
              </p>
            {/if}
          </button>
        {/each}
      </div>
    </section>
  {/each}
</nav>

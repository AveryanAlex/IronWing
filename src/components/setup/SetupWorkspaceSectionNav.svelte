<script lang="ts">
import type { SetupWorkspaceSection } from "../../lib/stores/setup-workspace";
import { setupWorkspaceTestIds } from "./setup-workspace-test-ids";

let {
  sections,
  selectedSectionId,
  onSelect,
}: {
  sections: SetupWorkspaceSection[];
  selectedSectionId: SetupWorkspaceSection["id"];
  onSelect: (sectionId: SetupWorkspaceSection["id"]) => void;
} = $props();

function sectionTone(section: SetupWorkspaceSection): string {
  if (section.availability === "gated") {
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
  class="flex gap-2 overflow-x-auto pb-1 xl:block xl:space-y-2 xl:overflow-visible xl:pb-0"
  data-testid={setupWorkspaceTestIds.nav}
>
  {#each sections as section (section.id)}
    <button
      aria-current={selectedSectionId === section.id ? "page" : undefined}
      class={`min-w-[15rem] rounded-2xl border px-3 py-3 text-left transition xl:w-full ${sectionTone(section)} ${selectedSectionId === section.id ? "ring-1 ring-accent" : ""} ${section.availability === "gated" ? "cursor-not-allowed opacity-85" : "hover:border-accent hover:text-text-primary"}`}
      data-testid={`${setupWorkspaceTestIds.navPrefix}-${section.id}`}
      disabled={section.availability === "gated"}
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
</nav>

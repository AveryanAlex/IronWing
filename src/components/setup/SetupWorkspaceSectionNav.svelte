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

let collapsedGroups: Record<string, boolean> = $state({});

function toggleGroup(groupId: string) {
  collapsedGroups[groupId] = !collapsedGroups[groupId];
}

function statusLabel(section: SetupWorkspaceSection): { text: string; className: string } | null {
  if (section.status === "complete") {
    return { text: "Done", className: "setup-nav__status--done" };
  }
  if (section.status === "in_progress") {
    return { text: "In Progress", className: "setup-nav__status--active" };
  }
  if (section.status === "failed") {
    return { text: "Check", className: "setup-nav__status--warn" };
  }
  return null;
}
</script>

<nav
  aria-label="Setup sections"
  data-testid={setupWorkspaceTestIds.nav}
>
  {#each sectionGroups as group (group.id)}
    <div data-testid={`${setupWorkspaceTestIds.navGroupPrefix}-${group.id}`}>
      <button
        class="setup-nav__group-header"
        onclick={() => toggleGroup(group.id)}
        type="button"
      >
        <svg
          class="setup-nav__chevron"
          class:is-collapsed={collapsedGroups[group.id]}
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden="true"
        >
          <path d="M4 2l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        {group.title}
      </button>

      {#if !collapsedGroups[group.id]}
        {#each group.sections as section (section.id)}
          <button
            aria-current={selectedSectionId === section.id ? "page" : undefined}
            class="setup-nav__item"
            class:is-active={selectedSectionId === section.id}
            data-availability={section.availability}
            data-implemented={section.implemented ? "true" : "false"}
            data-testid={`${setupWorkspaceTestIds.navPrefix}-${section.id}`}
            disabled={!section.implemented}
            onclick={() => onSelect(section.id)}
            type="button"
          >
            <span>{section.title}</span>

            {#if section.id === "beginner_wizard"}
              <span class="setup-nav__badge">Guide</span>
            {/if}

            {#if statusLabel(section)}
              {@const label = statusLabel(section)!}
              <span
                class="setup-nav__status {label.className}"
                data-testid={`${setupWorkspaceTestIds.sectionStatusPrefix}-${section.id}`}
              >
                {label.text}
              </span>
            {/if}
          </button>
        {/each}
      {/if}
    </div>
  {/each}
</nav>

<style>
  nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow-y: auto;
    padding: 4px;
  }

  .setup-nav__group-header {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 6px 8px;
    font-size: 0.68rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--color-text-muted);
    background: none;
    border: none;
    cursor: pointer;
  }

  .setup-nav__chevron {
    transition: transform 0.15s;
  }
  .setup-nav__chevron.is-collapsed {
    transform: rotate(-90deg);
  }

  .setup-nav__item {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 6px 8px 6px 26px;
    font-size: 0.8rem;
    color: var(--color-text-primary);
    background: none;
    border: none;
    border-left: 2px solid transparent;
    border-radius: 0 6px 6px 0;
    cursor: pointer;
    transition: all 0.1s;
  }
  .setup-nav__item:hover:not(:disabled) {
    background: var(--color-bg-tertiary);
  }
  .setup-nav__item.is-active {
    background: var(--color-bg-tertiary);
    border-left-color: var(--color-accent);
    color: var(--color-accent);
    font-weight: 600;
  }
  .setup-nav__item:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .setup-nav__badge {
    font-size: 0.6rem;
    font-weight: 700;
    text-transform: uppercase;
    color: var(--color-accent);
    border: 1px solid var(--color-accent);
    border-radius: 4px;
    padding: 1px 4px;
  }

  .setup-nav__status {
    margin-left: auto;
    font-size: 0.6rem;
    font-weight: 700;
    text-transform: uppercase;
  }
  .setup-nav__status--done {
    color: var(--color-success);
  }
  .setup-nav__status--active {
    color: var(--color-accent);
  }
  .setup-nav__status--warn {
    color: var(--color-warning);
  }
</style>

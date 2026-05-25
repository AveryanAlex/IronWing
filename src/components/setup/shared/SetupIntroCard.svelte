<script lang="ts">
import type { Snippet } from "svelte";

import type { SetupSectionId } from "../../../lib/setup-sections";
import SetupSectionIcon from "../SetupSectionIcon.svelte";
import DocsLink from "./DocsLink.svelte";

type SetupDocLink = {
  url: string | null | undefined;
  label?: string;
  testId?: string;
};

type Props = {
  sectionId?: SetupSectionId;
  title: string;
  description?: string;
  docs?: SetupDocLink[];
  actions?: Snippet;
};

let { sectionId, title, description, docs = [], actions }: Props = $props();

let visibleDocs = $derived(docs.filter((doc) => doc.url));
</script>

<header class="rounded-lg border border-border bg-bg-tertiary/50 p-4">
  <div class="flex min-w-0 items-start gap-2">
    {#if sectionId}
      <span class="mt-0.5 inline-flex shrink-0 text-accent">
        <SetupSectionIcon {sectionId} size={14} />
      </span>
    {/if}

    <div class="min-w-0">
      <h2 class="text-xs font-semibold uppercase tracking-widest text-text-muted">{title}</h2>
      {#if description}
        <p class="mt-2 text-xs leading-5 text-text-muted">{description}</p>
      {/if}

      {#if visibleDocs.length > 0 || actions}
        <div class="setup-section-intro-actions mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          {#each visibleDocs as doc (doc.url)}
            <DocsLink docsUrl={doc.url} docsLabel={doc.label ?? "ArduPilot Docs"} variant="inline" testId={doc.testId} />
          {/each}
          {#if actions}
            {@render actions()}
          {/if}
        </div>
      {/if}
    </div>
  </div>
</header>

<style>
  .setup-section-intro-actions :global(a) {
    border: 0 !important;
    background: transparent !important;
    padding: 0 !important;
    color: var(--color-accent) !important;
    font-size: 0.75rem !important;
    line-height: 1rem !important;
    font-weight: 500 !important;
  }

  .setup-section-intro-actions :global(a:hover) {
    color: var(--color-accent-hover) !important;
    text-decoration: underline;
  }
</style>

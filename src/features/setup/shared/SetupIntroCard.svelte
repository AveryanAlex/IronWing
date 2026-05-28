<script lang="ts">
import type { Snippet } from "svelte";

import { Card, Eyebrow, HelperText } from "../../../components/ui";
import type { SetupSectionId } from "../../../lib/setup-sections";
import SetupSectionIcon from "../components/SetupSectionIcon.svelte";
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

<Card.Root surface="secondary" density="default">
  <div class="flex min-w-0 items-start gap-2">
    {#if sectionId}
      <span class="mt-0.5 inline-flex shrink-0 text-accent">
        <SetupSectionIcon {sectionId} size={14} />
      </span>
    {/if}

    <div class="min-w-0">
      <Eyebrow tracking="widest">{title}</Eyebrow>
      {#if description}
        <HelperText class="mt-2" size="xs" tone="muted">{description}</HelperText>
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
</Card.Root>

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

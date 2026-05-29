<script lang="ts">
import type { Snippet, SvelteComponent } from "svelte";

import { Card, Eyebrow, HelperText } from "../../../components/ui";
import SetupCard from "./SetupCard.svelte";
import DocsLink from "./DocsLink.svelte";

type IconComponent = new (...args: any[]) => SvelteComponent;
type CardTone = "neutral" | "info" | "success" | "warning" | "danger";
type CardSurface = "default" | "elevated" | "muted" | "muted-soft" | "transparent" | "primary" | "secondary" | "panel" | "panel-soft" | "input";

type SetupDocLink = {
  url: string | null | undefined;
  label?: string;
  testId?: string;
};

type Props = {
  icon?: IconComponent;
  title: string;
  description?: string;
  docs?: SetupDocLink[];
  docsUrl?: string | null | undefined;
  docsLabel?: string;
  tone?: CardTone;
  surface?: CardSurface;
  compact?: boolean;
  class?: string;
  testId?: string;
  status?: Snippet;
  actions?: Snippet;
  footer?: Snippet;
  children: Snippet;
};

let {
  icon: Icon,
  title,
  description,
  docs = [],
  docsUrl,
  docsLabel = "ArduPilot Docs",
  tone = "neutral",
  surface = "default",
  compact = false,
  class: className = "",
  testId,
  status,
  actions,
  footer,
  children,
}: Props = $props();

let allDocs = $derived.by(() => {
  const links = [...docs];
  if (docsUrl) {
    links.unshift({ url: docsUrl, label: docsLabel });
  }

  return links.filter((doc) => doc.url);
});

let resolvedSurface = $derived(surface === "elevated" || surface === "primary" ? "default" : surface);
</script>

<SetupCard surface={resolvedSurface} {tone} class={className} {testId}>
  <Card.Header class={`flex items-start justify-between gap-3 ${compact ? "mb-2" : "mb-4"}`}>
    <div class="min-w-0">
      <div class="flex flex-wrap items-center gap-2">
        {#if Icon}
          <Icon size={16} class="text-accent" aria-hidden="true" />
        {/if}
        <Eyebrow as="span" tracking="widest">{title}</Eyebrow>
        {#if status}
          <span class="shrink-0">{@render status()}</span>
        {/if}
      </div>

      {#if description}
        <HelperText class="mt-2" size="xs" tone="muted">{description}</HelperText>
      {/if}

      {#if allDocs.length > 0}
        <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          {#each allDocs as doc (doc.url)}
            <DocsLink docsUrl={doc.url} docsLabel={doc.label ?? "ArduPilot Docs"} variant="inline" testId={doc.testId} />
          {/each}
        </div>
      {/if}
    </div>

    {#if actions}
      <div class="shrink-0">{@render actions()}</div>
    {/if}
  </Card.Header>

  <div class="flex flex-col gap-3">
    {@render children()}
  </div>

  {#if footer}
    <div class="border-t border-border pt-3">
      {@render footer()}
    </div>
  {/if}
</SetupCard>

<script lang="ts">
import { ExternalLink } from "lucide-svelte";

type Props = {
  docsUrl: string | null | undefined;
  docsLabel?: string;
  variant?: "inline" | "header";
  class?: string;
  testId?: string;
};

let {
  docsUrl,
  docsLabel = "ArduPilot Docs",
  variant = "header",
  class: className = "",
  testId,
}: Props = $props();

let linkClass = $derived([
  "inline-flex items-center gap-1 transition-colors",
  variant === "inline"
    ? "text-xs text-accent hover:underline"
    : "text-xs text-text-muted hover:text-text-secondary",
  className,
].filter(Boolean).join(" "));
</script>

{#if docsUrl}
  <a
    class={linkClass}
    data-testid={testId}
    href={docsUrl}
    rel="noopener noreferrer"
    target="_blank"
  >
    {docsLabel}
    <ExternalLink size={12} aria-hidden="true" />
  </a>
{/if}

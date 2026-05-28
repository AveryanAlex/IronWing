<script lang="ts">
import { ExternalLink as ExternalLinkIcon } from "lucide-svelte";
import type { Snippet } from "svelte";
import type { HTMLAnchorAttributes } from "svelte/elements";
import { openUrl } from "@platform/core";
import { cn } from "../../lib/utils";

type LinkVariant = "inline" | "muted" | "subtle" | "button" | "card";

type Props = Omit<HTMLAnchorAttributes, "class" | "children" | "href"> & {
  href: string;
  variant?: LinkVariant;
  external?: boolean;
  testId?: string;
  class?: string;
  children?: Snippet;
};

const variantClasses: Record<LinkVariant, string> = {
  inline: "inline-flex items-center gap-1 text-accent underline-offset-4 hover:underline",
  muted: "inline-flex items-center gap-1 text-text-secondary underline-offset-4 hover:text-text-primary hover:underline",
  subtle: "inline-flex items-center gap-1 text-text-muted underline-offset-4 hover:text-text-secondary hover:underline",
  button:
    "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border-light bg-bg-secondary px-4 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
  card: "flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-card p-4 text-sm text-text-primary transition-colors hover:border-border-light hover:bg-surface-card-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
};

let {
  href,
  variant = "inline",
  external = true,
  testId,
  target = "_blank",
  rel,
  onclick,
  class: className,
  children,
  ...restProps
}: Props = $props();

let safeRel = $derived(rel ?? (target === "_blank" ? "noopener noreferrer" : undefined));
let linkClass = $derived(cn(variantClasses[variant], className));

function isPlainLeftClick(event: MouseEvent) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

function handleClick(event: MouseEvent & { currentTarget: EventTarget & HTMLAnchorElement }) {
  onclick?.(event);

  if (event.defaultPrevented || !isPlainLeftClick(event)) {
    return;
  }

  event.preventDefault();
  void openUrl(href);
}
</script>

<a
  {...restProps}
  class={linkClass}
  data-testid={testId}
  data-variant={variant}
  {href}
  {target}
  rel={safeRel}
  onclick={handleClick}
>
  <span class="min-w-0">
    {@render children?.()}
  </span>
  {#if external}
    <ExternalLinkIcon aria-hidden="true" class="shrink-0" size={variant === "card" ? 16 : 14} />
  {/if}
</a>
